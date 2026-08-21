import {
  buildArchitectureGraph,
  type ArchitectureGraph
} from './architecture-graph.ts';
import type { ArchitectureCatalogs } from './catalog-loader.ts';
import {
  loadArchitectureCatalogSchemaPreflight,
  type ArchitectureCatalogSchemaPreflight
} from './catalog-schema-validation.ts';
import {
  loadRepositoryServiceContract,
  type RepositoryServiceContract
} from './service-schema-validation.ts';

export interface LoadValidationContextInput {
  readonly architectureRoot: string;
  readonly repositoryRoot?: string;
}

export interface CreateValidationContextInput extends LoadValidationContextInput {
  readonly catalogSchemaPreflight: ArchitectureCatalogSchemaPreflight;
  readonly repositoryServiceContract?: RepositoryServiceContract | null;
}

export interface ValidationContext {
  readonly architectureRoot: string;
  readonly repositoryRoot?: string;
  readonly catalogSchemaPreflight: ArchitectureCatalogSchemaPreflight;
  readonly catalogs: ArchitectureCatalogs;
  readonly getRepositoryServiceContract: () => Promise<
    RepositoryServiceContract | null
  >;
  readonly getGraph: () => Promise<ArchitectureGraph>;
}

/**
 * mf:anchor zdp.architecture-linter.validation-context
 * purpose: Share catalog preflight, repository service contract loading, and graph construction across one CLI command.
 * search: validation context, shared catalog load, shared service contract, memoized architecture graph
 * invariant: One context reads each source at most once and reuses the same graph without persisting stale state across commands.
 * risk: performance, data_consistency
 */
export async function loadValidationContext(
  input: LoadValidationContextInput
): Promise<ValidationContext> {
  const catalogSchemaPreflight = await loadArchitectureCatalogSchemaPreflight(
    input.architectureRoot
  );

  return createValidationContext({
    ...input,
    catalogSchemaPreflight
  });
}

export function createValidationContext(
  input: CreateValidationContextInput
): ValidationContext {
  let repositoryServiceContractPromise:
    | Promise<RepositoryServiceContract | null>
    | undefined =
    input.repositoryServiceContract === undefined
      ? undefined
      : Promise.resolve(input.repositoryServiceContract);
  let graphPromise: Promise<ArchitectureGraph> | undefined;

  const getRepositoryServiceContract = (): Promise<
    RepositoryServiceContract | null
  > =>
    (repositoryServiceContractPromise ??=
      input.repositoryRoot === undefined
        ? Promise.resolve(null)
        : loadRepositoryServiceContract(input.repositoryRoot));

  const getGraph = (): Promise<ArchitectureGraph> =>
    (graphPromise ??= getRepositoryServiceContract().then(
      (repositoryServiceContract) =>
        buildArchitectureGraph({
          catalogs: input.catalogSchemaPreflight.catalogs,
          repositoryServiceContract: repositoryServiceContract?.value ?? null
        })
    ));

  return {
    architectureRoot: input.architectureRoot,
    repositoryRoot: input.repositoryRoot,
    catalogSchemaPreflight: input.catalogSchemaPreflight,
    catalogs: input.catalogSchemaPreflight.catalogs,
    getRepositoryServiceContract,
    getGraph
  };
}
