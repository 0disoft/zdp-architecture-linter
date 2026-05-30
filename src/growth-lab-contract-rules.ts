import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { Diagnostic } from './diagnostics.ts';

const GROWTH_LAB_REPOSITORY_NAME = 'zdp-growth-lab';
const GROWTH_LAB_CONTRACT_RULE_ID = 'ZDP-GROWTH-001';

const FUNNEL_METRICS_FILE = 'contracts/funnel-metrics.yaml';
const GROWTH_EXPERIMENTS_FILE = 'contracts/growth-experiments.yaml';
const EXPERIMENT_FILE = 'EXPERIMENT.md';

const REQUIRED_SOURCE_EVENTS = [
  'web.page-viewed',
  'product.signup-started',
  'product.signup-completed',
  'product.activation-completed',
  'experiment.exposure-recorded',
  'billing.checkout-started'
] as const;

const REQUIRED_FUNNELS = [
  'public-site-to-signup',
  'signup-to-activation',
  'checkout-intent'
] as const;

const REQUIRED_GUARDRAILS = [
  'do_not_reduce_privacy_consent_clarity',
  'do_not_increase_checkout_confusion',
  'do_not_hide_pricing_or_cancellation_terms'
] as const;

const REQUIRED_ALLOWED_INPUTS = [
  'anonymous_aggregates',
  'funnel_counts',
  'activation_counts',
  'experiment_exposure_counts'
] as const;

const REQUIRED_FORBIDDEN_INPUTS = [
  'raw_clickstream_export',
  'product_database_direct_read',
  'payment_database_direct_read',
  'identity_database_direct_read',
  'privacy_vault_direct_read'
] as const;

const REQUIRED_EXPERIMENT_FIELDS = [
  'experiment_id',
  'hypothesis',
  'target_surface',
  'primary_metric',
  'guardrail_metrics',
  'start_condition',
  'stop_condition',
  'rollback_plan'
] as const;

const REQUIRED_FORBIDDEN_USES = [
  'final_authorization_decision',
  'entitlement_decision',
  'ledger_or_credit_mutation',
  'undisclosed_tracking',
  'deceptive_urgency'
] as const;

const REQUIRED_SERVICE_DEPENDENCIES = [
  'data-platform',
  'platform-observability'
] as const;

const REQUIRED_HUMAN_REVIEW_ITEMS = [
  'experiment launch',
  'metric definition changes',
  'checkout or pricing experiment',
  'privacy or consent copy experiment'
] as const;

const REQUIRED_KILL_CRITERIA = [
  'experiments require raw customer payloads',
  'experiment exposure is used as authorization, entitlement, billing, or ledger truth',
  'dark patterns or undisclosed tracking become part of the experiment plan'
] as const;

const REQUIRED_EXPERIMENT_FRAGMENTS = [
  '익명·집계',
  '권한, 결제, 원장 판단',
  'raw 개인정보',
  'dark pattern',
  '제품 DB, money DB, core DB, privacy vault',
  'raw event export'
] as const;

export async function validateRepositoryGrowthLabContract(input: {
  readonly repositoryRoot: string | undefined;
  readonly repositoryServiceContract: unknown;
}): Promise<readonly Diagnostic[]> {
  if (
    input.repositoryRoot === undefined ||
    readRepositoryName(input.repositoryServiceContract) !==
      GROWTH_LAB_REPOSITORY_NAME
  ) {
    return [];
  }

  const [funnelMetrics, growthExperiments, experimentDoc] = await Promise.all([
    readRequiredYamlContract(input.repositoryRoot, FUNNEL_METRICS_FILE),
    readRequiredYamlContract(input.repositoryRoot, GROWTH_EXPERIMENTS_FILE),
    readRequiredTextFile(input.repositoryRoot, EXPERIMENT_FILE)
  ]);

  return [
    ...funnelMetrics.diagnostics,
    ...growthExperiments.diagnostics,
    ...experimentDoc.diagnostics,
    ...(funnelMetrics.value === null
      ? []
      : validateFunnelMetricsContract(funnelMetrics.value)),
    ...(growthExperiments.value === null
      ? []
      : validateGrowthExperimentsContract(growthExperiments.value)),
    ...(experimentDoc.source === null
      ? []
      : validateExperimentDocSurface(experimentDoc.source)),
    ...validateServiceContract(input.repositoryServiceContract),
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
          createGrowthLabDiagnostic(
            file,
            'repository.root',
            `Growth lab repository must include \`${file}\`.`
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
        createGrowthLabDiagnostic(
          file,
          'yaml',
          `Growth lab contract \`${file}\` must be valid YAML: ${formatError(
            error
          )}`
        )
      ]
    };
  }
}

async function readRequiredTextFile(
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
          createGrowthLabDiagnostic(
            file,
            'repository.root',
            `Growth lab repository must include \`${file}\`.`
          )
        ]
      };
    }

    throw error;
  }
}

function validateFunnelMetricsContract(value: unknown): readonly Diagnostic[] {
  return [
    ...validateRequiredStringArrayEntries({
      value,
      file: FUNNEL_METRICS_FILE,
      path: 'source_events',
      field: 'source_events',
      requiredEntries: REQUIRED_SOURCE_EVENTS
    }),
    ...validateRequiredIds({
      value,
      file: FUNNEL_METRICS_FILE,
      path: 'standard_funnels',
      field: 'standard_funnels',
      requiredIds: REQUIRED_FUNNELS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: FUNNEL_METRICS_FILE,
      path: 'guardrails',
      field: 'guardrails',
      requiredEntries: REQUIRED_GUARDRAILS
    })
  ];
}

function validateGrowthExperimentsContract(value: unknown): readonly Diagnostic[] {
  return [
    ...validateRequiredStringArrayEntries({
      value,
      file: GROWTH_EXPERIMENTS_FILE,
      path: 'allowed_inputs',
      field: 'allowed_inputs',
      requiredEntries: REQUIRED_ALLOWED_INPUTS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: GROWTH_EXPERIMENTS_FILE,
      path: 'forbidden_inputs',
      field: 'forbidden_inputs',
      requiredEntries: REQUIRED_FORBIDDEN_INPUTS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: GROWTH_EXPERIMENTS_FILE,
      path: 'required_fields',
      field: 'required_fields',
      requiredEntries: REQUIRED_EXPERIMENT_FIELDS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: GROWTH_EXPERIMENTS_FILE,
      path: 'forbidden_uses',
      field: 'forbidden_uses',
      requiredEntries: REQUIRED_FORBIDDEN_USES
    })
  ];
}

function validateExperimentDocSurface(source: string): readonly Diagnostic[] {
  return validateSourceIncludes({
    file: EXPERIMENT_FILE,
    source,
    requiredFragments: REQUIRED_EXPERIMENT_FRAGMENTS
  });
}

function validateServiceContract(value: unknown): readonly Diagnostic[] {
  return [
    ...validateExactValue({
      value,
      file: 'service.yaml',
      path: 'service.status',
      expected: 'experiment',
      message: 'Growth lab service must remain in `experiment` status.'
    }),
    ...validateExactValue({
      value,
      file: 'service.yaml',
      path: 'domain.type',
      expected: 'lab',
      message: 'Growth lab service must remain a lab boundary.'
    }),
    ...validateExactValue({
      value,
      file: 'service.yaml',
      path: 'data.pii_level',
      expected: 'none',
      message: 'Growth lab service must not own PII.'
    }),
    ...validateExactValue({
      value,
      file: 'service.yaml',
      path: 'data.payment_data',
      expected: false,
      message: 'Growth lab service must not own payment data.'
    }),
    ...validateExactValue({
      value,
      file: 'service.yaml',
      path: 'data.money_movement',
      expected: false,
      message: 'Growth lab service must not move money.'
    }),
    ...validateExactValue({
      value,
      file: 'service.yaml',
      path: 'data.ai_user_data',
      expected: false,
      message: 'Growth lab service must not own AI user data.'
    }),
    ...validateStringArrayEmpty({
      value,
      file: 'service.yaml',
      path: 'dependencies.datastores',
      message:
        'Growth lab service must not depend directly on product, core, money, privacy, or analytics datastores.'
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
      path: 'human_review_required',
      field: 'human_review_required',
      requiredEntries: REQUIRED_HUMAN_REVIEW_ITEMS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: 'service.yaml',
      path: 'exit.kill_criteria',
      field: 'exit.kill_criteria',
      requiredEntries: REQUIRED_KILL_CRITERIA
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

  if (requiredRules.includes(GROWTH_LAB_CONTRACT_RULE_ID)) {
    return [];
  }

  return [
    createGrowthLabDiagnostic(
      'service.yaml',
      'policy_gates.required_linter_rules',
      `Growth lab service contract must require \`${GROWTH_LAB_CONTRACT_RULE_ID}\`.`
    )
  ];
}

function validateRequiredIds(input: {
  readonly value: unknown;
  readonly file: string;
  readonly path: string;
  readonly field: string;
  readonly requiredIds: readonly string[];
}): readonly Diagnostic[] {
  const entries = readPath(input.value, input.field);
  const ids = Array.isArray(entries)
    ? entries.flatMap((entry) =>
        isRecord(entry) && typeof entry.id === 'string' ? [entry.id] : []
      )
    : [];
  const diagnostics: Diagnostic[] = [];

  for (const requiredId of input.requiredIds) {
    if (ids.includes(requiredId)) {
      continue;
    }

    diagnostics.push(
      createGrowthLabDiagnostic(
        input.file,
        input.path,
        `Growth lab contract \`${input.file}\` must include id \`${requiredId}\` in \`${input.field}\`.`
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
  const diagnostics: Diagnostic[] = [];

  for (const requiredEntry of input.requiredEntries) {
    if (entries.includes(requiredEntry)) {
      continue;
    }

    diagnostics.push(
      createGrowthLabDiagnostic(
        input.file,
        input.path,
        `Growth lab contract \`${input.file}\` must include \`${requiredEntry}\` in \`${input.field}\`.`
      )
    );
  }

  return diagnostics;
}

function validateStringArrayEmpty(input: {
  readonly value: unknown;
  readonly file: string;
  readonly path: string;
  readonly message: string;
}): readonly Diagnostic[] {
  const candidate = readPath(input.value, input.path);

  if (Array.isArray(candidate) && candidate.length === 0) {
    return [];
  }

  return [createGrowthLabDiagnostic(input.file, input.path, input.message)];
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
      createGrowthLabDiagnostic(
        input.file,
        'source',
        `Growth lab contract source must include \`${fragment}\`.`
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

  return [createGrowthLabDiagnostic(input.file, input.path, input.message)];
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

function createGrowthLabDiagnostic(
  file: string,
  path: string,
  message: string
): Diagnostic {
  return {
    ruleId: GROWTH_LAB_CONTRACT_RULE_ID,
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
