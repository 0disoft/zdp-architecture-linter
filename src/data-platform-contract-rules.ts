import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { Diagnostic } from './diagnostics.ts';
import {
  extractTestCallNames,
  stripCommentsAndStringLiterals
} from './source-proof.ts';

const DATA_PLATFORM_REPOSITORY_NAME = 'zdp-data-platform';
const DATA_PLATFORM_CONTRACT_RULE_ID = 'ZDP-DATA-PLATFORM-001';

const ANALYTICS_INGEST_FILE = 'contracts/analytics-ingest.yaml';
const CLICKHOUSE_STORAGE_FILE = 'contracts/clickhouse-storage.yaml';
const DELETION_ANONYMIZATION_FILE = 'contracts/deletion-anonymization.yaml';
const OPERATIONAL_METRICS_FILE = 'contracts/operational-metrics.yaml';
const PACKAGE_FILE = 'package.json';
const BUN_LOCK_FILE = 'bun.lock';
const TSCONFIG_FILE = 'tsconfig.json';
const CHECKER_SCRIPT_FILE = 'scripts/check-data-contracts.ts';
const CHECKER_CLI_FILE = 'src/analytics-ingest/cli.ts';
const CHECKER_PARSER_FILE = 'src/analytics-ingest/parser.ts';
const CHECKER_TYPES_FILE = 'src/analytics-ingest/types.ts';
const CHECKER_VALIDATOR_FILE = 'src/analytics-ingest/validator.ts';
const CHECKER_RUNTIME_FILE = 'src/analytics-ingest/runtime.ts';
const CHECKER_TEST_FILE = 'tests/analytics-ingest.test.ts';

const REQUIRED_DATA_PLATFORM_CHECKER_FILES = [
  BUN_LOCK_FILE,
  TSCONFIG_FILE,
  CHECKER_SCRIPT_FILE,
  CHECKER_CLI_FILE,
  CHECKER_PARSER_FILE,
  CHECKER_TYPES_FILE,
  CHECKER_VALIDATOR_FILE,
  CHECKER_RUNTIME_FILE,
  CHECKER_TEST_FILE
] as const;

const REQUIRED_PACKAGE_SCRIPTS = ['check', 'test', 'contracts:check'] as const;
const REQUIRED_CHECK_SCRIPT_FRAGMENTS = [
  'tsc --noEmit',
  'bun test',
  'bun run contracts:check',
  'bun run contracts:check -- --architecture'
] as const;

const REQUIRED_INGEST_ENVELOPE_FIELDS = [
  'event_id',
  'schema_version',
  'source',
  'product_id',
  'occurred_at',
  'request_id',
  'trace_id'
] as const;

const FORBIDDEN_PAYLOAD_FIELDS = [
  'email',
  'name',
  'phone',
  'address',
  'raw_search_query',
  'form_body',
  'prompt_body',
  'mail_subject',
  'authorization',
  'cookie',
  'secret',
  'token',
  'payment_payload'
] as const;

const INITIAL_ANALYTICS_EVENTS = [
  'web.page-viewed',
  'product.signup-started',
  'product.signup-completed',
  'product.activation-completed',
  'experiment.exposure-recorded',
  'billing.checkout-started'
] as const;

const REQUIRED_RAW_EVENT_COLUMNS = [
  'event_id',
  'occurred_at',
  'received_at',
  'source',
  'product_id',
  'event_name',
  'schema_version',
  'request_id',
  'trace_id'
] as const;

const FORBIDDEN_CLICKHOUSE_OWNERSHIP = [
  'ledger_truth',
  'entitlement_truth',
  'identity_truth',
  'consent_truth',
  'raw_customer_payload_archive'
] as const;

const DELETION_EVENTS = [
  'deletion.request.created',
  'deletion.step.completed',
  'deletion.step.failed'
] as const;

const REQUIRED_DELETION_BEHAVIOR = [
  'exclude deleted or withdrawn subjects from query output first',
  'break user_id, anonymous_id, and session_id linkage for analytics views',
  'keep raw event mutation or tombstone work replayable',
  'emit evidence through core audit when deletion step handling succeeds or fails'
] as const;

const FORBIDDEN_DELETION_OWNERSHIP = [
  'source_data_deletion',
  'legal_hold_decision',
  'final_identity_state',
  'final_consent_state'
] as const;

const OPERATIONAL_METRICS = [
  'ingest_requests_total',
  'ingest_validation_failures_total',
  'ingest_queue_depth',
  'dead_letter_events_total',
  'clickhouse_insert_failures_total',
  'deletion_lag_seconds',
  'anonymization_lag_seconds'
] as const;

const OPERATIONAL_METRIC_KINDS = ['counter', 'gauge', 'histogram'] as const;

const ALLOWED_METRIC_LABELS = [
  'service_id',
  'event_name',
  'outcome',
  'reason_code',
  'queue_name',
  'worker',
  'target'
] as const;

const FORBIDDEN_METRIC_LABELS = [
  'user_id',
  'anonymous_id',
  'session_id',
  'email',
  'phone',
  'name',
  'address',
  'authorization',
  'authorization_header',
  'cookie',
  'cookies',
  'secret',
  'token',
  'payment_id',
  'payment_payload',
  'prompt_body',
  'form_body',
  'mail_subject',
  'message_body',
  'customer_message_body',
  'raw_path',
  'raw_query',
  'payload',
  'raw_payload'
] as const;

export async function validateRepositoryDataPlatformContract(input: {
  readonly repositoryRoot: string | undefined;
  readonly repositoryServiceContract: unknown;
}): Promise<readonly Diagnostic[]> {
  if (
    input.repositoryRoot === undefined ||
    readRepositoryName(input.repositoryServiceContract) !==
      DATA_PLATFORM_REPOSITORY_NAME
  ) {
    return [];
  }

  const [
    analyticsIngest,
    clickhouseStorage,
    deletionAnonymization,
    operationalMetrics
  ] =
    await Promise.all([
      readRequiredYamlContract(input.repositoryRoot, ANALYTICS_INGEST_FILE),
      readRequiredYamlContract(input.repositoryRoot, CLICKHOUSE_STORAGE_FILE),
      readRequiredYamlContract(input.repositoryRoot, DELETION_ANONYMIZATION_FILE),
      readRequiredYamlContract(input.repositoryRoot, OPERATIONAL_METRICS_FILE)
    ]);
  const packageJson = await readRequiredJsonContract(input.repositoryRoot, PACKAGE_FILE);

  return [
    ...analyticsIngest.diagnostics,
    ...clickhouseStorage.diagnostics,
    ...deletionAnonymization.diagnostics,
    ...operationalMetrics.diagnostics,
    ...packageJson.diagnostics,
    ...(analyticsIngest.value === null
      ? []
      : validateAnalyticsIngestContract(analyticsIngest.value)),
    ...(clickhouseStorage.value === null
      ? []
      : validateClickhouseStorageContract(clickhouseStorage.value)),
    ...(deletionAnonymization.value === null
      ? []
      : validateDeletionAnonymizationContract(deletionAnonymization.value)),
    ...(operationalMetrics.value === null
      ? []
      : validateOperationalMetricsContract(operationalMetrics.value)),
    ...(packageJson.value === null ? [] : validatePackageScripts(packageJson.value)),
    ...validateRequiredLinterRule(input.repositoryServiceContract),
    ...validateServiceOperationalMetrics(
      input.repositoryServiceContract,
      operationalMetrics.value
    ),
    ...(await validateCheckerSurface(input.repositoryRoot))
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
          createDataPlatformDiagnostic(
            file,
            'repository.root',
            `Data platform repository must include \`${file}\`.`
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
        createDataPlatformDiagnostic(
          file,
          'yaml',
          `Data platform contract \`${file}\` must be valid YAML: ${formatError(
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
          createDataPlatformDiagnostic(
            file,
            'repository.root',
            `Data platform repository must include \`${file}\`.`
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
        createDataPlatformDiagnostic(
          file,
          'json',
          `Data platform contract \`${file}\` must be valid JSON: ${formatError(
            error
          )}`
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
          createDataPlatformDiagnostic(
            file,
            'repository.root',
            `Data platform repository must include \`${file}\`.`
          )
        ]
      };
    }

    throw error;
  }
}

function validateAnalyticsIngestContract(value: unknown): readonly Diagnostic[] {
  return [
    ...validateExactValue({
      value,
      file: ANALYTICS_INGEST_FILE,
      path: 'source_of_truth.event_catalog',
      expected: 'zdp-architecture/catalogs/events.yaml',
      message:
        'Data platform ingest contract must use the architecture event catalog as source of truth.'
    }),
    ...validateExactValue({
      value,
      file: ANALYTICS_INGEST_FILE,
      path: 'source_of_truth.event_schemas',
      expected: 'zdp-architecture/schemas/events/*.json',
      message:
        'Data platform ingest contract must use architecture event schemas as source of truth.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: ANALYTICS_INGEST_FILE,
      path: 'ingest.accepted_from',
      field: 'ingest.accepted_from',
      requiredEntries: ['zdp-edge-workers']
    }),
    ...validateExactValue({
      value,
      file: ANALYTICS_INGEST_FILE,
      path: 'ingest.direct_browser_to_clickhouse',
      expected: 'forbidden',
      message:
        'Data platform ingest contract must forbid direct browser writes to ClickHouse.'
    }),
    ...validateExactValue({
      value,
      file: ANALYTICS_INGEST_FILE,
      path: 'ingest.direct_product_api_to_clickhouse',
      expected: 'forbidden',
      message:
        'Data platform ingest contract must forbid direct product API writes to ClickHouse.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: ANALYTICS_INGEST_FILE,
      path: 'ingest.envelope_required',
      field: 'ingest.envelope_required',
      requiredEntries: REQUIRED_INGEST_ENVELOPE_FIELDS
    }),
    ...validateExactValue({
      value,
      file: ANALYTICS_INGEST_FILE,
      path: 'ingest.idempotency.key',
      expected: 'event_id',
      message: 'Data platform ingest contract must use `event_id` for idempotency.'
    }),
    ...validateExactValue({
      value,
      file: ANALYTICS_INGEST_FILE,
      path: 'ingest.queue.dead_letter_required',
      expected: true,
      message: 'Data platform ingest contract must require a dead-letter path.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: ANALYTICS_INGEST_FILE,
      path: 'forbidden_payload_fields',
      field: 'forbidden_payload_fields',
      requiredEntries: FORBIDDEN_PAYLOAD_FIELDS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: ANALYTICS_INGEST_FILE,
      path: 'initial_events',
      field: 'initial_events',
      requiredEntries: INITIAL_ANALYTICS_EVENTS
    })
  ];
}

function validateClickhouseStorageContract(value: unknown): readonly Diagnostic[] {
  return [
    ...validateExactValue({
      value,
      file: CLICKHOUSE_STORAGE_FILE,
      path: 'datastore',
      expected: 'event_clickhouse',
      message:
        'Data platform ClickHouse contract must target `event_clickhouse` datastore.'
    }),
    ...validateExactValue({
      value,
      file: CLICKHOUSE_STORAGE_FILE,
      path: 'owner_repo',
      expected: DATA_PLATFORM_REPOSITORY_NAME,
      message:
        'Data platform ClickHouse contract must keep `zdp-data-platform` as owner repo.'
    }),
    ...validateExactValue({
      value,
      file: CLICKHOUSE_STORAGE_FILE,
      path: 'final_truth',
      expected: false,
      message:
        'Data platform ClickHouse contract must declare analytics storage as non-final truth.'
    }),
    ...validateExactValue({
      value,
      file: CLICKHOUSE_STORAGE_FILE,
      path: 'raw_events.data_class',
      expected: 'events',
      message: 'Raw analytics events must use the `events` data class.'
    }),
    ...validateExactValue({
      value,
      file: CLICKHOUSE_STORAGE_FILE,
      path: 'aggregates.data_class',
      expected: 'analytics',
      message: 'Analytics aggregates must use the `analytics` data class.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: CLICKHOUSE_STORAGE_FILE,
      path: 'raw_events.required_columns',
      field: 'raw_events.required_columns',
      requiredEntries: REQUIRED_RAW_EVENT_COLUMNS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: CLICKHOUSE_STORAGE_FILE,
      path: 'forbidden',
      field: 'forbidden',
      requiredEntries: FORBIDDEN_CLICKHOUSE_OWNERSHIP
    })
  ];
}

function validateDeletionAnonymizationContract(
  value: unknown
): readonly Diagnostic[] {
  return [
    ...validateRequiredStringArrayEntries({
      value,
      file: DELETION_ANONYMIZATION_FILE,
      path: 'consumes',
      field: 'consumes',
      requiredEntries: DELETION_EVENTS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: DELETION_ANONYMIZATION_FILE,
      path: 'required_behavior',
      field: 'required_behavior',
      requiredEntries: REQUIRED_DELETION_BEHAVIOR
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: DELETION_ANONYMIZATION_FILE,
      path: 'does_not_own',
      field: 'does_not_own',
      requiredEntries: FORBIDDEN_DELETION_OWNERSHIP
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: DELETION_ANONYMIZATION_FILE,
      path: 'fallback',
      field: 'fallback',
      requiredEntries: ['suppress subject in query layer until batch anonymization catches up']
    })
  ];
}

function validateOperationalMetricsContract(value: unknown): readonly Diagnostic[] {
  return [
    ...validateExactValue({
      value,
      file: OPERATIONAL_METRICS_FILE,
      path: 'telemetry.format',
      expected: 'prometheus',
      message:
        'Data platform operational metrics must use Prometheus-compatible names and types.'
    }),
    ...validateExactValue({
      value,
      file: OPERATIONAL_METRICS_FILE,
      path: 'telemetry.business_kpi_authority',
      expected: false,
      message:
        'Data platform operational metrics must not be declared as product or business KPI authority.'
    }),
    ...validateExactValue({
      value,
      file: OPERATIONAL_METRICS_FILE,
      path: 'telemetry.clickhouse_final_truth',
      expected: false,
      message:
        'Data platform operational metrics must not make ClickHouse final platform truth.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: OPERATIONAL_METRICS_FILE,
      path: 'labels.allowed',
      field: 'labels.allowed',
      requiredEntries: ALLOWED_METRIC_LABELS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: OPERATIONAL_METRICS_FILE,
      path: 'labels.forbidden',
      field: 'labels.forbidden',
      requiredEntries: FORBIDDEN_METRIC_LABELS
    }),
    ...validateOperationalMetricEntries(value)
  ];
}

function validateOperationalMetricEntries(value: unknown): readonly Diagnostic[] {
  const metrics = readPath(value, 'metrics');

  if (!Array.isArray(metrics)) {
    return [
      createDataPlatformDiagnostic(
        OPERATIONAL_METRICS_FILE,
        'metrics',
        'Data platform operational metrics contract must declare a `metrics` array.'
      )
    ];
  }

  const diagnostics: Diagnostic[] = [];
  const metricNames = readMetricNames(value);
  const allowedLabels = readStringArrayPath(value, 'labels.allowed');

  for (const requiredMetric of OPERATIONAL_METRICS) {
    if (metricNames.includes(requiredMetric)) {
      continue;
    }

    diagnostics.push(
      createDataPlatformDiagnostic(
        OPERATIONAL_METRICS_FILE,
        'metrics',
        `Data platform operational metrics contract must include \`${requiredMetric}\`.`
      )
    );
  }

  for (const [index, metric] of metrics.entries()) {
    if (!isRecord(metric)) {
      diagnostics.push(
        createDataPlatformDiagnostic(
          OPERATIONAL_METRICS_FILE,
          `metrics.${index}`,
          'Data platform operational metric entries must be YAML objects.'
        )
      );
      continue;
    }

    const name = readStringPath(metric, 'name');
    if (name === null || !isPrometheusMetricName(name)) {
      diagnostics.push(
        createDataPlatformDiagnostic(
          OPERATIONAL_METRICS_FILE,
          `metrics.${index}.name`,
          'Data platform operational metric names must be Prometheus-compatible snake_case identifiers.'
        )
      );
    }

    const kind = readStringPath(metric, 'kind');
    if (
      kind === null ||
      !OPERATIONAL_METRIC_KINDS.includes(
        kind as (typeof OPERATIONAL_METRIC_KINDS)[number]
      )
    ) {
      diagnostics.push(
        createDataPlatformDiagnostic(
          OPERATIONAL_METRICS_FILE,
          `metrics.${index}.kind`,
          'Data platform operational metric kind must be `counter`, `gauge`, or `histogram`.'
        )
      );
    }

    diagnostics.push(
      ...validateMetricLabels({
        metric,
        field: 'required_labels',
        path: `metrics.${index}.required_labels`,
        allowedLabels
      }),
      ...validateMetricLabels({
        metric,
        field: 'optional_labels',
        path: `metrics.${index}.optional_labels`,
        allowedLabels
      })
    );
  }

  return diagnostics;
}

function validateMetricLabels(input: {
  readonly metric: Record<string, unknown>;
  readonly field: string;
  readonly path: string;
  readonly allowedLabels: readonly string[];
}): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [
    ...validateStringArrayItems({
      value: input.metric,
      file: OPERATIONAL_METRICS_FILE,
      path: input.path,
      field: input.field
    })
  ];
  const labels = readStringArrayPath(input.metric, input.field);

  for (const label of labels) {
    if (!isPrometheusMetricName(label)) {
      diagnostics.push(
        createDataPlatformDiagnostic(
          OPERATIONAL_METRICS_FILE,
          input.path,
          `Data platform operational metric label \`${label}\` must be a Prometheus-compatible snake_case identifier.`
        )
      );
    }

    if (
      FORBIDDEN_METRIC_LABELS.includes(
        label as (typeof FORBIDDEN_METRIC_LABELS)[number]
      )
    ) {
      diagnostics.push(
        createDataPlatformDiagnostic(
          OPERATIONAL_METRICS_FILE,
          input.path,
          `Data platform operational metric label \`${label}\` is forbidden because it can expose sensitive or high-cardinality data.`
        )
      );
    }

    if (!input.allowedLabels.includes(label)) {
      diagnostics.push(
        createDataPlatformDiagnostic(
          OPERATIONAL_METRICS_FILE,
          input.path,
          `Data platform operational metric label \`${label}\` must be declared in \`labels.allowed\` before use.`
        )
      );
    }
  }

  return diagnostics;
}

function validateRequiredLinterRule(
  repositoryServiceContract: unknown
): readonly Diagnostic[] {
  const requiredRules = readStringArrayPath(
    repositoryServiceContract,
    'policy_gates.required_linter_rules'
  );

  if (requiredRules.includes(DATA_PLATFORM_CONTRACT_RULE_ID)) {
    return [];
  }

  return [
    createDataPlatformDiagnostic(
      'service.yaml',
      'policy_gates.required_linter_rules',
      `Data platform service contract must require \`${DATA_PLATFORM_CONTRACT_RULE_ID}\`.`
    )
  ];
}

function validateServiceOperationalMetrics(
  repositoryServiceContract: unknown,
  operationalMetricsContract: unknown | null
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [
    ...validateRequiredStringArrayEntries({
      value: repositoryServiceContract,
      file: 'service.yaml',
      path: 'observability.operational_metrics',
      field: 'observability.operational_metrics',
      requiredEntries: OPERATIONAL_METRICS
    })
  ];

  if (operationalMetricsContract === null) {
    return diagnostics;
  }

  const serviceMetrics = readStringArrayPath(
    repositoryServiceContract,
    'observability.operational_metrics'
  );
  const contractMetrics = readMetricNames(operationalMetricsContract);

  for (const metric of contractMetrics) {
    if (serviceMetrics.includes(metric)) {
      continue;
    }

    diagnostics.push(
      createDataPlatformDiagnostic(
        'service.yaml',
        'observability.operational_metrics',
        `Data platform service contract must include operational metric \`${metric}\` from \`${OPERATIONAL_METRICS_FILE}\`.`
      )
    );
  }

  for (const metric of serviceMetrics) {
    if (contractMetrics.includes(metric)) {
      continue;
    }

    diagnostics.push(
      createDataPlatformDiagnostic(
        'service.yaml',
        'observability.operational_metrics',
        `Data platform service contract operational metric \`${metric}\` must be declared in \`${OPERATIONAL_METRICS_FILE}\`.`
      )
    );
  }

  return diagnostics;
}

function validatePackageScripts(value: unknown): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const script of REQUIRED_PACKAGE_SCRIPTS) {
    const actual = readPath(value, `scripts.${script}`);

    if (typeof actual === 'string' && actual.trim().length > 0) {
      continue;
    }

    diagnostics.push(
      createDataPlatformDiagnostic(
        PACKAGE_FILE,
        `scripts.${script}`,
        `Data platform package must declare \`${script}\` script.`
      )
    );
  }

  const checkScript = readPath(value, 'scripts.check');

  if (typeof checkScript === 'string') {
    for (const requiredFragment of REQUIRED_CHECK_SCRIPT_FRAGMENTS) {
      if (checkScript.includes(requiredFragment)) {
        continue;
      }

      diagnostics.push(
        createDataPlatformDiagnostic(
          PACKAGE_FILE,
          'scripts.check',
          `Data platform package \`check\` script must include \`${requiredFragment}\`.`
        )
      );
    }
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
    runtimeSource,
    testSource
  ] = await Promise.all(
    REQUIRED_DATA_PLATFORM_CHECKER_FILES.map((file) =>
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
    ...runtimeSource.diagnostics,
    ...testSource.diagnostics,
    ...(script.source === null
      ? []
      : validateSourceIncludes({
          file: CHECKER_SCRIPT_FILE,
          source: script.source,
          requiredFragments: ['runContractCheckCli', 'process.argv.slice(2)']
        })),
    ...(cliSource.source === null
      ? []
      : validateSourceIncludes({
          file: CHECKER_CLI_FILE,
          source: cliSource.source,
          requiredFragments: [
            '--architecture',
            'architectureRoot',
            'checkDataContracts(repositoryRoot'
          ]
        })),
    ...(parserSource.source === null
      ? []
      : validateSourceIncludes({
          file: CHECKER_PARSER_FILE,
          source: parserSource.source,
          requiredFragments: ['readYamlFile', 'parse(source)', 'readJsonFile', 'JSON.parse(source)']
        })),
    ...(typesSource.source === null
      ? []
      : validateSourceIncludes({
          file: CHECKER_TYPES_FILE,
          source: typesSource.source,
          requiredFragments: ['DataContractCheckOptions', 'architectureRoot']
        })),
    ...(validatorSource.source === null
      ? []
      : [
          ...validateSourceIncludes({
            file: CHECKER_VALIDATOR_FILE,
            source: validatorSource.source,
            requiredFragments: [
              ANALYTICS_INGEST_FILE,
              CLICKHOUSE_STORAGE_FILE,
              DELETION_ANONYMIZATION_FILE,
              OPERATIONAL_METRICS_FILE,
              'service.yaml',
              'observability.operational_metrics',
              'business_kpi_authority',
              'clickhouse_final_truth',
              'labels.allowed',
              'labels.forbidden',
              'analytics.event.ingest',
              'FORBIDDEN_ENVELOPE_FIELDS',
              'payload_ref',
              'catalogs/events.yaml',
              'schemas/events/',
              '$id',
              'properties.schema_version.const',
              'initial_events'
            ]
          }),
          ...validateSourceCodeIncludes({
            file: CHECKER_VALIDATOR_FILE,
            source: validatorSource.source,
            requiredFragments: [
              'export function validateAnalyticsQueueEnvelope',
              'export function assertAnalyticsQueueEnvelope',
              'export async function checkDataContracts',
              'async function validateArchitectureEventCompatibility',
              'function validateOperationalMetricsContract',
              'function validateServiceOperationalMetricSync',
              'function validateGoRuntimeMetricSync',
              'function validateForbiddenEnvelopeFields',
              'function validateSupportedSchemaVersions'
            ]
          })
        ]),
    ...(runtimeSource.source === null
      ? []
      : [
          ...validateSourceIncludes({
            file: CHECKER_RUNTIME_FILE,
            source: runtimeSource.source,
            requiredFragments: [
              'repositoryRoot',
              'architectureRoot',
              'initial_events',
              'catalogs/events.yaml',
              'schemas/events/',
              'FORBIDDEN_EVENT_FIELDS',
              'idempotency_key',
              'payload_ref',
              'must not include raw or sensitive field'
            ]
          }),
          ...validateSourceCodeIncludes({
            file: CHECKER_RUNTIME_FILE,
            source: runtimeSource.source,
            requiredFragments: [
              'export async function validateAnalyticsIngestRuntime',
              'validateAnalyticsQueueEnvelope',
              'validateRepositoryEventContract',
              'validateArchitectureEventSchema',
              'validateQueueEventConsistency'
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
              'fails when required analytics contract fields drift',
              'fails when analytics schema versions are invalid',
              'fails when ClickHouse is treated as final truth',
              'fails when deletion ownership boundaries drift',
              'fails when operational metric contracts drift',
              'fails when Go runtime operational metrics drift from the contract',
              'rejects queue envelopes with raw payloads or missing trace fields',
              'rejects nested sensitive fields in queue envelopes',
              'passes current repository contracts against architecture event schemas',
              'fails when an initial event is missing from the architecture catalog',
              'fails when an architecture event schema file is missing',
              'fails when an architecture event schema id drifts',
              'fails when an architecture event schema omits required envelope fields',
              'fails when an architecture event schema is malformed JSON',
              'validates a runtime ingest candidate without writing to storage',
              'rejects runtime events with nested sensitive fields',
              'rejects runtime events that are not registered before ingest',
              'rejects runtime events when architecture schema drifts',
              'rejects runtime queue and event idempotency drift'
            ]
          }),
          ...validateSourceCodeIncludes({
            file: CHECKER_TEST_FILE,
            source: testSource.source,
            requiredFragments: [
              'expect(',
              'checkDataContracts',
              'validateAnalyticsQueueEnvelope',
              'validateAnalyticsIngestRuntime'
            ]
          })
        ])
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
      createDataPlatformDiagnostic(
        input.file,
        'source',
        `Data platform checker source must include \`${fragment}\`.`
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
      createDataPlatformDiagnostic(
        input.file,
        'source',
        `Data platform checker source must include test case \`${testName}\`.`
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
      createDataPlatformDiagnostic(
        input.file,
        'source',
        `Data platform checker source must include code fragment \`${fragment}\`.`
      )
    );
  }

  return diagnostics;
}

function validateRequiredStringArrayEntries(input: {
  readonly value: unknown;
  readonly file: string;
  readonly path: string;
  readonly field: string;
  readonly requiredEntries: readonly string[];
}): readonly Diagnostic[] {
  const entries = readStringArrayPath(input.value, input.field);
  const diagnostics: Diagnostic[] = [
    ...validateStringArrayItems({
      value: input.value,
      file: input.file,
      path: input.path,
      field: input.field
    })
  ];

  for (const requiredEntry of input.requiredEntries) {
    if (entries.includes(requiredEntry)) {
      continue;
    }

    diagnostics.push(
      createDataPlatformDiagnostic(
        input.file,
        input.path,
        `Data platform contract \`${input.file}\` must include \`${requiredEntry}\` in \`${input.field}\`.`
      )
    );
  }

  return diagnostics;
}

function validateStringArrayItems(input: {
  readonly value: unknown;
  readonly file: string;
  readonly path: string;
  readonly field: string;
}): readonly Diagnostic[] {
  const candidate = readPath(input.value, input.field);

  if (!Array.isArray(candidate)) {
    return [];
  }

  if (candidate.every((item) => typeof item === 'string' && item.trim().length > 0)) {
    return [];
  }

  return [
    createDataPlatformDiagnostic(
      input.file,
      input.path,
      `Data platform contract \`${input.file}\` must declare \`${input.field}\` as a string list.`
    )
  ];
}

function validateExactValue(input: {
  readonly value: unknown;
  readonly file: string;
  readonly path: string;
  readonly expected: unknown;
  readonly message: string;
}): readonly Diagnostic[] {
  const actual = readPath(input.value, input.path);

  if (actual === input.expected) {
    return [];
  }

  return [createDataPlatformDiagnostic(input.file, input.path, input.message)];
}

function readRepositoryName(value: unknown): string | null {
  if (!isRecord(value) || !isRecord(value.service)) {
    return null;
  }

  return readStringField(value.service, 'repo');
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

function readMetricNames(value: unknown): readonly string[] {
  const metrics = readPath(value, 'metrics');

  if (!Array.isArray(metrics)) {
    return [];
  }

  return metrics.flatMap((metric) => {
    if (!isRecord(metric)) {
      return [];
    }

    const name = readStringField(metric, 'name');
    return name === null ? [] : [name];
  });
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

function readStringPath(value: unknown, path: string): string | null {
  const candidate = readPath(value, path);

  return typeof candidate === 'string' && candidate.trim().length > 0
    ? candidate.trim()
    : null;
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

function isPrometheusMetricName(value: string): boolean {
  return /^[a-z_][a-z0-9_]*$/.test(value);
}

function createDataPlatformDiagnostic(
  file: string,
  path: string,
  message: string
): Diagnostic {
  return {
    ruleId: DATA_PLATFORM_CONTRACT_RULE_ID,
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
