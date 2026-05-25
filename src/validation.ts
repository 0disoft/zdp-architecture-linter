import { loadArchitectureCatalogs } from './catalog-loader.ts';
import { validateEdgeRuntimeDirectDatastoreAccess } from './data-access-rules.ts';
import {
  buildDatastoreIndex,
  validateDatastoreOwnerReferences,
  validateServiceDatastoreReferences
} from './datastore-rules.ts';
import type { ValidationResult } from './diagnostics.ts';
import {
  buildRepositoryIndex,
  validateRepositoriesCatalog
} from './repository-rules.ts';
import { validateServiceRepositoryReferences } from './service-rules.ts';

export interface ValidateArchitectureInput {
  readonly architectureRoot: string;
}

export async function validateArchitecture(
  input: ValidateArchitectureInput
): Promise<ValidationResult> {
  const catalogs = await loadArchitectureCatalogs(input.architectureRoot);
  const repositoryIndex = buildRepositoryIndex(catalogs.repositories);
  const datastoreIndex = buildDatastoreIndex(catalogs.datastores);

  return {
    diagnostics: [
      ...validateRepositoriesCatalog(catalogs.repositories),
      ...validateServiceRepositoryReferences(catalogs.services, repositoryIndex),
      ...validateDatastoreOwnerReferences(catalogs.datastores, repositoryIndex),
      ...validateServiceDatastoreReferences(catalogs.services, datastoreIndex),
      ...validateEdgeRuntimeDirectDatastoreAccess(catalogs.services, datastoreIndex)
    ]
  };
}
