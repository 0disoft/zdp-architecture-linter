import type { DatastoreIndex } from './datastore-rules.ts';
import type { Diagnostic } from './diagnostics.ts';
import type { RepositoryIndex } from './repository-rules.ts';

const SERVICES_FILE = 'catalogs/services.yaml';
const TOKEN_RAW_CHAIN_CONSUMPTION_RULE_ID = 'ZDP-TOKEN-004';
const TOKEN_INDEXER_REPOSITORY_NAME = 'zdp-token-indexer';
const TOKEN_RAW_CHAIN_TARGET_AREAS = new Set(['core', 'labs', 'money', 'product']);

const EMPTY_TOKEN_RAW_CHAIN_CONSUMPTION_POLICY: TokenRawChainConsumptionPolicy = {
  enabled: false,
  forbiddenDatastores: [],
  requiredFields: [],
  directCommandForbiddenValue: null
};

export interface TokenRawChainConsumptionPolicy {
  readonly enabled: boolean;
  readonly forbiddenDatastores: readonly string[];
  readonly requiredFields: readonly string[];
  readonly directCommandForbiddenValue: unknown;
}

export function buildTokenRawChainConsumptionPolicy(
  tokenRules: unknown,
  datastoreIndex: DatastoreIndex
): TokenRawChainConsumptionPolicy {
  if (!isRecord(tokenRules) || !Array.isArray(tokenRules.rules)) {
    return EMPTY_TOKEN_RAW_CHAIN_CONSUMPTION_POLICY;
  }

  const rule = findRuleById(
    tokenRules.rules,
    TOKEN_RAW_CHAIN_CONSUMPTION_RULE_ID
  );

  if (rule === undefined) {
    return EMPTY_TOKEN_RAW_CHAIN_CONSUMPTION_POLICY;
  }

  const assertions = isRecord(rule.assertions) ? rule.assertions : {};
  const forbidValues = isRecord(assertions.forbid_values)
    ? assertions.forbid_values
    : {};
  const conditionDatastores = readDatastoreIdsFromCondition(rule.condition);
  const tokenIndexerDatastores = [...datastoreIndex.byId.values()].flatMap(
    (datastore) =>
      datastore.ownerRepo === TOKEN_INDEXER_REPOSITORY_NAME ? [datastore.id] : []
  );

  return {
    enabled: true,
    forbiddenDatastores: unique([
      ...conditionDatastores,
      ...tokenIndexerDatastores
    ]),
    requiredFields: readStringArray(assertions.require_fields),
    directCommandForbiddenValue:
      forbidValues['token.raw_chain_event_direct_command'] ?? null
  };
}

export function validateTokenRawChainConsumptionContracts(
  value: unknown,
  policy: TokenRawChainConsumptionPolicy,
  repositoryIndex: RepositoryIndex
): readonly Diagnostic[] {
  if (!policy.enabled) {
    return [];
  }

  if (!isRecord(value)) {
    return [
      createTokenServiceDiagnostic(
        'services',
        '`services.yaml` must be a YAML object with a services array.'
      )
    ];
  }

  const services = value.services;

  if (!Array.isArray(services)) {
    return [
      createTokenServiceDiagnostic(
        'services',
        '`services` must be a YAML array.'
      )
    ];
  }

  return services.flatMap((service, index) =>
    validateServiceTokenRawChainConsumption(
      service,
      index,
      policy,
      repositoryIndex
    )
  );
}

function validateServiceTokenRawChainConsumption(
  value: unknown,
  index: number,
  policy: TokenRawChainConsumptionPolicy,
  repositoryIndex: RepositoryIndex
): readonly Diagnostic[] {
  if (!isRecord(value)) {
    return [
      createTokenServiceDiagnostic(
        `services[${index}]`,
        'Service entry must be a YAML object.'
      )
    ];
  }

  const serviceRepo = readStringAtPreferredPaths(value, ['service.repo', 'repo']);
  const serviceRepoRecord =
    serviceRepo.value === null
      ? undefined
      : repositoryIndex.byName.get(serviceRepo.value);

  if (
    serviceRepoRecord?.area === null ||
    serviceRepoRecord?.area === undefined ||
    !TOKEN_RAW_CHAIN_TARGET_AREAS.has(serviceRepoRecord.area)
  ) {
    return [];
  }

  const servicePath = getServiceDiagnosticPath(value, index);
  const serviceName = getServiceName(value, index);
  const dependencies = readDatastoreListAtPath(
    value,
    'dependencies.datastores'
  );
  const directAccess = readDatastoreListAtPath(value, 'direct_datastore_access');
  const rawChainEvent = readValueAtPath(value, 'data.raw_chain_event');
  const diagnostics: Diagnostic[] = [];

  if (dependencies.invalid) {
    diagnostics.push(
      createTokenServiceDiagnostic(
        `${servicePath}.dependencies.datastores`,
        '`dependencies.datastores` must be a YAML array when present.'
      )
    );
  }

  if (directAccess.invalid) {
    diagnostics.push(
      createTokenServiceDiagnostic(
        `${servicePath}.direct_datastore_access`,
        '`direct_datastore_access` must be a YAML array when present.'
      )
    );
  }

  if (rawChainEvent !== undefined && typeof rawChainEvent !== 'boolean') {
    diagnostics.push(
      createTokenServiceDiagnostic(
        `${servicePath}.data.raw_chain_event`,
        '`data.raw_chain_event` must be a boolean when present.'
      )
    );
  }

  const datastoreTrigger = [...dependencies.values, ...directAccess.values].find(
    (datastoreId) => policy.forbiddenDatastores.includes(datastoreId)
  );
  const rawChainEventTrigger = rawChainEvent === true;
  const triggered = datastoreTrigger !== undefined || rawChainEventTrigger;

  if (!triggered) {
    return diagnostics;
  }

  for (const requiredField of policy.requiredFields) {
    if (isPresentValue(readValueAtPath(value, requiredField))) {
      continue;
    }

    diagnostics.push(
      createTokenServiceDiagnostic(
        `${servicePath}.${requiredField}`,
        `Token raw chain consumer \`${serviceName}\` must declare \`${requiredField}\` before consuming token indexer chain facts.`
      )
    );
  }

  if (
    policy.directCommandForbiddenValue !== null &&
    readValueAtPath(value, 'token.raw_chain_event_direct_command') ===
      policy.directCommandForbiddenValue
  ) {
    diagnostics.push(
      createTokenServiceDiagnostic(
        `${servicePath}.token.raw_chain_event_direct_command`,
        `Token raw chain consumer \`${serviceName}\` must not turn raw chain events into direct ledger, entitlement, or customer-right commands.`
      )
    );
  }

  return diagnostics;
}

function readDatastoreIdsFromCondition(condition: unknown): readonly string[] {
  return readConditionExpressions(condition).flatMap((expression) => {
    const dependencyPrefix = 'dependencies.datastores contains ';
    const directAccessPrefix = 'direct_datastore_access contains ';

    if (expression.startsWith(dependencyPrefix)) {
      return [expression.slice(dependencyPrefix.length).trim()].filter(
        (entry) => entry.length > 0
      );
    }

    if (expression.startsWith(directAccessPrefix)) {
      return [expression.slice(directAccessPrefix.length).trim()].filter(
        (entry) => entry.length > 0
      );
    }

    return [];
  });
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

function readDatastoreListAtPath(
  value: Record<string, unknown>,
  path: string
): { readonly values: readonly string[]; readonly invalid: boolean } {
  const candidate = readValueAtPath(value, path);

  if (candidate === undefined) {
    return { values: [], invalid: false };
  }

  if (!Array.isArray(candidate)) {
    return { values: [], invalid: true };
  }

  const values = readStringArray(candidate);

  return {
    values,
    invalid: values.length !== candidate.length
  };
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

function isPresentValue(value: unknown): boolean {
  if (value === undefined || value === null) {
    return false;
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return true;
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function getServiceDiagnosticPath(value: Record<string, unknown>, index: number): string {
  const id = readStringField(value, 'id');

  return id === null ? `services[${index}]` : `services[${index}:${id}]`;
}

function getServiceName(value: Record<string, unknown>, index: number): string {
  return readStringField(value, 'id') ?? `services[${index}]`;
}

function createTokenServiceDiagnostic(path: string, message: string): Diagnostic {
  return {
    ruleId: TOKEN_RAW_CHAIN_CONSUMPTION_RULE_ID,
    severity: 'error',
    file: SERVICES_FILE,
    path,
    message
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
