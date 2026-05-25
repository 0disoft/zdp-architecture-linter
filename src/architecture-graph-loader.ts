import { buildArchitectureGraph, type ArchitectureGraph } from './architecture-graph.ts';
import { loadArchitectureCatalogs } from './catalog-loader.ts';
import { loadRepositoryServiceContract } from './service-schema-validation.ts';

export interface LoadArchitectureGraphInput {
  readonly architectureRoot: string;
  readonly repositoryRoot?: string;
}

export async function loadArchitectureGraph(
  input: LoadArchitectureGraphInput
): Promise<ArchitectureGraph> {
  const catalogs = await loadArchitectureCatalogs(input.architectureRoot);
  const repositoryServiceContract =
    input.repositoryRoot === undefined
      ? null
      : await loadRepositoryServiceContract(input.repositoryRoot);

  return buildArchitectureGraph({
    catalogs,
    repositoryServiceContract: repositoryServiceContract?.value ?? null
  });
}
