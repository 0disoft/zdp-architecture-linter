import type { Diagnostic } from './diagnostics.ts';

const SERVICES_FILE = 'catalogs/services.yaml';
const AI_USER_DATA_RULE_ID = 'ZDP-AI-001';

const EMPTY_AI_USER_DATA_POLICY: AiUserDataPolicy = {
  enabled: false,
  dependencyOptions: [],
  requiredValues: new Map(),
  requiredFields: [],
  forbiddenValues: new Map()
};

export interface AiUserDataPolicy {
  readonly enabled: boolean;
  readonly dependencyOptions: readonly string[];
  readonly requiredValues: ReadonlyMap<string, unknown>;
  readonly requiredFields: readonly string[];
  readonly forbiddenValues: ReadonlyMap<string, readonly unknown[]>;
}

export function buildAiUserDataPolicy(value: unknown): AiUserDataPolicy {
  if (!isRecord(value) || !Array.isArray(value.rules)) {
    return EMPTY_AI_USER_DATA_POLICY;
  }

  const aiUserDataRule = value.rules.find(
    (rule): rule is Record<string, unknown> =>
      isRecord(rule) && readStringField(rule, 'id') === AI_USER_DATA_RULE_ID
  );

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
        'services',
        '`services.yaml` must be a YAML object with a services array.'
      )
    ];
  }

  const services = value.services;

  if (!Array.isArray(services)) {
    return [
      createAiDiagnostic('services', '`services` must be a YAML array.')
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
          `${servicePath}.${field}`,
          `AI user data service \`${serviceName}\` must set \`${field}\` to \`${String(expectedValue)}\`.`
        )
      );
    }
  }

  for (const field of policy.requiredFields) {
    if (!hasUsableFieldAtPath(value, field)) {
      diagnostics.push(
        createAiDiagnostic(
          `${servicePath}.${field}`,
          `AI user data service \`${serviceName}\` is missing required field \`${field}\`.`
        )
      );
    }
  }

  for (const [field, forbiddenValues] of policy.forbiddenValues.entries()) {
    const actualValue = readValueAtPath(value, field);

    if (forbiddenValues.includes(actualValue)) {
      diagnostics.push(
        createAiDiagnostic(
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
          `${servicePath}.${dependencies.path}`,
          `AI user data service \`${serviceName}\` must depend on one of: ${policy.dependencyOptions.map((dependency) => `\`${dependency}\``).join(', ')}.`
        )
      );
    }
  }

  return diagnostics;
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

function createAiDiagnostic(path: string, message: string): Diagnostic {
  return {
    ruleId: AI_USER_DATA_RULE_ID,
    severity: 'error',
    file: SERVICES_FILE,
    path,
    message
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
