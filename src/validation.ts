import { loadArchitectureCatalogs } from './catalog-loader.ts';
import { validateEdgeRuntimeDirectDatastoreAccess } from './data-access-rules.ts';
import {
  buildDatastoreIndex,
  validateDatastoreOwnerReferences,
  validateServiceDatastoreReferences
} from './datastore-rules.ts';
import type { ValidationResult } from './diagnostics.ts';
import {
  buildExternalProviderIndex,
  validateExternalProviderCatalog,
  validateServiceExternalDependencyReferences
} from './provider-rules.ts';
import {
  buildRepositoryIndex,
  validateRepositoriesCatalog
} from './repository-rules.ts';
import {
  buildServiceIndex,
  validateServiceDependencyReferences,
  validateServiceRepositoryReferences
} from './service-rules.ts';

export interface ValidateArchitectureInput {
  readonly architectureRoot: string;
}

export async function validateArchitecture(
  input: ValidateArchitectureInput
): Promise<ValidationResult> {
  const catalogs = await loadArchitectureCatalogs(input.architectureRoot);
  const repositoryIndex = buildRepositoryIndex(catalogs.repositories);
  const datastoreIndex = buildDatastoreIndex(catalogs.datastores);
  const serviceIndex = buildServiceIndex(catalogs.services);
  const externalProviderIndex = buildExternalProviderIndex(catalogs.externalProviders);

  return {
    diagnostics: [
      ...validateRepositoriesCatalog(catalogs.repositories),
      ...validateExternalProviderCatalog(catalogs.externalProviders),
      ...validateServiceRepositoryReferences(catalogs.services, repositoryIndex),
      ...validateServiceDependencyReferences(catalogs.services, serviceIndex),
      ...validateDatastoreOwnerReferences(catalogs.datastores, repositoryIndex),
      ...validateServiceDatastoreReferences(catalogs.services, datastoreIndex),
      ...validateServiceExternalDependencyReferences(
        catalogs.services,
        externalProviderIndex
      ),
      ...validateEdgeRuntimeDirectDatastoreAccess(catalogs.services, datastoreIndex)
    ]
  };
}
