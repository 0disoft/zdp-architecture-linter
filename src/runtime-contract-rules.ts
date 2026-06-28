import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { Diagnostic } from './diagnostics.ts';
import {
  SMOKE_TARGETS_FILE,
  validateSmokeTargetsContract
} from './rules/runtime/smoke-targets.ts';
import { validateSmokeRunnerSurface } from './rules/runtime/smoke-runner-surface.ts';

const RUNTIME_REPOSITORY_NAME = 'zdp-platform-runtime';
const RUNTIME_CONTRACT_RULE_ID = 'ZDP-RUNTIME-001';
const HEALTHCHECK_FILE = 'contracts/healthcheck.yaml';
const DEPLOYMENT_TEMPLATE_FILE = 'contracts/deployment-template.yaml';
const ROLLBACK_FILE = 'contracts/rollback.yaml';
const PACKAGE_FILE = 'package.json';

const REQUIRED_PACKAGE_SCRIPTS = [
  'check',
  'test',
  'smoke:plan',
  'smoke:run'
] as const;

const REQUIRED_PACKAGE_SCRIPT_FRAGMENTS = [
  {
    script: 'smoke:plan',
    fragment: 'bun scripts/smoke-runner.ts plan'
  },
  {
    script: 'smoke:run',
    fragment: 'bun scripts/smoke-runner.ts run'
  }
] as const;

const REQUIRED_DEPLOYMENT_FIELDS = [
  'service_id',
  'service_repo',
  'environment',
  'image_ref',
  'deploy_id',
  'healthcheck',
  'rollback',
  'env_schema_ref'
] as const;

const REQUIRED_DEPLOYMENT_FORBIDDEN_FIELDS = [
  'secret_values',
  'product_business_logic',
  'database_migration_body'
] as const;

const REQUIRED_ROLLBACK_RECORD_FIELDS = [
  'deploy_id',
  'previous_image_ref',
  'target_image_ref',
  'actor',
  'reason',
  'trace_id'
] as const;

const REQUIRED_ROLLBACK_BLOCKERS = [
  'destructive migration has no rollback note',
  'previous revision is missing',
  'secret schema changed without compatibility note'
] as const;

export async function validateRepositoryRuntimeContract(input: {
  readonly repositoryRoot: string | undefined;
  readonly repositoryServiceContract: unknown;
}): Promise<readonly Diagnostic[]> {
  if (
    input.repositoryRoot === undefined ||
    readRepositoryName(input.repositoryServiceContract) !== RUNTIME_REPOSITORY_NAME
  ) {
    return [];
  }

  const [healthcheck, smokeTargets, deploymentTemplate, rollback, packageJson] =
    await Promise.all([
      readRequiredYamlContract(input.repositoryRoot, HEALTHCHECK_FILE),
      readRequiredYamlContract(input.repositoryRoot, SMOKE_TARGETS_FILE),
      readRequiredYamlContract(input.repositoryRoot, DEPLOYMENT_TEMPLATE_FILE),
      readRequiredYamlContract(input.repositoryRoot, ROLLBACK_FILE),
      readRequiredJsonFile(input.repositoryRoot, PACKAGE_FILE)
    ]);

  return [
    ...healthcheck.diagnostics,
    ...smokeTargets.diagnostics,
    ...deploymentTemplate.diagnostics,
    ...rollback.diagnostics,
    ...packageJson.diagnostics,
    ...(healthcheck.value === null ? [] : validateHealthcheckContract(healthcheck.value)),
    ...(smokeTargets.value === null
      ? []
      : validateSmokeTargetsContract(smokeTargets.value)),
    ...(deploymentTemplate.value === null
      ? []
      : validateDeploymentTemplateContract(deploymentTemplate.value)),
    ...(rollback.value === null ? [] : validateRollbackContract(rollback.value)),
    ...(packageJson.value === null ? [] : validatePackageScripts(packageJson.value)),
    ...(await validateSmokeRunnerSurface(input.repositoryRoot))
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
          createRuntimeDiagnostic(
            file,
            'repository.root',
            `Runtime repository must include \`${file}\`.`
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
        createRuntimeDiagnostic(
          file,
          'yaml',
          `Runtime contract \`${file}\` must be valid YAML: ${formatError(error)}`
        )
      ]
    };
  }
}

async function readRequiredJsonFile(
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
          createRuntimeDiagnostic(
            file,
            'repository.root',
            `Runtime repository must include \`${file}\`.`
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
        createRuntimeDiagnostic(
          file,
          'json',
          `Runtime contract \`${file}\` must be valid JSON: ${formatError(error)}`
        )
      ]
    };
  }
}

function validateHealthcheckContract(value: unknown): readonly Diagnostic[] {
  return [
    ...validateExactValue({
      value,
      file: HEALTHCHECK_FILE,
      path: 'healthcheck.liveness.method',
      expected: 'GET',
      message: 'Runtime liveness check must use `GET`.'
    }),
    ...validateExactValue({
      value,
      file: HEALTHCHECK_FILE,
      path: 'healthcheck.liveness.default_path',
      expected: '/healthz',
      message: 'Runtime liveness check must use `/healthz`.'
    }),
    ...validateExactValue({
      value,
      file: HEALTHCHECK_FILE,
      path: 'healthcheck.liveness.timeout_seconds',
      expected: 2,
      message: 'Runtime liveness timeout must be 2 seconds.'
    }),
    ...validateExactValue({
      value,
      file: HEALTHCHECK_FILE,
      path: 'healthcheck.liveness.success_status',
      expected: 200,
      message: 'Runtime liveness success status must be 200.'
    }),
    ...validateExactValue({
      value,
      file: HEALTHCHECK_FILE,
      path: 'healthcheck.liveness.response.content_type',
      expected: 'application/json',
      message: 'Runtime liveness response must be JSON.'
    }),
    ...validateExactValue({
      value,
      file: HEALTHCHECK_FILE,
      path: 'healthcheck.liveness.response.required_fields.ok',
      expected: true,
      message: 'Runtime liveness response must require `ok: true`.'
    }),
    ...validateExactValue({
      value,
      file: HEALTHCHECK_FILE,
      path: 'healthcheck.liveness.response.required_fields.service',
      expected: 'string',
      message: 'Runtime liveness response must require a string `service` field.'
    }),
    ...validateExactValue({
      value,
      file: HEALTHCHECK_FILE,
      path: 'healthcheck.readiness.method',
      expected: 'GET',
      message: 'Runtime readiness check must use `GET`.'
    }),
    ...validateExactValue({
      value,
      file: HEALTHCHECK_FILE,
      path: 'healthcheck.readiness.default_path',
      expected: '/readyz',
      message: 'Runtime readiness check must use `/readyz`.'
    }),
    ...validateExactValue({
      value,
      file: HEALTHCHECK_FILE,
      path: 'healthcheck.readiness.timeout_seconds',
      expected: 3,
      message: 'Runtime readiness timeout must be 3 seconds.'
    }),
    ...validateExactValue({
      value,
      file: HEALTHCHECK_FILE,
      path: 'healthcheck.readiness.success_status',
      expected: 200,
      message: 'Runtime readiness success status must be 200.'
    }),
    ...validateExactValue({
      value,
      file: HEALTHCHECK_FILE,
      path: 'healthcheck.readiness.response.content_type',
      expected: 'application/json',
      message: 'Runtime readiness response must be JSON.'
    }),
    ...validateExactValue({
      value,
      file: HEALTHCHECK_FILE,
      path: 'healthcheck.readiness.response.required_fields.ready',
      expected: 'boolean',
      message: 'Runtime readiness response must require a boolean `ready` field.'
    }),
    ...validateExactValue({
      value,
      file: HEALTHCHECK_FILE,
      path: 'healthcheck.readiness.response.required_fields.checks',
      expected: 'string_array',
      message:
        'Runtime readiness response must require a string array `checks` field.'
    }),
    ...validateExactValue({
      value,
      file: HEALTHCHECK_FILE,
      path: 'healthcheck.smoke.targets_ref',
      expected: SMOKE_TARGETS_FILE.split('/').at(-1),
      message: 'Runtime smoke contract must reference `smoke-targets.yaml`.'
    }),
    ...validateExactValue({
      value,
      file: HEALTHCHECK_FILE,
      path: 'healthcheck.smoke.required_before_production',
      expected: true,
      message: 'Runtime smoke contract must be required before production.'
    }),
    ...validateExactValue({
      value,
      file: HEALTHCHECK_FILE,
      path: 'healthcheck.smoke.must_not_require_real_payment',
      expected: true,
      message: 'Runtime smoke contract must not require real payment.'
    }),
    ...validateExactValue({
      value,
      file: HEALTHCHECK_FILE,
      path: 'healthcheck.smoke.must_not_require_user_data',
      expected: true,
      message: 'Runtime smoke contract must not require user data.'
    }),
    ...validateExactValue({
      value,
      file: HEALTHCHECK_FILE,
      path: 'healthcheck.smoke.must_not_require_real_customer_account',
      expected: true,
      message: 'Runtime smoke contract must not require a real customer account.'
    }),
    ...validateExactValue({
      value,
      file: HEALTHCHECK_FILE,
      path: 'healthcheck.smoke.must_not_perform_state_changes',
      expected: true,
      message: 'Runtime smoke contract must not perform state changes.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: HEALTHCHECK_FILE,
      path: 'headers.required',
      field: 'headers.required',
      requiredEntries: ['x-request-id']
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: HEALTHCHECK_FILE,
      path: 'headers.propagated',
      field: 'headers.propagated',
      requiredEntries: ['traceparent', 'x-request-id']
    })
  ];
}

function validateDeploymentTemplateContract(value: unknown): readonly Diagnostic[] {
  return [
    ...validateRequiredStringArrayEntries({
      value,
      file: DEPLOYMENT_TEMPLATE_FILE,
      path: 'deployment_template.required_fields',
      field: 'deployment_template.required_fields',
      requiredEntries: REQUIRED_DEPLOYMENT_FIELDS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: DEPLOYMENT_TEMPLATE_FILE,
      path: 'deployment_template.forbidden_fields',
      field: 'deployment_template.forbidden_fields',
      requiredEntries: REQUIRED_DEPLOYMENT_FORBIDDEN_FIELDS
    }),
    ...validateExactValue({
      value,
      file: DEPLOYMENT_TEMPLATE_FILE,
      path: 'process_model.web_process_required',
      expected: true,
      message: 'Runtime deployment template must require a web process.'
    }),
    ...validateExactValue({
      value,
      file: DEPLOYMENT_TEMPLATE_FILE,
      path: 'process_model.worker_process_optional',
      expected: true,
      message:
        'Runtime deployment template must keep worker processes optional.'
    }),
    ...validateExactValue({
      value,
      file: DEPLOYMENT_TEMPLATE_FILE,
      path: 'process_model.state_in_process_memory_allowed',
      expected: false,
      message: 'Runtime deployment template must forbid process-memory state.'
    }),
    ...validateExactValue({
      value,
      file: DEPLOYMENT_TEMPLATE_FILE,
      path: 'process_model.graceful_shutdown_required',
      expected: true,
      message: 'Runtime deployment template must require graceful shutdown.'
    })
  ];
}

function validateRollbackContract(value: unknown): readonly Diagnostic[] {
  return [
    ...validateExactValue({
      value,
      file: ROLLBACK_FILE,
      path: 'rollback.required',
      expected: true,
      message: 'Runtime rollback contract must require rollback.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: ROLLBACK_FILE,
      path: 'rollback.record_fields',
      field: 'rollback.record_fields',
      requiredEntries: REQUIRED_ROLLBACK_RECORD_FIELDS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: ROLLBACK_FILE,
      path: 'rollback.blocked_when',
      field: 'rollback.blocked_when',
      requiredEntries: REQUIRED_ROLLBACK_BLOCKERS
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
      createRuntimeDiagnostic(
        PACKAGE_FILE,
        `scripts.${script}`,
        `Runtime package must declare \`${script}\` script.`
      )
    );
  }

  const checkScript = readPath(value, 'scripts.check');
  if (
    typeof checkScript !== 'string' ||
    !checkScript.includes('tsc --noEmit') ||
    !checkScript.includes('bun test')
  ) {
    diagnostics.push(
      createRuntimeDiagnostic(
        PACKAGE_FILE,
        'scripts.check',
        'Runtime package `check` script must run `tsc --noEmit` and `bun test`.'
      )
    );
  }

  for (const requiredScript of REQUIRED_PACKAGE_SCRIPT_FRAGMENTS) {
    const actual = readPath(value, `scripts.${requiredScript.script}`);

    if (
      typeof actual !== 'string' ||
      actual.includes(requiredScript.fragment)
    ) {
      continue;
    }

    diagnostics.push(
      createRuntimeDiagnostic(
        PACKAGE_FILE,
        `scripts.${requiredScript.script}`,
        `Runtime package \`${requiredScript.script}\` script must run \`${requiredScript.fragment}\`.`
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
      createRuntimeDiagnostic(
        input.file,
        input.path,
        `Runtime contract \`${input.file}\` must include \`${requiredEntry}\` in \`${input.field}\`.`
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

  if (candidate.every((item) => typeof item === 'string')) {
    return [];
  }

  return [
    createRuntimeDiagnostic(
      input.file,
      input.path,
      `Runtime contract \`${input.file}\` must declare \`${input.field}\` as a string list.`
    )
  ];
}

function validateExactValue(input: {
  readonly value: unknown;
  readonly file: string;
  readonly path: string;
  readonly field?: string;
  readonly expected: unknown;
  readonly message: string;
}): readonly Diagnostic[] {
  const actual = readPath(input.value, input.field ?? input.path);

  if (actual === input.expected) {
    return [];
  }

  return [createRuntimeDiagnostic(input.file, input.path, input.message)];
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

function createRuntimeDiagnostic(
  file: string,
  path: string,
  message: string
): Diagnostic {
  return {
    ruleId: RUNTIME_CONTRACT_RULE_ID,
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
