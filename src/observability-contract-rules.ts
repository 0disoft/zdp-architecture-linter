import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { Diagnostic } from './diagnostics.ts';

const OBSERVABILITY_REPOSITORY_NAME = 'zdp-platform-observability';
const OBSERVABILITY_CONTRACT_RULE_ID = 'ZDP-OBS-001';

const TELEMETRY_CONVENTIONS_FILE = 'contracts/telemetry-conventions.yaml';
const DASHBOARD_INVENTORY_FILE = 'contracts/dashboard-inventory.yaml';
const ALERT_RULES_FILE = 'contracts/alert-rules.yaml';

const REQUIRED_ALL_SERVICE_ATTRIBUTES = [
  'service_id',
  'service_repo',
  'environment',
  'cost_center',
  'request_id',
  'trace_id'
] as const;

const REQUIRED_REDACTED_ATTRIBUTES = [
  'authorization',
  'cookie',
  'secret',
  'token',
  'database_url',
  'payment_payload',
  'ai_prompt'
] as const;

const REQUIRED_PROPAGATION_HEADERS = ['traceparent', 'x-request-id'] as const;

const REQUIRED_DASHBOARD_IDS = [
  'platform-health',
  'platform-cost-and-ingest'
] as const;

const REQUIRED_ALERT_IDS = [
  'service-healthcheck-failing',
  'backup-restore-drill-failed',
  'telemetry-sensitive-data-detected',
  'provider-ingest-failing'
] as const;

export async function validateRepositoryObservabilityContract(input: {
  readonly repositoryRoot: string | undefined;
  readonly repositoryServiceContract: unknown;
}): Promise<readonly Diagnostic[]> {
  if (
    input.repositoryRoot === undefined ||
    readRepositoryName(input.repositoryServiceContract) !==
      OBSERVABILITY_REPOSITORY_NAME
  ) {
    return [];
  }

  const [telemetryConventions, dashboardInventory, alertRules] = await Promise.all([
    readRequiredYamlContract(input.repositoryRoot, TELEMETRY_CONVENTIONS_FILE),
    readRequiredYamlContract(input.repositoryRoot, DASHBOARD_INVENTORY_FILE),
    readRequiredYamlContract(input.repositoryRoot, ALERT_RULES_FILE)
  ]);

  return [
    ...telemetryConventions.diagnostics,
    ...dashboardInventory.diagnostics,
    ...alertRules.diagnostics,
    ...(telemetryConventions.value === null
      ? []
      : validateTelemetryConventionsContract(telemetryConventions.value)),
    ...(dashboardInventory.value === null
      ? []
      : validateDashboardInventoryContract(dashboardInventory.value)),
    ...(alertRules.value === null ? [] : validateAlertRulesContract(alertRules.value))
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
          createObservabilityDiagnostic(
            file,
            'repository.root',
            `Observability repository must include \`${file}\`.`
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
        createObservabilityDiagnostic(
          file,
          'yaml',
          `Observability contract \`${file}\` must be valid YAML: ${formatError(
            error
          )}`
        )
      ]
    };
  }
}

function validateTelemetryConventionsContract(
  value: unknown
): readonly Diagnostic[] {
  return [
    ...validateRequiredStringArrayEntries({
      value,
      file: TELEMETRY_CONVENTIONS_FILE,
      path: 'required_attributes.all_services',
      field: 'required_attributes.all_services',
      requiredEntries: REQUIRED_ALL_SERVICE_ATTRIBUTES
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: TELEMETRY_CONVENTIONS_FILE,
      path: 'redacted_attributes',
      field: 'redacted_attributes',
      requiredEntries: REQUIRED_REDACTED_ATTRIBUTES
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: TELEMETRY_CONVENTIONS_FILE,
      path: 'propagation_headers',
      field: 'propagation_headers',
      requiredEntries: REQUIRED_PROPAGATION_HEADERS
    })
  ];
}

function validateDashboardInventoryContract(value: unknown): readonly Diagnostic[] {
  return [
    ...validateRequiredIdEntries({
      value,
      file: DASHBOARD_INVENTORY_FILE,
      path: 'dashboards',
      field: 'dashboards',
      requiredEntries: REQUIRED_DASHBOARD_IDS
    }),
    ...validateExactValue({
      value,
      file: DASHBOARD_INVENTORY_FILE,
      path: 'policy.source_of_truth',
      expected: 'repository-contract-first',
      message:
        'Observability dashboard inventory must keep repository contracts as source of truth.'
    }),
    ...validateExactValue({
      value,
      file: DASHBOARD_INVENTORY_FILE,
      path: 'policy.dashboard_only_changes',
      expected: 'forbidden',
      message:
        'Observability dashboard inventory must forbid dashboard-only changes.'
    }),
    ...validateExactValue({
      value,
      file: DASHBOARD_INVENTORY_FILE,
      path: 'policy.export_required_before_provider_migration',
      expected: true,
      message:
        'Observability dashboard inventory must require export before provider migration.'
    })
  ];
}

function validateAlertRulesContract(value: unknown): readonly Diagnostic[] {
  return [
    ...validateRequiredIdEntries({
      value,
      file: ALERT_RULES_FILE,
      path: 'alerts',
      field: 'alerts',
      requiredEntries: REQUIRED_ALERT_IDS
    })
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
      createObservabilityDiagnostic(
        input.file,
        input.path,
        `Observability contract \`${input.file}\` must include \`${requiredEntry}\` in \`${input.field}\`.`
      )
    );
  }

  return diagnostics;
}

function validateRequiredIdEntries(input: {
  readonly value: unknown;
  readonly file: string;
  readonly path: string;
  readonly field: string;
  readonly requiredEntries: readonly string[];
}): readonly Diagnostic[] {
  const entries = readIdArrayPath(input.value, input.field);
  const diagnostics: Diagnostic[] = [];

  for (const requiredEntry of input.requiredEntries) {
    if (entries.includes(requiredEntry)) {
      continue;
    }

    diagnostics.push(
      createObservabilityDiagnostic(
        input.file,
        input.path,
        `Observability contract \`${input.file}\` must declare \`${requiredEntry}\` in \`${input.field}\`.`
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

  return [
    createObservabilityDiagnostic(input.file, input.path, input.message)
  ];
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

function readIdArrayPath(value: unknown, path: string): readonly string[] {
  const candidate = readPath(value, path);

  if (!Array.isArray(candidate)) {
    return [];
  }

  return candidate.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    return readStringField(entry, 'id') ?? [];
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

function readStringField(
  value: Record<string, unknown>,
  field: string
): string | null {
  const candidate = value[field];

  return typeof candidate === 'string' && candidate.trim().length > 0
    ? candidate.trim()
    : null;
}

function createObservabilityDiagnostic(
  file: string,
  path: string,
  message: string
): Diagnostic {
  return {
    ruleId: OBSERVABILITY_CONTRACT_RULE_ID,
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
