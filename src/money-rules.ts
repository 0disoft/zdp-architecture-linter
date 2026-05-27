import type { Diagnostic } from './diagnostics.ts';
import type { RepositoryIndex } from './repository-rules.ts';

const SERVICES_FILE = 'catalogs/services.yaml';
const MONEY_MOVEMENT_RULE_ID = 'ZDP-MONEY-001';
const PAYMENT_DATA_FRONTEND_RULE_ID = 'ZDP-MONEY-002';
const CREDIT_MONETIZATION_RULE_ID = 'ZDP-MONEY-003';

const EMPTY_MONEY_MOVEMENT_POLICY: MoneyMovementPolicy = {
  enabled: false,
  expectedTier: null,
  auditRequired: null,
  idempotencyRequired: null,
  moneyDependencyOptions: []
};

const EMPTY_PAYMENT_DATA_FRONTEND_POLICY: PaymentDataFrontendPolicy = {
  enabled: false,
  forbiddenRepos: []
};

const EMPTY_CREDIT_MONETIZATION_POLICY: CreditMonetizationPolicy = {
  enabled: false,
  requiredValues: new Map(),
  moneyDependencyOptions: []
};

export interface MoneyMovementPolicy {
  readonly enabled: boolean;
  readonly expectedTier: string | null;
  readonly auditRequired: boolean | null;
  readonly idempotencyRequired: boolean | null;
  readonly moneyDependencyOptions: readonly string[];
}

export interface PaymentDataFrontendPolicy {
  readonly enabled: boolean;
  readonly forbiddenRepos: readonly string[];
}

export interface CreditMonetizationPolicy {
  readonly enabled: boolean;
  readonly requiredValues: ReadonlyMap<string, unknown>;
  readonly moneyDependencyOptions: readonly string[];
}

export function buildMoneyMovementPolicy(value: unknown): MoneyMovementPolicy {
  if (!isRecord(value) || !Array.isArray(value.rules)) {
    return EMPTY_MONEY_MOVEMENT_POLICY;
  }

  const moneyMovementRule = findRuleById(value.rules, MONEY_MOVEMENT_RULE_ID);

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

export function buildPaymentDataFrontendPolicy(
  value: unknown
): PaymentDataFrontendPolicy {
  if (!isRecord(value) || !Array.isArray(value.rules)) {
    return EMPTY_PAYMENT_DATA_FRONTEND_POLICY;
  }

  const paymentDataFrontendRule = findRuleById(
    value.rules,
    PAYMENT_DATA_FRONTEND_RULE_ID
  );

  if (paymentDataFrontendRule === undefined) {
    return EMPTY_PAYMENT_DATA_FRONTEND_POLICY;
  }

  const assertions = isRecord(paymentDataFrontendRule.assertions)
    ? paymentDataFrontendRule.assertions
    : {};
  const forbidValues = isRecord(assertions.forbid_values)
    ? assertions.forbid_values
    : {};

  return {
    enabled: true,
    forbiddenRepos: readStringArray(forbidValues['service.repo'])
  };
}

export function buildCreditMonetizationPolicy(
  value: unknown
): CreditMonetizationPolicy {
  if (!isRecord(value) || !Array.isArray(value.rules)) {
    return EMPTY_CREDIT_MONETIZATION_POLICY;
  }

  const creditMonetizationRule = findRuleById(
    value.rules,
    CREDIT_MONETIZATION_RULE_ID
  );

  if (creditMonetizationRule === undefined) {
    return EMPTY_CREDIT_MONETIZATION_POLICY;
  }

  const assertions = isRecord(creditMonetizationRule.assertions)
    ? creditMonetizationRule.assertions
    : {};
  const requireAny = isRecord(assertions.require_any) ? assertions.require_any : {};

  return {
    enabled: true,
    requiredValues: readValueMap(assertions.require_values),
    moneyDependencyOptions: readStringArray(requireAny['dependencies.services'])
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
        MONEY_MOVEMENT_RULE_ID,
        'services',
        '`services.yaml` must be a YAML object with a services array.'
      )
    ];
  }

  const services = value.services;

  if (!Array.isArray(services)) {
    return [
      createMoneyDiagnostic(
        MONEY_MOVEMENT_RULE_ID,
        'services',
        '`services` must be a YAML array.'
      )
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
        MONEY_MOVEMENT_RULE_ID,
        `services[${index}]`,
        'Service entry must be a YAML object.'
      )
    ];
  }

  const moneyMovementMarker = readMoneyMovementMarker(value);
  const servicePath = getServiceDiagnosticPath(value, index);

  if (moneyMovementMarker.invalidPath !== null) {
    return [
      createMoneyDiagnostic(
        MONEY_MOVEMENT_RULE_ID,
        `${servicePath}.${moneyMovementMarker.invalidPath}`,
        `Money movement marker \`${moneyMovementMarker.invalidPath}\` must be a boolean.`
      )
    ];
  }

  if (!moneyMovementMarker.enabled) {
    return [];
  }

  const diagnostics: Diagnostic[] = [];

  if (policy.expectedTier !== null) {
    const tier = readStringAtPreferredPaths(value, [
      'service.tier',
      'tier'
    ]);

    if (tier.value !== policy.expectedTier) {
      diagnostics.push(
        createMoneyDiagnostic(
          MONEY_MOVEMENT_RULE_ID,
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
          MONEY_MOVEMENT_RULE_ID,
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
          MONEY_MOVEMENT_RULE_ID,
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
          MONEY_MOVEMENT_RULE_ID,
          `${servicePath}.${dependencies.path}`,
          `Money movement service \`${getServiceName(value, index)}\` must depend on one of: ${policy.moneyDependencyOptions.map((dependency) => `\`${dependency}\``).join(', ')}.`
        )
      );
    }
  }

  return diagnostics;
}

export function validatePaymentDataFrontendContracts(
  value: unknown,
  policy: PaymentDataFrontendPolicy,
  repositoryIndex?: RepositoryIndex
): readonly Diagnostic[] {
  if (!policy.enabled) {
    return [];
  }

  if (!isRecord(value)) {
    return [
      createMoneyDiagnostic(
        PAYMENT_DATA_FRONTEND_RULE_ID,
        'services',
        '`services.yaml` must be a YAML object with a services array.'
      )
    ];
  }

  const services = value.services;

  if (!Array.isArray(services)) {
    return [
      createMoneyDiagnostic(
        PAYMENT_DATA_FRONTEND_RULE_ID,
        'services',
        '`services` must be a YAML array.'
      )
    ];
  }

  return services.flatMap((service, index) =>
    validateServicePaymentDataFrontendContract(
      service,
      index,
      policy,
      repositoryIndex
    )
  );
}

export function validateCreditMonetizationContracts(
  value: unknown,
  policy: CreditMonetizationPolicy
): readonly Diagnostic[] {
  if (!policy.enabled) {
    return [];
  }

  if (!isRecord(value)) {
    return [
      createMoneyDiagnostic(
        CREDIT_MONETIZATION_RULE_ID,
        'services',
        '`services.yaml` must be a YAML object with a services array.'
      )
    ];
  }

  const services = value.services;

  if (!Array.isArray(services)) {
    return [
      createMoneyDiagnostic(
        CREDIT_MONETIZATION_RULE_ID,
        'services',
        '`services` must be a YAML array.'
      )
    ];
  }

  return services.flatMap((service, index) =>
    validateServiceCreditMonetizationContract(service, index, policy)
  );
}

function validateServicePaymentDataFrontendContract(
  value: unknown,
  index: number,
  policy: PaymentDataFrontendPolicy,
  repositoryIndex?: RepositoryIndex
): readonly Diagnostic[] {
  if (!isRecord(value)) {
    return [
      createMoneyDiagnostic(
        PAYMENT_DATA_FRONTEND_RULE_ID,
        `services[${index}]`,
        'Service entry must be a YAML object.'
      )
    ];
  }

  if (readBooleanAtPath(value, 'data.payment_data') !== true) {
    return [];
  }

  const repo = readStringAtPreferredPaths(value, ['repo', 'service.repo']);

  if (repo.value === null) {
    return [];
  }

  const forbidden =
    policy.forbiddenRepos.includes(repo.value) ||
    isLabOnlyLabRepository(repo.value, repositoryIndex);

  if (!forbidden) {
    return [];
  }

  return [
    createMoneyDiagnostic(
      PAYMENT_DATA_FRONTEND_RULE_ID,
      `${getServiceDiagnosticPath(value, index)}.${repo.path}`,
      `Payment data service \`${getServiceName(value, index)}\` must not use forbidden repository \`${repo.value}\`.`
    )
  ];
}

function isLabOnlyLabRepository(
  repo: string,
  repositoryIndex?: RepositoryIndex
): boolean {
  const repository = repositoryIndex?.byName.get(repo);

  return repository?.repoStage === 'lab_only' && repository.kind === 'lab';
}

function validateServiceCreditMonetizationContract(
  value: unknown,
  index: number,
  policy: CreditMonetizationPolicy
): readonly Diagnostic[] {
  if (!isRecord(value)) {
    return [
      createMoneyDiagnostic(
        CREDIT_MONETIZATION_RULE_ID,
        `services[${index}]`,
        'Service entry must be a YAML object.'
      )
    ];
  }

  if (!hasCreditMonetization(value)) {
    return [];
  }

  const servicePath = getServiceDiagnosticPath(value, index);
  const serviceName = getServiceName(value, index);
  const diagnostics: Diagnostic[] = [];

  for (const [field, expectedValue] of policy.requiredValues.entries()) {
    const actualValue = readValueAtPath(value, field);

    if (actualValue !== expectedValue) {
      diagnostics.push(
        createMoneyDiagnostic(
          CREDIT_MONETIZATION_RULE_ID,
          `${servicePath}.${field}`,
          `Credit monetization service \`${serviceName}\` must set \`${field}\` to \`${String(expectedValue)}\`.`
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
          CREDIT_MONETIZATION_RULE_ID,
          `${servicePath}.${dependencies.path}`,
          `Credit monetization service \`${serviceName}\` must depend on one of: ${policy.moneyDependencyOptions.map((dependency) => `\`${dependency}\``).join(', ')}.`
        )
      );
    }
  }

  return diagnostics;
}

function readMoneyMovementMarker(value: Record<string, unknown>): {
  readonly enabled: boolean;
  readonly invalidPath: string | null;
} {
  const markerPaths = ['domain.money_movement', 'data.money_movement'] as const;

  for (const markerPath of markerPaths) {
    const markerValue = readValueAtPath(value, markerPath);

    if (typeof markerValue === 'boolean') {
      if (markerValue) {
        return { enabled: true, invalidPath: null };
      }

      continue;
    }

    if (markerValue !== undefined) {
      return { enabled: false, invalidPath: markerPath };
    }
  }

  return { enabled: false, invalidPath: null };
}

function hasCreditMonetization(value: Record<string, unknown>): boolean {
  return (
    readStringAtPath(value, 'monetization.model') === 'credit' ||
    readBooleanAtPath(value, 'monetization.credit_policy.enabled') === true ||
    readBooleanAtPath(
      value,
      'monetization.ad_policy.credit_ad_removal_allowed'
    ) === true ||
    readBooleanAtPath(
      value,
      'monetization.ad_policy.auto_renew_with_credits_allowed'
    ) === true
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

function readValueMap(value: unknown): ReadonlyMap<string, unknown> {
  if (!isRecord(value)) {
    return new Map();
  }

  return new Map(
    Object.entries(value).filter(([field]) => field.trim().length > 0)
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

function createMoneyDiagnostic(
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
