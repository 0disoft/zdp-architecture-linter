import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { validateRepositoryConnectorsContract } from '../src/connectors-contract-rules.ts';

describe('connectors contract rules', () => {
  test('passes when the connectors platform repository declares provider contracts', async () => {
    await withRepositoryRoot(createValidConnectorsFiles(), async (repositoryRoot) => {
      const diagnostics = await validateRepositoryConnectorsContract({
        repositoryRoot,
        repositoryServiceContract: createConnectorsServiceContract()
      });

      expect(diagnostics).toEqual([]);
    });
  });

  test('skips repositories that are not zdp-connectors-platform', async () => {
    await withRepositoryRoot({}, async (repositoryRoot) => {
      const diagnostics = await validateRepositoryConnectorsContract({
        repositoryRoot,
        repositoryServiceContract: {
          service: {
            repo: 'zdp-privacy-access-broker'
          }
        }
      });

      expect(diagnostics).toEqual([]);
    });
  });

  test('fails when required connectors contract files are missing', async () => {
    await withRepositoryRoot({}, async (repositoryRoot) => {
      const diagnostics = await validateRepositoryConnectorsContract({
        repositoryRoot,
        repositoryServiceContract: createConnectorsServiceContract()
      });

      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-CONNECTORS-001',
        severity: 'error',
        file: 'contracts/provider-registry.yaml',
        path: 'repository.root',
        message:
          'Connectors repository must include `contracts/provider-registry.yaml`.'
      });
      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-CONNECTORS-001',
        severity: 'error',
        file: 'contracts/sync-state.yaml',
        path: 'repository.root',
        message: 'Connectors repository must include `contracts/sync-state.yaml`.'
      });
      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-CONNECTORS-001',
        severity: 'error',
        file: 'contracts/webhook-replay.yaml',
        path: 'repository.root',
        message:
          'Connectors repository must include `contracts/webhook-replay.yaml`.'
      });
      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-CONNECTORS-001',
        severity: 'error',
        file: 'contracts/provider-boundaries.yaml',
        path: 'repository.root',
        message:
          'Connectors repository must include `contracts/provider-boundaries.yaml`.'
      });
    });
  });

  test('fails when a connectors contract file is not valid YAML', async () => {
    await withRepositoryRoot(
      {
        ...createValidConnectorsFiles(),
        'contracts/provider-registry.yaml': 'contract: [broken'
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryConnectorsContract({
          repositoryRoot,
          repositoryServiceContract: createConnectorsServiceContract()
        });

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]).toMatchObject({
          ruleId: 'ZDP-CONNECTORS-001',
          severity: 'error',
          file: 'contracts/provider-registry.yaml',
          path: 'yaml'
        });
      }
    );
  });

  test('fails when provider registry allows raw credentials or skips broker scope', async () => {
    await withRepositoryRoot(
      {
        ...createValidConnectorsFiles(),
        'contracts/provider-registry.yaml': `
contract:
  version: 1
  status: draft
registry_owner: zdp-privacy-credential-vault
provider_required:
  - provider_id
providers:
  - id: google
    adapter_boundary: deploy_unit
    credential_source: local_refresh_token
    privacy_broker_required: false
    sync_state_required: false
    webhook_signature_required: false
    request_id_required: false
    trace_id_required: false
forbidden_values:
  - oauth_refresh_token_plaintext
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryConnectorsContract({
          repositoryRoot,
          repositoryServiceContract: createConnectorsServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CONNECTORS-001',
          severity: 'error',
          file: 'contracts/provider-registry.yaml',
          path: 'registry_owner',
          message:
            'Provider registry owner must remain `zdp-connectors-platform`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CONNECTORS-001',
          severity: 'error',
          file: 'contracts/provider-registry.yaml',
          path: 'providers.google.credential_source',
          message:
            'Provider `google` must use credential vault capability as its credential source.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CONNECTORS-001',
          severity: 'error',
          file: 'contracts/provider-registry.yaml',
          path: 'providers',
          message: 'Provider registry must declare provider `microsoft`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CONNECTORS-001',
          severity: 'error',
          file: 'contracts/provider-registry.yaml',
          path: 'forbidden_values',
          message:
            'Connectors contract `contracts/provider-registry.yaml` must include `raw_mail_body` in `forbidden_values`.'
        });
      }
    );
  });

  test('fails when sync state or webhook replay can persist raw provider data', async () => {
    await withRepositoryRoot(
      {
        ...createValidConnectorsFiles(),
        'contracts/sync-state.yaml': `
contract:
  version: 1
  status: draft
sync_state_owner: zdp-connectors-platform
state_shape:
  cursor_storage: raw_payload
  raw_source_payload_allowed: true
  credential_material_allowed: true
  privacy_scope_required: false
required_fields:
  - provider_id
states:
  - syncing
retry_policy:
  retry_budget_required: false
  backoff_required: false
  dead_letter_required: false
forbidden_values:
  - raw_provider_payload
`,
        'contracts/webhook-replay.yaml': `
contract:
  version: 1
  status: draft
webhook_replay_owner: zdp-connectors-platform
signature_verification_required: false
provider_event_id_required: false
idempotency_key_required: false
replay_safe_mapping_required: false
dead_letter_handoff_required: false
payload_storage:
  raw_payload_allowed: true
  payload_ref_required: false
required_fields:
  - provider_id
retry_policy:
  max_attempts_required: false
  next_attempt_at_required: false
  terminal_failure_reason_required: false
forbidden_values:
  - raw_webhook_payload
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryConnectorsContract({
          repositoryRoot,
          repositoryServiceContract: createConnectorsServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CONNECTORS-001',
          severity: 'error',
          file: 'contracts/sync-state.yaml',
          path: 'state_shape.raw_source_payload_allowed',
          message: 'Sync-state must not allow raw source payload storage.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CONNECTORS-001',
          severity: 'error',
          file: 'contracts/sync-state.yaml',
          path: 'required_fields',
          message:
            'Connectors contract `contracts/sync-state.yaml` must include `trace_id` in `required_fields`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CONNECTORS-001',
          severity: 'error',
          file: 'contracts/webhook-replay.yaml',
          path: 'signature_verification_required',
          message: 'Webhook replay must require signature verification.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CONNECTORS-001',
          severity: 'error',
          file: 'contracts/webhook-replay.yaml',
          path: 'payload_storage.raw_payload_allowed',
          message: 'Webhook replay must not allow raw payload storage.'
        });
      }
    );
  });

  test('fails when provider boundaries own final product decisions', async () => {
    await withRepositoryRoot(
      {
        ...createValidConnectorsFiles(),
        'contracts/provider-boundaries.yaml': `
contract:
  version: 1
  status: draft
boundary_owner: zdp-connectors-platform
provider_boundaries:
  - id: google
    repo_status: deploy_unit
    split_target: zdp-google
split_triggers:
  - provider_review_isolation
forbidden_ownership:
  - credential_plaintext
forbidden_values:
  - oauth_refresh_token_plaintext
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryConnectorsContract({
          repositoryRoot,
          repositoryServiceContract: createConnectorsServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CONNECTORS-001',
          severity: 'error',
          file: 'contracts/provider-boundaries.yaml',
          path: 'provider_boundaries.google.repo_status',
          message: 'Provider `google` must remain a logical boundary.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CONNECTORS-001',
          severity: 'error',
          file: 'contracts/provider-boundaries.yaml',
          path: 'forbidden_ownership',
          message:
            'Connectors contract `contracts/provider-boundaries.yaml` must include `final_authorization` in `forbidden_ownership`.'
        });
      }
    );
  });

  test('fails when service contract does not require the connectors gate', async () => {
    await withRepositoryRoot(createValidConnectorsFiles(), async (repositoryRoot) => {
      const diagnostics = await validateRepositoryConnectorsContract({
        repositoryRoot,
        repositoryServiceContract: {
          ...createConnectorsServiceContract(),
          policy_gates: {
            required_linter_rules: ['ZDP-REPO-BASELINE-001']
          }
        }
      });

      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-CONNECTORS-001',
        severity: 'error',
        file: 'service.yaml',
        path: 'policy_gates.required_linter_rules',
        message:
          'Connectors platform service contract must require `ZDP-CONNECTORS-001`.'
      });
    });
  });
});

async function withRepositoryRoot(
  files: Record<string, string>,
  callback: (repositoryRoot: string) => Promise<void>
): Promise<void> {
  const repositoryRoot = await mkdtemp(join(tmpdir(), 'zdp-connectors-'));

  try {
    await Promise.all(
      Object.entries(files).map(async ([file, content]) => {
        const target = join(repositoryRoot, file);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, content.trimStart(), 'utf8');
      })
    );

    await callback(repositoryRoot);
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true });
  }
}

function createValidConnectorsFiles(): Record<string, string> {
  return {
    'contracts/provider-registry.yaml': `
contract:
  version: 1
  status: draft
registry_owner: zdp-connectors-platform
provider_required:
  - provider_id
  - adapter_boundary
  - credential_source
  - privacy_broker_required
  - sync_state_required
  - request_id_required
  - trace_id_required
providers:
  - id: google
    adapter_boundary: logical
    credential_source: credential_vault_capability
    privacy_broker_required: true
    sync_state_required: true
    webhook_signature_required: true
    request_id_required: true
    trace_id_required: true
  - id: microsoft
    adapter_boundary: logical
    credential_source: credential_vault_capability
    privacy_broker_required: true
    sync_state_required: true
    webhook_signature_required: true
    request_id_required: true
    trace_id_required: true
  - id: telegram
    adapter_boundary: logical
    credential_source: credential_vault_capability
    privacy_broker_required: true
    sync_state_required: true
    webhook_signature_required: true
    request_id_required: true
    trace_id_required: true
forbidden_values:
  - oauth_refresh_token_plaintext
  - provider_api_credential_plaintext
  - webhook_secret_plaintext
  - authorization_header
  - cookie
  - raw_mail_body
  - raw_message_body
  - raw_file_body
  - ai_prompt_body
`,
    'contracts/sync-state.yaml': `
contract:
  version: 1
  status: draft
sync_state_owner: zdp-connectors-platform
state_shape:
  cursor_storage: reference_only
  raw_source_payload_allowed: false
  credential_material_allowed: false
  privacy_scope_required: true
required_fields:
  - provider_id
  - tenant_id
  - account_ref
  - cursor_ref
  - schema_version
  - last_success_at
  - failure_count
  - request_id
  - trace_id
states:
  - disconnected
  - pending
  - syncing
  - paused
  - failed
  - backoff
  - replaying
retry_policy:
  retry_budget_required: true
  backoff_required: true
  dead_letter_required: true
forbidden_values:
  - raw_provider_payload
  - oauth_refresh_token_plaintext
  - provider_api_credential_plaintext
  - authorization_header
  - cookie
  - raw_mail_body
  - raw_message_body
  - raw_file_body
`,
    'contracts/webhook-replay.yaml': `
contract:
  version: 1
  status: draft
webhook_replay_owner: zdp-connectors-platform
signature_verification_required: true
provider_event_id_required: true
idempotency_key_required: true
replay_safe_mapping_required: true
dead_letter_handoff_required: true
payload_storage:
  raw_payload_allowed: false
  payload_ref_required: true
required_fields:
  - provider_id
  - provider_event_id
  - idempotency_key
  - received_at
  - request_id
  - trace_id
  - payload_ref
retry_policy:
  max_attempts_required: true
  next_attempt_at_required: true
  terminal_failure_reason_required: true
forbidden_values:
  - raw_webhook_payload
  - webhook_secret_plaintext
  - authorization_header
  - cookie
  - payment_payload
  - raw_mail_body
  - raw_message_body
  - raw_file_body
`,
    'contracts/provider-boundaries.yaml': `
contract:
  version: 1
  status: draft
boundary_owner: zdp-connectors-platform
provider_boundaries:
  - id: google
    repo_status: logical_boundary
    split_target: zdp-connectors-google
  - id: microsoft
    repo_status: logical_boundary
    split_target: zdp-connectors-microsoft
  - id: telegram
    repo_status: logical_boundary
    split_target: zdp-connectors-telegram
split_triggers:
  - provider_review_isolation
  - quota_isolation
  - webhook_failure_isolation
  - deploy_cadence_isolation
forbidden_ownership:
  - credential_plaintext
  - final_authorization
  - entitlement_decision
  - ledger_credit_mutation
  - privacy_data_access_policy
  - raw_source_data_policy
forbidden_values:
  - oauth_refresh_token_plaintext
  - provider_api_credential_plaintext
  - raw_mail_body
  - raw_message_body
  - raw_file_body
`
  };
}

function createConnectorsServiceContract(): Record<string, unknown> {
  return {
    service: {
      repo: 'zdp-connectors-platform',
      tier: 'tier2'
    },
    domain: {
      type: 'connector'
    },
    access: {
      auth_required: true,
      object_level_auth_required: true
    },
    audit: {
      required: true,
      events: [
        'connector.provider.added',
        'connector.provider.boundary.changed',
        'connector.sync.cursor.updated',
        'connector.sync.failed',
        'connector.webhook.denied',
        'connector.webhook.replayed'
      ]
    },
    idempotency: {
      required: true,
      replay_safe: true
    },
    observability: {
      otel: {
        propagation_headers: ['traceparent', 'x-request-id']
      }
    },
    dependencies: {
      services: ['credential-vault', 'privacy-broker', 'platform-observability']
    },
    exit: {
      kill_criteria: [
        'connector code stores credential plaintext or bypasses privacy broker',
        'connector replay uses raw provider payload as durable state',
        'provider adapter makes final authorization, entitlement, ledger, or privacy policy decisions'
      ]
    },
    policy_gates: {
      required_linter_rules: [
        'ZDP-REPO-BASELINE-001',
        'ZDP-CONNECTORS-001'
      ]
    }
  };
}
