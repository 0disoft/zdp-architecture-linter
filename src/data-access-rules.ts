import type { DatastoreIndex } from './datastore-rules.ts';
import type { Diagnostic } from './diagnostics.ts';
import type { RepositoryIndex } from './repository-rules.ts';

const SERVICES_FILE = 'catalogs/services.yaml';
const LEDGER_DATASTORE_DEPENDENCY_RULE_ID = 'ZDP-DATA-002';

const PRODUCT_LIKE_SERVICE_REPOSITORY_AREAS = new Set([
  'frontend',
  'labs',
  'product'
]);

const SENSITIVE_DATASTORE_OWNER_AREAS = new Set(['core', 'money', 'privacy']);

const AI_REPOSITORY_AREA = 'ai';

const EDGE_RUNTIMES = new Set([
  'cloudflare-workers',
  'cloudflare-durable-objects'
]);

const EDGE_FORBIDDEN_DATASTORE_KINDS = new Set(['postgresql', 'secure-storage']);

const EMPTY_LEDGER_DATASTORE_DEPENDENCY_POLICY: LedgerDatastoreDependencyPolicy = {
  enabled: false,
  forbiddenRepos: [],
  forbiddenDatastores: []
};

export interface LedgerDatastoreDependencyPolicy {
  readonly enabled: boolean;
  readonly forbiddenRepos: readonly string[];
  readonly forbiddenDatastores: readonly string[];
}

export function buildLedgerDatastoreDependencyPolicy(
  value: unknown
): LedgerDatastoreDependencyPolicy {
  if (!isRecord(value) || !Array.isArray(value.rules)) {
    return EMPTY_LEDGER_DATASTORE_DEPENDENCY_POLICY;
  }

  const ledgerDependencyRule = findRuleById(
    value.rules,
    LEDGER_DATASTORE_DEPENDENCY_RULE_ID
  );

  if (ledgerDependencyRule === undefined) {
    return EMPTY_LEDGER_DATASTORE_DEPENDENCY_POLICY;
  }

  const assertions = isRecord(ledgerDependencyRule.assertions)
    ? ledgerDependencyRule.assertions
    : {};
  const forbidValues = isRecord(assertions.forbid_values)
    ? assertions.forbid_values
    : {};

  return {
    enabled: true,
    forbiddenRepos: readServiceRepoConditionValues(ledgerDependencyRule.condition),
    forbiddenDatastores: readStringArray(forbidValues['dependencies.datastores'])
  };
}

export function validateProductLikeDirectSensitiveDatastoreAccess(
  value: unknown,
  repositoryIndex: RepositoryIndex,
  datastoreIndex: DatastoreIndex
): readonly Diagnostic[] {
  if (!isRecord(value)) {
    return [
      createDataAccessDiagnostic(
        'ZDP-DATA-001',
        'services',
        '`services.yaml` must be a YAML object with a services array.'
      )
    ];
  }

  const services = value.services;

  if (!Array.isArray(services)) {
    return [
      createDataAccessDiagnostic(
        'ZDP-DATA-001',
        'services',
        '`services` must be a YAML array.'
      )
    ];
  }

  return services.flatMap((service, index) =>
    validateServiceProductLikeSensitiveDatastoreAccess(
      service,
      index,
      repositoryIndex,
      datastoreIndex
    )
  );
}

export function validateLedgerDatastoreDependencyAccess(
  value: unknown,
  policy: LedgerDatastoreDependencyPolicy
): readonly Diagnostic[] {
  if (!policy.enabled) {
    return [];
  }

  if (!isRecord(value)) {
    return [
      createDataAccessDiagnostic(
        LEDGER_DATASTORE_DEPENDENCY_RULE_ID,
        'services',
        '`services.yaml` must be a YAML object with a services array.'
      )
    ];
  }

  const services = value.services;

  if (!Array.isArray(services)) {
    return [
      createDataAccessDiagnostic(
        LEDGER_DATASTORE_DEPENDENCY_RULE_ID,
        'services',
        '`services` must be a YAML array.'
      )
    ];
  }

  return services.flatMap((service, index) =>
    validateServiceLedgerDatastoreDependencyAccess(service, index, policy)
  );
}

export function validateAiDirectNonOwnedDatastoreAccess(
  value: unknown,
  repositoryIndex: RepositoryIndex,
  datastoreIndex: DatastoreIndex
): readonly Diagnostic[] {
  if (!isRecord(value)) {
    return [
      createDataAccessDiagnostic(
        'ZDP-AI-003',
        'services',
        '`services.yaml` must be a YAML object with a services array.'
      )
    ];
  }

  const services = value.services;

  if (!Array.isArray(services)) {
    return [
      createDataAccessDiagnostic(
        'ZDP-AI-003',
        'services',
        '`services` must be a YAML array.'
      )
    ];
  }

  return services.flatMap((service, index) =>
    validateServiceAiDirectNonOwnedDatastoreAccess(
      service,
      index,
      repositoryIndex,
      datastoreIndex
    )
  );
}

export function validateEdgeRuntimeDirectDatastoreAccess(
  value: unknown,
  datastoreIndex: DatastoreIndex
): readonly Diagnostic[] {
  if (!isRecord(value)) {
    return [
      createDataAccessDiagnostic(
        'ZDP-DATA-004',
        'services',
        '`services.yaml` must be a YAML object with a services array.'
      )
    ];
  }

  const services = value.services;

  if (!Array.isArray(services)) {
    return [
      createDataAccessDiagnostic(
        'ZDP-DATA-004',
        'services',
        '`services` must be a YAML array.'
      )
    ];
  }

  return services.flatMap((service, index) =>
    validateServiceEdgeDatastoreAccess(service, index, datastoreIndex)
  );
}

function validateServiceProductLikeSensitiveDatastoreAccess(
  value: unknown,
  index: number,
  repositoryIndex: RepositoryIndex,
  datastoreIndex: DatastoreIndex
): readonly Diagnostic[] {
  if (!isRecord(value)) {
    return [
      createDataAccessDiagnostic(
        'ZDP-DATA-001',
        `services[${index}]`,
        'Service entry must be a YAML object.'
      )
    ];
  }

  const serviceRepoName = readStringField(value, 'repo');

  if (serviceRepoName === null) {
    return [];
  }

  const serviceRepo = repositoryIndex.byName.get(serviceRepoName);

  if (
    serviceRepo === undefined ||
    serviceRepo.area === null ||
    !PRODUCT_LIKE_SERVICE_REPOSITORY_AREAS.has(serviceRepo.area)
  ) {
    return [];
  }

  const directDatastoreAccess = value.direct_datastore_access;

  if (!Array.isArray(directDatastoreAccess)) {
    return [];
  }

  const servicePath = getServiceDiagnosticPath(value, index);

  return directDatastoreAccess.flatMap((datastoreId, datastoreIndexInService) => {
    if (typeof datastoreId !== 'string') {
      return [];
    }

    const normalizedDatastoreId = datastoreId.trim();
    const datastore = datastoreIndex.byId.get(normalizedDatastoreId);

    if (datastore === undefined || datastore.ownerRepo === null) {
      return [];
    }

    const datastoreOwnerRepo = repositoryIndex.byName.get(datastore.ownerRepo);

    if (
      datastoreOwnerRepo === undefined ||
      datastoreOwnerRepo.area === null ||
      !SENSITIVE_DATASTORE_OWNER_AREAS.has(datastoreOwnerRepo.area)
    ) {
      return [];
    }

    return [
      createDataAccessDiagnostic(
        'ZDP-DATA-001',
        `${servicePath}.direct_datastore_access[${datastoreIndexInService}]`,
        `Service in \`${serviceRepo.area}\` repository \`${serviceRepoName}\` must not directly access \`${datastoreOwnerRepo.area}\` datastore \`${normalizedDatastoreId}\`.`
      )
    ];
  });
}

function validateServiceLedgerDatastoreDependencyAccess(
  value: unknown,
  index: number,
  policy: LedgerDatastoreDependencyPolicy
): readonly Diagnostic[] {
  if (!isRecord(value)) {
    return [
      createDataAccessDiagnostic(
        LEDGER_DATASTORE_DEPENDENCY_RULE_ID,
        `services[${index}]`,
        'Service entry must be a YAML object.'
      )
    ];
  }

  const serviceRepo = readStringAtPreferredPaths(value, ['service.repo', 'repo']);

  if (
    serviceRepo.value === null ||
    !policy.forbiddenRepos.includes(serviceRepo.value)
  ) {
    return [];
  }

  const datastoreDependencies = readValueAtPath(value, 'dependencies.datastores');

  if (datastoreDependencies === undefined) {
    return [];
  }

  const servicePath = getServiceDiagnosticPath(value, index);

  if (!Array.isArray(datastoreDependencies)) {
    return [
      createDataAccessDiagnostic(
        LEDGER_DATASTORE_DEPENDENCY_RULE_ID,
        `${servicePath}.dependencies.datastores`,
        '`dependencies.datastores` must be a YAML array when present.'
      )
    ];
  }

  return datastoreDependencies.flatMap((datastoreId, datastoreIndexInService) => {
    const path = `${servicePath}.dependencies.datastores[${datastoreIndexInService}]`;

    if (typeof datastoreId !== 'string' || datastoreId.trim().length === 0) {
      return [
        createDataAccessDiagnostic(
          LEDGER_DATASTORE_DEPENDENCY_RULE_ID,
          path,
          'Dependency datastore entry must be a non-empty datastore id.'
        )
      ];
    }

    const normalizedDatastoreId = datastoreId.trim();

    if (!policy.forbiddenDatastores.includes(normalizedDatastoreId)) {
      return [];
    }

    return [
      createDataAccessDiagnostic(
        LEDGER_DATASTORE_DEPENDENCY_RULE_ID,
        path,
        `Service \`${getServiceName(value, index)}\` in repository \`${serviceRepo.value}\` must not depend directly on datastore \`${normalizedDatastoreId}\`.`
      )
    ];
  });
}

function validateServiceAiDirectNonOwnedDatastoreAccess(
  value: unknown,
  index: number,
  repositoryIndex: RepositoryIndex,
  datastoreIndex: DatastoreIndex
): readonly Diagnostic[] {
  if (!isRecord(value)) {
    return [
      createDataAccessDiagnostic(
        'ZDP-AI-003',
        `services[${index}]`,
        'Service entry must be a YAML object.'
      )
    ];
  }

  const serviceRepoName = readStringField(value, 'repo');

  if (serviceRepoName === null) {
    return [];
  }

  const serviceRepo = repositoryIndex.byName.get(serviceRepoName);

  if (serviceRepo?.area !== AI_REPOSITORY_AREA) {
    return [];
  }

  const directDatastoreAccess = value.direct_datastore_access;

  if (!Array.isArray(directDatastoreAccess)) {
    return [];
  }

  const servicePath = getServiceDiagnosticPath(value, index);
  const serviceComponent = readStringField(value, 'component');
  const componentRepo =
    serviceComponent === null ? undefined : repositoryIndex.byName.get(serviceComponent);
  const isAiOwnedComponent = componentRepo?.area === AI_REPOSITORY_AREA;

  return directDatastoreAccess.flatMap((datastoreId, datastoreIndexInService) => {
    if (typeof datastoreId !== 'string') {
      return [];
    }

    const normalizedDatastoreId = datastoreId.trim();
    const datastore = datastoreIndex.byId.get(normalizedDatastoreId);

    if (datastore === undefined || datastore.ownerRepo === null) {
      return [];
    }

    if (
      datastore.ownerRepo === serviceRepoName ||
      (isAiOwnedComponent && datastore.ownerRepo === serviceComponent)
    ) {
      return [];
    }

    return [
      createDataAccessDiagnostic(
        'ZDP-AI-003',
        `${servicePath}.direct_datastore_access[${datastoreIndexInService}]`,
        `AI service \`${getServiceName(value, index)}\` must not directly access datastore \`${normalizedDatastoreId}\` owned by \`${datastore.ownerRepo}\`.`
      )
    ];
  });
}

function validateServiceEdgeDatastoreAccess(
  value: unknown,
  index: number,
  datastoreIndex: DatastoreIndex
): readonly Diagnostic[] {
  if (!isRecord(value)) {
    return [
      createDataAccessDiagnostic(
        'ZDP-DATA-004',
        `services[${index}]`,
        'Service entry must be a YAML object.'
      )
    ];
  }

  const runtime = readStringField(value, 'runtime');

  if (runtime === null || !EDGE_RUNTIMES.has(runtime)) {
    return [];
  }

  const directDatastoreAccess = value.direct_datastore_access;

  if (!Array.isArray(directDatastoreAccess)) {
    return [];
  }

  const servicePath = getServiceDiagnosticPath(value, index);

  return directDatastoreAccess.flatMap((datastoreId, datastoreIndexInService) => {
    if (typeof datastoreId !== 'string') {
      return [];
    }

    const normalizedDatastoreId = datastoreId.trim();
    const datastore = datastoreIndex.byId.get(normalizedDatastoreId);

    if (
      datastore === undefined ||
      datastore.kind === null ||
      !EDGE_FORBIDDEN_DATASTORE_KINDS.has(datastore.kind)
    ) {
      return [];
    }

    return [
      createDataAccessDiagnostic(
        'ZDP-DATA-004',
        `${servicePath}.direct_datastore_access[${datastoreIndexInService}]`,
        `Service with runtime \`${runtime}\` must not directly access \`${datastore.kind}\` datastore \`${normalizedDatastoreId}\`.`
      )
    ];
  });
}

function getServiceDiagnosticPath(value: Record<string, unknown>, index: number): string {
  const id = readStringField(value, 'id');

  return id === null ? `services[${index}]` : `services[${index}:${id}]`;
}

function getServiceName(value: Record<string, unknown>, index: number): string {
  return readStringField(value, 'id') ?? `services[${index}]`;
}

function createDataAccessDiagnostic(
  ruleId:
    | 'ZDP-AI-003'
    | 'ZDP-DATA-001'
    | 'ZDP-DATA-002'
    | 'ZDP-DATA-004',
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

function readServiceRepoConditionValues(condition: unknown): readonly string[] {
  const expression = readConditionExpressions(condition).find((entry) =>
    entry.startsWith('service.repo in [')
  );

  if (expression === undefined || !expression.endsWith(']')) {
    return [];
  }

  return expression
    .slice('service.repo in ['.length, -1)
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
