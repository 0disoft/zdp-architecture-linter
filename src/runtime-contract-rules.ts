import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { Diagnostic } from './diagnostics.ts';

const RUNTIME_REPOSITORY_NAME = 'zdp-platform-runtime';
const RUNTIME_CONTRACT_RULE_ID = 'ZDP-RUNTIME-001';

const HEALTHCHECK_FILE = 'contracts/healthcheck.yaml';
const SMOKE_TARGETS_FILE = 'contracts/smoke-targets.yaml';
const DEPLOYMENT_TEMPLATE_FILE = 'contracts/deployment-template.yaml';
const ROLLBACK_FILE = 'contracts/rollback.yaml';

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

  const [healthcheck, smokeTargets, deploymentTemplate, rollback] =
    await Promise.all([
      readRequiredYamlContract(input.repositoryRoot, HEALTHCHECK_FILE),
      readRequiredYamlContract(input.repositoryRoot, SMOKE_TARGETS_FILE),
      readRequiredYamlContract(input.repositoryRoot, DEPLOYMENT_TEMPLATE_FILE),
      readRequiredYamlContract(input.repositoryRoot, ROLLBACK_FILE)
    ]);

  return [
    ...healthcheck.diagnostics,
    ...smokeTargets.diagnostics,
    ...deploymentTemplate.diagnostics,
    ...rollback.diagnostics,
    ...(healthcheck.value === null ? [] : validateHealthcheckContract(healthcheck.value)),
    ...(smokeTargets.value === null
      ? []
      : validateSmokeTargetsContract(smokeTargets.value)),
    ...(deploymentTemplate.value === null
      ? []
      : validateDeploymentTemplateContract(deploymentTemplate.value)),
    ...(rollback.value === null ? [] : validateRollbackContract(rollback.value))
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

function validateSmokeTargetsContract(value: unknown): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const targets = readPath(value, 'targets');

  if (!Array.isArray(targets)) {
    return [
      createRuntimeDiagnostic(
        SMOKE_TARGETS_FILE,
        'targets',
        'Runtime smoke contract must declare a `targets` array.'
      )
    ];
  }

  const targetById = new Map<string, Record<string, unknown>>();

  for (const target of targets) {
    if (!isRecord(target)) {
      continue;
    }

    const id = readStringField(target, 'id');

    if (id !== null) {
      targetById.set(id, target);
    }
  }

  diagnostics.push(
    ...validateCoreApiSmokeTarget(targetById.get('core-api')),
    ...validateAppConsoleSmokeTarget(targetById.get('app-console')),
    ...validateEdgeWebhookIngressSmokeTarget(
      targetById.get('edge-webhook-ingress')
    )
  );

  return diagnostics;
}

function validateCoreApiSmokeTarget(
  target: Record<string, unknown> | undefined
): readonly Diagnostic[] {
  if (target === undefined) {
    return [
      createRuntimeDiagnostic(
        SMOKE_TARGETS_FILE,
        'targets.core-api',
        'Runtime smoke contract must declare `core-api` target.'
      )
    ];
  }

  return [
    ...validateTargetIdentity(target, 'core-api', 'zdp-core-platform'),
    ...validateExactValue({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'targets.core-api.healthz.expect_json.ok',
      field: 'healthz.expect_json.ok',
      expected: true,
      message: 'Runtime `core-api` healthz smoke target must expect `ok: true`.'
    }),
    ...validateExactValue({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'targets.core-api.healthz.expect_json.service',
      field: 'healthz.expect_json.service',
      expected: 'core-api',
      message:
        'Runtime `core-api` healthz smoke target must expect service `core-api`.'
    }),
    ...validateExactValue({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'targets.core-api.readyz.expect_json.ready',
      field: 'readyz.expect_json.ready',
      expected: true,
      message: 'Runtime `core-api` readyz smoke target must expect `ready: true`.'
    }),
    ...validateRequiredStringArrayEntries({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'targets.core-api.readyz.expect_json.checks',
      field: 'readyz.expect_json.checks',
      requiredEntries: ['contracts']
    }),
    ...validateRequiredStringArrayEntries({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'targets.core-api.blocked_production_when',
      field: 'blocked_production_when',
      requiredEntries: ['readyz checks omit contracts']
    })
  ];
}

function validateAppConsoleSmokeTarget(
  target: Record<string, unknown> | undefined
): readonly Diagnostic[] {
  if (target === undefined) {
    return [
      createRuntimeDiagnostic(
        SMOKE_TARGETS_FILE,
        'targets.app-console',
        'Runtime smoke contract must declare `app-console` target.'
      )
    ];
  }

  return [
    ...validateTargetIdentity(target, 'app-console', 'zdp-web-apps'),
    ...validateExactValue({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'targets.app-console.healthz.expect_json.ok',
      field: 'healthz.expect_json.ok',
      expected: true,
      message: 'Runtime `app-console` healthz smoke target must expect `ok: true`.'
    }),
    ...validateExactValue({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'targets.app-console.healthz.expect_json.service',
      field: 'healthz.expect_json.service',
      expected: 'app-console',
      message:
        'Runtime `app-console` healthz smoke target must expect service `app-console`.'
    }),
    ...validateRequiredStringArrayEntries({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'targets.app-console.required_env',
      field: 'required_env',
      requiredEntries: ['ZDP_CORE_API_BASE_URL']
    }),
    ...validateRequiredStringArrayEntries({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'targets.app-console.readyz.required_env',
      field: 'readyz.required_env',
      requiredEntries: ['ZDP_CORE_API_BASE_URL']
    }),
    ...validateExactValue({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'targets.app-console.readyz.expect_json_when_configured.ready',
      field: 'readyz.expect_json_when_configured.ready',
      expected: true,
      message:
        'Runtime `app-console` configured readyz smoke target must expect `ready: true`.'
    }),
    ...validateExactValue({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'targets.app-console.readyz.expect_json_when_configured.service',
      field: 'readyz.expect_json_when_configured.service',
      expected: 'app-console',
      message:
        'Runtime `app-console` configured readyz smoke target must expect service `app-console`.'
    }),
    ...validateRequiredStringArrayEntries({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'targets.app-console.readyz.expect_json_when_configured.upstreams',
      field: 'readyz.expect_json_when_configured.upstreams',
      requiredEntries: ['core-api']
    }),
    ...validateExactValue({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'targets.app-console.readyz.expect_json_when_missing_env.ready',
      field: 'readyz.expect_json_when_missing_env.ready',
      expected: false,
      message:
        'Runtime `app-console` missing-env readyz smoke target must expect `ready: false`.'
    }),
    ...validateRequiredStringArrayEntries({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'targets.app-console.readyz.expect_json_when_missing_env.missing',
      field: 'readyz.expect_json_when_missing_env.missing',
      requiredEntries: ['ZDP_CORE_API_BASE_URL']
    }),
    ...validateRequiredStringArrayEntries({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'targets.app-console.blocked_production_when',
      field: 'blocked_production_when',
      requiredEntries: [
        'ZDP_CORE_API_BASE_URL is missing',
        'readyz does not report core-api as an upstream',
        'app shell attempts direct core, money, privacy, or credential datastore access'
      ]
    })
  ];
}

function validateEdgeWebhookIngressSmokeTarget(
  target: Record<string, unknown> | undefined
): readonly Diagnostic[] {
  if (target === undefined) {
    return [
      createRuntimeDiagnostic(
        SMOKE_TARGETS_FILE,
        'targets.edge-webhook-ingress',
        'Runtime smoke contract must declare `edge-webhook-ingress` target.'
      )
    ];
  }

  return [
    ...validateTargetIdentity(
      target,
      'edge-webhook-ingress',
      'zdp-edge-workers'
    ),
    ...validateExactValue({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'targets.edge-webhook-ingress.process',
      field: 'process',
      expected: 'edge-worker',
      message:
        'Runtime `edge-webhook-ingress` smoke target must declare process `edge-worker`.'
    }),
    ...validateExactValue({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'targets.edge-webhook-ingress.healthz.expect_json.ok',
      field: 'healthz.expect_json.ok',
      expected: true,
      message:
        'Runtime `edge-webhook-ingress` healthz smoke target must expect `ok: true`.'
    }),
    ...validateExactValue({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'targets.edge-webhook-ingress.healthz.expect_json.service',
      field: 'healthz.expect_json.service',
      expected: 'edge-webhook-ingress',
      message:
        'Runtime `edge-webhook-ingress` healthz smoke target must expect service `edge-webhook-ingress`.'
    }),
    ...validateExactValue({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'targets.edge-webhook-ingress.readyz.expect_json.ready',
      field: 'readyz.expect_json.ready',
      expected: true,
      message:
        'Runtime `edge-webhook-ingress` readyz smoke target must expect `ready: true`.'
    }),
    ...validateRequiredStringArrayEntries({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'targets.edge-webhook-ingress.readyz.expect_json.checks',
      field: 'readyz.expect_json.checks',
      requiredEntries: ['contracts']
    }),
    ...validateRequiredStringArrayEntries({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'targets.edge-webhook-ingress.blocked_production_when',
      field: 'blocked_production_when',
      requiredEntries: [
        'x-request-id is not propagated',
        'traceparent is not propagated when present',
        'edge worker becomes the source of final authorization, entitlement, ledger, or privacy decisions'
      ]
    })
  ];
}

function validateTargetIdentity(
  target: Record<string, unknown>,
  id: string,
  repo: string
): readonly Diagnostic[] {
  return [
    ...validateExactValue({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: `targets.${id}.repo`,
      field: 'repo',
      expected: repo,
      message: `Runtime \`${id}\` smoke target must reference repo \`${repo}\`.`
    }),
    ...validateExactValue({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: `targets.${id}.service_id`,
      field: 'service_id',
      expected: id,
      message: `Runtime \`${id}\` smoke target must declare service id \`${id}\`.`
    }),
    ...validateEndpointContract(target, id, 'healthz', '/healthz', 2),
    ...validateEndpointContract(target, id, 'readyz', '/readyz', 3)
  ];
}

function validateEndpointContract(
  target: Record<string, unknown>,
  id: string,
  endpoint: 'healthz' | 'readyz',
  path: string,
  timeoutSeconds: number
): readonly Diagnostic[] {
  return [
    ...validateExactValue({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: `targets.${id}.${endpoint}.method`,
      field: `${endpoint}.method`,
      expected: 'GET',
      message: `Runtime \`${id}\` ${endpoint} smoke target must use \`GET\`.`
    }),
    ...validateExactValue({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: `targets.${id}.${endpoint}.path`,
      field: `${endpoint}.path`,
      expected: path,
      message: `Runtime \`${id}\` ${endpoint} smoke target must use \`${path}\`.`
    }),
    ...validateExactValue({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: `targets.${id}.${endpoint}.timeout_seconds`,
      field: `${endpoint}.timeout_seconds`,
      expected: timeoutSeconds,
      message: `Runtime \`${id}\` ${endpoint} smoke target must use ${timeoutSeconds}s timeout.`
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
      createRuntimeDiagnostic(
        input.file,
        input.path,
        `Runtime contract \`${input.file}\` must include \`${requiredEntry}\` in \`${input.field}\`.`
      )
    );
  }

  return diagnostics;
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
