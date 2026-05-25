import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';

export interface ArchitectureCatalogs {
  readonly repositories: RepositoriesCatalog;
}

export interface RepositoriesCatalog {
  readonly repositories?: unknown;
}

export async function loadArchitectureCatalogs(
  architectureRoot: string
): Promise<ArchitectureCatalogs> {
  return {
    repositories: await loadYamlFile<RepositoriesCatalog>(
      architectureRoot,
      'catalogs/repositories.yaml'
    )
  };
}

async function loadYamlFile<T>(root: string, relativePath: string): Promise<T> {
  const source = await readFile(join(root, relativePath), 'utf8');
  const parsed = parse(source) as unknown;

  return parsed as T;
}

