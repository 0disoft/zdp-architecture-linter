import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';

export interface ArchitectureCatalogs {
  readonly repositories: RepositoriesCatalog;
  readonly services: ServicesCatalog;
  readonly datastores: DatastoresCatalog;
  readonly dataClasses: DataClassesCatalog;
  readonly externalProviders: ExternalProvidersCatalog;
}

export interface RepositoriesCatalog {
  readonly repositories?: unknown;
}

export interface ServicesCatalog {
  readonly services?: unknown;
}

export interface DatastoresCatalog {
  readonly datastores?: unknown;
}

export interface DataClassesCatalog {
  readonly data_classes?: unknown;
}

export interface ExternalProvidersCatalog {
  readonly providers?: unknown;
}

export async function loadArchitectureCatalogs(
  architectureRoot: string
): Promise<ArchitectureCatalogs> {
  return {
    repositories: await loadYamlFile<RepositoriesCatalog>(
      architectureRoot,
      'catalogs/repositories.yaml'
    ),
    services: await loadYamlFile<ServicesCatalog>(
      architectureRoot,
      'catalogs/services.yaml'
    ),
    datastores: await loadYamlFile<DatastoresCatalog>(
      architectureRoot,
      'catalogs/datastores.yaml'
    ),
    dataClasses: await loadYamlFile<DataClassesCatalog>(
      architectureRoot,
      'catalogs/data-classes.yaml'
    ),
    externalProviders: await loadYamlFile<ExternalProvidersCatalog>(
      architectureRoot,
      'catalogs/external-providers.yaml'
    )
  };
}

async function loadYamlFile<T>(root: string, relativePath: string): Promise<T> {
  const source = await readFile(join(root, relativePath), 'utf8');
  const parsed = parse(source) as unknown;

  return parsed as T;
}
