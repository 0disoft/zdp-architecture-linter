import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { Diagnostic } from './diagnostics.ts';

const CONNECTORS_REPOSITORY_NAME = 'zdp-connectors-platform';
const CONNECTORS_RULE_ID = 'ZDP-CONNECTORS-001';

const PROVIDER_REGISTRY_FILE = 'contracts/provider-registry.yaml';
const SYNC_STATE_FILE = 'contracts/sync-state.yaml';
const WEBHOOK_REPLAY_FILE = 'contracts/webhook-replay.yaml';
const PROVIDER_BOUNDARIES_FILE = 'contracts/provider-boundaries.yaml';
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

export async function validateRepositoryConnectorsContract(input: {
  readonly repositoryRoot: string | undefined;
  readonly repositoryServiceContract: unknown;
}): Promise<readonly Diagnostic[]> {
  if (
    input.repositoryRoot === undefined ||
    readRepositoryName(input.repositoryServiceContract) !==
      CONNECTORS_REPOSITORY_NAME
  ) {
    return [];
  }

  const [providerRegistry, syncState, webhookReplay, providerBoundaries] =
    await Promise.all([
      readRequiredYamlContract(input.repositoryRoot, PROVIDER_REGISTRY_FILE),
      readRequiredYamlContract(input.repositoryRoot, SYNC_STATE_FILE),
      readRequiredYamlContract(input.repositoryRoot, WEBHOOK_REPLAY_FILE),
      readRequiredYamlContract(input.repositoryRoot, PROVIDER_BOUNDARIES_FILE)
    ]);
  const packageJson = await readRequiredJsonContract(input.repositoryRoot, PACKAGE_FILE);

  return [
    ...providerRegistry.diagnostics,
    ...syncState.diagnostics,
    ...webhookReplay.diagnostics,
    ...providerBoundaries.diagnostics,
    ...packageJson.diagnostics,
    ...(providerRegistry.value === null
      ? []
      : validateProviderRegistryContract(providerRegistry.value)),
    ...(syncState.value === null
      ? []
      : validateSyncStateContract(syncState.value)),
    ...(webhookReplay.value === null
      ? []
      : validateWebhookReplayContract(webhookReplay.value)),
    ...(providerBoundaries.value === null
      ? []
      : validateProviderBoundariesContract(providerBoundaries.value)),
    ...(packageJson.value === null ? [] : validatePackageScripts(packageJson.value)),
    ...validateServiceContract(input.repositoryServiceContract),
    ...validateRequiredLinterRule(input.repositoryServiceContract),
    ...(await validateCheckerSurface(input.repositoryRoot)),
    ...(await validateRuntimeSurface(input.repositoryRoot))
  ];
}

async function readRequiredYamlContract(
  repositoryRoot: string,
  file: string
): Promise<{
  readonly value: unknown | null;
  readonly diagnostics: readonly Diagnostic[];
}> {
  let source: string;

  try {
    source = await readFile(join(repositoryRoot, file), 'utf8');
  } catch (error) {
    if (isMissingPathError(error)) {
      return {
        value: null,
        diagnostics: [
          createConnectorsDiagnostic(
            file,
            'repository.root',
            `Connectors repository must include \`${file}\`.`
          )
        ]
      };
    }

    throw error;
  }

  try {
    return {
      value: parse(source) as unknown,
      diagnostics: []
    };
  } catch (error) {
    return {
      value: null,
      diagnostics: [
        createConnectorsDiagnostic(
          file,
          'yaml',
          `Connectors contract \`${file}\` must be valid YAML: ${formatError(
            error
          )}`
        )
      ]
    };
  }
}

async function readRequiredJsonContract(
  repositoryRoot: string,
  file: string
): Promise<{
  readonly value: unknown | null;
  readonly diagnostics: readonly Diagnostic[];
}> {
  let source: string;

  try {
    source = await readFile(join(repositoryRoot, file), 'utf8');
  } catch (error) {
    if (isMissingPathError(error)) {
      return {
        value: null,
        diagnostics: [
          createConnectorsDiagnostic(
            file,
            'repository.root',
            `Connectors repository must include \`${file}\`.`
          )
        ]
      };
    }

    throw error;
  }

  try {
    return {
      value: JSON.parse(source) as unknown,
      diagnostics: []
    };
  } catch (error) {
    return {
      value: null,
      diagnostics: [
        createConnectorsDiagnostic(
          file,
          'json',
          `Connectors contract \`${file}\` must be valid JSON: ${formatError(error)}`
        )
      ]
    };
  }
}

async function readOptionalTextFile(
  repositoryRoot: string,
  file: string
): Promise<{
  readonly source: string | null;
  readonly diagnostics: readonly Diagnostic[];
}> {
  try {
    return {
      source: await readFile(join(repositoryRoot, file), 'utf8'),
      diagnostics: []
    };
  } catch (error) {
    if (isMissingPathError(error)) {
      return {
        source: null,
        diagnostics: [
          createConnectorsDiagnostic(
            file,
            'repository.root',
            `Connectors repository must include \`${file}\`.`
          )
        ]
      };
    }

    throw error;
  }
}

function validateProviderRegistryContract(value: unknown): readonly Diagnostic[] {
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

function validateSyncStateContract(value: unknown): readonly Diagnostic[] {
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

function validateWebhookReplayContract(value: unknown): readonly Diagnostic[] {
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

function validateProviderBoundariesContract(value: unknown): readonly Diagnostic[] {
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

function validateServiceContract(value: unknown): readonly Diagnostic[] {
  return [
    ...validateExactValue({
      value,
      file: 'service.yaml',
      path: 'service.tier',
      expected: 'tier2',
      message: 'Connectors platform service must remain tier2.'
    }),
    ...validateExactValue({
      value,
      file: 'service.yaml',
      path: 'domain.type',
      expected: 'connector',
      message: 'Connectors platform service domain type must remain connector.'
    }),
    ...validateExactValue({
      value,
      file: 'service.yaml',
      path: 'runtime.core',
      expected: 'axum',
      message: 'Connectors platform service runtime core must remain axum.'
    }),
    ...validateExactValue({
      value,
      file: 'service.yaml',
      path: 'runtime.framework',
      expected: 'rust-axum-contracts',
      message:
        'Connectors platform service runtime framework must remain rust-axum-contracts.'
    }),
    ...validateExactValue({
      value,
      file: 'service.yaml',
      path: 'runtime.database',
      expected: 'none',
      message:
        'Connectors platform service runtime must not declare a database before storage ownership is designed.'
    }),
    ...validateExactValue({
      value,
      file: 'service.yaml',
      path: 'access.auth_required',
      expected: true,
      message: 'Connectors platform service must require auth.'
    }),
    ...validateExactValue({
      value,
      file: 'service.yaml',
      path: 'access.object_level_auth_required',
      expected: true,
      message: 'Connectors platform service must require object-level auth.'
    }),
    ...validateExactValue({
      value,
      file: 'service.yaml',
      path: 'audit.required',
      expected: true,
      message: 'Connectors platform service must require audit.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: 'service.yaml',
      path: 'audit.events',
      field: 'audit.events',
      requiredEntries: REQUIRED_AUDIT_EVENTS
    }),
    ...validateExactValue({
      value,
      file: 'service.yaml',
      path: 'idempotency.required',
      expected: true,
      message: 'Connectors platform service must require idempotency.'
    }),
    ...validateExactValue({
      value,
      file: 'service.yaml',
      path: 'idempotency.replay_safe',
      expected: true,
      message: 'Connectors platform service must be replay safe.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: 'service.yaml',
      path: 'dependencies.services',
      field: 'dependencies.services',
      requiredEntries: REQUIRED_SERVICE_DEPENDENCIES
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: 'service.yaml',
      path: 'observability.otel.propagation_headers',
      field: 'observability.otel.propagation_headers',
      requiredEntries: ['traceparent', 'x-request-id']
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: 'service.yaml',
      path: 'exit.kill_criteria',
      field: 'exit.kill_criteria',
      requiredEntries: [
        'connector code stores credential plaintext or bypasses privacy broker',
        'connector replay uses raw provider payload as durable state',
        'provider adapter makes final authorization, entitlement, ledger, or privacy policy decisions'
      ]
    })
  ];
}

function validatePackageScripts(value: unknown): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const script of REQUIRED_PACKAGE_SCRIPTS) {
    const actual = readPath(value, `scripts.${script}`);

    if (typeof actual === 'string' && actual.trim().length > 0) {
      continue;
    }

    diagnostics.push(
      createConnectorsDiagnostic(
        PACKAGE_FILE,
        `scripts.${script}`,
        `Connectors package must declare \`${script}\` script.`
      )
    );
  }

  return diagnostics;
}

async function validateCheckerSurface(
  repositoryRoot: string
): Promise<readonly Diagnostic[]> {
  const [
    bunLock,
    tsconfig,
    script,
    cliSource,
    parserSource,
    typesSource,
    validatorSource,
    testSource
  ] = await Promise.all(
    REQUIRED_CONNECTORS_CHECKER_FILES.map((file) =>
      readOptionalTextFile(repositoryRoot, file)
    )
  );

  return [
    ...bunLock.diagnostics,
    ...tsconfig.diagnostics,
    ...script.diagnostics,
    ...cliSource.diagnostics,
    ...parserSource.diagnostics,
    ...typesSource.diagnostics,
    ...validatorSource.diagnostics,
    ...testSource.diagnostics,
    ...(script.source === null
      ? []
      : validateSourceIncludes({
          file: CHECKER_SCRIPT_FILE,
          source: script.source,
          requiredFragments: ['runConnectorsContractCheckCli']
        })),
    ...(parserSource.source === null
      ? []
      : validateSourceIncludes({
          file: CHECKER_PARSER_FILE,
          source: parserSource.source,
          requiredFragments: [
            'service.yaml',
            PROVIDER_REGISTRY_FILE,
            SYNC_STATE_FILE,
            WEBHOOK_REPLAY_FILE,
            PROVIDER_BOUNDARIES_FILE,
            'credential_capability_required',
            'privacy_scope_required',
            'sync_state_policy',
            'webhook_replay_policy'
          ]
        })),
    ...(typesSource.source === null
      ? []
      : validateSourceIncludes({
          file: CHECKER_TYPES_FILE,
          source: typesSource.source,
          requiredFragments: [
            'credentialCapabilityRequired',
            'privacyScopeRequired',
            'syncStatePolicy',
            'webhookReplayPolicy'
          ]
        })),
    ...(validatorSource.source === null
      ? []
      : validateSourceIncludes({
          file: CHECKER_VALIDATOR_FILE,
          source: validatorSource.source,
          requiredFragments: [
            'REQUIRED_PROVIDERS',
            'CON_PROVIDER_CREDENTIAL_SOURCE_INVALID',
            'CON_PROVIDER_CREDENTIAL_CAPABILITY_NOT_REQUIRED',
            'CON_PROVIDER_PRIVACY_SCOPE_NOT_REQUIRED',
            'CON_PROVIDER_SYNC_STATE_POLICY_INVALID',
            'CON_PROVIDER_WEBHOOK_REPLAY_POLICY_INVALID',
            'CON_SYNC_RAW_PAYLOAD_ALLOWED',
            'CON_WEBHOOK_SIGNATURE_NOT_REQUIRED',
            'CON_WEBHOOK_RAW_PAYLOAD_ALLOWED',
            'CON_BOUNDARY_FORBIDDEN_OWNERSHIP_MISSING'
          ]
        })),
    ...(testSource.source === null
      ? []
      : validateSourceIncludes({
          file: CHECKER_TEST_FILE,
          source: testSource.source,
          requiredFragments: [
            'fails when a required provider is missing',
            'fails when a provider bypasses credential vault capability',
            'fails when a provider skips credential capability and replay policies',
            'fails when sync-state allows raw provider payload storage',
            'fails when webhook replay drops signature verification',
            'fails when webhook replay stores raw payloads instead of payload references',
            'fails when provider boundaries allow final authorization ownership'
          ]
        }))
  ];
}

async function validateRuntimeSurface(
  repositoryRoot: string
): Promise<readonly Diagnostic[]> {
  const [
    cargo,
    cargoLock,
    libSource,
    mainSource,
    boundaryModSource,
    providerRegistrySource,
    syncStateSource,
    webhookReplaySource,
    providerBoundariesSource
  ] = await Promise.all(
    REQUIRED_CONNECTORS_RUNTIME_FILES.map((file) =>
      readOptionalTextFile(repositoryRoot, file)
    )
  );

  return [
    ...cargo.diagnostics,
    ...cargoLock.diagnostics,
    ...libSource.diagnostics,
    ...mainSource.diagnostics,
    ...boundaryModSource.diagnostics,
    ...providerRegistrySource.diagnostics,
    ...syncStateSource.diagnostics,
    ...webhookReplaySource.diagnostics,
    ...providerBoundariesSource.diagnostics,
    ...(cargo.source === null
      ? []
      : validateSourceIncludes({
          file: CARGO_FILE,
          source: cargo.source,
          requiredFragments: ['axum', 'tokio', 'serde', 'serde_json', 'tower']
        })),
    ...(libSource.source === null
      ? []
      : validateSourceIncludes({
          file: RUNTIME_LIB_FILE,
          source: libSource.source,
          requiredFragments: [
            'pub const SERVICE_ID',
            '"connectors-platform"',
            'pub const DEFAULT_BIND_ADDR',
            '"127.0.0.1:3006"',
            'ZDP_CONNECTORS_BIND_ADDR',
            '.route("/healthz", get(healthz))',
            '.route("/readyz", get(readyz))',
            'ready: true',
            'checks:',
            '"contracts"',
            'healthz_returns_connectors_platform_identity',
            'readyz_reports_contract_readiness_only',
            'connector_boundaries_do_not_store_credentials_or_own_final_decisions',
            'can_store_plaintext_credential',
            'can_store_raw_source_payload',
            'can_make_final_product_decision'
          ]
        })),
    ...(mainSource.source === null
      ? []
      : validateSourceIncludes({
          file: RUNTIME_MAIN_FILE,
          source: mainSource.source,
          requiredFragments: ['bind_addr_from_env', 'serve']
        })),
    ...(boundaryModSource.source === null
      ? []
      : validateSourceIncludes({
          file: RUNTIME_BOUNDARY_MOD_FILE,
          source: boundaryModSource.source,
          requiredFragments: [
            'provider_registry',
            'sync_state',
            'webhook_replay',
            'provider_boundaries',
            'can_store_plaintext_credential',
            'can_store_raw_source_payload',
            'can_make_final_product_decision'
          ]
        })),
    ...(providerRegistrySource.source === null
      ? []
      : validateSourceIncludes({
          file: RUNTIME_PROVIDER_REGISTRY_FILE,
          source: providerRegistrySource.source,
          requiredFragments: [
            'id: "provider_registry"',
            'can_store_plaintext_credential: false',
            'can_store_raw_source_payload: false',
            'can_make_final_product_decision: false',
            'REQUIRED_PROVIDER_FIELDS',
            'provider_id',
            'credential_capability_required',
            'privacy_scope_required',
            'webhook_replay_policy',
            'sync_state_policy',
            'FORBIDDEN_PROVIDER_VALUES',
            'refresh_token_plaintext',
            'webhook_secret_plaintext',
            'provider_api_key_plaintext',
            'authorization_header',
            'cookie'
          ]
        })),
    ...(syncStateSource.source === null
      ? []
      : validateSourceIncludes({
          file: RUNTIME_SYNC_STATE_FILE,
          source: syncStateSource.source,
          requiredFragments: [
            'id: "sync_state"',
            'can_store_plaintext_credential: false',
            'can_store_raw_source_payload: false',
            'can_make_final_product_decision: false',
            'ALLOWED_SYNC_STATE_FIELDS',
            'provider_id',
            'tenant_id',
            'cursor',
            'schema_version',
            'retry_count',
            'next_retry_at',
            'request_id',
            'trace_id',
            'FORBIDDEN_SYNC_STATE_VALUES',
            'raw_mail_body',
            'raw_message_body',
            'raw_file_body',
            'raw_contact_body',
            'raw_provider_payload',
            'credential_plaintext'
          ]
        })),
    ...(webhookReplaySource.source === null
      ? []
      : validateSourceIncludes({
          file: RUNTIME_WEBHOOK_REPLAY_FILE,
          source: webhookReplaySource.source,
          requiredFragments: [
            'id: "webhook_replay"',
            'can_store_plaintext_credential: false',
            'can_store_raw_source_payload: false',
            'can_make_final_product_decision: false',
            'REQUIRED_WEBHOOK_FIELDS',
            'provider_id',
            'provider_event_id',
            'signature_verified',
            'idempotency_key',
            'payload_ref',
            'request_id',
            'trace_id',
            'dead_letter_policy',
            'FORBIDDEN_WEBHOOK_VALUES',
            'raw_provider_payload',
            'raw_payment_payload',
            'authorization_header',
            'cookie',
            'webhook_secret_plaintext'
          ]
        })),
    ...(providerBoundariesSource.source === null
      ? []
      : validateSourceIncludes({
          file: RUNTIME_PROVIDER_BOUNDARIES_FILE,
          source: providerBoundariesSource.source,
          requiredFragments: [
            'id: "provider_boundaries"',
            'can_store_plaintext_credential: false',
            'can_store_raw_source_payload: false',
            'can_make_final_product_decision: false',
            'INITIAL_PROVIDER_BOUNDARIES',
            'google',
            'microsoft',
            'telegram',
            'DELEGATED_DECISIONS',
            'final_authorization',
            'entitlement',
            'ledger_or_credit_mutation',
            'privacy_data_access_policy'
          ]
        }))
  ];
}

function validateSourceIncludes(input: {
  readonly file: string;
  readonly source: string;
  readonly requiredFragments: readonly string[];
}): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const fragment of input.requiredFragments) {
    if (input.source.includes(fragment)) {
      continue;
    }

    diagnostics.push(
      createConnectorsDiagnostic(
        input.file,
        'source',
        `Connectors checker source must include \`${fragment}\`.`
      )
    );
  }

  return diagnostics;
}

function validateRequiredLinterRule(value: unknown): readonly Diagnostic[] {
  const requiredRules = readStringArrayPath(
    value,
    'policy_gates.required_linter_rules'
  );

  if (requiredRules.includes(CONNECTORS_RULE_ID)) {
    return [];
  }

  return [
    createConnectorsDiagnostic(
      'service.yaml',
      'policy_gates.required_linter_rules',
      `Connectors platform service contract must require \`${CONNECTORS_RULE_ID}\`.`
    )
  ];
}

function validateRequiredStringArrayEntries(input: {
  readonly value: unknown;
  readonly file: string;
  readonly path: string;
  readonly field: string;
  readonly requiredEntries: readonly string[];
}): readonly Diagnostic[] {
  const entries = readStringArrayPath(input.value, input.field);
  const diagnostics: Diagnostic[] = [];

  for (const requiredEntry of input.requiredEntries) {
    if (entries.includes(requiredEntry)) {
      continue;
    }

    diagnostics.push(
      createConnectorsDiagnostic(
        input.file,
        input.path,
        `Connectors contract \`${input.file}\` must include \`${requiredEntry}\` in \`${input.field}\`.`
      )
    );
  }

  return diagnostics;
}

function validateExactValue(input: {
  readonly value: unknown;
  readonly file: string;
  readonly path: string;
  readonly diagnosticPath?: string;
  readonly expected: unknown;
  readonly message: string;
}): readonly Diagnostic[] {
  const actual = readPath(input.value, input.path);

  if (actual === input.expected) {
    return [];
  }

  return [
    createConnectorsDiagnostic(
      input.file,
      input.diagnosticPath ?? input.path,
      input.message
    )
  ];
}

function readRepositoryName(value: unknown): string | null {
  if (!isRecord(value) || !isRecord(value.service)) {
    return null;
  }

  return readStringField(value.service, 'repo');
}

function readRecordArrayPath(
  value: unknown,
  path: string
): readonly Record<string, unknown>[] {
  const candidate = readPath(value, path);

  if (!Array.isArray(candidate)) {
    return [];
  }

  return candidate.filter(isRecord);
}

function readStringArrayPath(value: unknown, path: string): readonly string[] {
  const candidate = readPath(value, path);

  if (!Array.isArray(candidate)) {
    return [];
  }

  return candidate.flatMap((entry) =>
    typeof entry === 'string' && entry.trim().length > 0 ? [entry.trim()] : []
  );
}

function readPath(value: unknown, path: string): unknown {
  let current = value;

  for (const segment of path.split('.')) {
    if (!isRecord(current)) {
      return undefined;
    }

    current = current[segment];
  }

  return current;
}

function readStringField(
  value: Record<string, unknown>,
  field: string
): string | null {
  const candidate = value[field];

  return typeof candidate === 'string' && candidate.trim().length > 0
    ? candidate.trim()
    : null;
}

function createConnectorsDiagnostic(
  file: string,
  path: string,
  message: string
): Diagnostic {
  return {
    ruleId: CONNECTORS_RULE_ID,
    severity: 'error',
    file,
    path,
    message
  };
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isMissingPathError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
