import type { DatastoreIndex } from './datastore-rules.ts';
import type { Diagnostic } from './diagnostics.ts';
import type { RepositoryIndex } from './repository-rules.ts';

const SERVICES_FILE = 'catalogs/services.yaml';

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
      (serviceComponent !== null && datastore.ownerRepo === serviceComponent)
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
  ruleId: 'ZDP-AI-003' | 'ZDP-DATA-001' | 'ZDP-DATA-004',
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
