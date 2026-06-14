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
        file: 'contracts/core-boundaries.yaml',
        path: 'repository.root',
        message:
          'Core platform repository must include `contracts/core-boundaries.yaml`.'
      });
      expect(diagnostics).toHaveLength(5);
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
  - no_identity_session_store
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
          path: 'forbidden_runtime_claims',
          message:
            'Core platform contract `contracts/auth-session-runtime.yaml` must include `plaintext_refresh_token_storage` in `forbidden_runtime_claims`.'
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
  - no_identity_session_store
  - no_credential_vault_capability_handoff
  - no_auth_audit_event_persistence
  - no_idempotency_storage
  - no_product_reviewer_approval
forbidden_runtime_claims:
  - live_login_handler
  - live_session_issue_handler
  - live_session_refresh_handler
  - live_session_revoke_handler
  - plaintext_refresh_token_storage
  - provider_secret_storage
  - product_authorization_decision
`
  };
}
