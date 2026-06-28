import type { Diagnostic } from '../../diagnostics.ts';
import {
  CONNECTORS_REPOSITORY_NAME,
  createConnectorsDiagnostic,
  readRecordArrayPath,
  readStringField,
  validateExactValue,
  validateRequiredStringArrayEntries
} from './contract-helpers.ts';

export const PROVIDER_REGISTRY_FILE = 'contracts/provider-registry.yaml';
export const SYNC_STATE_FILE = 'contracts/sync-state.yaml';
export const WEBHOOK_REPLAY_FILE = 'contracts/webhook-replay.yaml';
export const PROVIDER_BOUNDARIES_FILE = 'contracts/provider-boundaries.yaml';
const PACKAGE_FILE = 'package.json';
const BUN_LOCK_FILE = 'bun.lock';
const TSCONFIG_FILE = 'tsconfig.json';
const CHECKER_SCRIPT_FILE = 'scripts/check-connectors-contracts.ts';
const CHECKER_CLI_FILE = 'src/connectors-contracts/cli.ts';
const CHECKER_PARSER_FILE = 'src/connectors-contracts/parser.ts';
const CHECKER_TYPES_FILE = 'src/connectors-contracts/types.ts';
const CHECKER_VALIDATOR_FILE = 'src/connectors-contracts/validator.ts';
const CHECKER_TEST_FILE = 'tests/connectors-contracts.test.ts';
const CARGO_FILE = 'Cargo.toml';
const CARGO_LOCK_FILE = 'Cargo.lock';
const RUNTIME_LIB_FILE = 'src/lib.rs';
const RUNTIME_MAIN_FILE = 'src/main.rs';
const RUNTIME_BOUNDARY_MOD_FILE = 'src/boundaries/mod.rs';
const RUNTIME_PROVIDER_REGISTRY_FILE = 'src/boundaries/provider_registry.rs';
const RUNTIME_SYNC_STATE_FILE = 'src/boundaries/sync_state.rs';
const RUNTIME_WEBHOOK_REPLAY_FILE = 'src/boundaries/webhook_replay.rs';
const RUNTIME_PROVIDER_BOUNDARIES_FILE = 'src/boundaries/provider_boundaries.rs';

const REQUIRED_CONNECTORS_CHECKER_FILES = [
  BUN_LOCK_FILE,
  TSCONFIG_FILE,
  CHECKER_SCRIPT_FILE,
  CHECKER_CLI_FILE,
  CHECKER_PARSER_FILE,
  CHECKER_TYPES_FILE,
  CHECKER_VALIDATOR_FILE,
  CHECKER_TEST_FILE
] as const;

const REQUIRED_CONNECTORS_RUNTIME_FILES = [
  CARGO_FILE,
  CARGO_LOCK_FILE,
  RUNTIME_LIB_FILE,
  RUNTIME_MAIN_FILE,
  RUNTIME_BOUNDARY_MOD_FILE,
  RUNTIME_PROVIDER_REGISTRY_FILE,
  RUNTIME_SYNC_STATE_FILE,
  RUNTIME_WEBHOOK_REPLAY_FILE,
  RUNTIME_PROVIDER_BOUNDARIES_FILE
] as const;

const REQUIRED_PACKAGE_SCRIPTS = ['check', 'test', 'contracts:check'] as const;

const REQUIRED_PROVIDERS = ['google', 'microsoft', 'telegram'] as const;

const REQUIRED_PROVIDER_FIELDS = [
  'provider_id',
  'adapter_boundary',
  'credential_source',
  'credential_capability_required',
  'privacy_broker_required',
  'privacy_scope_required',
  'sync_state_required',
  'sync_state_policy',
  'webhook_signature_required',
  'webhook_replay_policy',
  'request_id_required',
  'trace_id_required'
] as const;

const REQUIRED_PROVIDER_FORBIDDEN_VALUES = [
  'oauth_refresh_token_plaintext',
  'provider_api_credential_plaintext',
  'provider_api_key_plaintext',
  'webhook_secret_plaintext',
  'authorization_header',
  'cookie',
  'raw_mail_body',
  'raw_message_body',
  'raw_file_body',
  'ai_prompt_body'
] as const;

const REQUIRED_SYNC_FIELDS = [
  'provider_id',
  'tenant_id',
  'account_ref',
  'cursor_ref',
  'schema_version',
  'last_success_at',
  'retry_count',
  'next_retry_at',
  'failure_count',
  'request_id',
  'trace_id'
] as const;

const REQUIRED_SYNC_STATES = [
  'disconnected',
  'pending',
  'syncing',
  'paused',
  'failed',
  'backoff',
  'replaying'
] as const;

const REQUIRED_SYNC_FORBIDDEN_VALUES = [
  'raw_provider_payload',
  'oauth_refresh_token_plaintext',
  'provider_api_credential_plaintext',
  'provider_api_key_plaintext',
  'authorization_header',
  'cookie',
  'raw_mail_body',
  'raw_message_body',
  'raw_file_body',
  'raw_contact_body',
  'credential_plaintext'
] as const;

const REQUIRED_WEBHOOK_FIELDS = [
  'provider_id',
  'provider_event_id',
  'signature_verified',
  'idempotency_key',
  'received_at',
  'request_id',
  'trace_id',
  'payload_ref',
  'dead_letter_policy'
] as const;

const REQUIRED_WEBHOOK_FORBIDDEN_VALUES = [
  'raw_webhook_payload',
  'oauth_refresh_token_plaintext',
  'provider_api_credential_plaintext',
  'webhook_secret_plaintext',
  'authorization_header',
  'cookie',
  'payment_payload',
  'raw_provider_payload',
  'raw_payment_payload',
  'raw_mail_body',
  'raw_message_body',
  'raw_file_body'
] as const;

const REQUIRED_SPLIT_TRIGGERS = [
  'provider_review_isolation',
  'quota_isolation',
  'webhook_failure_isolation',
  'deploy_cadence_isolation'
] as const;

const REQUIRED_FORBIDDEN_OWNERSHIP = [
  'credential_plaintext',
  'final_authorization',
  'entitlement_decision',
  'entitlement',
  'ledger_credit_mutation',
  'ledger_or_credit_mutation',
  'privacy_data_access_policy',
  'raw_source_data_policy'
] as const;

const REQUIRED_BOUNDARY_FORBIDDEN_VALUES = [
  'oauth_refresh_token_plaintext',
  'provider_api_credential_plaintext',
  'provider_api_key_plaintext',
  'authorization_header',
  'cookie',
  'raw_mail_body',
  'raw_message_body',
  'raw_file_body'
] as const;

const REQUIRED_SERVICE_DEPENDENCIES = [
  'credential-vault',
  'privacy-broker',
  'platform-observability'
] as const;

const REQUIRED_AUDIT_EVENTS = [
  'connector.provider.added',
  'connector.provider.boundary.changed',
  'connector.sync.cursor.updated',
  'connector.sync.failed',
  'connector.webhook.denied',
  'connector.webhook.replayed'
] as const;

export function validateProviderRegistryContract(value: unknown): readonly Diagnostic[] {
  return [
    ...validateExactValue({
      value,
      file: PROVIDER_REGISTRY_FILE,
      path: 'registry_owner',
      expected: CONNECTORS_REPOSITORY_NAME,
      message: 'Provider registry owner must remain `zdp-connectors-platform`.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: PROVIDER_REGISTRY_FILE,
      path: 'provider_required',
      field: 'provider_required',
      requiredEntries: REQUIRED_PROVIDER_FIELDS
    }),
    ...validateProviders(value),
    ...validateRequiredStringArrayEntries({
      value,
      file: PROVIDER_REGISTRY_FILE,
      path: 'forbidden_values',
      field: 'forbidden_values',
      requiredEntries: REQUIRED_PROVIDER_FORBIDDEN_VALUES
    })
  ];
}

function validateProviders(value: unknown): readonly Diagnostic[] {
  const providers = readRecordArrayPath(value, 'providers');
  const diagnostics: Diagnostic[] = [];

  for (const providerId of REQUIRED_PROVIDERS) {
    const provider = providers.find(
      (entry) => readStringField(entry, 'id') === providerId
    );

    if (provider === undefined) {
      diagnostics.push(
        createConnectorsDiagnostic(
          PROVIDER_REGISTRY_FILE,
          'providers',
          `Provider registry must declare provider \`${providerId}\`.`
        )
      );
      continue;
    }

    diagnostics.push(
      ...validateExactValue({
        value: provider,
        file: PROVIDER_REGISTRY_FILE,
        path: 'adapter_boundary',
        diagnosticPath: `providers.${providerId}.adapter_boundary`,
        expected: 'logical',
        message: `Provider \`${providerId}\` must remain a logical adapter boundary.`
      }),
      ...validateExactValue({
        value: provider,
        file: PROVIDER_REGISTRY_FILE,
        path: 'credential_source',
        diagnosticPath: `providers.${providerId}.credential_source`,
        expected: 'credential_vault_capability',
        message:
          `Provider \`${providerId}\` must use credential vault capability as its credential source.`
      }),
      ...validateExactValue({
        value: provider,
        file: PROVIDER_REGISTRY_FILE,
        path: 'credential_capability_required',
        diagnosticPath: `providers.${providerId}.credential_capability_required`,
        expected: true,
        message:
          `Provider \`${providerId}\` must require credential vault capability checks.`
      }),
      ...validateExactValue({
        value: provider,
        file: PROVIDER_REGISTRY_FILE,
        path: 'privacy_broker_required',
        diagnosticPath: `providers.${providerId}.privacy_broker_required`,
        expected: true,
        message: `Provider \`${providerId}\` must require privacy broker scope.`
      }),
      ...validateExactValue({
        value: provider,
        file: PROVIDER_REGISTRY_FILE,
        path: 'privacy_scope_required',
        diagnosticPath: `providers.${providerId}.privacy_scope_required`,
        expected: true,
        message: `Provider \`${providerId}\` must require privacy scope propagation.`
      }),
      ...validateExactValue({
        value: provider,
        file: PROVIDER_REGISTRY_FILE,
        path: 'sync_state_required',
        diagnosticPath: `providers.${providerId}.sync_state_required`,
        expected: true,
        message: `Provider \`${providerId}\` must require sync-state tracking.`
      }),
      ...validateExactValue({
        value: provider,
        file: PROVIDER_REGISTRY_FILE,
        path: 'sync_state_policy',
        diagnosticPath: `providers.${providerId}.sync_state_policy`,
        expected: 'cursor_reference_only',
        message:
          `Provider \`${providerId}\` must use cursor-reference-only sync state.`
      }),
      ...validateExactValue({
        value: provider,
        file: PROVIDER_REGISTRY_FILE,
        path: 'webhook_signature_required',
        diagnosticPath: `providers.${providerId}.webhook_signature_required`,
        expected: true,
        message: `Provider \`${providerId}\` must require webhook signature policy.`
      }),
      ...validateExactValue({
        value: provider,
        file: PROVIDER_REGISTRY_FILE,
        path: 'webhook_replay_policy',
        diagnosticPath: `providers.${providerId}.webhook_replay_policy`,
        expected: 'signed_idempotent_payload_ref',
        message:
          `Provider \`${providerId}\` must use signed idempotent payload references for replay.`
      }),
      ...validateExactValue({
        value: provider,
        file: PROVIDER_REGISTRY_FILE,
        path: 'request_id_required',
        diagnosticPath: `providers.${providerId}.request_id_required`,
        expected: true,
        message: `Provider \`${providerId}\` must require request_id propagation.`
      }),
      ...validateExactValue({
        value: provider,
        file: PROVIDER_REGISTRY_FILE,
        path: 'trace_id_required',
        diagnosticPath: `providers.${providerId}.trace_id_required`,
        expected: true,
        message: `Provider \`${providerId}\` must require trace_id propagation.`
      })
    );
  }

  return diagnostics;
}
export function validateSyncStateContract(value: unknown): readonly Diagnostic[] {
  return [
    ...validateExactValue({
      value,
      file: SYNC_STATE_FILE,
      path: 'sync_state_owner',
      expected: CONNECTORS_REPOSITORY_NAME,
      message: 'Sync-state owner must remain `zdp-connectors-platform`.'
    }),
    ...validateExactValue({
      value,
      file: SYNC_STATE_FILE,
      path: 'state_shape.cursor_storage',
      expected: 'reference_only',
      message: 'Sync-state cursor storage must remain reference-only.'
    }),
    ...validateExactValue({
      value,
      file: SYNC_STATE_FILE,
      path: 'state_shape.raw_source_payload_allowed',
      expected: false,
      message: 'Sync-state must not allow raw source payload storage.'
    }),
    ...validateExactValue({
      value,
      file: SYNC_STATE_FILE,
      path: 'state_shape.credential_material_allowed',
      expected: false,
      message: 'Sync-state must not allow credential material storage.'
    }),
    ...validateExactValue({
      value,
      file: SYNC_STATE_FILE,
      path: 'state_shape.privacy_scope_required',
      expected: true,
      message: 'Sync-state must require privacy scope.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: SYNC_STATE_FILE,
      path: 'required_fields',
      field: 'required_fields',
      requiredEntries: REQUIRED_SYNC_FIELDS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: SYNC_STATE_FILE,
      path: 'states',
      field: 'states',
      requiredEntries: REQUIRED_SYNC_STATES
    }),
    ...validateExactValue({
      value,
      file: SYNC_STATE_FILE,
      path: 'retry_policy.retry_budget_required',
      expected: true,
      message: 'Sync retry policy must require a retry budget.'
    }),
    ...validateExactValue({
      value,
      file: SYNC_STATE_FILE,
      path: 'retry_policy.backoff_required',
      expected: true,
      message: 'Sync retry policy must require backoff.'
    }),
    ...validateExactValue({
      value,
      file: SYNC_STATE_FILE,
      path: 'retry_policy.dead_letter_required',
      expected: true,
      message: 'Sync retry policy must require dead-letter handling.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: SYNC_STATE_FILE,
      path: 'forbidden_values',
      field: 'forbidden_values',
      requiredEntries: REQUIRED_SYNC_FORBIDDEN_VALUES
    })
  ];
}

export function validateWebhookReplayContract(value: unknown): readonly Diagnostic[] {
  return [
    ...validateExactValue({
      value,
      file: WEBHOOK_REPLAY_FILE,
      path: 'webhook_replay_owner',
      expected: CONNECTORS_REPOSITORY_NAME,
      message: 'Webhook replay owner must remain `zdp-connectors-platform`.'
    }),
    ...validateExactValue({
      value,
      file: WEBHOOK_REPLAY_FILE,
      path: 'signature_verification_required',
      expected: true,
      message: 'Webhook replay must require signature verification.'
    }),
    ...validateExactValue({
      value,
      file: WEBHOOK_REPLAY_FILE,
      path: 'provider_event_id_required',
      expected: true,
      message: 'Webhook replay must require provider event id.'
    }),
    ...validateExactValue({
      value,
      file: WEBHOOK_REPLAY_FILE,
      path: 'idempotency_key_required',
      expected: true,
      message: 'Webhook replay must require idempotency key.'
    }),
    ...validateExactValue({
      value,
      file: WEBHOOK_REPLAY_FILE,
      path: 'replay_safe_mapping_required',
      expected: true,
      message: 'Webhook replay must require replay-safe mapping.'
    }),
    ...validateExactValue({
      value,
      file: WEBHOOK_REPLAY_FILE,
      path: 'dead_letter_handoff_required',
      expected: true,
      message: 'Webhook replay must require dead-letter handoff.'
    }),
    ...validateExactValue({
      value,
      file: WEBHOOK_REPLAY_FILE,
      path: 'payload_storage.raw_payload_allowed',
      expected: false,
      message: 'Webhook replay must not allow raw payload storage.'
    }),
    ...validateExactValue({
      value,
      file: WEBHOOK_REPLAY_FILE,
      path: 'payload_storage.payload_ref_required',
      expected: true,
      message: 'Webhook replay must require payload_ref.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: WEBHOOK_REPLAY_FILE,
      path: 'required_fields',
      field: 'required_fields',
      requiredEntries: REQUIRED_WEBHOOK_FIELDS
    }),
    ...validateExactValue({
      value,
      file: WEBHOOK_REPLAY_FILE,
      path: 'retry_policy.max_attempts_required',
      expected: true,
      message: 'Webhook replay must require max attempts.'
    }),
    ...validateExactValue({
      value,
      file: WEBHOOK_REPLAY_FILE,
      path: 'retry_policy.next_attempt_at_required',
      expected: true,
      message: 'Webhook replay must require next_attempt_at.'
    }),
    ...validateExactValue({
      value,
      file: WEBHOOK_REPLAY_FILE,
      path: 'retry_policy.terminal_failure_reason_required',
      expected: true,
      message: 'Webhook replay must require terminal failure reason.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: WEBHOOK_REPLAY_FILE,
      path: 'forbidden_values',
      field: 'forbidden_values',
      requiredEntries: REQUIRED_WEBHOOK_FORBIDDEN_VALUES
    })
  ];
}

export function validateProviderBoundariesContract(value: unknown): readonly Diagnostic[] {
  return [
    ...validateExactValue({
      value,
      file: PROVIDER_BOUNDARIES_FILE,
      path: 'boundary_owner',
      expected: CONNECTORS_REPOSITORY_NAME,
      message: 'Provider boundary owner must remain `zdp-connectors-platform`.'
    }),
    ...validateProviderBoundaries(value),
    ...validateRequiredStringArrayEntries({
      value,
      file: PROVIDER_BOUNDARIES_FILE,
      path: 'split_triggers',
      field: 'split_triggers',
      requiredEntries: REQUIRED_SPLIT_TRIGGERS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: PROVIDER_BOUNDARIES_FILE,
      path: 'forbidden_ownership',
      field: 'forbidden_ownership',
      requiredEntries: REQUIRED_FORBIDDEN_OWNERSHIP
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: PROVIDER_BOUNDARIES_FILE,
      path: 'forbidden_values',
      field: 'forbidden_values',
      requiredEntries: REQUIRED_BOUNDARY_FORBIDDEN_VALUES
    })
  ];
}

function validateProviderBoundaries(value: unknown): readonly Diagnostic[] {
  const boundaries = readRecordArrayPath(value, 'provider_boundaries');
  const diagnostics: Diagnostic[] = [];

  for (const providerId of REQUIRED_PROVIDERS) {
    const boundary = boundaries.find(
      (entry) => readStringField(entry, 'id') === providerId
    );

    if (boundary === undefined) {
      diagnostics.push(
        createConnectorsDiagnostic(
          PROVIDER_BOUNDARIES_FILE,
          'provider_boundaries',
          `Provider boundaries must declare \`${providerId}\`.`
        )
      );
      continue;
    }

    diagnostics.push(
      ...validateExactValue({
        value: boundary,
        file: PROVIDER_BOUNDARIES_FILE,
        path: 'repo_status',
        diagnosticPath: `provider_boundaries.${providerId}.repo_status`,
        expected: 'logical_boundary',
        message: `Provider \`${providerId}\` must remain a logical boundary.`
      }),
      ...validateExactValue({
        value: boundary,
        file: PROVIDER_BOUNDARIES_FILE,
        path: 'split_target',
        diagnosticPath: `provider_boundaries.${providerId}.split_target`,
        expected: `zdp-connectors-${providerId}`,
        message:
          `Provider \`${providerId}\` split target must remain ` +
          `\`zdp-connectors-${providerId}\`.`
      })
    );
  }

  return diagnostics;
}
