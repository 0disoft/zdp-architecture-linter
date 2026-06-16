import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { validateRepositoryCoreContract } from '../src/core-contract-rules.ts';

describe('core platform contract rules', () => {
  test('passes when the core platform repository declares all contract gates', async () => {
    await withRepositoryRoot(createValidCoreFiles(), async (repositoryRoot) => {
      const diagnostics = await validateRepositoryCoreContract({
        repositoryRoot,
        repositoryServiceContract: createCoreServiceContract()
      });

      expect(diagnostics).toEqual([]);
    });
  });

  test('skips repositories that are not zdp-core-platform', async () => {
    await withRepositoryRoot({}, async (repositoryRoot) => {
      const diagnostics = await validateRepositoryCoreContract({
        repositoryRoot,
        repositoryServiceContract: {
          service: {
            repo: 'zdp-web-public'
          }
        }
      });

      expect(diagnostics).toEqual([]);
    });
  });

  test('fails when required core contract files are missing', async () => {
    await withRepositoryRoot({}, async (repositoryRoot) => {
      const diagnostics = await validateRepositoryCoreContract({
        repositoryRoot,
        repositoryServiceContract: createCoreServiceContract()
      });

      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-CORE-001',
        severity: 'error',
        file: '.github/workflows/ci.yml',
        path: 'repository.root',
        message:
          'Core platform repository must include `.github/workflows/ci.yml`.'
      });
      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-CORE-001',
        severity: 'error',
        file: 'contracts/core-boundaries.yaml',
        path: 'repository.root',
        message:
          'Core platform repository must include `contracts/core-boundaries.yaml`.'
      });
      expect(diagnostics).toHaveLength(14);
    });
  });

  test('fails when a core contract file is not valid YAML', async () => {
    await withRepositoryRoot(
      {
        ...createValidCoreFiles(),
        'contracts/command-envelope.yaml': 'required_fields: [command_id'
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryCoreContract({
          repositoryRoot,
          repositoryServiceContract: createCoreServiceContract()
        });

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]).toMatchObject({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/command-envelope.yaml',
          path: 'yaml'
        });
      }
    );
  });

  test('fails when core boundaries and contract fields drift', async () => {
    await withRepositoryRoot(
      {
        ...createValidCoreFiles(),
        'contracts/core-boundaries.yaml': `
permission_model:
  roles:
    - owner
authorization:
  final_decision_owner: ui
boundaries:
  - id: identity
    owns:
      - app_user_id
`,
        'contracts/audit-event.yaml': `
forbidden_payload_values:
  - raw_secret
`,
        'contracts/consent-record.yaml': `
required_fields:
  - purpose
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryCoreContract({
          repositoryRoot,
          repositoryServiceContract: createCoreServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/core-boundaries.yaml',
          path: 'permission_model.roles',
          message:
            'Core platform contract `contracts/core-boundaries.yaml` must include `admin` in `permission_model.roles`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/core-boundaries.yaml',
          path: 'authorization.final_decision_owner',
          message: 'Core platform final authorization owner must be `access`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/core-boundaries.yaml',
          path: 'boundaries.accounts',
          message:
            'Core platform boundaries contract must declare `accounts` boundary.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/audit-event.yaml',
          path: 'forbidden_payload_values',
          message:
            'Core platform contract `contracts/audit-event.yaml` must include `token` in `forbidden_payload_values`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/consent-record.yaml',
          path: 'withdrawal_record',
          message:
            'Core platform consent contract must declare `withdrawal_record`.'
        });
      }
    );
  });

  test('fails when core CI workflow loses Rust verification gates', async () => {
    await withRepositoryRoot(
      {
        ...createValidCoreFiles(),
        '.github/workflows/ci.yml': `
name: CI
jobs:
  rust:
    steps:
      - uses: actions/checkout@v4
      - run: cargo test
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryCoreContract({
          repositoryRoot,
          repositoryServiceContract: createCoreServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: '.github/workflows/ci.yml',
          path: 'ci.workflow',
          message:
            'Core platform CI workflow must include `actions/checkout@v6`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: '.github/workflows/ci.yml',
          path: 'ci.workflow',
          message:
            'Core platform CI workflow must include `cargo fmt --check`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: '.github/workflows/ci.yml',
          path: 'ci.workflow',
          message:
            'Core platform CI workflow must include `cargo check --locked --all-targets`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: '.github/workflows/ci.yml',
          path: 'ci.workflow',
          message:
            'Core platform CI workflow must include `cargo test --locked`.'
        });
      }
    );
  });

  test('fails when auth session runtime handoff gates drift', async () => {
    await withRepositoryRoot(
      {
        ...createValidCoreFiles(),
        'contracts/auth-session-runtime.yaml': `
contract:
  status: live
  catalog_source: local
required_operations:
  - operation_id: core.auth.sessions.create
    runtime_status: live
    session_effect: none
    handoff_owner: product
required_handoff_controls:
  - request_id_propagation
promotion_blockers:
  - no_identity_session_store_implementation
  - no_credential_vault_capability_handoff_implementation
  - no_auth_audit_event_persistence_implementation
  - no_idempotency_storage_implementation
forbidden_runtime_claims:
  - live_login_handler
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryCoreContract({
          repositoryRoot,
          repositoryServiceContract: createCoreServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/auth-session-runtime.yaml',
          path: 'contract.status',
          message:
            'Core platform auth/session runtime contract must stay `contracted_no_live_handler` until live handlers are reviewed.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/auth-session-runtime.yaml',
          path: 'required_operations',
          message:
            'Core platform auth/session runtime contract must include operation `core.auth.registrations.create`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/auth-session-runtime.yaml',
          path: 'required_operations.core.auth.sessions.create.runtime_status',
          message:
            'Core platform auth/session operation `core.auth.sessions.create` must stay `contracted_no_live_handler`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/auth-session-runtime.yaml',
          path: 'required_operations.core.auth.sessions.create.session_effect',
          message:
            'Core platform auth/session operation `core.auth.sessions.create` must declare session_effect `issue`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/auth-session-runtime.yaml',
          path: 'required_handoff_controls',
          message:
            'Core platform contract `contracts/auth-session-runtime.yaml` must include `trace_id_propagation` in `required_handoff_controls`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/auth-session-runtime.yaml',
          path: 'promotion_blockers',
          message:
            'Core platform contract `contracts/auth-session-runtime.yaml` must include `no_passkey_challenge_store_implementation` in `promotion_blockers`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/auth-session-runtime.yaml',
          path: 'forbidden_runtime_claims',
          message:
            'Core platform contract `contracts/auth-session-runtime.yaml` must include `plaintext_refresh_token_storage` in `forbidden_runtime_claims`.'
        });
      }
    );
  });

  test('fails when auth runtime readiness summary claims promotion readiness', async () => {
    await withRepositoryRoot(
      {
        ...createValidCoreFiles(),
        'contracts/auth-runtime-readiness.yaml': `
contract:
  version: 1
  status: production_ready
  owner_repo: zdp-core-platform
  owner_boundary: product
  runtime_status: live
promotion_ready: true
production_route_ready: true
required_gate_states:
  - gate_id: session_store_contract
    contract_status: live
    typed_boundary_status: live
    durable_implementation_status: ready
    review_status: approved
    promotion_blocker: none
    evidence_contracts:
      - contracts/auth-session-runtime.yaml
blocking_summary:
  - no_identity_session_store_implementation
forbidden_readiness_claims:
  - production_ready
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryCoreContract({
          repositoryRoot,
          repositoryServiceContract: createCoreServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/auth-runtime-readiness.yaml',
          path: 'contract.status',
          message:
            'Core platform auth runtime readiness summary must stay `readiness_summary_no_runtime_promotion` until durable implementation and review proof exist.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/auth-runtime-readiness.yaml',
          path: 'promotion_ready',
          message:
            'Core platform auth runtime readiness summary must keep `promotion_ready` false until all promotion blockers are removed by durable proof.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/auth-runtime-readiness.yaml',
          path: 'production_route_ready',
          message:
            'Core platform auth runtime readiness summary must keep `production_route_ready` false until product route promotion is reviewed.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/auth-runtime-readiness.yaml',
          path: 'required_gate_states',
          message:
            'Core platform auth runtime readiness summary must include gate `oauth_callback_state_verification`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/auth-runtime-readiness.yaml',
          path: 'required_gate_states.session_store_contract.durable_implementation_status',
          message:
            'Core platform auth runtime readiness gate `session_store_contract` must keep `durable_implementation_status` as `durable_implementation_missing`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/auth-runtime-readiness.yaml',
          path: 'forbidden_readiness_claims',
          message:
            'Core platform contract `contracts/auth-runtime-readiness.yaml` must include `live_auth_handler_ready` in `forbidden_readiness_claims`.'
        });
      }
    );
  });

  test('fails when identity session store gates drift', async () => {
    await withRepositoryRoot(
      {
        ...createValidCoreFiles(),
        'contracts/identity-session-store.yaml': `
contract:
  status: live
  owner_boundary: product
required_session_record_fields:
  - session_id
state_values:
  - active
required_refresh_rotation_fields:
  - refresh_token_hash
required_revocation_fields:
  - revoked_at
required_controls:
  - opaque_session_id
uniqueness:
  - session_id
adapter_contract:
  status: live
  adapter_kinds:
    - transactional_session_store
  required_adapter_fields:
    - adapter_id
  required_adapter_controls:
    - unique_session_id_enforced_by_storage
forbidden_storage_values:
  - refresh_token_plaintext
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryCoreContract({
          repositoryRoot,
          repositoryServiceContract: createCoreServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/identity-session-store.yaml',
          path: 'contract.status',
          message:
            'Core platform identity session store contract must stay `contract_only_no_migration` until migrations exist.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/identity-session-store.yaml',
          path: 'required_session_record_fields',
          message:
            'Core platform contract `contracts/identity-session-store.yaml` must include `refresh_token_family_id` in `required_session_record_fields`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/identity-session-store.yaml',
          path: 'required_refresh_rotation_fields',
          message:
            'Core platform contract `contracts/identity-session-store.yaml` must include `previous_refresh_token_hash` in `required_refresh_rotation_fields`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/identity-session-store.yaml',
          path: 'required_controls',
          message:
            'Core platform contract `contracts/identity-session-store.yaml` must include `hashed_refresh_token_only` in `required_controls`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/identity-session-store.yaml',
          path: 'adapter_contract.status',
          message:
            'Core platform identity session store adapter boundary must stay `typed_adapter_boundary_no_migration` until a migration-backed storage implementation exists.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/identity-session-store.yaml',
          path: 'adapter_contract.adapter_kinds',
          message:
            'Core platform contract `contracts/identity-session-store.yaml` must include `session_state_table` in `adapter_contract.adapter_kinds`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/identity-session-store.yaml',
          path: 'adapter_contract.required_adapter_fields',
          message:
            'Core platform contract `contracts/identity-session-store.yaml` must include `transaction_boundary_ref` in `adapter_contract.required_adapter_fields`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/identity-session-store.yaml',
          path: 'adapter_contract.required_adapter_controls',
          message:
            'Core platform contract `contracts/identity-session-store.yaml` must include `atomic_refresh_rotation` in `adapter_contract.required_adapter_controls`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/identity-session-store.yaml',
          path: 'forbidden_storage_values',
          message:
            'Core platform contract `contracts/identity-session-store.yaml` must include `session_secret_plaintext` in `forbidden_storage_values`.'
        });
      }
    );
  });

  test('fails when auth credential vault handoff gates drift', async () => {
    await withRepositoryRoot(
      {
        ...createValidCoreFiles(),
        'contracts/auth-credential-vault-handoff.yaml': `
contract:
  status: live
  owner_boundary: product
  vault_owner_repo: product-local-vault
required_capability_fields:
  - tenant_id
required_credential_kinds:
  - oauth_refresh_token
required_scopes:
  - store_credential
required_handoff_controls:
  - request_id_propagation
capability_client_contract:
  status: live_vault_client
  client_kinds:
    - vault_capability_client
  required_client_fields:
    - client_id
  required_client_controls:
    - capability_ref_only
forbidden_payload_values:
  - refresh_token_plaintext
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryCoreContract({
          repositoryRoot,
          repositoryServiceContract: createCoreServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/auth-credential-vault-handoff.yaml',
          path: 'contract.status',
          message:
            'Core platform auth credential vault handoff contract must stay `contract_only_no_capability_client` until a capability client exists.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/auth-credential-vault-handoff.yaml',
          path: 'contract.vault_owner_repo',
          message:
            'Core platform auth credential vault handoff contract must keep vault_owner_repo `zdp-privacy-credential-vault`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/auth-credential-vault-handoff.yaml',
          path: 'capability_client_contract.status',
          message:
            'Core platform auth credential vault capability client boundary must stay `typed_capability_client_boundary_no_vault_client` until a reviewed live vault client exists.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/auth-credential-vault-handoff.yaml',
          path: 'required_capability_fields',
          message:
            'Core platform contract `contracts/auth-credential-vault-handoff.yaml` must include `capability_ref` in `required_capability_fields`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/auth-credential-vault-handoff.yaml',
          path: 'required_handoff_controls',
          message:
            'Core platform contract `contracts/auth-credential-vault-handoff.yaml` must include `no_raw_secret_return` in `required_handoff_controls`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/auth-credential-vault-handoff.yaml',
          path: 'capability_client_contract.required_client_fields',
          message:
            'Core platform contract `contracts/auth-credential-vault-handoff.yaml` must include `vault_access_audit_ref` in `capability_client_contract.required_client_fields`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/auth-credential-vault-handoff.yaml',
          path: 'capability_client_contract.required_client_controls',
          message:
            'Core platform contract `contracts/auth-credential-vault-handoff.yaml` must include `raw_secret_material_rejected` in `capability_client_contract.required_client_controls`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/auth-credential-vault-handoff.yaml',
          path: 'forbidden_payload_values',
          message:
            'Core platform contract `contracts/auth-credential-vault-handoff.yaml` must include `provider_secret` in `forbidden_payload_values`.'
        });
      }
    );
  });

  test('fails when auth passkey challenge store gates drift', async () => {
    await withRepositoryRoot(
      {
        ...createValidCoreFiles(),
        'contracts/auth-passkey-challenge-store.yaml': `
contract:
  status: live
  owner_boundary: product
required_challenge_fields:
  - challenge_id
state_values:
  - active
ceremony_types:
  - registration
required_controls:
  - tenant_actor_scope
uniqueness:
  - challenge_id
adapter_contract:
  status: migration_ready
  adapter_kinds:
    - passkey_challenge_hash_store
  required_adapter_fields:
    - adapter_id
  required_adapter_controls:
    - ttl_enforced_by_storage
forbidden_storage_values:
  - passkey_challenge_plaintext
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryCoreContract({
          repositoryRoot,
          repositoryServiceContract: createCoreServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/auth-passkey-challenge-store.yaml',
          path: 'contract.status',
          message:
            'Core platform auth passkey challenge store contract must stay `contract_only_no_storage` until durable storage exists.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/auth-passkey-challenge-store.yaml',
          path: 'contract.owner_boundary',
          message:
            'Core platform auth passkey challenge store contract must keep owner_boundary `identity`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/auth-passkey-challenge-store.yaml',
          path: 'required_challenge_fields',
          message:
            'Core platform contract `contracts/auth-passkey-challenge-store.yaml` must include `challenge_hash` in `required_challenge_fields`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/auth-passkey-challenge-store.yaml',
          path: 'recommended_challenge_fields',
          message:
            'Core platform contract `contracts/auth-passkey-challenge-store.yaml` must include `expired_at` in `recommended_challenge_fields`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/auth-passkey-challenge-store.yaml',
          path: 'required_controls',
          message:
            'Core platform contract `contracts/auth-passkey-challenge-store.yaml` must include `challenge_hash_only` in `required_controls`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/auth-passkey-challenge-store.yaml',
          path: 'uniqueness',
          message:
            'Core platform contract `contracts/auth-passkey-challenge-store.yaml` must include `challenge_hash` in `uniqueness`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/auth-passkey-challenge-store.yaml',
          path: 'adapter_contract.status',
          message:
            'Core platform auth passkey challenge store adapter boundary must stay `typed_adapter_boundary_no_migration` until a migration-backed storage implementation exists.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/auth-passkey-challenge-store.yaml',
          path: 'forbidden_storage_values',
          message:
            'Core platform contract `contracts/auth-passkey-challenge-store.yaml` must include `client_data_json` in `forbidden_storage_values`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/auth-passkey-challenge-store.yaml',
          path: 'adapter_contract.required_adapter_fields',
          message:
            'Core platform contract `contracts/auth-passkey-challenge-store.yaml` must include `consume_receipt_ref` in `adapter_contract.required_adapter_fields`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/auth-passkey-challenge-store.yaml',
          path: 'adapter_contract.required_adapter_controls',
          message:
            'Core platform contract `contracts/auth-passkey-challenge-store.yaml` must include `atomic_single_use_consume` in `adapter_contract.required_adapter_controls`.'
        });
      }
    );
  });

  test('fails when auth OAuth callback state gates drift', async () => {
    await withRepositoryRoot(
      {
        ...createValidCoreFiles(),
        'contracts/auth-oauth-callback-state.yaml': `
contract:
  status: live
  owner_boundary: product
required_state_fields:
  - state_id
state_values:
  - active
required_controls:
  - tenant_actor_scope
uniqueness:
  - state_id
adapter_contract:
  status: migration_ready
  adapter_kinds:
    - oauth_callback_state_hash_store
  required_adapter_fields:
    - adapter_id
  required_adapter_controls:
    - ttl_enforced_by_storage
forbidden_storage_values:
  - oauth_callback_state_plaintext
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryCoreContract({
          repositoryRoot,
          repositoryServiceContract: createCoreServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/auth-oauth-callback-state.yaml',
          path: 'contract.status',
          message:
            'Core platform auth OAuth callback state contract must stay `contract_only_no_storage` until durable storage exists.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/auth-oauth-callback-state.yaml',
          path: 'contract.owner_boundary',
          message:
            'Core platform auth OAuth callback state contract must keep owner_boundary `identity`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/auth-oauth-callback-state.yaml',
          path: 'required_state_fields',
          message:
            'Core platform contract `contracts/auth-oauth-callback-state.yaml` must include `callback_state_hash` in `required_state_fields`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/auth-oauth-callback-state.yaml',
          path: 'recommended_state_fields',
          message:
            'Core platform contract `contracts/auth-oauth-callback-state.yaml` must include `revoked_by_command_id` in `recommended_state_fields`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/auth-oauth-callback-state.yaml',
          path: 'required_controls',
          message:
            'Core platform contract `contracts/auth-oauth-callback-state.yaml` must include `callback_state_hash_only` in `required_controls`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/auth-oauth-callback-state.yaml',
          path: 'required_controls',
          message:
            'Core platform contract `contracts/auth-oauth-callback-state.yaml` must include `raw_provider_payload_rejected` in `required_controls`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/auth-oauth-callback-state.yaml',
          path: 'uniqueness',
          message:
            'Core platform contract `contracts/auth-oauth-callback-state.yaml` must include `callback_state_hash` in `uniqueness`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/auth-oauth-callback-state.yaml',
          path: 'adapter_contract.status',
          message:
            'Core platform auth OAuth callback state adapter boundary must stay `typed_adapter_boundary_no_migration` until a migration-backed storage implementation exists.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/auth-oauth-callback-state.yaml',
          path: 'adapter_contract.required_adapter_fields',
          message:
            'Core platform contract `contracts/auth-oauth-callback-state.yaml` must include `revoke_receipt_ref` in `adapter_contract.required_adapter_fields`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/auth-oauth-callback-state.yaml',
          path: 'adapter_contract.required_adapter_controls',
          message:
            'Core platform contract `contracts/auth-oauth-callback-state.yaml` must include `atomic_single_use_consume` in `adapter_contract.required_adapter_controls`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/auth-oauth-callback-state.yaml',
          path: 'forbidden_storage_values',
          message:
            'Core platform contract `contracts/auth-oauth-callback-state.yaml` must include `authorization_code` in `forbidden_storage_values`.'
        });
      }
    );
  });

  test('fails when auth audit event persistence gates drift', async () => {
    await withRepositoryRoot(
      {
        ...createValidCoreFiles(),
        'contracts/auth-audit-event-persistence.yaml': `
contract:
  status: live
  owner_boundary: identity
  source_boundary: product
required_auth_event_fields:
  - event_id
required_auth_event_types:
  - core.auth.session.issued
required_controls:
  - request_id_propagation
forbidden_payload_values:
  - refresh_token_plaintext
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryCoreContract({
          repositoryRoot,
          repositoryServiceContract: createCoreServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/auth-audit-event-persistence.yaml',
          path: 'contract.status',
          message:
            'Core platform auth audit event persistence contract must stay `append_receipt_gate_no_durable_store` until durable append-only storage exists.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/auth-audit-event-persistence.yaml',
          path: 'contract.owner_boundary',
          message:
            'Core platform auth audit event persistence contract must keep owner_boundary `audit`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/auth-audit-event-persistence.yaml',
          path: 'required_auth_event_fields',
          message:
            'Core platform contract `contracts/auth-audit-event-persistence.yaml` must include `auth_operation_id` in `required_auth_event_fields`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/auth-audit-event-persistence.yaml',
          path: 'required_controls',
          message:
            'Core platform contract `contracts/auth-audit-event-persistence.yaml` must include `append_only_audit_store` in `required_controls`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/auth-audit-event-persistence.yaml',
          path: 'forbidden_payload_values',
          message:
            'Core platform contract `contracts/auth-audit-event-persistence.yaml` must include `raw_provider_payload` in `forbidden_payload_values`.'
        });
      }
    );
  });

  test('fails when auth audit storage adapter gates drift', async () => {
    await withRepositoryRoot(
      {
        ...createValidCoreFiles(),
        'contracts/auth-audit-storage-adapter.yaml': `
contract:
  status: live
  owner_boundary: identity
  source_contract: local
required_adapter_fields:
  - adapter_id
required_adapter_kinds:
  - append_only_table
required_controls:
  - append_only_enforced_by_storage
forbidden_storage_values:
  - refresh_token_plaintext
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryCoreContract({
          repositoryRoot,
          repositoryServiceContract: createCoreServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/auth-audit-storage-adapter.yaml',
          path: 'contract.status',
          message:
            'Core platform auth audit storage adapter contract must stay `contract_only_no_adapter` until a durable adapter exists.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/auth-audit-storage-adapter.yaml',
          path: 'contract.owner_boundary',
          message:
            'Core platform auth audit storage adapter contract must keep owner_boundary `audit`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/auth-audit-storage-adapter.yaml',
          path: 'contract.source_contract',
          message:
            'Core platform auth audit storage adapter contract must reference `contracts/auth-audit-event-persistence.yaml`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/auth-audit-storage-adapter.yaml',
          path: 'required_adapter_fields',
          message:
            'Core platform contract `contracts/auth-audit-storage-adapter.yaml` must include `transaction_boundary_ref` in `required_adapter_fields`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/auth-audit-storage-adapter.yaml',
          path: 'required_adapter_kinds',
          message:
            'Core platform contract `contracts/auth-audit-storage-adapter.yaml` must include `transactional_outbox` in `required_adapter_kinds`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/auth-audit-storage-adapter.yaml',
          path: 'required_controls',
          message:
            'Core platform contract `contracts/auth-audit-storage-adapter.yaml` must include `unique_event_id_enforced_by_storage` in `required_controls`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/auth-audit-storage-adapter.yaml',
          path: 'forbidden_storage_values',
          message:
            'Core platform contract `contracts/auth-audit-storage-adapter.yaml` must include `raw_provider_payload` in `forbidden_storage_values`.'
        });
      }
    );
  });

  test('fails when auth idempotency storage gates drift', async () => {
    await withRepositoryRoot(
      {
        ...createValidCoreFiles(),
        'contracts/auth-idempotency-storage.yaml': `
contract:
  status: live
  owner_boundary: product
required_record_fields:
  - idempotency_key
state_values:
  - in_progress
required_controls:
  - tenant_actor_scope
uniqueness:
  - idempotency_key
adapter_contract:
  status: live
  adapter_kinds:
    - atomic_unique_claim_table
  required_adapter_fields:
    - adapter_id
  required_adapter_controls:
    - unique_scope_enforced_by_storage
forbidden_storage_values:
  - raw_request_body
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryCoreContract({
          repositoryRoot,
          repositoryServiceContract: createCoreServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/auth-idempotency-storage.yaml',
          path: 'contract.status',
          message:
            'Core platform auth idempotency storage contract must stay `contract_only_no_storage` until durable storage exists.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/auth-idempotency-storage.yaml',
          path: 'contract.owner_boundary',
          message:
            'Core platform auth idempotency storage contract must keep owner_boundary `identity`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/auth-idempotency-storage.yaml',
          path: 'required_record_fields',
          message:
            'Core platform contract `contracts/auth-idempotency-storage.yaml` must include `request_fingerprint_hash` in `required_record_fields`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/auth-idempotency-storage.yaml',
          path: 'required_record_fields',
          message:
            'Core platform contract `contracts/auth-idempotency-storage.yaml` must include `audit_event_ref` in `required_record_fields`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/auth-idempotency-storage.yaml',
          path: 'required_controls',
          message:
            'Core platform contract `contracts/auth-idempotency-storage.yaml` must include `same_request_replay_returns_saved_result` in `required_controls`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/auth-idempotency-storage.yaml',
          path: 'uniqueness',
          message:
            'Core platform contract `contracts/auth-idempotency-storage.yaml` must include `tenant_id` in `uniqueness`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/auth-idempotency-storage.yaml',
          path: 'adapter_contract.status',
          message:
            'Core platform auth idempotency storage adapter boundary must stay `typed_adapter_boundary_no_migration` until a migration-backed storage implementation exists.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/auth-idempotency-storage.yaml',
          path: 'adapter_contract.adapter_kinds',
          message:
            'Core platform contract `contracts/auth-idempotency-storage.yaml` must include `transactional_idempotency_record` in `adapter_contract.adapter_kinds`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/auth-idempotency-storage.yaml',
          path: 'adapter_contract.required_adapter_fields',
          message:
            'Core platform contract `contracts/auth-idempotency-storage.yaml` must include `transaction_boundary_ref` in `adapter_contract.required_adapter_fields`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/auth-idempotency-storage.yaml',
          path: 'adapter_contract.required_adapter_controls',
          message:
            'Core platform contract `contracts/auth-idempotency-storage.yaml` must include `atomic_claim_or_conflict` in `adapter_contract.required_adapter_controls`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/auth-idempotency-storage.yaml',
          path: 'forbidden_storage_values',
          message:
            'Core platform contract `contracts/auth-idempotency-storage.yaml` must include `provider_secret` in `forbidden_storage_values`.'
        });
      }
    );
  });
});

async function withRepositoryRoot(
  files: Record<string, string>,
  callback: (repositoryRoot: string) => Promise<void>
): Promise<void> {
  const repositoryRoot = await mkdtemp(join(tmpdir(), 'zdp-core-contract-'));

  try {
    for (const [relativePath, source] of Object.entries(files)) {
      const absolutePath = join(repositoryRoot, relativePath);

      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, source.trimStart(), 'utf8');
    }

    await callback(repositoryRoot);
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true });
  }
}

function createCoreServiceContract(): unknown {
  return {
    service: {
      repo: 'zdp-core-platform'
    }
  };
}

function createValidCoreFiles(): Record<string, string> {
  return {
    '.github/workflows/ci.yml': `
name: CI
on:
  push:
    branches:
      - main
  pull_request:
permissions:
  contents: read
jobs:
  rust:
    timeout-minutes: 15
    steps:
      - name: Checkout
        uses: actions/checkout@v6
      - name: Install Rust toolchain
        uses: dtolnay/rust-toolchain@stable
        with:
          components: rustfmt
      - name: Check formatting
        run: cargo fmt --check
      - name: Check
        run: cargo check --locked --all-targets
      - name: Test
        run: cargo test --locked
`,
    'contracts/core-boundaries.yaml': `
permission_model:
  roles:
    - owner
    - admin
    - member
    - viewer
    - service_account
authorization:
  final_decision_owner: access
boundaries:
  - id: identity
    owns: [app_user_id]
    must_not_own: [ledger_balance]
    db_schema: identity
    db_role: core_identity_user
    audit_required: true
    split_trigger: [identity security review requires independent deployment]
  - id: accounts
    owns: [organization]
    must_not_own: [permission_decision]
    db_schema: accounts
    db_role: core_accounts_user
    audit_required: true
    split_trigger: [account lifecycle needs isolated review]
  - id: access
    owns: [roles]
    must_not_own: [product_feature_logic]
    db_schema: access
    db_role: core_access_user
    audit_required: true
    split_trigger: [permission checks become a bottleneck]
  - id: consent
    owns: [consent_records]
    must_not_own: [provider_credentials]
    db_schema: consent
    db_role: core_consent_user
    audit_required: true
    split_trigger: [privacy review requires separate evidence export]
  - id: audit
    owns: [audit_log_contract]
    must_not_own: [raw_secret_values]
    db_schema: audit
    db_role: core_audit_writer
    audit_required: true
    split_trigger: [append-only audit storage needs independent durability policy]
`,
    'contracts/command-envelope.yaml': `
required_fields:
  - command_id
  - actor_id
  - tenant_id
  - reason
  - idempotency_key
`,
    'contracts/audit-event.yaml': `
forbidden_payload_values:
  - raw_secret
  - token
  - authorization_header
  - raw_personal_payload
`,
    'contracts/consent-record.yaml': `
required_fields:
  - purpose
  - scope
  - evidence_ref
withdrawal_record:
  required_fields:
    - withdrawal_id
`,
    'contracts/auth-session-runtime.yaml': `
contract:
  version: 1
  status: contracted_no_live_handler
  owner_repo: zdp-core-platform
  catalog_source: zdp-api-contracts/contracts/apis/catalog.yaml
required_operations:
  - operation_id: core.auth.registrations.create
    runtime_status: contracted_no_live_handler
    session_effect: none
    handoff_owner: identity
  - operation_id: core.auth.sessions.create
    runtime_status: contracted_no_live_handler
    session_effect: issue
    handoff_owner: identity
  - operation_id: core.auth.sessions.refresh
    runtime_status: contracted_no_live_handler
    session_effect: refresh
    handoff_owner: identity
  - operation_id: core.auth.sessions.revoke_current
    runtime_status: contracted_no_live_handler
    session_effect: revoke
    handoff_owner: identity
  - operation_id: core.auth.recovery_requests.create
    runtime_status: contracted_no_live_handler
    session_effect: none
    handoff_owner: identity
  - operation_id: core.auth.passkey_challenges.create
    runtime_status: contracted_no_live_handler
    session_effect: none
    handoff_owner: identity
  - operation_id: core.auth.passkey_assertions.verify
    runtime_status: contracted_no_live_handler
    session_effect: issue
    handoff_owner: identity
  - operation_id: core.auth.oauth_callbacks.accept
    runtime_status: contracted_no_live_handler
    session_effect: issue
    handoff_owner: identity
required_handoff_controls:
  - request_id_propagation
  - trace_id_propagation
  - idempotency_key_scope
  - audit_event_emission
  - session_store_contract
  - credential_vault_handoff
  - passkey_challenge_store_contract
  - oauth_callback_state_verification
  - refresh_token_rotation_without_plaintext_storage
promotion_blockers:
  - no_identity_session_store_implementation
  - no_credential_vault_capability_handoff_implementation
  - no_passkey_challenge_store_implementation
  - no_auth_audit_event_persistence_implementation
  - no_idempotency_storage_implementation
  - no_product_reviewer_approval
forbidden_runtime_claims:
  - live_login_handler
  - live_session_issue_handler
  - live_session_refresh_handler
  - live_session_revoke_handler
  - plaintext_refresh_token_storage
  - provider_secret_storage
  - product_authorization_decision
`,
    'contracts/auth-runtime-readiness.yaml': `
contract:
  version: 1
  status: readiness_summary_no_runtime_promotion
  owner_repo: zdp-core-platform
  owner_boundary: identity
  runtime_status: contracted_no_live_handler
promotion_ready: false
production_route_ready: false
required_gate_states:
  - gate_id: request_id_propagation
    contract_status: required_by_auth_session_runtime
    typed_boundary_status: no_typed_boundary_needed
    durable_implementation_status: propagation_implementation_missing
    review_status: review_missing
    promotion_blocker: no_request_id_propagation_implementation
    evidence_contracts:
      - contracts/auth-session-runtime.yaml
  - gate_id: trace_id_propagation
    contract_status: required_by_auth_session_runtime
    typed_boundary_status: no_typed_boundary_needed
    durable_implementation_status: propagation_implementation_missing
    review_status: review_missing
    promotion_blocker: no_trace_id_propagation_implementation
    evidence_contracts:
      - contracts/auth-session-runtime.yaml
  - gate_id: session_store_contract
    contract_status: contract_only_no_migration
    typed_boundary_status: typed_adapter_boundary_no_migration
    durable_implementation_status: durable_implementation_missing
    review_status: review_missing
    promotion_blocker: no_identity_session_store_implementation
    evidence_contracts:
      - contracts/auth-session-runtime.yaml
      - contracts/identity-session-store.yaml
  - gate_id: credential_vault_handoff
    contract_status: contract_only_no_capability_client
    typed_boundary_status: typed_capability_client_boundary_no_vault_client
    durable_implementation_status: live_capability_client_missing
    review_status: review_missing
    promotion_blocker: no_credential_vault_capability_handoff_implementation
    evidence_contracts:
      - contracts/auth-session-runtime.yaml
      - contracts/auth-credential-vault-handoff.yaml
  - gate_id: passkey_challenge_store_contract
    contract_status: contract_only_no_storage
    typed_boundary_status: typed_adapter_boundary_no_migration
    durable_implementation_status: durable_implementation_missing
    review_status: review_missing
    promotion_blocker: no_passkey_challenge_store_implementation
    evidence_contracts:
      - contracts/auth-session-runtime.yaml
      - contracts/auth-passkey-challenge-store.yaml
  - gate_id: oauth_callback_state_verification
    contract_status: contract_only_no_storage
    typed_boundary_status: typed_adapter_boundary_no_migration
    durable_implementation_status: durable_implementation_missing
    review_status: review_missing
    promotion_blocker: no_oauth_callback_state_storage_implementation
    evidence_contracts:
      - contracts/auth-session-runtime.yaml
      - contracts/auth-oauth-callback-state.yaml
  - gate_id: audit_event_emission
    contract_status: append_receipt_gate_no_durable_store
    typed_boundary_status: typed_port_no_durable_store
    durable_implementation_status: durable_implementation_missing
    review_status: review_missing
    promotion_blocker: no_auth_audit_event_persistence_implementation
    evidence_contracts:
      - contracts/auth-session-runtime.yaml
      - contracts/auth-audit-event-persistence.yaml
  - gate_id: auth_audit_storage_adapter
    contract_status: contract_only_no_adapter
    typed_boundary_status: typed_adapter_boundary_no_migration
    durable_implementation_status: durable_implementation_missing
    review_status: review_missing
    promotion_blocker: no_auth_audit_storage_adapter_implementation
    evidence_contracts:
      - contracts/auth-audit-event-persistence.yaml
      - contracts/auth-audit-storage-adapter.yaml
  - gate_id: idempotency_key_scope
    contract_status: contract_only_no_storage
    typed_boundary_status: typed_adapter_boundary_no_migration
    durable_implementation_status: durable_implementation_missing
    review_status: review_missing
    promotion_blocker: no_idempotency_storage_implementation
    evidence_contracts:
      - contracts/auth-session-runtime.yaml
      - contracts/auth-idempotency-storage.yaml
  - gate_id: refresh_token_rotation_without_plaintext_storage
    contract_status: contract_only_no_migration
    typed_boundary_status: typed_adapter_boundary_no_migration
    durable_implementation_status: durable_implementation_missing
    review_status: review_missing
    promotion_blocker: no_refresh_token_rotation_storage_implementation
    evidence_contracts:
      - contracts/auth-session-runtime.yaml
      - contracts/identity-session-store.yaml
  - gate_id: product_reviewer_approval
    contract_status: required_by_auth_session_runtime
    typed_boundary_status: no_typed_boundary_needed
    durable_implementation_status: review_missing
    review_status: review_missing
    promotion_blocker: no_product_reviewer_approval
    evidence_contracts:
      - contracts/auth-session-runtime.yaml
blocking_summary:
  - no_request_id_propagation_implementation
  - no_trace_id_propagation_implementation
  - no_identity_session_store_implementation
  - no_credential_vault_capability_handoff_implementation
  - no_passkey_challenge_store_implementation
  - no_oauth_callback_state_storage_implementation
  - no_auth_audit_event_persistence_implementation
  - no_auth_audit_storage_adapter_implementation
  - no_idempotency_storage_implementation
  - no_refresh_token_rotation_storage_implementation
  - no_product_reviewer_approval
forbidden_readiness_claims:
  - production_ready
  - live_auth_handler_ready
  - durable_storage_ready
  - oauth_provider_exchange_ready
  - product_route_unblocked
`,
    'contracts/identity-session-store.yaml': `
contract:
  version: 1
  status: contract_only_no_migration
  owner_repo: zdp-core-platform
  owner_boundary: identity
required_session_record_fields:
  - session_id
  - subject_id
  - tenant_id
  - session_version
  - state
  - issued_at
  - expires_at
  - refresh_token_family_id
  - refresh_token_hash
  - rotation_counter
  - created_by_command_id
  - trace_id
state_values:
  - active
  - refreshed
  - revoked
  - expired
  - compromised
required_refresh_rotation_fields:
  - refresh_token_family_id
  - refresh_token_hash
  - previous_refresh_token_hash
  - rotation_counter
  - rotated_at
  - rotated_by_command_id
  - trace_id
required_revocation_fields:
  - revoked_at
  - revoked_by_actor_id
  - revoke_reason
  - revocation_command_id
  - trace_id
required_controls:
  - tenant_actor_scope
  - opaque_session_id
  - hashed_refresh_token_only
  - refresh_token_rotation
  - refresh_reuse_detection
  - revoke_current_session
  - revoke_family_on_reuse
  - ttl_enforced_by_storage
  - command_idempotency_reference
  - audit_event_reference
uniqueness:
  - session_id
  - refresh_token_hash
  - created_by_command_id
adapter_contract:
  status: typed_adapter_boundary_no_migration
  adapter_kinds:
    - transactional_session_store
    - session_state_table
  required_adapter_fields:
    - adapter_id
    - storage_ref
    - transaction_boundary_ref
    - issue_receipt_ref
    - refresh_receipt_ref
    - revoke_receipt_ref
    - reuse_detection_ref
    - migration_or_adapter_review_ref
  required_adapter_controls:
    - unique_session_id_enforced_by_storage
    - unique_refresh_token_hash_enforced_by_storage
    - atomic_refresh_rotation
    - reuse_detection_blocks_family
    - revocation_state_enforced_by_storage
    - ttl_enforced_by_storage
    - audit_event_reference_required
    - no_plaintext_refresh_token_storage
forbidden_storage_values:
  - refresh_token_plaintext
  - session_secret_plaintext
  - oauth_refresh_token_plaintext
  - provider_secret
  - authorization_header
  - cookie_header
  - raw_provider_payload
  - password_hash
`,
    'contracts/auth-passkey-challenge-store.yaml': `
contract:
  version: 1
  status: contract_only_no_storage
  owner_repo: zdp-core-platform
  owner_boundary: identity
required_challenge_fields:
  - challenge_id
  - ceremony_type
  - actor_id
  - tenant_id
  - challenge_hash
  - relying_party_id
  - state
  - issued_at
  - expires_at
  - created_by_command_id
  - idempotency_key
  - trace_id
  - audit_event_ref
recommended_challenge_fields:
  - request_id
  - consumed_at
  - consumed_by_command_id
  - expired_at
state_values:
  - active
  - consumed
  - expired
  - revoked
ceremony_types:
  - registration
  - authentication
  - recovery
required_controls:
  - tenant_actor_scope
  - challenge_hash_only
  - single_use_challenge
  - consume_requires_active_state
  - ttl_enforced_by_storage
  - command_idempotency_reference
  - request_id_propagation
  - trace_id_propagation
  - audit_event_reference
  - replay_rejected_after_consumption
uniqueness:
  - challenge_id
  - challenge_hash
  - created_by_command_id
adapter_contract:
  status: typed_adapter_boundary_no_migration
  adapter_kinds:
    - passkey_challenge_hash_store
    - passkey_challenge_state_table
  required_adapter_fields:
    - adapter_id
    - storage_ref
    - transaction_boundary_ref
    - issue_receipt_ref
    - consume_receipt_ref
    - expire_receipt_ref
    - migration_or_adapter_review_ref
  required_adapter_controls:
    - unique_challenge_id_enforced_by_storage
    - unique_challenge_hash_enforced_by_storage
    - challenge_version_enforced_by_storage
    - atomic_single_use_consume
    - active_state_required_for_consume
    - ttl_enforced_by_storage
    - audit_event_reference_required
    - no_raw_webauthn_payload_storage
forbidden_storage_values:
  - passkey_challenge_plaintext
  - client_data_json
  - attestation_object
  - authenticator_data
  - signature
  - user_handle_raw
  - provider_secret
  - authorization_header
  - cookie_header
  - raw_provider_payload
`,
    'contracts/auth-oauth-callback-state.yaml': `
contract:
  version: 1
  status: contract_only_no_storage
  owner_repo: zdp-core-platform
  owner_boundary: identity
required_state_fields:
  - state_id
  - provider_id
  - actor_id
  - tenant_id
  - callback_state_hash
  - nonce_hash
  - pkce_verifier_ref
  - redirect_uri_ref
  - state
  - issued_at
  - expires_at
  - created_by_command_id
  - idempotency_key
  - trace_id
  - audit_event_ref
recommended_state_fields:
  - request_id
  - consumed_at
  - consumed_by_command_id
  - expired_at
  - revoked_at
  - revoked_by_command_id
state_values:
  - active
  - consumed
  - expired
  - revoked
required_controls:
  - tenant_actor_scope
  - callback_state_hash_only
  - nonce_hash_only
  - pkce_verifier_ref_only
  - redirect_uri_ref_only
  - single_use_callback_state
  - consume_requires_active_state
  - provider_id_scope
  - ttl_enforced_by_storage
  - command_idempotency_reference
  - request_id_propagation
  - trace_id_propagation
  - audit_event_reference
  - replay_rejected_after_consumption
  - raw_provider_payload_rejected
uniqueness:
  - state_id
  - callback_state_hash
  - created_by_command_id
adapter_contract:
  status: typed_adapter_boundary_no_migration
  adapter_kinds:
    - oauth_callback_state_hash_store
    - oauth_callback_state_table
  required_adapter_fields:
    - adapter_id
    - storage_ref
    - transaction_boundary_ref
    - issue_receipt_ref
    - consume_receipt_ref
    - expire_receipt_ref
    - revoke_receipt_ref
    - migration_or_adapter_review_ref
  required_adapter_controls:
    - unique_state_id_enforced_by_storage
    - unique_callback_state_hash_enforced_by_storage
    - state_version_enforced_by_storage
    - atomic_single_use_consume
    - active_state_required_for_consume
    - ttl_enforced_by_storage
    - audit_event_reference_required
    - no_raw_oauth_payload_storage
forbidden_storage_values:
  - oauth_callback_state_plaintext
  - callback_state_plaintext
  - oauth_state_plaintext
  - nonce_plaintext
  - pkce_verifier_plaintext
  - authorization_code
  - oauth_access_token
  - oauth_refresh_token_plaintext
  - provider_secret
  - authorization_header
  - cookie_header
  - raw_provider_payload
  - raw_provider_error
`,
    'contracts/auth-credential-vault-handoff.yaml': `
contract:
  version: 1
  status: contract_only_no_capability_client
  owner_repo: zdp-core-platform
  owner_boundary: identity
  vault_owner_repo: zdp-privacy-credential-vault
required_capability_fields:
  - capability_ref
  - capability_subject_id
  - tenant_id
  - capability_scope
  - credential_kind
  - issued_at
  - expires_at
  - created_by_command_id
  - trace_id
required_credential_kinds:
  - oauth_refresh_token
  - passkey_credential
  - password_recovery_secret
  - session_refresh_token_material
required_scopes:
  - store_credential
  - read_credential_metadata
  - rotate_credential
  - revoke_credential
required_handoff_controls:
  - vault_capability_ref_only
  - short_lived_capability
  - tenant_actor_scope
  - request_id_propagation
  - trace_id_propagation
  - command_idempotency_reference
  - audit_event_reference
  - no_raw_secret_return
  - vault_access_audit_required
capability_client_contract:
  status: typed_capability_client_boundary_no_vault_client
  client_kinds:
    - vault_capability_client
    - credential_metadata_client
  required_client_fields:
    - client_id
    - vault_owner_ref
    - capability_ref
    - capability_subject_id
    - tenant_id
    - credential_kind
    - capability_scope
    - issued_at
    - expires_at
    - created_by_command_id
    - idempotency_key
    - trace_id
    - request_id
    - audit_event_ref
    - vault_access_audit_ref
    - review_or_client_implementation_ref
  required_client_controls:
    - capability_ref_only
    - metadata_only_response
    - short_lived_capability
    - tenant_actor_scope
    - request_id_propagation
    - trace_id_propagation
    - command_idempotency_reference
    - audit_event_reference_required
    - vault_access_audit_required
    - raw_secret_material_rejected
    - no_provider_payload_storage
forbidden_payload_values:
  - refresh_token_plaintext
  - oauth_refresh_token_plaintext
  - provider_secret
  - passkey_private_key
  - password_plaintext
  - password_hash
  - authorization_header
  - cookie_header
  - raw_provider_payload
`,
    'contracts/auth-audit-event-persistence.yaml': `
contract:
  version: 1
  status: append_receipt_gate_no_durable_store
  owner_repo: zdp-core-platform
  owner_boundary: audit
  source_boundary: identity
required_auth_event_fields:
  - event_id
  - event_type
  - actor_id
  - tenant_id
  - subject_ref
  - auth_operation_id
  - auth_session_effect
  - outcome
  - command_id
  - idempotency_key
  - occurred_at
  - trace_id
  - request_id
  - transaction_or_outbox_ref
required_auth_event_types:
  - core.auth.registration.requested
  - core.auth.session.issued
  - core.auth.session.refreshed
  - core.auth.session.revoked
  - core.auth.recovery.requested
  - core.auth.passkey.challenge.created
  - core.auth.passkey.assertion.verified
  - core.auth.oauth.callback.accepted
required_controls:
  - append_only_audit_store
  - transaction_or_outbox_reference
  - command_idempotency_reference
  - request_id_propagation
  - trace_id_propagation
  - tenant_actor_scope
  - redacted_summary_only
  - evidence_ref_for_privileged_payload
  - append_receipt_required_before_auth_success
  - auth_failure_event_recorded
  - audit_write_failure_blocks_auth_success
conditional_auth_failure_event_fields:
  - failure_evidence_ref
forbidden_payload_values:
  - refresh_token_plaintext
  - oauth_refresh_token_plaintext
  - provider_secret
  - passkey_private_key
  - password_plaintext
  - password_hash
  - authorization_header
  - cookie_header
  - raw_provider_payload
  - raw_error_payload
`,
    'contracts/auth-audit-storage-adapter.yaml': `
contract:
  version: 1
  status: contract_only_no_adapter
  owner_repo: zdp-core-platform
  owner_boundary: audit
  source_contract: contracts/auth-audit-event-persistence.yaml
required_adapter_fields:
  - adapter_id
  - adapter_kind
  - owner_boundary
  - storage_ref
  - transaction_boundary_ref
  - append_receipt_ref
  - replay_or_reconciliation_ref
  - migration_or_adapter_review_ref
required_adapter_kinds:
  - append_only_table
  - transactional_outbox
required_controls:
  - append_only_enforced_by_storage
  - unique_event_id_enforced_by_storage
  - transaction_or_outbox_atomicity
  - audit_write_failure_blocks_auth_success
  - redaction_checked_before_write
  - raw_payload_rejected_before_write
  - replay_or_reconciliation_path
  - migration_or_adapter_review_required
forbidden_storage_values:
  - refresh_token_plaintext
  - oauth_refresh_token_plaintext
  - provider_secret
  - passkey_private_key
  - password_plaintext
  - password_hash
  - authorization_header
  - cookie_header
  - raw_provider_payload
  - raw_error_payload
`,
    'contracts/auth-idempotency-storage.yaml': `
contract:
  version: 1
  status: contract_only_no_storage
  owner_repo: zdp-core-platform
  owner_boundary: identity
required_record_fields:
  - idempotency_key
  - command_id
  - command_type
  - actor_id
  - tenant_id
  - resource_ref
  - request_fingerprint_hash
  - processing_state
  - final_status
  - final_result_ref
  - first_seen_at
  - last_seen_at
  - expires_at
  - trace_id
  - audit_event_ref
state_values:
  - in_progress
  - succeeded
  - failed
  - conflicted
  - expired
required_controls:
  - tenant_actor_scope
  - command_type_scope
  - resource_scope
  - request_fingerprint_match
  - same_request_replay_returns_saved_result
  - different_fingerprint_conflict
  - in_progress_duplicate_suppression
  - ttl_enforced_by_storage
  - atomic_claim_or_unique_constraint
  - audit_event_reference
  - no_raw_payload_storage
uniqueness:
  - tenant_id
  - actor_id
  - command_type
  - resource_ref
  - idempotency_key
adapter_contract:
  status: typed_adapter_boundary_no_migration
  adapter_kinds:
    - atomic_unique_claim_table
    - transactional_idempotency_record
  required_adapter_fields:
    - adapter_id
    - storage_ref
    - transaction_boundary_ref
    - claim_receipt_ref
    - replay_result_ref
    - conflict_receipt_ref
    - migration_or_adapter_review_ref
  required_adapter_controls:
    - unique_scope_enforced_by_storage
    - atomic_claim_or_conflict
    - ttl_enforced_by_storage
    - no_raw_payload_storage
    - audit_event_reference_required
forbidden_storage_values:
  - raw_request_body
  - raw_secret
  - refresh_token_plaintext
  - oauth_refresh_token_plaintext
  - provider_secret
  - authorization_header
  - cookie_header
  - raw_provider_payload
  - password_hash
`
  };
}
