import type { Diagnostic } from './diagnostics.ts';

const SERVICES_FILE = 'catalogs/services.yaml';
const PUBLIC_API_CONTRACT_RULE_ID = 'ZDP-API-001';

const EMPTY_PUBLIC_API_CONTRACT_POLICY: PublicApiContractPolicy = {
  enabled: false,
  publicApiFlagRequired: false,
  exposureOptions: [],
  requiredFields: [],
  requiredValues: new Map()
};

export interface PublicApiContractPolicy {
  readonly enabled: boolean;
  readonly publicApiFlagRequired: boolean;
  readonly exposureOptions: readonly string[];
  readonly requiredFields: readonly string[];
  readonly requiredValues: ReadonlyMap<string, unknown>;
}

export function buildPublicApiContractPolicy(
  value: unknown
): PublicApiContractPolicy {
  if (!isRecord(value) || !Array.isArray(value.rules)) {
    return EMPTY_PUBLIC_API_CONTRACT_POLICY;
  }

  const apiRule = findRuleById(value.rules, PUBLIC_API_CONTRACT_RULE_ID);

  if (apiRule === undefined) {
    return EMPTY_PUBLIC_API_CONTRACT_POLICY;
  }

  const assertions = isRecord(apiRule.assertions) ? apiRule.assertions : {};
  const condition = readPublicApiCondition(apiRule.condition);

  return {
    enabled: true,
    publicApiFlagRequired: condition.publicApiFlagRequired,
    exposureOptions: condition.exposureOptions,
    requiredFields: readStringArray(assertions.require_fields),
    requiredValues: readValueMap(assertions.require_values)
  };
}

export function validatePublicApiContracts(
  value: unknown,
  policy: PublicApiContractPolicy
): readonly Diagnostic[] {
  if (!policy.enabled) {
    return [];
  }

  if (!isRecord(value)) {
    return [
      createApiDiagnostic(
        'services',
        '`services.yaml` must be a YAML object with a services array.'
      )
    ];
  }

  const services = value.services;

  if (!Array.isArray(services)) {
    return [
      createApiDiagnostic('services', '`services` must be a YAML array.')
    ];
  }

  return services.flatMap((service, index) =>
    validateServicePublicApiContract(service, index, policy)
  );
}

function validateServicePublicApiContract(
  value: unknown,
  index: number,
  policy: PublicApiContractPolicy
): readonly Diagnostic[] {
  if (!isRecord(value)) {
    return [
      createApiDiagnostic(`services[${index}]`, 'Service entry must be a YAML object.')
    ];
  }

  if (!isPublicApiContractTarget(value, policy)) {
    return [];
  }

  const servicePath = getServiceDiagnosticPath(value, index);
  const serviceName = getServiceName(value, index);
  const diagnostics: Diagnostic[] = [];

  for (const field of policy.requiredFields) {
    if (hasUsableFieldAtPath(value, field)) {
      continue;
    }

    diagnostics.push(
      createApiDiagnostic(
        `${servicePath}.${field}`,
        `Public API service \`${serviceName}\` must set \`${field}\`.`
      )
    );
  }

  for (const [field, expectedValue] of policy.requiredValues.entries()) {
    const actualValue = readValueAtPath(value, field);

    if (actualValue === expectedValue) {
      continue;
    }

    diagnostics.push(
      createApiDiagnostic(
        `${servicePath}.${field}`,
        `Public API service \`${serviceName}\` must set \`${field}\` to \`${String(expectedValue)}\`.`
      )
    );
  }

  return diagnostics;
}

function isPublicApiContractTarget(
  value: Record<string, unknown>,
  policy: PublicApiContractPolicy
): boolean {
  if (
    policy.publicApiFlagRequired &&
    readBooleanAtPath(value, 'domain.public_api') === true
  ) {
    return true;
  }

  const exposure = readStringAtPath(value, 'api.exposure');

  return exposure !== null && policy.exposureOptions.includes(exposure);
}

function readPublicApiCondition(condition: unknown): {
  readonly publicApiFlagRequired: boolean;
  readonly exposureOptions: readonly string[];
} {
  const expressions = readConditionExpressions(condition);
  const publicApiFlagRequired = expressions.some((entry) =>
    entry.includes('domain.public_api == true')
  );
  const exposureExpression = expressions.find((entry) =>
    entry.includes('api.exposure in [')
  );

  return {
    publicApiFlagRequired,
    exposureOptions:
      exposureExpression === undefined
        ? []
        : readBracketList(exposureExpression, 'api.exposure in [')
  };
}

function readBracketList(expression: string, prefix: string): readonly string[] {
  const start = expression.indexOf(prefix);

  if (start === -1) {
    return [];
  }

  const listStart = start + prefix.length;
  const listEnd = expression.indexOf(']', listStart);

  if (listEnd === -1) {
    return [];
  }

  return expression
    .slice(listStart, listEnd)
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function readConditionExpressions(value: unknown): readonly string[] {
  if (!isRecord(value)) {
    return [];
  }

  if (typeof value.expression === 'string') {
    return value.expression
      .split(' or ')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }

  if (Array.isArray(value.all)) {
    return readStringArray(value.all);
  }

  if (Array.isArray(value.any)) {
    return readStringArray(value.any);
  }

  return [];
}

function hasUsableFieldAtPath(
  value: Record<string, unknown>,
  path: string
): boolean {
  const candidate = readValueAtPath(value, path);

  if (typeof candidate === 'string') {
    return candidate.trim().length > 0;
  }

  if (Array.isArray(candidate)) {
    return candidate.some(
      (entry) => typeof entry === 'string' && entry.trim().length > 0
    );
  }

  return candidate !== null && candidate !== undefined;
}

function readStringAtPath(
  value: Record<string, unknown>,
  path: string
): string | null {
  const candidate = readValueAtPath(value, path);

  return typeof candidate === 'string' && candidate.trim().length > 0
    ? candidate.trim()
    : null;
}

function readBooleanAtPath(
  value: Record<string, unknown>,
  path: string
): boolean | null {
  const candidate = readValueAtPath(value, path);

  return typeof candidate === 'boolean' ? candidate : null;
}

function readValueAtPath(value: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (!isRecord(current)) {
      return undefined;
    }

    return current[segment];
  }, value);
}

function readStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) =>
    typeof entry === 'string' && entry.trim().length > 0 ? [entry.trim()] : []
  );
}

function readValueMap(value: unknown): ReadonlyMap<string, unknown> {
  if (!isRecord(value)) {
    return new Map();
  }

  return new Map(
    Object.entries(value).filter(([field]) => field.trim().length > 0)
  );
}

function findRuleById(
  rules: readonly unknown[],
  ruleId: string
): Record<string, unknown> | undefined {
  return rules.find(
    (rule): rule is Record<string, unknown> =>
      isRecord(rule) && readStringField(rule, 'id') === ruleId
  );
}

function getServiceDiagnosticPath(value: Record<string, unknown>, index: number): string {
  const id = readStringField(value, 'id');

  return id === null ? `services[${index}]` : `services[${index}:${id}]`;
}

function getServiceName(value: Record<string, unknown>, index: number): string {
  return readStringField(value, 'id') ?? `services[${index}]`;
}

function createApiDiagnostic(path: string, message: string): Diagnostic {
  return {
    ruleId: PUBLIC_API_CONTRACT_RULE_ID,
    severity: 'error',
    file: SERVICES_FILE,
    path,
    message
  };
}

function readStringField(value: Record<string, unknown>, field: string): string | null {
  const candidate = value[field];

  return typeof candidate === 'string' && candidate.trim().length > 0
    ? candidate.trim()
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
