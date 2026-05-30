import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { Diagnostic } from './diagnostics.ts';

const DATA_PLATFORM_REPOSITORY_NAME = 'zdp-data-platform';
const DATA_PLATFORM_CONTRACT_RULE_ID = 'ZDP-DATA-PLATFORM-001';

const ANALYTICS_INGEST_FILE = 'contracts/analytics-ingest.yaml';
const CLICKHOUSE_STORAGE_FILE = 'contracts/clickhouse-storage.yaml';
const DELETION_ANONYMIZATION_FILE = 'contracts/deletion-anonymization.yaml';

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

  const [analyticsIngest, clickhouseStorage, deletionAnonymization] =
    await Promise.all([
      readRequiredYamlContract(input.repositoryRoot, ANALYTICS_INGEST_FILE),
      readRequiredYamlContract(input.repositoryRoot, CLICKHOUSE_STORAGE_FILE),
      readRequiredYamlContract(input.repositoryRoot, DELETION_ANONYMIZATION_FILE)
    ]);

  return [
    ...analyticsIngest.diagnostics,
    ...clickhouseStorage.diagnostics,
    ...deletionAnonymization.diagnostics,
    ...(analyticsIngest.value === null
      ? []
      : validateAnalyticsIngestContract(analyticsIngest.value)),
    ...(clickhouseStorage.value === null
      ? []
      : validateClickhouseStorageContract(clickhouseStorage.value)),
    ...(deletionAnonymization.value === null
      ? []
      : validateDeletionAnonymizationContract(deletionAnonymization.value)),
    ...validateRequiredLinterRule(input.repositoryServiceContract)
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
      createDataPlatformDiagnostic(
        input.file,
        input.path,
        `Data platform contract \`${input.file}\` must include \`${requiredEntry}\` in \`${input.field}\`.`
      )
    );
  }

  return diagnostics;
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
