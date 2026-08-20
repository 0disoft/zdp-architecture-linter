import type { Diagnostic } from './diagnostics.ts';
import type {
  RepositoryCatalogRecord,
  RepositoryIndex
} from './repository-rules.ts';

const DATASTORES_FILE = 'catalogs/datastores.yaml';
const SERVICES_FILE = 'catalogs/services.yaml';
const ALLOWED_DATASTORE_KINDS = new Set([
  'clickhouse',
  'key-value-store',
  'postgresql',
  'search-engine',
  'secure-storage',
  'object-storage',
  'sqlite',
  'vector-database'
]);
const DEPLOY_UNIT_KIND = 'deploy_unit';
const LOGICAL_BOUNDARY_KIND = 'logical_boundary';

export interface DatastoreCatalogRecord {
  readonly id: string;
  readonly status: string | null;
  readonly kind: string | null;
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
        status: readStringField(datastore, 'status'),
        kind: readStringField(datastore, 'kind'),
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
  const kind = readStringField(value, 'kind');
  const ownerRepo = readStringField(value, 'owner_repo');
  const diagnostics: Diagnostic[] = [];

  if (kind === null) {
    diagnostics.push(
      createDatastoreDiagnostic(
        `${datastorePath}.kind`,
        'Datastore entry is missing required field `kind`.'
      )
    );
  } else if (!ALLOWED_DATASTORE_KINDS.has(kind)) {
    diagnostics.push(
      createDatastoreDiagnostic(
        `${datastorePath}.kind`,
        `Datastore kind must be one of: ${[...ALLOWED_DATASTORE_KINDS]
          .map((allowedKind) => `\`${allowedKind}\``)
          .join(', ')}.`
      )
    );
  }

  if (ownerRepo === null) {
    diagnostics.push(
      createDatastoreDiagnostic(
        `${datastorePath}.owner_repo`,
        'Datastore entry is missing required field `owner_repo`.'
      )
    );
  } else {
    diagnostics.push(
      ...validateRepositoryReference({
        repositoryId: ownerRepo,
        fieldPath: `${datastorePath}.owner_repo`,
        fieldName: 'owner repository',
        repositoryIndex
      })
    );
  }

  diagnostics.push(
    ...validateDeployOwnerReference(value, datastorePath, repositoryIndex),
    ...validateLogicalOwnerReferences(value, datastorePath, repositoryIndex)
  );

  return diagnostics;
}

function validateDeployOwnerReference(
  value: Record<string, unknown>,
  datastorePath: string,
  repositoryIndex: RepositoryIndex
): readonly Diagnostic[] {
  const deployOwnerRepo = readStringField(value, 'deploy_owner_repo');

  if (deployOwnerRepo === null) {
    return [];
  }

  return validateRepositoryReference({
    repositoryId: deployOwnerRepo,
    fieldPath: `${datastorePath}.deploy_owner_repo`,
    fieldName: 'deploy owner repository',
    repositoryIndex,
    expectedKind: DEPLOY_UNIT_KIND
  });
}

function validateLogicalOwnerReferences(
  value: Record<string, unknown>,
  datastorePath: string,
  repositoryIndex: RepositoryIndex
): readonly Diagnostic[] {
  return [
    ...validateLogicalOwnerComponentReference(value, datastorePath, repositoryIndex),
    ...validateLogicalOwnerComponentsReference(value, datastorePath, repositoryIndex)
  ];
}

function validateLogicalOwnerComponentReference(
  value: Record<string, unknown>,
  datastorePath: string,
  repositoryIndex: RepositoryIndex
): readonly Diagnostic[] {
  const logicalOwnerComponent = readStringField(value, 'logical_owner_component');

  if (logicalOwnerComponent === null) {
    return [];
  }

  return validateRepositoryReference({
    repositoryId: logicalOwnerComponent,
    fieldPath: `${datastorePath}.logical_owner_component`,
    fieldName: 'logical owner component',
    repositoryIndex,
    expectedKind: LOGICAL_BOUNDARY_KIND,
    requireDbBoundary: true
  });
}

function validateLogicalOwnerComponentsReference(
  value: Record<string, unknown>,
  datastorePath: string,
  repositoryIndex: RepositoryIndex
): readonly Diagnostic[] {
  const logicalOwnerComponents = value.logical_owner_components;

  if (logicalOwnerComponents === undefined) {
    return [];
  }

  if (!Array.isArray(logicalOwnerComponents)) {
    return [
      createDatastoreDiagnostic(
        `${datastorePath}.logical_owner_components`,
        '`logical_owner_components` must be a YAML array when present.'
      )
    ];
  }

  return logicalOwnerComponents.flatMap((logicalOwnerComponent, componentIndex) => {
    const path = `${datastorePath}.logical_owner_components[${componentIndex}]`;

    if (
      typeof logicalOwnerComponent !== 'string' ||
      logicalOwnerComponent.trim().length === 0
    ) {
      return [
        createDatastoreDiagnostic(
          path,
          'Logical owner component entry must be a non-empty repository id.'
        )
      ];
    }

    return validateRepositoryReference({
      repositoryId: logicalOwnerComponent.trim(),
      fieldPath: path,
      fieldName: 'logical owner component',
      repositoryIndex,
      expectedKind: LOGICAL_BOUNDARY_KIND,
      requireDbBoundary: true
    });
  });
}

function validateRepositoryReference(input: {
  readonly repositoryId: string;
  readonly fieldPath: string;
  readonly fieldName: string;
  readonly repositoryIndex: RepositoryIndex;
  readonly expectedKind?: string;
  readonly requireDbBoundary?: boolean;
}): readonly Diagnostic[] {
  const repository = input.repositoryIndex.byName.get(input.repositoryId);

  if (repository === undefined) {
    return [
      createDatastoreDiagnostic(
        input.fieldPath,
        `Datastore references unknown ${input.fieldName} \`${input.repositoryId}\`.`
      )
    ];
  }

  const diagnostics: Diagnostic[] = [];

  if (
    input.expectedKind !== undefined &&
    repository.kind !== input.expectedKind
  ) {
    diagnostics.push(
      createDatastoreDiagnostic(
        input.fieldPath,
        `Datastore ${input.fieldName} \`${input.repositoryId}\` must have repository kind \`${input.expectedKind}\`, found \`${repository.kind ?? 'missing'}\`.`
      )
    );
  }

  if (input.requireDbBoundary === true) {
    diagnostics.push(...validateRepositoryDbBoundary(repository, input.fieldPath));
  }

  return diagnostics;
}

function validateRepositoryDbBoundary(
  repository: RepositoryCatalogRecord,
  fieldPath: string
): readonly Diagnostic[] {
  const securityBoundary = repository.securityBoundary;

  if (
    securityBoundary !== null &&
    securityBoundary.dbSchema !== null &&
    securityBoundary.dbRole !== null
  ) {
    return [];
  }

  return [
    createDatastoreDiagnostic(
      fieldPath,
      `Datastore logical owner component \`${repository.name}\` must declare security_boundary.db_schema and security_boundary.db_role.`
    )
  ];
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
