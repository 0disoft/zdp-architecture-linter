import type { ArchitectureCatalogs } from './catalog-loader.ts';

export type ArchitectureGraphNodeKind =
  | 'repository'
  | 'service'
  | 'datastore'
  | 'dataClass'
  | 'event'
  | 'externalProvider';

export type ArchitectureGraphEdgeType =
  | 'service-owned-by-repository'
  | 'service-depends-on-service'
  | 'service-accesses-datastore'
  | 'service-depends-on-datastore'
  | 'service-uses-data-class'
  | 'service-uses-provider'
  | 'service-produces-event'
  | 'service-consumes-event'
  | 'datastore-owned-by-repository'
  | 'datastore-stores-data-class'
  | 'data-class-allows-datastore'
  | 'data-class-deleted-by-event'
  | 'event-owned-by-repository'
  | 'event-emitted-by-repository'
  | 'event-consumed-by-repository'
  | 'event-carries-data-class';

export interface ArchitectureGraphEndpoint {
  readonly kind: ArchitectureGraphNodeKind;
  readonly id: string;
}

export interface ArchitectureGraphEdge {
  readonly type: ArchitectureGraphEdgeType;
  readonly from: ArchitectureGraphEndpoint;
  readonly to: ArchitectureGraphEndpoint;
  readonly file:
    | 'catalogs/services.yaml'
    | 'catalogs/datastores.yaml'
    | 'catalogs/data-classes.yaml'
    | 'catalogs/events.yaml'
    | 'service.yaml';
  readonly path: string;
  readonly source: 'catalog' | 'repository-service-contract';
}

export function buildArchitectureGraphEdges(input: {
  readonly catalogs: ArchitectureCatalogs;
  readonly repositoryServiceContract?: unknown | null;
}): readonly ArchitectureGraphEdge[] {
  return [
    ...buildServiceEdges(input.catalogs.services, {
      file: 'catalogs/services.yaml',
      source: 'catalog'
    }),
    ...buildRepositoryServiceContractEdges(input.repositoryServiceContract ?? null),
    ...buildDatastoreEdges(input.catalogs.datastores),
    ...buildDataClassEdges(input.catalogs.dataClasses),
    ...buildEventEdges(input.catalogs.events)
  ];
}

function buildServiceEdges(
  value: unknown,
  source: {
    readonly file: 'catalogs/services.yaml' | 'service.yaml';
    readonly source: 'catalog' | 'repository-service-contract';
  }
): readonly ArchitectureGraphEdge[] {
  if (!isRecord(value) || !Array.isArray(value.services)) {
    return [];
  }

  return value.services.flatMap((service, index) => {
    if (!isRecord(service)) {
      return [];
    }

    const serviceId = readStringField(service, 'id');

    if (serviceId === null) {
      return [];
    }

    const servicePath = getCollectionPath(source.file, service, index, 'services');
    const from = endpoint('service', serviceId);

    return [
      ...readStringReferences(service, 'repo').map(({ value: repoId, path }) =>
        edge({
          type: 'service-owned-by-repository',
          from,
          to: endpoint('repository', repoId),
          file: source.file,
          path: joinPath(servicePath, path),
          source: source.source
        })
      ),
      ...readArrayReferences(service, 'dependencies').map(
        ({ value: dependencyId, path }) =>
          edge({
            type: 'service-depends-on-service',
            from,
            to: endpoint('service', dependencyId),
            file: source.file,
            path: joinPath(servicePath, path),
            source: source.source
          })
      ),
      ...readArrayReferences(service, 'dependencies.services').map(
        ({ value: dependencyId, path }) =>
          edge({
            type: 'service-depends-on-service',
            from,
            to: endpoint('service', dependencyId),
            file: source.file,
            path: joinPath(servicePath, path),
            source: source.source
          })
      ),
      ...readArrayReferences(service, 'direct_datastore_access').map(
        ({ value: datastoreId, path }) =>
          edge({
            type: 'service-accesses-datastore',
            from,
            to: endpoint('datastore', datastoreId),
            file: source.file,
            path: joinPath(servicePath, path),
            source: source.source
          })
      ),
      ...readArrayReferences(service, 'dependencies.datastores').map(
        ({ value: datastoreId, path }) =>
          edge({
            type: 'service-depends-on-datastore',
            from,
            to: endpoint('datastore', datastoreId),
            file: source.file,
            path: joinPath(servicePath, path),
            source: source.source
          })
      ),
      ...readArrayReferences(service, 'data.classes').map(
        ({ value: dataClassId, path }) =>
          edge({
            type: 'service-uses-data-class',
            from,
            to: endpoint('dataClass', dataClassId),
            file: source.file,
            path: joinPath(servicePath, path),
            source: source.source
          })
      ),
      ...readArrayReferences(service, 'external_dependencies').map(
        ({ value: providerId, path }) =>
          edge({
            type: 'service-uses-provider',
            from,
            to: endpoint('externalProvider', providerId),
            file: source.file,
            path: joinPath(servicePath, path),
            source: source.source
          })
      ),
      ...readProviderReferences(service).map(({ value: providerId, path }) =>
        edge({
          type: 'service-uses-provider',
          from,
          to: endpoint('externalProvider', providerId),
          file: source.file,
          path: joinPath(servicePath, path),
          source: source.source
        })
      ),
      ...readEventReferences(service, 'events.produced').map(
        ({ value: eventId, path }) =>
          edge({
            type: 'service-produces-event',
            from,
            to: endpoint('event', eventId),
            file: source.file,
            path: joinPath(servicePath, path),
            source: source.source
          })
      ),
      ...readEventReferences(service, 'events.consumed').map(
        ({ value: eventId, path }) =>
          edge({
            type: 'service-consumes-event',
            from,
            to: endpoint('event', eventId),
            file: source.file,
            path: joinPath(servicePath, path),
            source: source.source
          })
      )
    ];
  });
}

function buildRepositoryServiceContractEdges(
  value: unknown
): readonly ArchitectureGraphEdge[] {
  if (!isRecord(value)) {
    return [];
  }

  const service = isRecord(value.service) ? value.service : {};
  const serviceId = readStringField(service, 'id') ?? readStringField(value, 'id');

  if (serviceId === null) {
    return [];
  }

  const from = endpoint('service', serviceId);
  const canonicalRepoReferences = readStringReferences(service, 'repo').map(
    ({ value: repoId, path }) => ({
      value: repoId,
      path: joinPath('service', path)
    })
  );
  const repoReferences =
    canonicalRepoReferences.length > 0
      ? canonicalRepoReferences
      : readStringReferences(value, 'repo');

  return [
    ...repoReferences.map(({ value: repoId, path }) =>
      edge({
        type: 'service-owned-by-repository',
        from,
        to: endpoint('repository', repoId),
        file: 'service.yaml',
        path,
        source: 'repository-service-contract'
      })
    ),
    ...readArrayReferences(value, 'dependencies').map(
      ({ value: dependencyId, path }) =>
        edge({
          type: 'service-depends-on-service',
          from,
          to: endpoint('service', dependencyId),
          file: 'service.yaml',
          path,
          source: 'repository-service-contract'
        })
    ),
    ...readArrayReferences(value, 'dependencies.services').map(
      ({ value: dependencyId, path }) =>
        edge({
          type: 'service-depends-on-service',
          from,
          to: endpoint('service', dependencyId),
          file: 'service.yaml',
          path,
          source: 'repository-service-contract'
        })
    ),
    ...readArrayReferences(value, 'direct_datastore_access').map(
      ({ value: datastoreId, path }) =>
        edge({
          type: 'service-accesses-datastore',
          from,
          to: endpoint('datastore', datastoreId),
          file: 'service.yaml',
          path,
          source: 'repository-service-contract'
        })
    ),
    ...readArrayReferences(value, 'data.direct_datastore_access').map(
      ({ value: datastoreId, path }) =>
        edge({
          type: 'service-accesses-datastore',
          from,
          to: endpoint('datastore', datastoreId),
          file: 'service.yaml',
          path,
          source: 'repository-service-contract'
        })
    ),
    ...readArrayReferences(value, 'data.datastores').map(
      ({ value: datastoreId, path }) =>
        edge({
          type: 'service-accesses-datastore',
          from,
          to: endpoint('datastore', datastoreId),
          file: 'service.yaml',
          path,
          source: 'repository-service-contract'
        })
    ),
    ...readArrayReferences(value, 'dependencies.datastores').map(
      ({ value: datastoreId, path }) =>
        edge({
          type: 'service-depends-on-datastore',
          from,
          to: endpoint('datastore', datastoreId),
          file: 'service.yaml',
          path,
          source: 'repository-service-contract'
        })
    ),
    ...readArrayReferences(value, 'data.classes').map(
      ({ value: dataClassId, path }) =>
        edge({
          type: 'service-uses-data-class',
          from,
          to: endpoint('dataClass', dataClassId),
          file: 'service.yaml',
          path,
          source: 'repository-service-contract'
        })
    ),
    ...readArrayReferences(value, 'external_dependencies').map(
      ({ value: providerId, path }) =>
        edge({
          type: 'service-uses-provider',
          from,
          to: endpoint('externalProvider', providerId),
          file: 'service.yaml',
          path,
          source: 'repository-service-contract'
        })
    ),
    ...readProviderReferences(value).map(({ value: providerId, path }) =>
      edge({
        type: 'service-uses-provider',
        from,
        to: endpoint('externalProvider', providerId),
        file: 'service.yaml',
        path,
        source: 'repository-service-contract'
      })
    ),
    ...readEventReferences(value, 'events.produced').map(
      ({ value: eventId, path }) =>
        edge({
          type: 'service-produces-event',
          from,
          to: endpoint('event', eventId),
          file: 'service.yaml',
          path,
          source: 'repository-service-contract'
        })
    ),
    ...readEventReferences(value, 'events.consumed').map(
      ({ value: eventId, path }) =>
        edge({
          type: 'service-consumes-event',
          from,
          to: endpoint('event', eventId),
          file: 'service.yaml',
          path,
          source: 'repository-service-contract'
        })
    )
  ];
}

function buildDatastoreEdges(value: unknown): readonly ArchitectureGraphEdge[] {
  if (!isRecord(value) || !Array.isArray(value.datastores)) {
    return [];
  }

  return value.datastores.flatMap((datastore, index) => {
    if (!isRecord(datastore)) {
      return [];
    }

    const datastoreId = readStringField(datastore, 'id');

    if (datastoreId === null) {
      return [];
    }

    const datastorePath = getCollectionPath(
      'catalogs/datastores.yaml',
      datastore,
      index,
      'datastores'
    );
    const from = endpoint('datastore', datastoreId);

    return [
      ...readStringReferences(datastore, 'owner_repo').map(
        ({ value: repositoryId, path }) =>
          edge({
            type: 'datastore-owned-by-repository',
            from,
            to: endpoint('repository', repositoryId),
            file: 'catalogs/datastores.yaml',
            path: joinPath(datastorePath, path),
            source: 'catalog'
          })
      ),
      ...readArrayReferences(datastore, 'data_classes').map(
        ({ value: dataClassId, path }) =>
          edge({
            type: 'datastore-stores-data-class',
            from,
            to: endpoint('dataClass', dataClassId),
            file: 'catalogs/datastores.yaml',
            path: joinPath(datastorePath, path),
            source: 'catalog'
          })
      )
    ];
  });
}

function buildDataClassEdges(value: unknown): readonly ArchitectureGraphEdge[] {
  if (!isRecord(value) || !Array.isArray(value.data_classes)) {
    return [];
  }

  return value.data_classes.flatMap((dataClass, index) => {
    if (!isRecord(dataClass)) {
      return [];
    }

    const dataClassId = readStringField(dataClass, 'id');

    if (dataClassId === null) {
      return [];
    }

    const dataClassPath = getCollectionPath(
      'catalogs/data-classes.yaml',
      dataClass,
      index,
      'data_classes'
    );
    const from = endpoint('dataClass', dataClassId);

    return [
      ...readArrayReferences(dataClass, 'allowed_datastores').map(
        ({ value: datastoreId, path }) =>
          edge({
            type: 'data-class-allows-datastore',
            from,
            to: endpoint('datastore', datastoreId),
            file: 'catalogs/data-classes.yaml',
            path: joinPath(dataClassPath, path),
            source: 'catalog'
          })
      ),
      ...readArrayReferences(dataClass, 'deletion_events').map(
        ({ value: eventId, path }) =>
          edge({
            type: 'data-class-deleted-by-event',
            from,
            to: endpoint('event', eventId),
            file: 'catalogs/data-classes.yaml',
            path: joinPath(dataClassPath, path),
            source: 'catalog'
          })
      )
    ];
  });
}

function buildEventEdges(value: unknown): readonly ArchitectureGraphEdge[] {
  if (!isRecord(value) || !Array.isArray(value.events)) {
    return [];
  }

  return value.events.flatMap((eventValue, index) => {
    if (!isRecord(eventValue)) {
      return [];
    }

    const eventId = readStringField(eventValue, 'id');

    if (eventId === null) {
      return [];
    }

    const eventPath = getCollectionPath(
      'catalogs/events.yaml',
      eventValue,
      index,
      'events'
    );
    const from = endpoint('event', eventId);

    return [
      ...readStringReferences(eventValue, 'owner_repo').map(
        ({ value: repositoryId, path }) =>
          edge({
            type: 'event-owned-by-repository',
            from,
            to: endpoint('repository', repositoryId),
            file: 'catalogs/events.yaml',
            path: joinPath(eventPath, path),
            source: 'catalog'
          })
      ),
      ...readArrayReferences(eventValue, 'emitted_by').map(
        ({ value: repositoryId, path }) =>
          edge({
            type: 'event-emitted-by-repository',
            from,
            to: endpoint('repository', repositoryId),
            file: 'catalogs/events.yaml',
            path: joinPath(eventPath, path),
            source: 'catalog'
          })
      ),
      ...readArrayReferences(eventValue, 'consumed_by').map(
        ({ value: repositoryId, path }) =>
          edge({
            type: 'event-consumed-by-repository',
            from,
            to: endpoint('repository', repositoryId),
            file: 'catalogs/events.yaml',
            path: joinPath(eventPath, path),
            source: 'catalog'
          })
      ),
      ...readArrayReferences(eventValue, 'data_classes').map(
        ({ value: dataClassId, path }) =>
          edge({
            type: 'event-carries-data-class',
            from,
            to: endpoint('dataClass', dataClassId),
            file: 'catalogs/events.yaml',
            path: joinPath(eventPath, path),
            source: 'catalog'
          })
      )
    ];
  });
}

function edge(value: ArchitectureGraphEdge): ArchitectureGraphEdge {
  return value;
}

function endpoint(
  kind: ArchitectureGraphNodeKind,
  id: string
): ArchitectureGraphEndpoint {
  return { kind, id };
}

function readStringReferences(
  value: Record<string, unknown>,
  path: string
): ReadonlyArray<{ readonly value: string; readonly path: string }> {
  const candidate = readValueAtPath(value, path);

  return typeof candidate === 'string' && candidate.trim().length > 0
    ? [{ value: candidate.trim(), path }]
    : [];
}

function readArrayReferences(
  value: Record<string, unknown>,
  path: string
): ReadonlyArray<{ readonly value: string; readonly path: string }> {
  const candidate = readValueAtPath(value, path);

  if (!Array.isArray(candidate)) {
    return [];
  }

  return candidate.flatMap((entry, index) =>
    typeof entry === 'string' && entry.trim().length > 0
      ? [{ value: entry.trim(), path: `${path}[${index}]` }]
      : []
  );
}

function readProviderReferences(
  value: Record<string, unknown>
): ReadonlyArray<{ readonly value: string; readonly path: string }> {
  const providers = value.providers;

  if (!Array.isArray(providers)) {
    return [];
  }

  return providers.flatMap((provider, index) => {
    if (!isRecord(provider)) {
      return [];
    }

    const providerId = readStringField(provider, 'id');

    return providerId === null
      ? []
      : [{ value: providerId, path: `providers[${index}].id` }];
  });
}

function readEventReferences(
  value: Record<string, unknown>,
  path: string
): ReadonlyArray<{ readonly value: string; readonly path: string }> {
  const events = readValueAtPath(value, path);

  if (!Array.isArray(events)) {
    return [];
  }

  return events.flatMap((eventValue, index) => {
    if (typeof eventValue === 'string' && eventValue.trim().length > 0) {
      return [{ value: eventValue.trim(), path: `${path}[${index}]` }];
    }

    if (!isRecord(eventValue)) {
      return [];
    }

    const eventId = readStringField(eventValue, 'id');

    return eventId === null
      ? []
      : [{ value: eventId, path: `${path}[${index}].id` }];
  });
}

function getCollectionPath(
  file: ArchitectureGraphEdge['file'],
  value: Record<string, unknown>,
  index: number,
  collection: 'services' | 'datastores' | 'data_classes' | 'events'
): string {
  if (file === 'service.yaml') {
    return index === 0 ? 'service' : `services[${index}]`;
  }

  const id = readStringField(value, 'id');

  return id === null ? `${collection}[${index}]` : `${collection}[${index}:${id}]`;
}

function joinPath(basePath: string, fieldPath: string): string {
  return fieldPath.length === 0 ? basePath : `${basePath}.${fieldPath}`;
}

function readValueAtPath(value: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (!isRecord(current)) {
      return undefined;
    }

    return current[segment];
  }, value);
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
