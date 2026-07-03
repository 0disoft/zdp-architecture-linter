import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { validateRepositoryDataPlatformContract } from '../src/data-platform-contract-rules.ts';

describe('data platform contract rules', () => {
  test('passes when the data platform repository declares analytics contracts', async () => {
    await withRepositoryRoot(createValidDataPlatformFiles(), async (repositoryRoot) => {
      const diagnostics = await validateRepositoryDataPlatformContract({
        repositoryRoot,
        repositoryServiceContract: createDataPlatformServiceContract()
      });

      expect(diagnostics).toEqual([]);
    });
  });

  test('skips repositories that are not zdp-data-platform', async () => {
    await withRepositoryRoot({}, async (repositoryRoot) => {
      const diagnostics = await validateRepositoryDataPlatformContract({
        repositoryRoot,
        repositoryServiceContract: {
          service: {
            repo: 'zdp-platform-runtime'
          }
        }
      });

      expect(diagnostics).toEqual([]);
    });
  });

  test('fails when required data platform contract files are missing', async () => {
    await withRepositoryRoot({}, async (repositoryRoot) => {
      const diagnostics = await validateRepositoryDataPlatformContract({
        repositoryRoot,
        repositoryServiceContract: createDataPlatformServiceContract()
      });

      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-DATA-PLATFORM-001',
        severity: 'error',
        file: 'contracts/analytics-ingest.yaml',
        path: 'repository.root',
        message:
          'Data platform repository must include `contracts/analytics-ingest.yaml`.'
      });
      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-DATA-PLATFORM-001',
        severity: 'error',
        file: 'contracts/clickhouse-storage.yaml',
        path: 'repository.root',
        message:
          'Data platform repository must include `contracts/clickhouse-storage.yaml`.'
      });
      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-DATA-PLATFORM-001',
        severity: 'error',
        file: 'contracts/deletion-anonymization.yaml',
        path: 'repository.root',
        message:
          'Data platform repository must include `contracts/deletion-anonymization.yaml`.'
      });
      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-DATA-PLATFORM-001',
        severity: 'error',
        file: 'contracts/operational-metrics.yaml',
        path: 'repository.root',
        message:
          'Data platform repository must include `contracts/operational-metrics.yaml`.'
      });
    });
  });

  test('fails when a data platform contract file is not valid YAML', async () => {
    await withRepositoryRoot(
      {
        ...createValidDataPlatformFiles(),
        'contracts/analytics-ingest.yaml': 'ingest: [broken'
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryDataPlatformContract({
          repositoryRoot,
          repositoryServiceContract: createDataPlatformServiceContract()
        });

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]).toMatchObject({
          ruleId: 'ZDP-DATA-PLATFORM-001',
          severity: 'error',
          file: 'contracts/analytics-ingest.yaml',
          path: 'yaml'
        });
      }
    );
  });

  test('fails when analytics ingest allows direct writes or misses event contract fields', async () => {
    await withRepositoryRoot(
      {
        ...createValidDataPlatformFiles(),
        'contracts/analytics-ingest.yaml': `
source_of_truth:
  event_catalog: local-events.yaml
  event_schemas: local-schemas/*.json
ingest:
  accepted_from:
    - zdp-web-apps
  direct_browser_to_clickhouse: allowed
  direct_product_api_to_clickhouse: allowed
  envelope_required:
    - event_id
  idempotency:
    key: request_id
  queue:
    dead_letter_required: false
forbidden_payload_fields:
  - token
initial_events:
  - web.page-viewed
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryDataPlatformContract({
          repositoryRoot,
          repositoryServiceContract: createDataPlatformServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-DATA-PLATFORM-001',
          severity: 'error',
          file: 'contracts/analytics-ingest.yaml',
          path: 'source_of_truth.event_catalog',
          message:
            'Data platform ingest contract must use the architecture event catalog as source of truth.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-DATA-PLATFORM-001',
          severity: 'error',
          file: 'contracts/analytics-ingest.yaml',
          path: 'ingest.direct_browser_to_clickhouse',
          message:
            'Data platform ingest contract must forbid direct browser writes to ClickHouse.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-DATA-PLATFORM-001',
          severity: 'error',
          file: 'contracts/analytics-ingest.yaml',
          path: 'ingest.envelope_required',
          message:
            'Data platform contract `contracts/analytics-ingest.yaml` must include `trace_id` in `ingest.envelope_required`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-DATA-PLATFORM-001',
          severity: 'error',
          file: 'contracts/analytics-ingest.yaml',
          path: 'forbidden_payload_fields',
          message:
            'Data platform contract `contracts/analytics-ingest.yaml` must include `payment_payload` in `forbidden_payload_fields`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-DATA-PLATFORM-001',
          severity: 'error',
          file: 'contracts/analytics-ingest.yaml',
          path: 'initial_events',
          message:
            'Data platform contract `contracts/analytics-ingest.yaml` must include `billing.checkout-started` in `initial_events`.'
        });
      }
    );
  });

  test('fails when ClickHouse storage becomes final truth', async () => {
    await withRepositoryRoot(
      {
        ...createValidDataPlatformFiles(),
        'contracts/clickhouse-storage.yaml': `
datastore: event_clickhouse
owner_repo: zdp-data-platform
final_truth: true
raw_events:
  data_class: events
  required_columns:
    - event_id
aggregates:
  data_class: customer
forbidden:
  - ledger_truth
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryDataPlatformContract({
          repositoryRoot,
          repositoryServiceContract: createDataPlatformServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-DATA-PLATFORM-001',
          severity: 'error',
          file: 'contracts/clickhouse-storage.yaml',
          path: 'final_truth',
          message:
            'Data platform ClickHouse contract must declare analytics storage as non-final truth.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-DATA-PLATFORM-001',
          severity: 'error',
          file: 'contracts/clickhouse-storage.yaml',
          path: 'aggregates.data_class',
          message: 'Analytics aggregates must use the `analytics` data class.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-DATA-PLATFORM-001',
          severity: 'error',
          file: 'contracts/clickhouse-storage.yaml',
          path: 'forbidden',
          message:
            'Data platform contract `contracts/clickhouse-storage.yaml` must include `identity_truth` in `forbidden`.'
        });
      }
    );
  });

  test('fails when deletion and anonymization behavior drifts', async () => {
    await withRepositoryRoot(
      {
        ...createValidDataPlatformFiles(),
        'contracts/deletion-anonymization.yaml': `
consumes:
  - deletion.request.created
required_behavior:
  - exclude deleted or withdrawn subjects from query output first
does_not_own:
  - source_data_deletion
fallback:
  - wait for batch anonymization
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryDataPlatformContract({
          repositoryRoot,
          repositoryServiceContract: createDataPlatformServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-DATA-PLATFORM-001',
          severity: 'error',
          file: 'contracts/deletion-anonymization.yaml',
          path: 'consumes',
          message:
            'Data platform contract `contracts/deletion-anonymization.yaml` must include `deletion.step.failed` in `consumes`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-DATA-PLATFORM-001',
          severity: 'error',
          file: 'contracts/deletion-anonymization.yaml',
          path: 'does_not_own',
          message:
            'Data platform contract `contracts/deletion-anonymization.yaml` must include `final_consent_state` in `does_not_own`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-DATA-PLATFORM-001',
          severity: 'error',
          file: 'contracts/deletion-anonymization.yaml',
          path: 'fallback',
          message:
            'Data platform contract `contracts/deletion-anonymization.yaml` must include `suppress subject in query layer until batch anonymization catches up` in `fallback`.'
        });
      }
    );
  });

  test('fails when operational metric contracts drift', async () => {
    await withRepositoryRoot(
      {
        ...createValidDataPlatformFiles(),
        'contracts/operational-metrics.yaml': `
telemetry:
  format: statsd
  business_kpi_authority: true
  clickhouse_final_truth: true
labels:
  allowed:
    - service_id
  forbidden:
    - user_id
metrics:
  - name: ingest-requests-total
    kind: counter
    required_labels:
      - service_id
      - user_id
`,
        'service.yaml': ''
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryDataPlatformContract({
          repositoryRoot,
          repositoryServiceContract: {
            service: {
              repo: 'zdp-data-platform'
            },
            observability: {
              operational_metrics: [
                'ingest_requests_total',
                'orphan_metric_total'
              ]
            },
            policy_gates: {
              required_linter_rules: [
                'ZDP-REPO-BASELINE-001',
                'ZDP-DATA-PLATFORM-001'
              ]
            }
          }
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-DATA-PLATFORM-001',
          severity: 'error',
          file: 'contracts/operational-metrics.yaml',
          path: 'telemetry.format',
          message:
            'Data platform operational metrics must use Prometheus-compatible names and types.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-DATA-PLATFORM-001',
          severity: 'error',
          file: 'contracts/operational-metrics.yaml',
          path: 'telemetry.business_kpi_authority',
          message:
            'Data platform operational metrics must not be declared as product or business KPI authority.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-DATA-PLATFORM-001',
          severity: 'error',
          file: 'contracts/operational-metrics.yaml',
          path: 'telemetry.clickhouse_final_truth',
          message:
            'Data platform operational metrics must not make ClickHouse final platform truth.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-DATA-PLATFORM-001',
          severity: 'error',
          file: 'contracts/operational-metrics.yaml',
          path: 'metrics',
          message:
            'Data platform operational metrics contract must include `ingest_requests_total`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-DATA-PLATFORM-001',
          severity: 'error',
          file: 'contracts/operational-metrics.yaml',
          path: 'metrics.0.name',
          message:
            'Data platform operational metric names must be Prometheus-compatible snake_case identifiers.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-DATA-PLATFORM-001',
          severity: 'error',
          file: 'contracts/operational-metrics.yaml',
          path: 'metrics.0.required_labels',
          message:
            'Data platform operational metric label `user_id` is forbidden because it can expose sensitive or high-cardinality data.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-DATA-PLATFORM-001',
          severity: 'error',
          file: 'service.yaml',
          path: 'observability.operational_metrics',
          message:
            'Data platform service contract operational metric `orphan_metric_total` must be declared in `contracts/operational-metrics.yaml`.'
        });
      }
    );
  });

  test('fails when service contract does not require the data platform linter gate', async () => {
    await withRepositoryRoot(createValidDataPlatformFiles(), async (repositoryRoot) => {
      const diagnostics = await validateRepositoryDataPlatformContract({
        repositoryRoot,
        repositoryServiceContract: {
          service: {
            repo: 'zdp-data-platform'
          },
          policy_gates: {
            required_linter_rules: ['ZDP-REPO-BASELINE-001']
          }
        }
      });

      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-DATA-PLATFORM-001',
        severity: 'error',
        file: 'service.yaml',
        path: 'policy_gates.required_linter_rules',
        message:
          'Data platform service contract must require `ZDP-DATA-PLATFORM-001`.'
      });
    });
  });

  test('fails when data platform checker files and scripts drift', async () => {
    await withRepositoryRoot(
      {
        ...createValidDataPlatformFiles(),
        'package.json': `
{
  "scripts": {
    "check": "tsc --noEmit"
  }
}
`,
        'src/analytics-ingest/cli.ts': `
export async function runContractCheckCli(): Promise<number> {
  return 0;
}
`,
        'src/analytics-ingest/validator.ts': `
export function validateAnalyticsQueueEnvelope(): void {}
`,
        'src/analytics-ingest/runtime.ts': `
export function validateAnalyticsIngestRuntime(): void {}
`,
        'tests/analytics-ingest.test.ts': `
import { test } from 'bun:test';
test('data platform placeholder', () => {});
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryDataPlatformContract({
          repositoryRoot,
          repositoryServiceContract: createDataPlatformServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-DATA-PLATFORM-001',
          severity: 'error',
          file: 'package.json',
          path: 'scripts.check',
          message:
            'Data platform package `check` script must include `bun test`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-DATA-PLATFORM-001',
          severity: 'error',
          file: 'package.json',
          path: 'scripts.test',
          message: 'Data platform package must declare `test` script.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-DATA-PLATFORM-001',
          severity: 'error',
          file: 'package.json',
          path: 'scripts.contracts:check',
          message: 'Data platform package must declare `contracts:check` script.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-DATA-PLATFORM-001',
          severity: 'error',
          file: 'src/analytics-ingest/validator.ts',
          path: 'source',
          message:
            'Data platform checker source must include `contracts/analytics-ingest.yaml`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-DATA-PLATFORM-001',
          severity: 'error',
          file: 'src/analytics-ingest/cli.ts',
          path: 'source',
          message: 'Data platform checker source must include `--architecture`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-DATA-PLATFORM-001',
          severity: 'error',
          file: 'src/analytics-ingest/runtime.ts',
          path: 'source',
          message:
            'Data platform checker source must include code fragment `validateAnalyticsQueueEnvelope`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-DATA-PLATFORM-001',
          severity: 'error',
          file: 'tests/analytics-ingest.test.ts',
          path: 'source',
          message:
            'Data platform checker source must include test case `rejects nested sensitive fields in queue envelopes`.'
        });
      }
    );
  });

  test('fails when data platform contract string lists include non-string items', async () => {
    await withRepositoryRoot(
      {
        ...createValidDataPlatformFiles(),
        'contracts/analytics-ingest.yaml': `
source_of_truth:
  event_catalog: zdp-architecture/catalogs/events.yaml
  event_schemas: zdp-architecture/schemas/events/*.json
ingest:
  accepted_from:
    - zdp-edge-workers
  direct_browser_to_clickhouse: forbidden
  direct_product_api_to_clickhouse: forbidden
  envelope_required:
    - event_id
    - schema_version
    - source
    - product_id
    - occurred_at
    - request_id
    - trace_id
    - 123
  idempotency:
    key: event_id
  queue:
    dead_letter_required: true
forbidden_payload_fields:
  - email
  - name
  - phone
  - address
  - raw_search_query
  - form_body
  - prompt_body
  - mail_subject
  - authorization
  - cookie
  - secret
  - token
  - payment_payload
initial_events:
  - web.page-viewed
  - product.signup-started
  - product.signup-completed
  - product.activation-completed
  - experiment.exposure-recorded
  - billing.checkout-started
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryDataPlatformContract({
          repositoryRoot,
          repositoryServiceContract: createDataPlatformServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-DATA-PLATFORM-001',
          severity: 'error',
          file: 'contracts/analytics-ingest.yaml',
          path: 'ingest.envelope_required',
          message:
            'Data platform contract `contracts/analytics-ingest.yaml` must declare `ingest.envelope_required` as a string list.'
        });
      }
    );
  });

  test('fails when data platform source proof is only string literal stubs', async () => {
    await withRepositoryRoot(
      {
        ...createValidDataPlatformFiles(),
        'src/analytics-ingest/validator.ts': `
const fakeProof = [
  'contracts/analytics-ingest.yaml',
  'contracts/clickhouse-storage.yaml',
  'contracts/deletion-anonymization.yaml',
  'service.yaml',
  'analytics.event.ingest',
  'FORBIDDEN_ENVELOPE_FIELDS',
  'payload_ref',
  'catalogs/events.yaml',
  'schemas/events/',
  '$id',
  'properties.schema_version.const',
  'initial_events',
  'export function validateAnalyticsQueueEnvelope',
  'export function assertAnalyticsQueueEnvelope',
  'export async function checkDataContracts',
  'async function validateArchitectureEventCompatibility',
  'function validateForbiddenEnvelopeFields',
  'function validateSupportedSchemaVersions'
];
export { fakeProof };
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryDataPlatformContract({
          repositoryRoot,
          repositoryServiceContract: createDataPlatformServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-DATA-PLATFORM-001',
          severity: 'error',
          file: 'src/analytics-ingest/validator.ts',
          path: 'source',
          message:
            'Data platform checker source must include code fragment `export function validateAnalyticsQueueEnvelope`.'
        });
      }
    );
  });

  test('fails when data platform test proof is only a string list plus placeholder test', async () => {
    await withRepositoryRoot(
      {
        ...createValidDataPlatformFiles(),
        'tests/analytics-ingest.test.ts': `
import { expect, test } from 'bun:test';
import { checkDataContracts, validateAnalyticsQueueEnvelope } from '../src/analytics-ingest/validator';
import { validateAnalyticsIngestRuntime } from '../src/analytics-ingest/runtime';
const fakeProof = [
  'fails when required analytics contract fields drift',
  'fails when analytics schema versions are invalid',
  'fails when ClickHouse is treated as final truth',
  'fails when deletion ownership boundaries drift',
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
];
test('data platform placeholder', () => {
  expect(fakeProof).toContain('rejects nested sensitive fields in queue envelopes');
  expect(checkDataContracts).toBeDefined();
  expect(validateAnalyticsQueueEnvelope).toBeDefined();
  expect(validateAnalyticsIngestRuntime).toBeDefined();
});
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryDataPlatformContract({
          repositoryRoot,
          repositoryServiceContract: createDataPlatformServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-DATA-PLATFORM-001',
          severity: 'error',
          file: 'tests/analytics-ingest.test.ts',
          path: 'source',
          message:
            'Data platform checker source must include test case `fails when required analytics contract fields drift`.'
        });
      }
    );
  });
});

async function withRepositoryRoot(
  files: Record<string, string>,
  callback: (repositoryRoot: string) => Promise<void>
): Promise<void> {
  const repositoryRoot = await mkdtemp(join(tmpdir(), 'zdp-data-platform-'));

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

function createDataPlatformServiceContract(): unknown {
  return {
    service: {
      repo: 'zdp-data-platform'
    },
    observability: {
      operational_metrics: [
        'ingest_requests_total',
        'ingest_validation_failures_total',
        'ingest_queue_depth',
        'dead_letter_events_total',
        'clickhouse_insert_failures_total',
        'deletion_lag_seconds',
        'anonymization_lag_seconds'
      ]
    },
    policy_gates: {
      required_linter_rules: [
        'ZDP-REPO-BASELINE-001',
        'ZDP-DATA-PLATFORM-001'
      ]
    }
  };
}

function createValidDataPlatformFiles(): Record<string, string> {
  return {
    ...createValidDataPlatformCheckerFiles(),
    'contracts/analytics-ingest.yaml': `
source_of_truth:
  event_catalog: zdp-architecture/catalogs/events.yaml
  event_schemas: zdp-architecture/schemas/events/*.json
ingest:
  accepted_from:
    - zdp-edge-workers
  direct_browser_to_clickhouse: forbidden
  direct_product_api_to_clickhouse: forbidden
  envelope_required:
    - event_id
    - schema_version
    - source
    - product_id
    - occurred_at
    - request_id
    - trace_id
  idempotency:
    key: event_id
  queue:
    dead_letter_required: true
forbidden_payload_fields:
  - email
  - name
  - phone
  - address
  - raw_search_query
  - form_body
  - prompt_body
  - mail_subject
  - authorization
  - cookie
  - secret
  - token
  - payment_payload
initial_events:
  - web.page-viewed
  - product.signup-started
  - product.signup-completed
  - product.activation-completed
  - experiment.exposure-recorded
  - billing.checkout-started
`,
    'contracts/clickhouse-storage.yaml': `
datastore: event_clickhouse
owner_repo: zdp-data-platform
final_truth: false
raw_events:
  data_class: events
  required_columns:
    - event_id
    - occurred_at
    - received_at
    - source
    - product_id
    - event_name
    - schema_version
    - request_id
    - trace_id
aggregates:
  data_class: analytics
forbidden:
  - ledger_truth
  - entitlement_truth
  - identity_truth
  - consent_truth
  - raw_customer_payload_archive
`,
    'contracts/deletion-anonymization.yaml': `
consumes:
  - deletion.request.created
  - deletion.step.completed
  - deletion.step.failed
required_behavior:
  - exclude deleted or withdrawn subjects from query output first
  - break user_id, anonymous_id, and session_id linkage for analytics views
  - keep raw event mutation or tombstone work replayable
  - emit evidence through core audit when deletion step handling succeeds or fails
does_not_own:
  - source_data_deletion
  - legal_hold_decision
  - final_identity_state
  - final_consent_state
fallback:
  - suppress subject in query layer until batch anonymization catches up
`,
    'contracts/operational-metrics.yaml': `
telemetry:
  format: prometheus
  business_kpi_authority: false
  clickhouse_final_truth: false
labels:
  allowed:
    - service_id
    - event_name
    - outcome
    - reason_code
    - queue_name
    - worker
    - target
  forbidden:
    - user_id
    - anonymous_id
    - session_id
    - email
    - phone
    - name
    - address
    - authorization
    - authorization_header
    - cookie
    - cookies
    - secret
    - token
    - payment_id
    - payment_payload
    - prompt_body
    - form_body
    - mail_subject
    - message_body
    - customer_message_body
    - raw_path
    - raw_query
    - payload
    - raw_payload
metrics:
  - name: ingest_requests_total
    kind: counter
    required_labels:
      - service_id
      - event_name
      - outcome
    optional_labels:
      - reason_code
  - name: ingest_validation_failures_total
    kind: counter
    required_labels:
      - service_id
      - event_name
      - reason_code
    optional_labels: []
  - name: ingest_queue_depth
    kind: gauge
    required_labels:
      - service_id
      - queue_name
    optional_labels: []
  - name: dead_letter_events_total
    kind: counter
    required_labels:
      - service_id
      - queue_name
      - reason_code
    optional_labels: []
  - name: clickhouse_insert_failures_total
    kind: counter
    required_labels:
      - service_id
      - event_name
      - reason_code
    optional_labels: []
  - name: deletion_lag_seconds
    kind: gauge
    required_labels:
      - service_id
      - target
    optional_labels: []
  - name: anonymization_lag_seconds
    kind: gauge
    required_labels:
      - service_id
      - target
    optional_labels: []
`
  };
}

function createValidDataPlatformCheckerFiles(): Record<string, string> {
  return {
    'package.json': `
{
  "scripts": {
    "check": "tsc --noEmit && bun test && bun run contracts:check && bun run contracts:check -- --architecture ../../docs/zdp-architecture",
    "test": "bun test",
    "contracts:check": "bun scripts/check-data-contracts.ts"
  }
}
`,
    'bun.lock': `
{
  "lockfileVersion": 1
}
`,
    'tsconfig.json': `
{
  "compilerOptions": {
    "strict": true
  }
}
`,
    'scripts/check-data-contracts.ts': `
import { runContractCheckCli } from '../src/analytics-ingest/cli';
const exitCode = await runContractCheckCli(process.cwd(), process.argv.slice(2));
process.exit(exitCode);
`,
    'src/analytics-ingest/cli.ts': `
export async function runContractCheckCli(repositoryRoot: string): Promise<number> {
  const architectureFlag = '--architecture';
  const architectureRoot = 'zdp-architecture';
  await checkDataContracts(repositoryRoot, { architectureRoot });
  void architectureFlag;
  return 0;
}
`,
    'src/analytics-ingest/parser.ts': `
import { parse } from 'yaml';
export function readYamlFile(source: string): unknown {
  return parse(source);
}
export function readJsonFile(source: string): unknown {
  return JSON.parse(source);
}
`,
    'src/analytics-ingest/types.ts': `
export interface DataContractCheckOptions {
  readonly architectureRoot?: string;
}
export interface AnalyticsQueueEnvelope {
  readonly payload_ref: string;
}
`,
    'src/analytics-ingest/validator.ts': `
const ANALYTICS_INGEST_FILE = 'contracts/analytics-ingest.yaml';
const CLICKHOUSE_STORAGE_FILE = 'contracts/clickhouse-storage.yaml';
const DELETION_ANONYMIZATION_FILE = 'contracts/deletion-anonymization.yaml';
const OPERATIONAL_METRICS_FILE = 'contracts/operational-metrics.yaml';
const SERVICE_FILE = 'service.yaml';
const FORBIDDEN_ENVELOPE_FIELDS = [];
const EVENT_CATALOG_FILE = 'catalogs/events.yaml';
export async function checkDataContracts(): Promise<void> {
  validateSupportedSchemaVersions();
  validateOperationalMetricsContract();
  validateServiceOperationalMetricSync();
  validateGoRuntimeMetricSync();
  await validateArchitectureEventCompatibility();
}
export function validateAnalyticsQueueEnvelope(): void {
  const jobType = 'analytics.event.ingest';
  const payload_ref = 'analytics-event://evt';
  validateForbiddenEnvelopeFields();
  void jobType;
  void payload_ref;
}
export function assertAnalyticsQueueEnvelope(): void {
  validateAnalyticsQueueEnvelope();
}
async function validateArchitectureEventCompatibility(): Promise<void> {
  const schemaRoot = 'schemas/events/';
  const idField = '$id';
  const schemaVersion = 'properties.schema_version.const';
  const initialEvents = 'initial_events';
  void schemaRoot;
  void idField;
  void schemaVersion;
  void initialEvents;
}
function validateOperationalMetricsContract(): void {
  const businessKpiAuthority = 'business_kpi_authority';
  const clickhouseFinalTruth = 'clickhouse_final_truth';
  const allowedLabels = 'labels.allowed';
  const forbiddenLabels = 'labels.forbidden';
  void OPERATIONAL_METRICS_FILE;
  void businessKpiAuthority;
  void clickhouseFinalTruth;
  void allowedLabels;
  void forbiddenLabels;
}
function validateServiceOperationalMetricSync(): void {
  const serviceMetrics = 'observability.operational_metrics';
  void SERVICE_FILE;
  void serviceMetrics;
}
function validateGoRuntimeMetricSync(): void {
  void OPERATIONAL_METRICS_FILE;
}
function validateForbiddenEnvelopeFields(): void {}
function validateSupportedSchemaVersions(): void {}
export {
  ANALYTICS_INGEST_FILE,
  CLICKHOUSE_STORAGE_FILE,
  DELETION_ANONYMIZATION_FILE,
  OPERATIONAL_METRICS_FILE,
  SERVICE_FILE,
  FORBIDDEN_ENVELOPE_FIELDS,
  EVENT_CATALOG_FILE,
  validateArchitectureEventCompatibility,
  validateOperationalMetricsContract,
  validateServiceOperationalMetricSync,
  validateGoRuntimeMetricSync
};
`,
    'src/analytics-ingest/runtime.ts': `
import { validateAnalyticsQueueEnvelope } from './validator';
const EVENT_CATALOG_FILE = 'catalogs/events.yaml';
const FORBIDDEN_EVENT_FIELDS = [];
export async function validateAnalyticsIngestRuntime(input: {
  repositoryRoot?: string;
  architectureRoot?: string;
}): Promise<void> {
  validateAnalyticsQueueEnvelope();
  validateRepositoryEventContract(input.repositoryRoot ?? '.', 'web.page-viewed');
  validateArchitectureEventSchema(input.architectureRoot ?? '.', 'web.page-viewed');
  validateQueueEventConsistency({ idempotency_key: 'evt_123', payload_ref: 'analytics-event://evt_123' });
  const initialEvents = 'initial_events';
  const schemaRoot = 'schemas/events/';
  const message = 'must not include raw or sensitive field';
  void EVENT_CATALOG_FILE;
  void FORBIDDEN_EVENT_FIELDS;
  void initialEvents;
  void schemaRoot;
  void message;
}
function validateRepositoryEventContract(repositoryRoot: string, eventId: string): void {
  void repositoryRoot;
  void eventId;
}
function validateArchitectureEventSchema(architectureRoot: string, eventId: string): void {
  void architectureRoot;
  void eventId;
}
function validateQueueEventConsistency(value: {
  idempotency_key: string;
  payload_ref: string;
}): void {
  void value;
}
`,
    'tests/analytics-ingest.test.ts': `
import { expect, test } from 'bun:test';
import { checkDataContracts, validateAnalyticsQueueEnvelope } from '../src/analytics-ingest/validator';
import { validateAnalyticsIngestRuntime } from '../src/analytics-ingest/runtime';

test('fails when required analytics contract fields drift', () => {
  expect(checkDataContracts).toBeDefined();
});
test('fails when analytics schema versions are invalid', () => {
  expect(checkDataContracts).toBeDefined();
});
test('fails when ClickHouse is treated as final truth', () => {
  expect(checkDataContracts).toBeDefined();
});
test('fails when deletion ownership boundaries drift', () => {
  expect(checkDataContracts).toBeDefined();
});
test('fails when operational metric contracts drift', () => {
  expect(checkDataContracts).toBeDefined();
});
test('fails when Go runtime operational metrics drift from the contract', () => {
  expect(checkDataContracts).toBeDefined();
});
test('rejects queue envelopes with raw payloads or missing trace fields', () => {
  expect(validateAnalyticsQueueEnvelope).toBeDefined();
});
test('rejects nested sensitive fields in queue envelopes', () => {
  expect(validateAnalyticsQueueEnvelope).toBeDefined();
});
test('passes current repository contracts against architecture event schemas', () => {
  expect(checkDataContracts).toBeDefined();
});
test('fails when an initial event is missing from the architecture catalog', () => {
  expect(checkDataContracts).toBeDefined();
});
test('fails when an architecture event schema file is missing', () => {
  expect(checkDataContracts).toBeDefined();
});
test('fails when an architecture event schema id drifts', () => {
  expect(checkDataContracts).toBeDefined();
});
test('fails when an architecture event schema omits required envelope fields', () => {
  expect(checkDataContracts).toBeDefined();
});
test('fails when an architecture event schema is malformed JSON', () => {
  expect(checkDataContracts).toBeDefined();
});
test('validates a runtime ingest candidate without writing to storage', () => {
  expect(validateAnalyticsIngestRuntime).toBeDefined();
});
test('rejects runtime events with nested sensitive fields', () => {
  expect(validateAnalyticsIngestRuntime).toBeDefined();
});
test('rejects runtime events that are not registered before ingest', () => {
  expect(validateAnalyticsIngestRuntime).toBeDefined();
});
test('rejects runtime events when architecture schema drifts', () => {
  expect(validateAnalyticsIngestRuntime).toBeDefined();
});
test('rejects runtime queue and event idempotency drift', () => {
  expect(validateAnalyticsIngestRuntime).toBeDefined();
});
`
  };
}
