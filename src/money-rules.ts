import type { Diagnostic } from './diagnostics.ts';

const SERVICES_FILE = 'catalogs/services.yaml';
const MONEY_MOVEMENT_RULE_ID = 'ZDP-MONEY-001';

const EMPTY_MONEY_MOVEMENT_POLICY: MoneyMovementPolicy = {
  enabled: false,
  expectedTier: null,
  auditRequired: null,
  idempotencyRequired: null,
  moneyDependencyOptions: []
};

export interface MoneyMovementPolicy {
  readonly enabled: boolean;
  readonly expectedTier: string | null;
  readonly auditRequired: boolean | null;
  readonly idempotencyRequired: boolean | null;
  readonly moneyDependencyOptions: readonly string[];
}

export function buildMoneyMovementPolicy(value: unknown): MoneyMovementPolicy {
  if (!isRecord(value) || !Array.isArray(value.rules)) {
    return EMPTY_MONEY_MOVEMENT_POLICY;
  }

  const moneyMovementRule = value.rules.find(
    (rule): rule is Record<string, unknown> =>
      isRecord(rule) && readStringField(rule, 'id') === MONEY_MOVEMENT_RULE_ID
  );

  if (moneyMovementRule === undefined) {
    return EMPTY_MONEY_MOVEMENT_POLICY;
  }

  const assertions = isRecord(moneyMovementRule.assertions)
    ? moneyMovementRule.assertions
    : {};
  const requireValues = isRecord(assertions.require_values)
    ? assertions.require_values
    : {};
  const requireAny = isRecord(assertions.require_any) ? assertions.require_any : {};

  const moneyDependencyOptions = readStringArray(
    requireAny['dependencies.services']
  );

  return {
    enabled: true,
    expectedTier: readStringField(requireValues, 'service.tier'),
    auditRequired: readBooleanField(requireValues, 'audit.required'),
    idempotencyRequired: readBooleanField(requireValues, 'idempotency.required'),
    moneyDependencyOptions
  };
}

export function validateMoneyMovementContracts(
  value: unknown,
  policy: MoneyMovementPolicy
): readonly Diagnostic[] {
  if (!policy.enabled) {
    return [];
  }

  if (!isRecord(value)) {
    return [
      createMoneyDiagnostic(
        'services',
        '`services.yaml` must be a YAML object with a services array.'
      )
    ];
  }

  const services = value.services;

  if (!Array.isArray(services)) {
    return [
      createMoneyDiagnostic('services', '`services` must be a YAML array.')
    ];
  }

  return services.flatMap((service, index) =>
    validateServiceMoneyMovementContract(service, index, policy)
  );
}

function validateServiceMoneyMovementContract(
  value: unknown,
  index: number,
  policy: MoneyMovementPolicy
): readonly Diagnostic[] {
  if (!isRecord(value)) {
    return [
      createMoneyDiagnostic(
        `services[${index}]`,
        'Service entry must be a YAML object.'
      )
    ];
  }

  if (!hasMoneyMovement(value)) {
    return [];
  }

  const servicePath = getServiceDiagnosticPath(value, index);
  const diagnostics: Diagnostic[] = [];

  if (policy.expectedTier !== null) {
    const tier = readStringAtPreferredPaths(value, [
      'service.tier',
      'tier'
    ]);

    if (tier.value !== policy.expectedTier) {
      diagnostics.push(
        createMoneyDiagnostic(
          `${servicePath}.${tier.path}`,
          `Money movement service \`${getServiceName(value, index)}\` must set \`${tier.path}\` to \`${policy.expectedTier}\`.`
        )
      );
    }
  }

  if (policy.auditRequired !== null) {
    const auditRequired = readBooleanAtPath(value, 'audit.required');

    if (auditRequired !== policy.auditRequired) {
      diagnostics.push(
        createMoneyDiagnostic(
          `${servicePath}.audit.required`,
          `Money movement service \`${getServiceName(value, index)}\` must set \`audit.required\` to \`${policy.auditRequired}\`.`
        )
      );
    }
  }

  if (policy.idempotencyRequired !== null) {
    const idempotencyRequired = readBooleanAtPath(
      value,
      'idempotency.required'
    );

    if (idempotencyRequired !== policy.idempotencyRequired) {
      diagnostics.push(
        createMoneyDiagnostic(
          `${servicePath}.idempotency.required`,
          `Money movement service \`${getServiceName(value, index)}\` must set \`idempotency.required\` to \`${policy.idempotencyRequired}\`.`
        )
      );
    }
  }

  if (policy.moneyDependencyOptions.length > 0) {
    const dependencies = readDependencyServices(value);
    const hasMoneyDependency = dependencies.values.some((dependency) =>
      policy.moneyDependencyOptions.includes(dependency)
    );

    if (!hasMoneyDependency) {
      diagnostics.push(
        createMoneyDiagnostic(
          `${servicePath}.${dependencies.path}`,
          `Money movement service \`${getServiceName(value, index)}\` must depend on one of: ${policy.moneyDependencyOptions.map((dependency) => `\`${dependency}\``).join(', ')}.`
        )
      );
    }
  }

  return diagnostics;
}

function hasMoneyMovement(value: Record<string, unknown>): boolean {
  return (
    readBooleanAtPath(value, 'domain.money_movement') === true ||
    readBooleanAtPath(value, 'data.money_movement') === true
  );
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

function readStringField(value: Record<string, unknown>, field: string): string | null {
  const candidate = value[field];

  return typeof candidate === 'string' && candidate.trim().length > 0
    ? candidate.trim()
    : null;
}

function readBooleanField(
  value: Record<string, unknown>,
  field: string
): boolean | null {
  const candidate = value[field];

  return typeof candidate === 'boolean' ? candidate : null;
}

function getServiceDiagnosticPath(value: Record<string, unknown>, index: number): string {
  const id = readStringField(value, 'id');

  return id === null ? `services[${index}]` : `services[${index}:${id}]`;
}

function getServiceName(value: Record<string, unknown>, index: number): string {
  return readStringField(value, 'id') ?? `services[${index}]`;
}

function createMoneyDiagnostic(path: string, message: string): Diagnostic {
  return {
    ruleId: MONEY_MOVEMENT_RULE_ID,
    severity: 'error',
    file: SERVICES_FILE,
    path,
    message
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
