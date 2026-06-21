import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { Diagnostic } from './diagnostics.ts';
import {
  extractTestCallNames,
  stripCommentsAndStringLiterals
} from './source-proof.ts';

const RUNTIME_REPOSITORY_NAME = 'zdp-platform-runtime';
const RUNTIME_CONTRACT_RULE_ID = 'ZDP-RUNTIME-001';
const RUNTIME_CONTRACT_ENFORCEMENTS = [
  'smoke_runner',
  'architecture_linter',
  'owning_contract_checker',
  'operator_review'
] as const;

type RuntimeContractEnforcement = (typeof RUNTIME_CONTRACT_ENFORCEMENTS)[number];

interface RequiredBlockedProductionCondition {
  readonly condition: string;
  readonly enforcedBy: RuntimeContractEnforcement;
}

interface BlockedProductionConditionEntry {
  readonly condition: string;
  readonly enforcedBy: string;
}

const HEALTHCHECK_FILE = 'contracts/healthcheck.yaml';
const SMOKE_TARGETS_FILE = 'contracts/smoke-targets.yaml';
const DEPLOYMENT_TEMPLATE_FILE = 'contracts/deployment-template.yaml';
const ROLLBACK_FILE = 'contracts/rollback.yaml';
const PACKAGE_FILE = 'package.json';
const SMOKE_RUNNER_SCRIPT_FILE = 'scripts/smoke-runner.ts';
const SMOKE_RUNNER_CONTRACT_FILE = 'src/smoke-runner/contract.ts';
const SMOKE_RUNNER_RUNNER_FILE = 'src/smoke-runner/runner.ts';
const SMOKE_RUNNER_TEST_FILE = 'tests/smoke-runner.test.ts';

const REQUIRED_PACKAGE_SCRIPTS = [
  'check',
  'test',
  'smoke:plan',
  'smoke:run'
] as const;

const REQUIRED_CORE_API_REQUIRED_BEFORE = [
  'hello-origin',
  'production-runtime-template'
] as const;
const REQUIRED_APP_CONSOLE_REQUIRED_BEFORE = [
  'first-console-preview',
  'production-runtime-template'
] as const;
const REQUIRED_EDGE_WEBHOOK_INGRESS_REQUIRED_BEFORE = [
  'hello-edge',
  'production-runtime-template'
] as const;
const REQUIRED_MONEY_API_REQUIRED_BEFORE = [
  'money-ledger-migration',
  'production-runtime-template'
] as const;
const REQUIRED_CONNECTORS_PLATFORM_REQUIRED_BEFORE = [
  'provider-onboarding',
  'production-runtime-template'
] as const;
const REQUIRED_PLATFORM_SECURITY_REQUIRED_BEFORE = [
  'critical-platform-promotion',
  'production-runtime-template'
] as const;
const REQUIRED_PLATFORM_INFRA_REQUIRED_BEFORE = [
  'provider-account-connection',
  'production-runtime-template'
] as const;
const REQUIRED_PLATFORM_OBSERVABILITY_REQUIRED_BEFORE = [
  'observability-provider-connection',
  'production-runtime-template'
] as const;

const REQUIRED_SMOKE_RUNNER_FILES = [
  SMOKE_RUNNER_SCRIPT_FILE,
  SMOKE_RUNNER_CONTRACT_FILE,
  SMOKE_RUNNER_RUNNER_FILE,
  SMOKE_RUNNER_TEST_FILE
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
  const contractChecks = readPath(value, 'contract_checks');

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
    ),
    ...validateMoneyApiSmokeTarget(targetById.get('money-api')),
    ...validateConnectorsPlatformSmokeTarget(
      targetById.get('connectors-platform')
    )
  );

  if (!Array.isArray(contractChecks)) {
    diagnostics.push(...validateContractChecksArray(value));
  } else {
    diagnostics.push(
      ...validatePlatformSecurityContractCheck(value),
      ...validatePlatformInfraContractCheck(value),
      ...validatePlatformObservabilityContractCheck(value)
    );
  }

  return diagnostics;
}

function validateContractChecksArray(value: unknown): readonly Diagnostic[] {
  const contractChecks = readPath(value, 'contract_checks');

  if (Array.isArray(contractChecks)) {
    return [];
  }

  return [
    createRuntimeDiagnostic(
      SMOKE_TARGETS_FILE,
      'contract_checks',
      'Runtime smoke contract must declare a `contract_checks` array.'
    )
  ];
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
    ...validateRequiredStringArrayEntries({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'targets.core-api.required_before',
      field: 'required_before',
      requiredEntries: REQUIRED_CORE_API_REQUIRED_BEFORE
    }),
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
    ...validateRequiredBlockedProductionConditions({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'targets.core-api.blocked_production_when',
      field: 'blocked_production_when',
      requiredEntries: [
        {
          condition: 'readyz checks omit contracts',
          enforcedBy: 'smoke_runner'
        }
      ]
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
    ...validateRequiredStringArrayEntries({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'targets.app-console.required_before',
      field: 'required_before',
      requiredEntries: REQUIRED_APP_CONSOLE_REQUIRED_BEFORE
    }),
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
    ...validateRequiredBlockedProductionConditions({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'targets.app-console.blocked_production_when',
      field: 'blocked_production_when',
      requiredEntries: [
        {
          condition: 'ZDP_CORE_API_BASE_URL is missing',
          enforcedBy: 'smoke_runner'
        },
        {
          condition: 'readyz does not report core-api as an upstream',
          enforcedBy: 'smoke_runner'
        },
        {
          condition:
            'app shell attempts direct core, money, privacy, or credential datastore access',
          enforcedBy: 'architecture_linter'
        }
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
    ...validateRequiredStringArrayEntries({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'targets.edge-webhook-ingress.required_before',
      field: 'required_before',
      requiredEntries: REQUIRED_EDGE_WEBHOOK_INGRESS_REQUIRED_BEFORE
    }),
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
    ...validateRequiredBlockedProductionConditions({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'targets.edge-webhook-ingress.blocked_production_when',
      field: 'blocked_production_when',
      requiredEntries: [
        {
          condition: 'x-request-id is not propagated',
          enforcedBy: 'smoke_runner'
        },
        {
          condition: 'traceparent is not propagated when present',
          enforcedBy: 'smoke_runner'
        },
        {
          condition:
            'edge worker becomes the source of final authorization, entitlement, ledger, or privacy decisions',
          enforcedBy: 'architecture_linter'
        }
      ]
    })
  ];
}

function validateMoneyApiSmokeTarget(
  target: Record<string, unknown> | undefined
): readonly Diagnostic[] {
  if (target === undefined) {
    return [
      createRuntimeDiagnostic(
        SMOKE_TARGETS_FILE,
        'targets.money-api',
        'Runtime smoke contract must declare `money-api` target.'
      )
    ];
  }

  return [
    ...validateTargetIdentity(target, 'money-api', 'zdp-money-platform'),
    ...validateRequiredStringArrayEntries({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'targets.money-api.required_before',
      field: 'required_before',
      requiredEntries: REQUIRED_MONEY_API_REQUIRED_BEFORE
    }),
    ...validateExactValue({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'targets.money-api.process',
      field: 'process',
      expected: 'web',
      message: 'Runtime `money-api` smoke target must declare process `web`.'
    }),
    ...validateExactValue({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'targets.money-api.healthz.expect_json.ok',
      field: 'healthz.expect_json.ok',
      expected: true,
      message: 'Runtime `money-api` healthz smoke target must expect `ok: true`.'
    }),
    ...validateExactValue({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'targets.money-api.healthz.expect_json.service',
      field: 'healthz.expect_json.service',
      expected: 'money-api',
      message:
        'Runtime `money-api` healthz smoke target must expect service `money-api`.'
    }),
    ...validateExactValue({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'targets.money-api.readyz.expect_json.ready',
      field: 'readyz.expect_json.ready',
      expected: true,
      message: 'Runtime `money-api` readyz smoke target must expect `ready: true`.'
    }),
    ...validateRequiredStringArrayEntries({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'targets.money-api.readyz.expect_json.checks',
      field: 'readyz.expect_json.checks',
      requiredEntries: ['contracts']
    }),
    ...validateRequiredBlockedProductionConditions({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'targets.money-api.blocked_production_when',
      field: 'blocked_production_when',
      requiredEntries: [
        {
          condition: 'healthz service id does not match money-api',
          enforcedBy: 'smoke_runner'
        },
        {
          condition: 'readyz checks omit contracts',
          enforcedBy: 'smoke_runner'
        },
        {
          condition:
            'smoke check requires a real payment, refund, credit mutation, customer account, or provider credential',
          enforcedBy: 'operator_review'
        },
        {
          condition:
            'money-api exposes payment, refund, credit, or ledger write routes before ledger storage migration exists',
          enforcedBy: 'architecture_linter'
        }
      ]
    })
  ];
}

function validateConnectorsPlatformSmokeTarget(
  target: Record<string, unknown> | undefined
): readonly Diagnostic[] {
  if (target === undefined) {
    return [
      createRuntimeDiagnostic(
        SMOKE_TARGETS_FILE,
        'targets.connectors-platform',
        'Runtime smoke contract must declare `connectors-platform` target.'
      )
    ];
  }

  return [
    ...validateTargetIdentity(
      target,
      'connectors-platform',
      'zdp-connectors-platform'
    ),
    ...validateRequiredStringArrayEntries({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'targets.connectors-platform.required_before',
      field: 'required_before',
      requiredEntries: REQUIRED_CONNECTORS_PLATFORM_REQUIRED_BEFORE
    }),
    ...validateExactValue({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'targets.connectors-platform.process',
      field: 'process',
      expected: 'web',
      message:
        'Runtime `connectors-platform` smoke target must declare process `web`.'
    }),
    ...validateExactValue({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'targets.connectors-platform.healthz.expect_json.ok',
      field: 'healthz.expect_json.ok',
      expected: true,
      message:
        'Runtime `connectors-platform` healthz smoke target must expect `ok: true`.'
    }),
    ...validateExactValue({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'targets.connectors-platform.healthz.expect_json.service',
      field: 'healthz.expect_json.service',
      expected: 'connectors-platform',
      message:
        'Runtime `connectors-platform` healthz smoke target must expect service `connectors-platform`.'
    }),
    ...validateExactValue({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'targets.connectors-platform.readyz.expect_json.ready',
      field: 'readyz.expect_json.ready',
      expected: true,
      message:
        'Runtime `connectors-platform` readyz smoke target must expect `ready: true`.'
    }),
    ...validateRequiredStringArrayEntries({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'targets.connectors-platform.readyz.expect_json.checks',
      field: 'readyz.expect_json.checks',
      requiredEntries: ['contracts']
    }),
    ...validateRequiredBlockedProductionConditions({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'targets.connectors-platform.blocked_production_when',
      field: 'blocked_production_when',
      requiredEntries: [
        {
          condition: 'healthz service id does not match connectors-platform',
          enforcedBy: 'smoke_runner'
        },
        {
          condition: 'readyz checks omit contracts',
          enforcedBy: 'smoke_runner'
        },
        {
          condition:
            'smoke check requires a real OAuth provider, source payload, plaintext credential, webhook delivery, or user data sync',
          enforcedBy: 'operator_review'
        },
        {
          condition:
            'connectors-platform exposes provider OAuth, sync worker, webhook ingest, or raw source payload routes before provider boundary contracts are implemented',
          enforcedBy: 'architecture_linter'
        }
      ]
    })
  ];
}

function validatePlatformSecurityContractCheck(value: unknown): readonly Diagnostic[] {
  const contractChecks = readPath(value, 'contract_checks');

  if (!Array.isArray(contractChecks)) {
    return [
      createRuntimeDiagnostic(
        SMOKE_TARGETS_FILE,
        'contract_checks',
        'Runtime smoke contract must declare a `contract_checks` array.'
      )
    ];
  }

  const target = contractChecks.find(
    (entry) =>
      isRecord(entry) &&
      readStringField(entry, 'id') === 'platform-security-contracts'
  );

  if (!isRecord(target)) {
    return [
      createRuntimeDiagnostic(
        SMOKE_TARGETS_FILE,
        'contract_checks.platform-security-contracts',
        'Runtime smoke contract must declare `platform-security-contracts` contract check target.'
      )
    ];
  }

  return [
    ...validateExactValue({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'contract_checks.platform-security-contracts.repo',
      field: 'repo',
      expected: 'zdp-platform-security',
      message:
        'Runtime `platform-security-contracts` check target must reference repo `zdp-platform-security`.'
    }),
    ...validateExactValue({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'contract_checks.platform-security-contracts.service_id',
      field: 'service_id',
      expected: 'platform-security',
      message:
        'Runtime `platform-security-contracts` check target must declare service id `platform-security`.'
    }),
    ...validateExactValue({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'contract_checks.platform-security-contracts.process',
      field: 'process',
      expected: 'one-shot-checker',
      message:
        'Runtime `platform-security-contracts` check target must declare process `one-shot-checker`.'
    }),
    ...validateExactValue({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'contract_checks.platform-security-contracts.command',
      field: 'command',
      expected: 'bun run contracts:check',
      message:
        'Runtime `platform-security-contracts` check target must run `bun run contracts:check`.'
    }),
    ...validateRequiredStringArrayEntries({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'contract_checks.platform-security-contracts.required_before',
      field: 'required_before',
      requiredEntries: REQUIRED_PLATFORM_SECURITY_REQUIRED_BEFORE
    }),
    ...validateRequiredStringArrayEntries({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'contract_checks.platform-security-contracts.required_files',
      field: 'required_files',
      requiredEntries: [
        'contracts/security-baseline.yaml',
        'contracts/threat-model-template.yaml',
        'contracts/secret-handling.yaml',
        'contracts/dependency-review.yaml',
        'scripts/check-security-contracts.ts'
      ]
    }),
    ...validateRequiredStringArrayEntries({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'contract_checks.platform-security-contracts.expected_evidence',
      field: 'expected_evidence',
      requiredEntries: [
        'security contracts parse without diagnostics',
        'checker does not connect to scanners or providers',
        'checker does not require exploit payloads, private incident details, or secret values'
      ]
    }),
    ...validateRequiredBlockedProductionConditions({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'contract_checks.platform-security-contracts.blocked_production_when',
      field: 'blocked_production_when',
      requiredEntries: [
        {
          condition: 'security baseline contracts are missing or unparseable',
          enforcedBy: 'owning_contract_checker'
        },
        {
          condition:
            'contract checker requires scanner output, provider account, exploit payload, private incident detail, or secret value',
          enforcedBy: 'owning_contract_checker'
        },
        {
          condition: 'security promotion relies on dashboard-only scanner evidence',
          enforcedBy: 'operator_review'
        }
      ]
    })
  ];
}

function validatePlatformInfraContractCheck(value: unknown): readonly Diagnostic[] {
  const contractChecks = readPath(value, 'contract_checks');

  if (!Array.isArray(contractChecks)) {
    return [
      createRuntimeDiagnostic(
        SMOKE_TARGETS_FILE,
        'contract_checks',
        'Runtime smoke contract must declare a `contract_checks` array.'
      )
    ];
  }

  const target = contractChecks.find(
    (entry) =>
      isRecord(entry) &&
      readStringField(entry, 'id') === 'platform-infra-contracts'
  );

  if (!isRecord(target)) {
    return [
      createRuntimeDiagnostic(
        SMOKE_TARGETS_FILE,
        'contract_checks.platform-infra-contracts',
        'Runtime smoke contract must declare `platform-infra-contracts` contract check target.'
      )
    ];
  }

  return [
    ...validateExactValue({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'contract_checks.platform-infra-contracts.repo',
      field: 'repo',
      expected: 'zdp-platform-infra',
      message:
        'Runtime `platform-infra-contracts` check target must reference repo `zdp-platform-infra`.'
    }),
    ...validateExactValue({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'contract_checks.platform-infra-contracts.service_id',
      field: 'service_id',
      expected: 'platform-infra',
      message:
        'Runtime `platform-infra-contracts` check target must declare service id `platform-infra`.'
    }),
    ...validateExactValue({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'contract_checks.platform-infra-contracts.process',
      field: 'process',
      expected: 'one-shot-checker',
      message:
        'Runtime `platform-infra-contracts` check target must declare process `one-shot-checker`.'
    }),
    ...validateExactValue({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'contract_checks.platform-infra-contracts.command',
      field: 'command',
      expected: 'bun run contracts:check',
      message:
        'Runtime `platform-infra-contracts` check target must run `bun run contracts:check`.'
    }),
    ...validateRequiredStringArrayEntries({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'contract_checks.platform-infra-contracts.required_before',
      field: 'required_before',
      requiredEntries: REQUIRED_PLATFORM_INFRA_REQUIRED_BEFORE
    }),
    ...validateRequiredStringArrayEntries({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'contract_checks.platform-infra-contracts.required_files',
      field: 'required_files',
      requiredEntries: [
        'contracts/resource-inventory.yaml',
        'contracts/environment.schema.yaml',
        'contracts/backup-restore.yaml',
        'scripts/check-infra-contracts.ts',
        'scripts/infra-plan.ts'
      ]
    }),
    ...validateRequiredStringArrayEntries({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'contract_checks.platform-infra-contracts.expected_evidence',
      field: 'expected_evidence',
      requiredEntries: [
        'infra contracts parse without diagnostics',
        'provider-neutral dry-run plan has no provider calls',
        'checker does not require account ids, server ips, dns challenge secrets, or provider tokens'
      ]
    }),
    ...validateRequiredBlockedProductionConditions({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'contract_checks.platform-infra-contracts.blocked_production_when',
      field: 'blocked_production_when',
      requiredEntries: [
        {
          condition: 'infra contracts are missing or unparseable',
          enforcedBy: 'owning_contract_checker'
        },
        {
          condition:
            'contract checker requires provider account, server ip, dns challenge secret, provider token, or terraform state',
          enforcedBy: 'owning_contract_checker'
        },
        {
          condition: 'infra promotion relies on dashboard-only provider evidence',
          enforcedBy: 'operator_review'
        }
      ]
    })
  ];
}

function validatePlatformObservabilityContractCheck(
  value: unknown
): readonly Diagnostic[] {
  const contractChecks = readPath(value, 'contract_checks');

  if (!Array.isArray(contractChecks)) {
    return [
      createRuntimeDiagnostic(
        SMOKE_TARGETS_FILE,
        'contract_checks',
        'Runtime smoke contract must declare a `contract_checks` array.'
      )
    ];
  }

  const target = contractChecks.find(
    (entry) =>
      isRecord(entry) &&
      readStringField(entry, 'id') === 'platform-observability-contracts'
  );

  if (!isRecord(target)) {
    return [
      createRuntimeDiagnostic(
        SMOKE_TARGETS_FILE,
        'contract_checks.platform-observability-contracts',
        'Runtime smoke contract must declare `platform-observability-contracts` contract check target.'
      )
    ];
  }

  return [
    ...validateExactValue({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'contract_checks.platform-observability-contracts.repo',
      field: 'repo',
      expected: 'zdp-platform-observability',
      message:
        'Runtime `platform-observability-contracts` check target must reference repo `zdp-platform-observability`.'
    }),
    ...validateExactValue({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'contract_checks.platform-observability-contracts.service_id',
      field: 'service_id',
      expected: 'platform-observability',
      message:
        'Runtime `platform-observability-contracts` check target must declare service id `platform-observability`.'
    }),
    ...validateExactValue({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'contract_checks.platform-observability-contracts.process',
      field: 'process',
      expected: 'one-shot-checker',
      message:
        'Runtime `platform-observability-contracts` check target must declare process `one-shot-checker`.'
    }),
    ...validateExactValue({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'contract_checks.platform-observability-contracts.command',
      field: 'command',
      expected: 'bun run contracts:check',
      message:
        'Runtime `platform-observability-contracts` check target must run `bun run contracts:check`.'
    }),
    ...validateRequiredStringArrayEntries({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'contract_checks.platform-observability-contracts.required_before',
      field: 'required_before',
      requiredEntries: REQUIRED_PLATFORM_OBSERVABILITY_REQUIRED_BEFORE
    }),
    ...validateRequiredStringArrayEntries({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'contract_checks.platform-observability-contracts.required_files',
      field: 'required_files',
      requiredEntries: [
        'contracts/telemetry-conventions.yaml',
        'contracts/dashboard-inventory.yaml',
        'contracts/alert-rules.yaml',
        'scripts/check-observability-contracts.ts'
      ]
    }),
    ...validateRequiredStringArrayEntries({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'contract_checks.platform-observability-contracts.expected_evidence',
      field: 'expected_evidence',
      requiredEntries: [
        'observability contracts parse without diagnostics',
        'checker does not connect to telemetry providers',
        'checker does not require provider tokens, dashboard urls, raw logs, or trace samples'
      ]
    }),
    ...validateRequiredBlockedProductionConditions({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'contract_checks.platform-observability-contracts.blocked_production_when',
      field: 'blocked_production_when',
      requiredEntries: [
        {
          condition: 'observability contracts are missing or unparseable',
          enforcedBy: 'owning_contract_checker'
        },
        {
          condition:
            'contract checker requires provider account, provider token, dashboard url, raw log, raw trace, or customer payload',
          enforcedBy: 'owning_contract_checker'
        },
        {
          condition:
            'observability promotion relies on dashboard-only provider evidence',
          enforcedBy: 'operator_review'
        }
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

  return diagnostics;
}

async function validateSmokeRunnerSurface(
  repositoryRoot: string
): Promise<readonly Diagnostic[]> {
  const [script, contractSource, runnerSource, testSource] = await Promise.all(
    REQUIRED_SMOKE_RUNNER_FILES.map((file) => readOptionalTextFile(repositoryRoot, file))
  );

  return [
    ...script.diagnostics,
    ...contractSource.diagnostics,
    ...runnerSource.diagnostics,
    ...testSource.diagnostics,
    ...(script.source === null
      ? []
      : validateSourceIncludes({
          file: SMOKE_RUNNER_SCRIPT_FILE,
          source: script.source,
          requiredFragments: ['runSmokeRunnerCli']
        })),
    ...(contractSource.source === null
      ? []
      : [
          ...validateSourceIncludes({
            file: SMOKE_RUNNER_CONTRACT_FILE,
            source: contractSource.source,
            requiredFragments: [
              'contracts/smoke-targets.yaml',
              'targets',
              'blocked_production_when',
              'enforced_by'
            ]
          }),
          ...validateSourceCodeIncludes({
            file: SMOKE_RUNNER_CONTRACT_FILE,
            source: contractSource.source,
            requiredFragments: [
              'export function parseSmokeTargetsContract',
              'function parseTarget',
              'function parseContractCheck',
              'function requiredBlockedProductionConditionList',
              'function parseBlockedProductionCondition',
              'function isRuntimeContractEnforcement',
              'Bun.YAML.parse'
            ]
          })
        ]),
    ...(runnerSource.source === null
      ? []
      : [
          ...validateSourceIncludes({
            file: SMOKE_RUNNER_RUNNER_FILE,
            source: runnerSource.source,
            requiredFragments: [
              'base_url_not_provided',
              'x-request-id_not_propagated',
              'traceparent_not_propagated',
              'blockedProductionWhen'
            ]
          }),
          ...validateSourceCodeIncludes({
            file: SMOKE_RUNNER_RUNNER_FILE,
            source: runnerSource.source,
            requiredFragments: [
              'export function createSmokePlan',
              'export async function runSmokeTargets',
              'async function checkEndpoint',
              'export function parseBaseUrlPairs',
              'function validateJsonExpectation',
              'AbortSignal.timeout',
              'input.fetcher'
            ]
          })
        ]),
    ...(testSource.source === null
      ? []
      : [
          ...validateSourceTestNames({
            file: SMOKE_RUNNER_TEST_FILE,
            source: testSource.source,
            requiredTestNames: [
              'fails closed when run mode has no base URL',
              'rejects blocked production conditions without enforcement owners'
            ]
          }),
          ...validateSourceIncludes({
            file: SMOKE_RUNNER_TEST_FILE,
            source: testSource.source,
            requiredFragments: [
              'base_url_not_provided',
              'platform-security-contracts',
              'platform-infra-contracts',
              'platform-observability-contracts',
              'is plan-only',
              'malformed_json_response',
              'money-api',
              'connectors-platform'
            ]
          }),
          ...validateSourceCodeIncludes({
            file: SMOKE_RUNNER_TEST_FILE,
            source: testSource.source,
            requiredFragments: [
              'expect(',
              'parseSmokeTargetsContract',
              'createSmokePlan',
              'runSmokeTargets'
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
      createRuntimeDiagnostic(
        input.file,
        'source',
        `Runtime smoke runner source must include \`${fragment}\`.`
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
      createRuntimeDiagnostic(
        input.file,
        'source',
        `Runtime smoke runner source must include test case \`${testName}\`.`
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
      createRuntimeDiagnostic(
        input.file,
        'source',
        `Runtime smoke runner source must include code fragment \`${fragment}\`.`
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

function validateRequiredBlockedProductionConditions(input: {
  readonly value: unknown;
  readonly file: string;
  readonly path: string;
  readonly field: string;
  readonly requiredEntries: readonly RequiredBlockedProductionCondition[];
}): readonly Diagnostic[] {
  const entries = readBlockedProductionConditionEntries(input.value, input.field);
  const diagnostics: Diagnostic[] = [];

  diagnostics.push(
    ...validateBlockedProductionConditionShape({
      value: input.value,
      file: input.file,
      path: input.path,
      field: input.field
    })
  );

  if (entries.length === 0) {
    diagnostics.push(
      createRuntimeDiagnostic(
        input.file,
        input.path,
        `Runtime contract \`${input.file}\` must declare \`${input.field}\` as a non-empty list of \`{ condition, enforced_by }\` objects.`
      )
    );
  }

  diagnostics.push(
    ...validateBlockedProductionEnforcementValues({
      entries,
      file: input.file,
      path: input.path,
      field: input.field
    })
  );

  for (const requiredEntry of input.requiredEntries) {
    const actualEntry = entries.find(
      (entry) => entry.condition === requiredEntry.condition
    );

    if (actualEntry === undefined) {
      diagnostics.push(
        createRuntimeDiagnostic(
          input.file,
          input.path,
          `Runtime contract \`${input.file}\` must include \`${requiredEntry.condition}\` in \`${input.field}\`.`
        )
      );
      continue;
    }

    if (actualEntry.enforcedBy !== requiredEntry.enforcedBy) {
      diagnostics.push(
        createRuntimeDiagnostic(
          input.file,
          input.path,
          `Runtime contract \`${input.file}\` must assign \`${requiredEntry.condition}\` in \`${input.field}\` to enforcement owner \`${requiredEntry.enforcedBy}\`.`
        )
      );
    }
  }

  return diagnostics;
}

function validateBlockedProductionConditionShape(input: {
  readonly value: unknown;
  readonly file: string;
  readonly path: string;
  readonly field: string;
}): readonly Diagnostic[] {
  const candidate = readPath(input.value, input.field);

  if (!Array.isArray(candidate)) {
    return [];
  }

  for (const entry of candidate) {
    if (
      isRecord(entry) &&
      readStringField(entry, 'condition') !== null &&
      readStringField(entry, 'enforced_by') !== null
    ) {
      continue;
    }

    return [
      createRuntimeDiagnostic(
        input.file,
        input.path,
        `Runtime contract \`${input.file}\` must declare every \`${input.field}\` item as a \`{ condition, enforced_by }\` object.`
      )
    ];
  }

  return [];
}

function validateBlockedProductionEnforcementValues(input: {
  readonly entries: readonly BlockedProductionConditionEntry[];
  readonly file: string;
  readonly path: string;
  readonly field: string;
}): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const entry of input.entries) {
    if (isRuntimeContractEnforcement(entry.enforcedBy)) {
      continue;
    }

    diagnostics.push(
      createRuntimeDiagnostic(
        input.file,
        input.path,
        `Runtime contract \`${input.file}\` must use a known \`enforced_by\` value for \`${entry.condition}\` in \`${input.field}\`.`
      )
    );
  }

  return diagnostics;
}

function readBlockedProductionConditionEntries(
  value: unknown,
  path: string
): readonly BlockedProductionConditionEntry[] {
  const candidate = readPath(value, path);

  if (!Array.isArray(candidate)) {
    return [];
  }

  return candidate.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    const condition = readStringField(entry, 'condition');
    const enforcedBy = readStringField(entry, 'enforced_by');

    if (condition === null || enforcedBy === null) {
      return [];
    }

    return [
      {
        condition,
        enforcedBy
      }
    ];
  });
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

function isRuntimeContractEnforcement(
  value: string
): value is RuntimeContractEnforcement {
  return RUNTIME_CONTRACT_ENFORCEMENTS.includes(
    value as RuntimeContractEnforcement
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
