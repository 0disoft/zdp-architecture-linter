import type { Diagnostic } from '../../diagnostics.ts';
import {
  createRuntimeDiagnostic,
  isRecord,
  readPath,
  readStringField,
  validateEmptyStringArray,
  validateExactValue,
  validateOptionalJsonExpectationField,
  validateOptionalStringArrayField,
  validatePositiveIntegerField,
  validateRequiredBlockedProductionConditions,
  validateRequiredStringArrayEntries,
  validateRequiredStringArrayField,
  validateRequiredStringField
} from './contract-helpers.ts';

export const SMOKE_TARGETS_FILE = 'contracts/smoke-targets.yaml';
const REQUIRED_SMOKE_TARGETS_PRODUCTION_PROMOTION_REQUIRES = [
  'target health endpoint returns the declared service id',
  'target readiness endpoint returns the declared readiness contract',
  'platform contract checker targets pass before dependent runtime promotion',
  'smoke check does not require real payment, customer data, or user mutation',
  'runtime operator can reproduce the check from repository contracts'
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
const REQUIRED_DATA_PLATFORM_REQUIRED_BEFORE = [
  'analytics-ingest-promotion',
  'production-runtime-template'
] as const;

export function validateSmokeTargetsContract(value: unknown): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const targets = readPath(value, 'targets');
  const contractChecks = readPath(value, 'contract_checks');

  diagnostics.push(...validateSmokeTargetsMetadata(value));

  if (!Array.isArray(targets)) {
    diagnostics.push(
      createRuntimeDiagnostic(
        SMOKE_TARGETS_FILE,
        'targets',
        'Runtime smoke contract must declare a `targets` array.'
      )
    );
    return diagnostics;
  }

  const targetById = new Map<string, Record<string, unknown>>();

  diagnostics.push(...validateGenericSmokeTargetEntries(targets));

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
      ...validateGenericContractCheckEntries(contractChecks),
      ...validatePlatformSecurityContractCheck(value),
      ...validatePlatformInfraContractCheck(value),
      ...validatePlatformObservabilityContractCheck(value),
      ...validateDataPlatformContractCheck(value)
    );
  }

  return diagnostics;
}

function validateSmokeTargetsMetadata(value: unknown): readonly Diagnostic[] {
  return [
    ...validateExactValue({
      value,
      file: SMOKE_TARGETS_FILE,
      path: 'smoke_targets.version',
      expected: 1,
      message: 'Runtime smoke contract metadata version must be 1.'
    }),
    ...validateExactValue({
      value,
      file: SMOKE_TARGETS_FILE,
      path: 'smoke_targets.stage',
      expected: 'early-origin-runtime',
      message:
        'Runtime smoke contract metadata stage must be `early-origin-runtime`.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: SMOKE_TARGETS_FILE,
      path: 'smoke_targets.production_promotion_requires',
      field: 'smoke_targets.production_promotion_requires',
      requiredEntries: REQUIRED_SMOKE_TARGETS_PRODUCTION_PROMOTION_REQUIRES
    })
  ];
}

function validateGenericSmokeTargetEntries(
  targets: readonly unknown[]
): readonly Diagnostic[] {
  return targets.flatMap((target, index) => {
    const id = isRecord(target) ? readStringField(target, 'id') : null;
    const path = id === null ? `targets[${index}]` : `targets.${id}`;

    if (!isRecord(target)) {
      return [
        createRuntimeDiagnostic(
          SMOKE_TARGETS_FILE,
          path,
          'Runtime smoke contract must declare each `targets` item as an object.'
        )
      ];
    }

    return [
      ...validateRequiredStringField({
        value: target,
        file: SMOKE_TARGETS_FILE,
        path: `${path}.id`,
        field: 'id',
        label: 'smoke target id'
      }),
      ...validateRequiredStringField({
        value: target,
        file: SMOKE_TARGETS_FILE,
        path: `${path}.repo`,
        field: 'repo',
        label: 'smoke target repo'
      }),
      ...validateRequiredStringField({
        value: target,
        file: SMOKE_TARGETS_FILE,
        path: `${path}.service_id`,
        field: 'service_id',
        label: 'smoke target service id'
      }),
      ...validateRequiredStringField({
        value: target,
        file: SMOKE_TARGETS_FILE,
        path: `${path}.process`,
        field: 'process',
        label: 'smoke target process'
      }),
      ...validateOptionalStringArrayField({
        value: target,
        file: SMOKE_TARGETS_FILE,
        path: `${path}.required_before`,
        field: 'required_before'
      }),
      ...validateOptionalStringArrayField({
        value: target,
        file: SMOKE_TARGETS_FILE,
        path: `${path}.required_env`,
        field: 'required_env'
      }),
      ...validateGenericEndpoint(target, path, 'healthz'),
      ...validateGenericEndpoint(target, path, 'readyz'),
      ...validateRequiredBlockedProductionConditions({
        value: target,
        file: SMOKE_TARGETS_FILE,
        path: `${path}.blocked_production_when`,
        field: 'blocked_production_when',
        requiredEntries: []
      })
    ];
  });
}

function validateGenericEndpoint(
  target: Record<string, unknown>,
  targetPath: string,
  endpoint: 'healthz' | 'readyz'
): readonly Diagnostic[] {
  const value = readPath(target, endpoint);
  const path = `${targetPath}.${endpoint}`;

  if (!isRecord(value)) {
    return [
      createRuntimeDiagnostic(
        SMOKE_TARGETS_FILE,
        path,
        `Runtime smoke target must declare \`${endpoint}\` as an object.`
      )
    ];
  }

  return [
    ...validateExactValue({
      value,
      file: SMOKE_TARGETS_FILE,
      path: `${path}.method`,
      field: 'method',
      expected: 'GET',
      message: `Runtime smoke target \`${path}\` must use \`GET\`.`
    }),
    ...validateRequiredStringField({
      value,
      file: SMOKE_TARGETS_FILE,
      path: `${path}.path`,
      field: 'path',
      label: `${path} path`
    }),
    ...validatePositiveIntegerField({
      value,
      file: SMOKE_TARGETS_FILE,
      path: `${path}.timeout_seconds`,
      field: 'timeout_seconds'
    }),
    ...validateOptionalStringArrayField({
      value,
      file: SMOKE_TARGETS_FILE,
      path: `${path}.required_env`,
      field: 'required_env'
    }),
    ...validateOptionalJsonExpectationField({
      value,
      file: SMOKE_TARGETS_FILE,
      path: `${path}.expect_json`,
      field: 'expect_json'
    }),
    ...validateOptionalJsonExpectationField({
      value,
      file: SMOKE_TARGETS_FILE,
      path: `${path}.expect_json_when_configured`,
      field: 'expect_json_when_configured'
    }),
    ...validateOptionalJsonExpectationField({
      value,
      file: SMOKE_TARGETS_FILE,
      path: `${path}.expect_json_when_missing_env`,
      field: 'expect_json_when_missing_env'
    })
  ];
}

function validateGenericContractCheckEntries(
  contractChecks: readonly unknown[]
): readonly Diagnostic[] {
  return contractChecks.flatMap((target, index) => {
    const id = isRecord(target) ? readStringField(target, 'id') : null;
    const path = id === null ? `contract_checks[${index}]` : `contract_checks.${id}`;

    if (!isRecord(target)) {
      return [
        createRuntimeDiagnostic(
          SMOKE_TARGETS_FILE,
          path,
          'Runtime smoke contract must declare each `contract_checks` item as an object.'
        )
      ];
    }

    return [
      ...validateRequiredStringField({
        value: target,
        file: SMOKE_TARGETS_FILE,
        path: `${path}.id`,
        field: 'id',
        label: 'contract check id'
      }),
      ...validateRequiredStringField({
        value: target,
        file: SMOKE_TARGETS_FILE,
        path: `${path}.repo`,
        field: 'repo',
        label: 'contract check repo'
      }),
      ...validateRequiredStringField({
        value: target,
        file: SMOKE_TARGETS_FILE,
        path: `${path}.service_id`,
        field: 'service_id',
        label: 'contract check service id'
      }),
      ...validateExactValue({
        value: target,
        file: SMOKE_TARGETS_FILE,
        path: `${path}.process`,
        field: 'process',
        expected: 'one-shot-checker',
        message:
          'Runtime contract check target must declare process `one-shot-checker`.'
      }),
      ...validateRequiredStringField({
        value: target,
        file: SMOKE_TARGETS_FILE,
        path: `${path}.command`,
        field: 'command',
        label: 'contract check command'
      }),
      ...validateOptionalStringArrayField({
        value: target,
        file: SMOKE_TARGETS_FILE,
        path: `${path}.required_before`,
        field: 'required_before'
      }),
      ...validateRequiredStringArrayField({
        value: target,
        file: SMOKE_TARGETS_FILE,
        path: `${path}.required_files`,
        field: 'required_files'
      }),
      ...validateRequiredStringArrayField({
        value: target,
        file: SMOKE_TARGETS_FILE,
        path: `${path}.expected_evidence`,
        field: 'expected_evidence'
      }),
      ...validateRequiredBlockedProductionConditions({
        value: target,
        file: SMOKE_TARGETS_FILE,
        path: `${path}.blocked_production_when`,
        field: 'blocked_production_when',
        requiredEntries: []
      })
    ];
  });
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
          condition: 'healthz service id does not match core-api',
          enforcedBy: 'smoke_runner'
        },
        {
          condition: 'readyz checks omit contracts',
          enforcedBy: 'smoke_runner'
        },
        {
          condition:
            'readiness depends on a database before the core migration slice exists',
          enforcedBy: 'architecture_linter'
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
    ...validateEmptyStringArray({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'targets.money-api.readyz.expect_json.checks',
      field: 'readyz.expect_json.checks',
      message:
        'Runtime `money-api` contract-only readyz smoke target must not claim unexecuted dependency checks.'
    }),
    ...validateExactValue({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'targets.money-api.readyz.expect_json.mode',
      field: 'readyz.expect_json.mode',
      expected: 'contract_only',
      message:
        'Runtime `money-api` readyz smoke target must declare mode `contract_only`.'
    }),
    ...validateRequiredStringArrayEntries({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'targets.money-api.readyz.expect_json.blockers',
      field: 'readyz.expect_json.blockers',
      requiredEntries: ['live_money_handlers_disabled']
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
          condition: 'contract-only readiness omits live money handler blocker',
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

function validateDataPlatformContractCheck(value: unknown): readonly Diagnostic[] {
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
      readStringField(entry, 'id') === 'data-platform-contracts'
  );

  if (!isRecord(target)) {
    return [
      createRuntimeDiagnostic(
        SMOKE_TARGETS_FILE,
        'contract_checks.data-platform-contracts',
        'Runtime smoke contract must declare `data-platform-contracts` contract check target.'
      )
    ];
  }

  return [
    ...validateExactValue({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'contract_checks.data-platform-contracts.repo',
      field: 'repo',
      expected: 'zdp-data-platform',
      message:
        'Runtime `data-platform-contracts` check target must reference repo `zdp-data-platform`.'
    }),
    ...validateExactValue({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'contract_checks.data-platform-contracts.service_id',
      field: 'service_id',
      expected: 'data-platform',
      message:
        'Runtime `data-platform-contracts` check target must declare service id `data-platform`.'
    }),
    ...validateExactValue({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'contract_checks.data-platform-contracts.process',
      field: 'process',
      expected: 'one-shot-checker',
      message:
        'Runtime `data-platform-contracts` check target must declare process `one-shot-checker`.'
    }),
    ...validateExactValue({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'contract_checks.data-platform-contracts.command',
      field: 'command',
      expected: 'bun run contracts:check',
      message:
        'Runtime `data-platform-contracts` check target must run `bun run contracts:check`.'
    }),
    ...validateRequiredStringArrayEntries({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'contract_checks.data-platform-contracts.required_before',
      field: 'required_before',
      requiredEntries: REQUIRED_DATA_PLATFORM_REQUIRED_BEFORE
    }),
    ...validateRequiredStringArrayEntries({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'contract_checks.data-platform-contracts.required_files',
      field: 'required_files',
      requiredEntries: [
        'contracts/analytics-ingest.yaml',
        'contracts/clickhouse-storage.yaml',
        'contracts/deletion-anonymization.yaml',
        'contracts/operational-metrics.yaml',
        'scripts/check-data-contracts.ts'
      ]
    }),
    ...validateRequiredStringArrayEntries({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'contract_checks.data-platform-contracts.expected_evidence',
      field: 'expected_evidence',
      requiredEntries: [
        'data platform contracts parse without diagnostics',
        'architecture event catalog and schema compatibility checks pass',
        'operational metrics contract and runtime metric labels stay in sync',
        'checker does not require ClickHouse, queue consumers, collector, provider tokens, raw payloads, or customer data'
      ]
    }),
    ...validateRequiredBlockedProductionConditions({
      value: target,
      file: SMOKE_TARGETS_FILE,
      path: 'contract_checks.data-platform-contracts.blocked_production_when',
      field: 'blocked_production_when',
      requiredEntries: [
        {
          condition: 'data platform contracts are missing or unparseable',
          enforcedBy: 'owning_contract_checker'
        },
        {
          condition: 'event catalog or schema compatibility fails',
          enforcedBy: 'owning_contract_checker'
        },
        {
          condition: 'operational metrics contract or runtime metric labels drift',
          enforcedBy: 'owning_contract_checker'
        },
        {
          condition:
            'data platform promotion relies on live ClickHouse, collector, queue consumer, provider token, raw payload, or customer data evidence',
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
