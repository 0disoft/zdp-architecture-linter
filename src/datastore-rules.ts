import type { Diagnostic } from './diagnostics.ts';
import type { RepositoryIndex } from './repository-rules.ts';

const DATASTORES_FILE = 'catalogs/datastores.yaml';
const SERVICES_FILE = 'catalogs/services.yaml';

export interface DatastoreCatalogRecord {
  readonly id: string;
  readonly ownerRepo: string | null;
  readonly path: string;
}

export interface DatastoreIndex {
  readonly byId: ReadonlyMap<string, DatastoreCatalogRecord>;
}

export function buildDatastoreIndex(value: unknown): DatastoreIndex {
  if (!isRecord(value) || !Array.isArray(value.datastores)) {
    return { byId: new Map() };
  }

  const entries: Array<[string, DatastoreCatalogRecord]> = [];

  for (const [index, datastore] of value.datastores.entries()) {
    if (!isRecord(datastore) || typeof datastore.id !== 'string') {
      continue;
    }

    const id = datastore.id.trim();

    if (id.length === 0) {
      continue;
    }

    entries.push([
      id,
      {
        id,
        ownerRepo: readStringField(datastore, 'owner_repo'),
        path: getDatastoreDiagnosticPath(datastore, index)
      }
    ]);
  }

  return { byId: new Map(entries) };
}

export function validateDatastoreOwnerReferences(
  value: unknown,
  repositoryIndex: RepositoryIndex
): readonly Diagnostic[] {
  if (!isRecord(value)) {
    return [
      createDatastoreDiagnostic(
        'datastores',
        '`datastores.yaml` must be a YAML object with a datastores array.'
      )
    ];
  }

  const datastores = value.datastores;

  if (!Array.isArray(datastores)) {
    return [
      createDatastoreDiagnostic(
        'datastores',
        '`datastores` must be a YAML array.'
      )
    ];
  }

  return datastores.flatMap((datastore, index) =>
    validateDatastoreRecord(datastore, index, repositoryIndex)
  );
}

export function validateServiceDatastoreReferences(
  value: unknown,
  datastoreIndex: DatastoreIndex
): readonly Diagnostic[] {
  if (!isRecord(value)) {
    return [
      createServiceDatastoreDiagnostic(
        'services',
        '`services.yaml` must be a YAML object with a services array.'
      )
    ];
  }

  const services = value.services;

  if (!Array.isArray(services)) {
    return [
      createServiceDatastoreDiagnostic('services', '`services` must be a YAML array.')
    ];
  }

  return services.flatMap((service, index) =>
    validateServiceDatastoreRecord(service, index, datastoreIndex)
  );
}

function validateDatastoreRecord(
  value: unknown,
  index: number,
  repositoryIndex: RepositoryIndex
): readonly Diagnostic[] {
  if (!isRecord(value)) {
    return [
      createDatastoreDiagnostic(
        `datastores[${index}]`,
        'Datastore entry must be a YAML object.'
      )
    ];
  }

  const datastorePath = getDatastoreDiagnosticPath(value, index);
  const ownerRepo = readStringField(value, 'owner_repo');

  if (ownerRepo === null) {
    return [
      createDatastoreDiagnostic(
        `${datastorePath}.owner_repo`,
        'Datastore entry is missing required field `owner_repo`.'
      )
    ];
  }

  if (!repositoryIndex.byName.has(ownerRepo)) {
    return [
      createDatastoreDiagnostic(
        `${datastorePath}.owner_repo`,
        `Datastore references unknown owner repository \`${ownerRepo}\`.`
      )
    ];
  }

  return [];
}

function validateServiceDatastoreRecord(
  value: unknown,
  index: number,
  datastoreIndex: DatastoreIndex
): readonly Diagnostic[] {
  if (!isRecord(value)) {
    return [
      createServiceDatastoreDiagnostic(
        `services[${index}]`,
        'Service entry must be a YAML object.'
      )
    ];
  }

  const servicePath = getServiceDiagnosticPath(value, index);
  const directDatastoreAccess = value.direct_datastore_access;

  if (directDatastoreAccess === undefined) {
    return [];
  }

  if (!Array.isArray(directDatastoreAccess)) {
    return [
      createServiceDatastoreDiagnostic(
        `${servicePath}.direct_datastore_access`,
        '`direct_datastore_access` must be a YAML array when present.'
      )
    ];
  }

  return directDatastoreAccess.flatMap((datastoreId, datastoreIndexInService) => {
    const path = `${servicePath}.direct_datastore_access[${datastoreIndexInService}]`;

    if (typeof datastoreId !== 'string' || datastoreId.trim().length === 0) {
      return [
        createServiceDatastoreDiagnostic(
          path,
          'Direct datastore access entry must be a non-empty datastore id.'
        )
      ];
    }

    const normalizedDatastoreId = datastoreId.trim();

    if (!datastoreIndex.byId.has(normalizedDatastoreId)) {
      return [
        createServiceDatastoreDiagnostic(
          path,
          `Service references unknown datastore \`${normalizedDatastoreId}\`.`
        )
      ];
    }

    return [];
  });
}

function getDatastoreDiagnosticPath(value: Record<string, unknown>, index: number): string {
  const id = readStringField(value, 'id');

  return id === null ? `datastores[${index}]` : `datastores[${index}:${id}]`;
}

function getServiceDiagnosticPath(value: Record<string, unknown>, index: number): string {
  const id = readStringField(value, 'id');

  return id === null ? `services[${index}]` : `services[${index}:${id}]`;
}

function createDatastoreDiagnostic(path: string, message: string): Diagnostic {
  return {
    ruleId: 'ZDP-REF-003',
    severity: 'error',
    file: DATASTORES_FILE,
    path,
    message
  };
}

function createServiceDatastoreDiagnostic(path: string, message: string): Diagnostic {
  return {
    ruleId: 'ZDP-REF-002',
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
