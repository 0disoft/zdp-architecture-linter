import type { ArchitectureCatalogs } from './catalog-loader.ts';
import {
  buildDataClassIndex,
  type DataClassIndex,
  type DataClassRecord
} from './data-class-rules.ts';
import {
  buildDatastoreIndex,
  type DatastoreCatalogRecord,
  type DatastoreIndex
} from './datastore-rules.ts';
import {
  buildEventIndex,
  type EventIndex,
  type EventRecord
} from './event-rules.ts';
import {
  buildExternalProviderIndex,
  type ExternalProviderIndex,
  type ExternalProviderRecord
} from './provider-rules.ts';
import {
  buildRepositoryIndex,
  type RepositoryCatalogRecord,
  type RepositoryIndex
} from './repository-rules.ts';
import {
  buildRepositoryServiceContractCatalog
} from './service-contract-policy-rules.ts';
import {
  buildServiceIndex,
  type ServiceCatalogRecord,
  type ServiceIndex
} from './service-rules.ts';

export type ArchitectureNodeSource =
  | 'catalog'
  | 'repository-service-contract';

export interface ArchitectureGraph {
  readonly catalogs: ArchitectureCatalogs;
  readonly indexes: ArchitectureGraphIndexes;
  readonly nodes: ArchitectureGraphNodes;
  readonly repositoryServiceContractCatalog: {
    readonly services: readonly unknown[];
  } | null;
}

export interface ArchitectureGraphIndexes {
  readonly repositories: RepositoryIndex;
  readonly services: ServiceIndex;
  readonly datastores: DatastoreIndex;
  readonly dataClasses: DataClassIndex;
  readonly events: EventIndex;
  readonly externalProviders: ExternalProviderIndex;
}

export interface ArchitectureGraphNodes {
  readonly repositories: readonly RepositoryGraphNode[];
  readonly services: readonly ServiceGraphNode[];
  readonly datastores: readonly DatastoreGraphNode[];
  readonly dataClasses: readonly DataClassGraphNode[];
  readonly events: readonly EventGraphNode[];
  readonly externalProviders: readonly ExternalProviderGraphNode[];
}

export interface RepositoryGraphNode {
  readonly id: string;
  readonly file: 'catalogs/repositories.yaml';
  readonly path: string;
  readonly source: 'catalog';
  readonly area: string | null;
  readonly kind: string | null;
  readonly repoStage: string | null;
}

export interface ServiceGraphNode {
  readonly id: string;
  readonly file: 'catalogs/services.yaml' | 'service.yaml';
  readonly path: string;
  readonly source: ArchitectureNodeSource;
  readonly repo: string | null;
}

export interface DatastoreGraphNode {
  readonly id: string;
  readonly file: 'catalogs/datastores.yaml';
  readonly path: string;
  readonly source: 'catalog';
  readonly kind: string | null;
  readonly ownerRepo: string | null;
}

export interface DataClassGraphNode {
  readonly id: string;
  readonly file: 'catalogs/data-classes.yaml';
  readonly path: string;
  readonly source: 'catalog';
}

export interface EventGraphNode {
  readonly id: string;
  readonly file: 'catalogs/events.yaml';
  readonly path: string;
  readonly source: 'catalog';
}

export interface ExternalProviderGraphNode {
  readonly id: string;
  readonly file: 'catalogs/external-providers.yaml';
  readonly path: string;
  readonly source: 'catalog';
}

export function buildArchitectureGraph(input: {
  readonly catalogs: ArchitectureCatalogs;
  readonly repositoryServiceContract?: unknown | null;
}): ArchitectureGraph {
  const repositoryServiceContractCatalog =
    input.repositoryServiceContract === undefined ||
    input.repositoryServiceContract === null
      ? null
      : buildRepositoryServiceContractCatalog(input.repositoryServiceContract);
  const indexes = {
    repositories: buildRepositoryIndex(input.catalogs.repositories),
    services: buildServiceIndex(input.catalogs.services),
    datastores: buildDatastoreIndex(input.catalogs.datastores),
    dataClasses: buildDataClassIndex(input.catalogs.dataClasses),
    events: buildEventIndex(input.catalogs.events),
    externalProviders: buildExternalProviderIndex(input.catalogs.externalProviders)
  };

  return {
    catalogs: input.catalogs,
    indexes,
    nodes: {
      repositories: buildRepositoryNodes(indexes.repositories),
      services: [
        ...buildCatalogServiceNodes(indexes.services),
        ...buildRepositoryServiceContractNodes(repositoryServiceContractCatalog)
      ],
      datastores: buildDatastoreNodes(indexes.datastores),
      dataClasses: buildDataClassNodes(indexes.dataClasses),
      events: buildEventNodes(indexes.events),
      externalProviders: buildExternalProviderNodes(indexes.externalProviders)
    },
    repositoryServiceContractCatalog
  };
}

function buildRepositoryNodes(
  index: RepositoryIndex
): readonly RepositoryGraphNode[] {
  return Array.from(index.byName.values()).map(
    (record: RepositoryCatalogRecord) => ({
      id: record.name,
      file: 'catalogs/repositories.yaml',
      path: record.path,
      source: 'catalog',
      area: record.area,
      kind: record.kind,
      repoStage: record.repoStage
    })
  );
}

function buildCatalogServiceNodes(index: ServiceIndex): readonly ServiceGraphNode[] {
  return Array.from(index.byId.values()).map((record: ServiceCatalogRecord) => ({
    id: record.id,
    file: 'catalogs/services.yaml',
    path: record.path,
    source: 'catalog',
    repo: record.repo
  }));
}

function buildRepositoryServiceContractNodes(
  catalog: { readonly services: readonly unknown[] } | null
): readonly ServiceGraphNode[] {
  if (catalog === null) {
    return [];
  }

  return catalog.services.flatMap((service, index) => {
    if (!isRecord(service)) {
      return [];
    }

    const id = readStringField(service, 'id');

    if (id === null) {
      return [];
    }

    return [
      {
        id,
        file: 'service.yaml',
        path: index === 0 ? 'service' : `services[${index}]`,
        source: 'repository-service-contract',
        repo: readStringField(service, 'repo')
      }
    ];
  });
}

function buildDatastoreNodes(index: DatastoreIndex): readonly DatastoreGraphNode[] {
  return Array.from(index.byId.values()).map(
    (record: DatastoreCatalogRecord) => ({
      id: record.id,
      file: 'catalogs/datastores.yaml',
      path: record.path,
      source: 'catalog',
      kind: record.kind,
      ownerRepo: record.ownerRepo
    })
  );
}

function buildDataClassNodes(index: DataClassIndex): readonly DataClassGraphNode[] {
  return Array.from(index.byId.values()).map((record: DataClassRecord) => ({
    id: record.id,
    file: 'catalogs/data-classes.yaml',
    path: record.path,
    source: 'catalog'
  }));
}

function buildEventNodes(index: EventIndex): readonly EventGraphNode[] {
  return Array.from(index.byId.values()).map((record: EventRecord) => ({
    id: record.id,
    file: 'catalogs/events.yaml',
    path: record.path,
    source: 'catalog'
  }));
}

function buildExternalProviderNodes(
  index: ExternalProviderIndex
): readonly ExternalProviderGraphNode[] {
  return Array.from(index.byId.values()).map(
    (record: ExternalProviderRecord) => ({
      id: record.id,
      file: 'catalogs/external-providers.yaml',
      path: record.path,
      source: 'catalog'
    })
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
