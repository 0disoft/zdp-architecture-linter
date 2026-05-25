import type { Diagnostic } from './diagnostics.ts';

const SERVICES_FILE = 'catalogs/services.yaml';
const TIER_OPERATIONAL_CONTRACT_RULE_ID = 'ZDP-TIER-001';
const TIER_CRITICAL_CONTROLS_RULE_ID = 'ZDP-TIER-002';

const EMPTY_TIER_OPERATIONAL_CONTRACT_POLICY: TierOperationalContractPolicy = {
  enabled: false,
  applicableTiers: [],
  requiredFields: [],
  requiredValues: new Map()
};

const EMPTY_TIER_CRITICAL_CONTROLS_POLICY: TierCriticalControlsPolicy = {
  enabled: false,
  requiredTier: null,
  requiredFields: [],
  requiredValues: new Map()
};

export interface TierOperationalContractPolicy {
  readonly enabled: boolean;
  readonly applicableTiers: readonly string[];
  readonly requiredFields: readonly string[];
  readonly requiredValues: ReadonlyMap<string, unknown>;
}

export interface TierCriticalControlsPolicy {
  readonly enabled: boolean;
  readonly requiredTier: string | null;
  readonly requiredFields: readonly string[];
  readonly requiredValues: ReadonlyMap<string, unknown>;
}

export function buildTierOperationalContractPolicy(
  value: unknown
): TierOperationalContractPolicy {
  if (!isRecord(value) || !Array.isArray(value.rules)) {
    return EMPTY_TIER_OPERATIONAL_CONTRACT_POLICY;
  }

  const tierRule = findRuleById(
    value.rules,
    TIER_OPERATIONAL_CONTRACT_RULE_ID
  );

  if (tierRule === undefined) {
    return EMPTY_TIER_OPERATIONAL_CONTRACT_POLICY;
  }

  const assertions = isRecord(tierRule.assertions) ? tierRule.assertions : {};

  return {
    enabled: true,
    applicableTiers: readServiceTierConditionValues(tierRule.condition),
    requiredFields: readStringArray(assertions.require_fields),
    requiredValues: readValueMap(assertions.require_values)
  };
}

export function buildTierCriticalControlsPolicy(
  value: unknown
): TierCriticalControlsPolicy {
  if (!isRecord(value) || !Array.isArray(value.rules)) {
    return EMPTY_TIER_CRITICAL_CONTROLS_POLICY;
  }

  const tierRule = findRuleById(value.rules, TIER_CRITICAL_CONTROLS_RULE_ID);

  if (tierRule === undefined) {
    return EMPTY_TIER_CRITICAL_CONTROLS_POLICY;
  }

  const assertions = isRecord(tierRule.assertions) ? tierRule.assertions : {};

  return {
    enabled: true,
    requiredTier: readServiceTierEqualityValue(tierRule.condition),
    requiredFields: readStringArray(assertions.require_fields),
    requiredValues: readValueMap(assertions.require_values)
  };
}

export function validateTierOperationalContracts(
  value: unknown,
  policy: TierOperationalContractPolicy
): readonly Diagnostic[] {
  if (!policy.enabled) {
    return [];
  }

  if (!isRecord(value)) {
    return [
      createTierDiagnostic(
        TIER_OPERATIONAL_CONTRACT_RULE_ID,
        'services',
        '`services.yaml` must be a YAML object with a services array.'
      )
    ];
  }

  const services = value.services;

  if (!Array.isArray(services)) {
    return [
      createTierDiagnostic(
        TIER_OPERATIONAL_CONTRACT_RULE_ID,
        'services',
        '`services` must be a YAML array.'
      )
    ];
  }

  return services.flatMap((service, index) =>
    validateServiceTierOperationalContract(service, index, policy)
  );
}

export function validateTierCriticalControls(
  value: unknown,
  policy: TierCriticalControlsPolicy
): readonly Diagnostic[] {
  if (!policy.enabled) {
    return [];
  }

  if (!isRecord(value)) {
    return [
      createTierDiagnostic(
        TIER_CRITICAL_CONTROLS_RULE_ID,
        'services',
        '`services.yaml` must be a YAML object with a services array.'
      )
    ];
  }

  const services = value.services;

  if (!Array.isArray(services)) {
    return [
      createTierDiagnostic(
        TIER_CRITICAL_CONTROLS_RULE_ID,
        'services',
        '`services` must be a YAML array.'
      )
    ];
  }

  return services.flatMap((service, index) =>
    validateServiceTierCriticalControls(service, index, policy)
  );
}

function validateServiceTierOperationalContract(
  value: unknown,
  index: number,
  policy: TierOperationalContractPolicy
): readonly Diagnostic[] {
  if (!isRecord(value)) {
    return [
      createTierDiagnostic(
        TIER_OPERATIONAL_CONTRACT_RULE_ID,
        `services[${index}]`,
        'Service entry must be a YAML object.'
      )
    ];
  }

  const tier = readStringAtPreferredPaths(value, ['service.tier', 'tier']);

  if (tier.value === null || !policy.applicableTiers.includes(tier.value)) {
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
      createTierDiagnostic(
        TIER_OPERATIONAL_CONTRACT_RULE_ID,
        `${servicePath}.${field}`,
        `Tier \`${tier.value}\` service \`${serviceName}\` must set \`${field}\`.`
      )
    );
  }

  for (const [field, expectedValue] of policy.requiredValues.entries()) {
    const actualValue = readValueAtPath(value, field);

    if (actualValue === expectedValue) {
      continue;
    }

    diagnostics.push(
      createTierDiagnostic(
        TIER_OPERATIONAL_CONTRACT_RULE_ID,
        `${servicePath}.${field}`,
        `Tier \`${tier.value}\` service \`${serviceName}\` must set \`${field}\` to \`${String(expectedValue)}\`.`
      )
    );
  }

  return diagnostics;
}

function validateServiceTierCriticalControls(
  value: unknown,
  index: number,
  policy: TierCriticalControlsPolicy
): readonly Diagnostic[] {
  if (!isRecord(value)) {
    return [
      createTierDiagnostic(
        TIER_CRITICAL_CONTROLS_RULE_ID,
        `services[${index}]`,
        'Service entry must be a YAML object.'
      )
    ];
  }

  const tier = readStringAtPreferredPaths(value, ['service.tier', 'tier']);

  if (
    tier.value === null ||
    policy.requiredTier === null ||
    tier.value !== policy.requiredTier
  ) {
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
      createTierDiagnostic(
        TIER_CRITICAL_CONTROLS_RULE_ID,
        `${servicePath}.${field}`,
        `Tier \`${tier.value}\` service \`${serviceName}\` must set \`${field}\`.`
      )
    );
  }

  for (const [field, expectedValue] of policy.requiredValues.entries()) {
    const actualValue = readValueAtPath(value, field);

    if (actualValue === expectedValue) {
      continue;
    }

    diagnostics.push(
      createTierDiagnostic(
        TIER_CRITICAL_CONTROLS_RULE_ID,
        `${servicePath}.${field}`,
        `Tier \`${tier.value}\` service \`${serviceName}\` must set \`${field}\` to \`${String(expectedValue)}\`.`
      )
    );
  }

  return diagnostics;
}

function readServiceTierConditionValues(condition: unknown): readonly string[] {
  const expression = readConditionExpressions(condition).find((entry) =>
    entry.startsWith('service.tier in [')
  );

  if (expression === undefined || !expression.endsWith(']')) {
    return [];
  }

  return expression
    .slice('service.tier in ['.length, -1)
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function readServiceTierEqualityValue(condition: unknown): string | null {
  const expression = readConditionExpressions(condition).find((entry) =>
    entry.startsWith('service.tier == ')
  );

  if (expression === undefined) {
    return null;
  }

  const value = expression.slice('service.tier == '.length).trim();

  return value.length > 0 ? value : null;
}

function readConditionExpressions(value: unknown): readonly string[] {
  if (!isRecord(value)) {
    return [];
  }

  if (typeof value.expression === 'string') {
    return [value.expression.trim()].filter((entry) => entry.length > 0);
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

function readStringAtPreferredPaths(
  value: Record<string, unknown>,
  paths: readonly string[]
): { readonly path: string; readonly value: string | null } {
  for (const path of paths) {
    const pathValue = readStringAtPath(value, path);

    if (pathValue !== null) {
      return { path, value: pathValue };
    }
  }

  return { path: paths[0] ?? 'unknown', value: null };
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

function createTierDiagnostic(
  ruleId: string,
  path: string,
  message: string
): Diagnostic {
  return {
    ruleId,
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
