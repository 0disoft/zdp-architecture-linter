import type { Diagnostic } from './diagnostics.ts';

const SERVICES_FILE = 'catalogs/services.yaml';
const AI_USER_DATA_RULE_ID = 'ZDP-AI-001';
const AI_SENSITIVE_DATA_RULE_ID = 'ZDP-AI-002';

const EMPTY_AI_USER_DATA_POLICY: AiUserDataPolicy = {
  enabled: false,
  dependencyOptions: [],
  requiredValues: new Map(),
  requiredFields: [],
  forbiddenValues: new Map()
};

const EMPTY_AI_SENSITIVE_DATA_POLICY: AiSensitiveDataPolicy = {
  enabled: false,
  requiredValues: new Map(),
  providerPolicyAnyFields: []
};

export interface AiUserDataPolicy {
  readonly enabled: boolean;
  readonly dependencyOptions: readonly string[];
  readonly requiredValues: ReadonlyMap<string, unknown>;
  readonly requiredFields: readonly string[];
  readonly forbiddenValues: ReadonlyMap<string, readonly unknown[]>;
}

export interface AiSensitiveDataPolicy {
  readonly enabled: boolean;
  readonly requiredValues: ReadonlyMap<string, unknown>;
  readonly providerPolicyAnyFields: readonly string[];
}

export function buildAiUserDataPolicy(value: unknown): AiUserDataPolicy {
  if (!isRecord(value) || !Array.isArray(value.rules)) {
    return EMPTY_AI_USER_DATA_POLICY;
  }

  const aiUserDataRule = findRuleById(value.rules, AI_USER_DATA_RULE_ID);

  if (aiUserDataRule === undefined) {
    return EMPTY_AI_USER_DATA_POLICY;
  }

  const assertions = isRecord(aiUserDataRule.assertions)
    ? aiUserDataRule.assertions
    : {};
  const requireAny = isRecord(assertions.require_any) ? assertions.require_any : {};

  return {
    enabled: true,
    dependencyOptions: readStringArray(requireAny['dependencies.services']),
    requiredValues: readValueMap(assertions.require_values),
    requiredFields: readStringArray(assertions.require_fields),
    forbiddenValues: readForbiddenValueMap(assertions.forbid_values)
  };
}

export function buildAiSensitiveDataPolicy(value: unknown): AiSensitiveDataPolicy {
  if (!isRecord(value) || !Array.isArray(value.rules)) {
    return EMPTY_AI_SENSITIVE_DATA_POLICY;
  }

  const aiSensitiveDataRule = findRuleById(
    value.rules,
    AI_SENSITIVE_DATA_RULE_ID
  );

  if (aiSensitiveDataRule === undefined) {
    return EMPTY_AI_SENSITIVE_DATA_POLICY;
  }

  const assertions = isRecord(aiSensitiveDataRule.assertions)
    ? aiSensitiveDataRule.assertions
    : {};
  const requireAny = isRecord(assertions.require_any) ? assertions.require_any : {};

  return {
    enabled: true,
    requiredValues: readValueMap(assertions.require_values),
    providerPolicyAnyFields: readStringArray(requireAny['ai.provider_policy'])
  };
}

export function validateAiUserDataContracts(
  value: unknown,
  policy: AiUserDataPolicy
): readonly Diagnostic[] {
  if (!policy.enabled) {
    return [];
  }

  if (!isRecord(value)) {
    return [
      createAiDiagnostic(
        AI_USER_DATA_RULE_ID,
        'services',
        '`services.yaml` must be a YAML object with a services array.'
      )
    ];
  }

  const services = value.services;

  if (!Array.isArray(services)) {
    return [
      createAiDiagnostic(
        AI_USER_DATA_RULE_ID,
        'services',
        '`services` must be a YAML array.'
      )
    ];
  }

  return services.flatMap((service, index) =>
    validateServiceAiUserDataContract(service, index, policy)
  );
}

function validateServiceAiUserDataContract(
  value: unknown,
  index: number,
  policy: AiUserDataPolicy
): readonly Diagnostic[] {
  if (!isRecord(value)) {
    return [
      createAiDiagnostic(
        AI_USER_DATA_RULE_ID,
        `services[${index}]`,
        'Service entry must be a YAML object.'
      )
    ];
  }

  if (readBooleanAtPath(value, 'data.ai_user_data') !== true) {
    return [];
  }

  const servicePath = getServiceDiagnosticPath(value, index);
  const serviceName = getServiceName(value, index);
  const diagnostics: Diagnostic[] = [];

  for (const [field, expectedValue] of policy.requiredValues.entries()) {
    const actualValue = readValueAtPath(value, field);

    if (actualValue !== expectedValue) {
      diagnostics.push(
        createAiDiagnostic(
          AI_USER_DATA_RULE_ID,
          `${servicePath}.${field}`,
          `AI user data service \`${serviceName}\` must set \`${field}\` to \`${String(expectedValue)}\`.`
        )
      );
    }
  }

  for (const field of policy.requiredFields) {
    if (!hasRequiredAiUserFieldAtPath(value, field)) {
      diagnostics.push(
        createAiDiagnostic(
          AI_USER_DATA_RULE_ID,
          `${servicePath}.${field}`,
          `AI user data service \`${serviceName}\` is missing required field \`${field}\`.`
        )
      );
    }
  }

  for (const [field, forbiddenValues] of policy.forbiddenValues.entries()) {
    const actualValue = readValueAtPath(value, field);

    if (containsForbiddenValue(actualValue, forbiddenValues)) {
      diagnostics.push(
        createAiDiagnostic(
          AI_USER_DATA_RULE_ID,
          `${servicePath}.${field}`,
          `AI user data service \`${serviceName}\` must not set \`${field}\` to \`${String(actualValue)}\`.`
        )
      );
    }
  }

  if (policy.dependencyOptions.length > 0) {
    const dependencies = readDependencyServices(value);
    const hasRequiredDependency = dependencies.values.some((dependency) =>
      policy.dependencyOptions.includes(dependency)
    );

    if (!hasRequiredDependency) {
      diagnostics.push(
        createAiDiagnostic(
          AI_USER_DATA_RULE_ID,
          `${servicePath}.${dependencies.path}`,
          `AI user data service \`${serviceName}\` must depend on one of: ${policy.dependencyOptions.map((dependency) => `\`${dependency}\``).join(', ')}.`
        )
      );
    }
  }

  return diagnostics;
}

export function validateAiSensitiveDataContracts(
  value: unknown,
  policy: AiSensitiveDataPolicy
): readonly Diagnostic[] {
  if (!policy.enabled) {
    return [];
  }

  if (!isRecord(value)) {
    return [
      createAiDiagnostic(
        AI_SENSITIVE_DATA_RULE_ID,
        'services',
        '`services.yaml` must be a YAML object with a services array.'
      )
    ];
  }

  const services = value.services;

  if (!Array.isArray(services)) {
    return [
      createAiDiagnostic(
        AI_SENSITIVE_DATA_RULE_ID,
        'services',
        '`services` must be a YAML array.'
      )
    ];
  }

  return services.flatMap((service, index) =>
    validateServiceAiSensitiveDataContract(service, index, policy)
  );
}

function validateServiceAiSensitiveDataContract(
  value: unknown,
  index: number,
  policy: AiSensitiveDataPolicy
): readonly Diagnostic[] {
  if (!isRecord(value)) {
    return [
      createAiDiagnostic(
        AI_SENSITIVE_DATA_RULE_ID,
        `services[${index}]`,
        'Service entry must be a YAML object.'
      )
    ];
  }

  const hasSensitiveAiData =
    readBooleanAtPath(value, 'ai.sensitive_data') === true ||
    readBooleanAtPath(value, 'data.ai_user_data') === true;

  if (!hasSensitiveAiData) {
    return [];
  }

  const servicePath = getServiceDiagnosticPath(value, index);
  const serviceName = getServiceName(value, index);
  const diagnostics: Diagnostic[] = [];

  for (const [field, expectedValue] of policy.requiredValues.entries()) {
    const actualValue = readValueAtPath(value, field);

    if (actualValue !== expectedValue) {
      diagnostics.push(
        createAiDiagnostic(
          AI_SENSITIVE_DATA_RULE_ID,
          `${servicePath}.${field}`,
          `AI sensitive data service \`${serviceName}\` must set \`${field}\` to \`${String(expectedValue)}\`.`
        )
      );
    }
  }

  if (
    policy.providerPolicyAnyFields.length > 0 &&
    !hasAnyProviderPolicyField(value, policy.providerPolicyAnyFields)
  ) {
    diagnostics.push(
      createAiDiagnostic(
        AI_SENSITIVE_DATA_RULE_ID,
        `${servicePath}.ai.provider_policy`,
        `AI sensitive data service \`${serviceName}\` must set one of: ${policy.providerPolicyAnyFields.map((field) => `\`ai.provider_policy.${field}\``).join(', ')}.`
      )
    );
  }

  return diagnostics;
}

function hasAnyProviderPolicyField(
  value: Record<string, unknown>,
  fields: readonly string[]
): boolean {
  return fields.some((field) => {
    const fieldPath = `ai.provider_policy.${field}`;
    const candidate = readValueAtPath(value, fieldPath);

    if (typeof candidate === 'boolean') {
      return candidate === true;
    }

    if (isBooleanProviderPolicyField(field)) {
      return false;
    }

    return hasUsableFieldAtPath(value, fieldPath);
  });
}

function hasRequiredAiUserFieldAtPath(
  value: Record<string, unknown>,
  path: string
): boolean {
  const candidate = readValueAtPath(value, path);

  if (path === 'access.permission_model') {
    return typeof candidate === 'string' && candidate.trim().length > 0;
  }

  return hasUsableFieldAtPath(value, path);
}

function containsForbiddenValue(
  actualValue: unknown,
  forbiddenValues: readonly unknown[]
): boolean {
  if (Array.isArray(actualValue)) {
    return actualValue.some((entry) => forbiddenValues.includes(entry));
  }

  return forbiddenValues.includes(actualValue);
}

function isBooleanProviderPolicyField(field: string): boolean {
  return field.endsWith('_required');
}

function readDependencyServices(value: Record<string, unknown>): {
  readonly path: string;
  readonly values: readonly string[];
} {
  const nestedServices = readStringArrayAtPath(value, 'dependencies.services');

  if (nestedServices !== null) {
    return { path: 'dependencies.services', values: nestedServices };
  }

  const legacyDependencies = readStringArray(value.dependencies);

  if (legacyDependencies.length > 0) {
    return { path: 'dependencies', values: legacyDependencies };
  }

  return { path: 'dependencies.services', values: [] };
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
    return candidate.length > 0;
  }

  return candidate !== null && candidate !== undefined;
}

function readValueAtPath(value: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (!isRecord(current)) {
      return undefined;
    }

    return current[segment];
  }, value);
}

function readBooleanAtPath(
  value: Record<string, unknown>,
  path: string
): boolean | null {
  const candidate = readValueAtPath(value, path);

  return typeof candidate === 'boolean' ? candidate : null;
}

function readStringArrayAtPath(
  value: Record<string, unknown>,
  path: string
): readonly string[] | null {
  const candidate = readValueAtPath(value, path);

  return Array.isArray(candidate) ? readStringArray(candidate) : null;
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

function readForbiddenValueMap(
  value: unknown
): ReadonlyMap<string, readonly unknown[]> {
  if (!isRecord(value)) {
    return new Map();
  }

  const entries = Object.entries(value).flatMap(([field, forbiddenValues]) => {
    if (field.trim().length === 0 || !Array.isArray(forbiddenValues)) {
      return [];
    }

    return [[field, forbiddenValues] as const];
  });

  return new Map(entries);
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

function readStringField(value: Record<string, unknown>, field: string): string | null {
  const candidate = value[field];

  return typeof candidate === 'string' && candidate.trim().length > 0
    ? candidate.trim()
    : null;
}

function getServiceDiagnosticPath(value: Record<string, unknown>, index: number): string {
  const id = readStringField(value, 'id');

  return id === null ? `services[${index}]` : `services[${index}:${id}]`;
}

function getServiceName(value: Record<string, unknown>, index: number): string {
  return readStringField(value, 'id') ?? `services[${index}]`;
}

function createAiDiagnostic(
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
