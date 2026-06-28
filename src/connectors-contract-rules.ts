import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { Diagnostic } from './diagnostics.ts';
import {
  extractTestCallNames,
  stripCommentsAndStringLiterals
} from './source-proof.ts';
import {
  CONNECTORS_REPOSITORY_NAME,
  CONNECTORS_RULE_ID,
  createConnectorsDiagnostic,
  formatError,
  isMissingPathError,
  isRecord,
  readPath,
  readRepositoryName,
  readStringArrayPath,
  validateExactValue,
  validateRequiredStringArrayEntries
} from './rules/connectors/contract-helpers.ts';
import {
  PROVIDER_BOUNDARIES_FILE,
  PROVIDER_REGISTRY_FILE,
  SYNC_STATE_FILE,
  WEBHOOK_REPLAY_FILE,
  validateProviderBoundariesContract,
  validateProviderRegistryContract,
  validateSyncStateContract,
  validateWebhookReplayContract
} from './rules/connectors/boundary-contracts.ts';

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
      : [
          ...validateSourceIncludes({
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
          }),
          ...validateSourceCodeIncludes({
            file: CHECKER_VALIDATOR_FILE,
            source: validatorSource.source,
            requiredFragments: [
              'export function validateConnectorsContracts',
              'function validateForbiddenValues',
              'function validateProviderRegistry',
              'function validateSyncState',
              'function validateWebhookReplay',
              'function validateProviderBoundaries',
              'function requireListMatches'
            ]
          })
        ]),
    ...(testSource.source === null
      ? []
      : [
          ...validateSourceTestNames({
            file: CHECKER_TEST_FILE,
            source: testSource.source,
            requiredTestNames: [
              'fails when a required provider is missing',
              'fails when a provider bypasses credential vault capability',
              'fails when a provider skips credential capability and replay policies',
              'fails when sync-state allows raw provider payload storage',
              'fails when webhook replay drops signature verification',
              'fails when webhook replay stores raw payloads instead of payload references',
              'fails when provider boundaries allow final authorization ownership'
            ]
          }),
          ...validateSourceCodeIncludes({
            file: CHECKER_TEST_FILE,
            source: testSource.source,
            requiredFragments: ['expect(', 'validateConnectorsContracts']
          })
        ])
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
            'provider_api_key_plaintext',
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
            'privacy_data_access_policy',
            'provider_api_key_plaintext'
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

function validateSourceTestNames(input: {
  readonly file: string;
  readonly source: string;
  readonly requiredTestNames: readonly string[];
}): readonly Diagnostic[] {
  const testNames = new Set(extractTestCallNames(input.source));
  const diagnostics: Diagnostic[] = [];

  for (const testName of input.requiredTestNames) {
    if (testNames.has(testName)) {
      continue;
    }

    diagnostics.push(
      createConnectorsDiagnostic(
        input.file,
        'source',
        `Connectors checker source must include test case \`${testName}\`.`
      )
    );
  }

  return diagnostics;
}

function validateSourceCodeIncludes(input: {
  readonly file: string;
  readonly source: string;
  readonly requiredFragments: readonly string[];
}): readonly Diagnostic[] {
  const sourceWithoutCommentsOrStrings = stripCommentsAndStringLiterals(
    input.source
  );
  const diagnostics: Diagnostic[] = [];

  for (const fragment of input.requiredFragments) {
    if (sourceWithoutCommentsOrStrings.includes(fragment)) {
      continue;
    }

    diagnostics.push(
      createConnectorsDiagnostic(
        input.file,
        'source',
        `Connectors checker source must include code fragment \`${fragment}\`.`
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
