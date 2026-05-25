import { loadArchitectureCatalogs } from './catalog-loader.ts';
import {
  buildDataClassIndex,
  validateDataClassAllowedDatastoreReferences,
  validateDataClassCatalog,
  validateDatastoreDataClassReferences
} from './data-class-rules.ts';
import { validateEdgeRuntimeDirectDatastoreAccess } from './data-access-rules.ts';
import {
  buildDatastoreIndex,
  validateDatastoreOwnerReferences,
  validateServiceDatastoreReferences
} from './datastore-rules.ts';
import type { ValidationResult } from './diagnostics.ts';
import {
  buildEventIndex,
  validateDataClassDeletionEventReferences,
  validateEventCatalog,
  validateEventDataClassReferences
} from './event-rules.ts';
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
  const dataClassIndex = buildDataClassIndex(catalogs.dataClasses);
  const eventIndex = buildEventIndex(catalogs.events);
  const serviceIndex = buildServiceIndex(catalogs.services);
  const externalProviderIndex = buildExternalProviderIndex(catalogs.externalProviders);

  return {
    diagnostics: [
      ...validateRepositoriesCatalog(catalogs.repositories),
      ...validateDataClassCatalog(catalogs.dataClasses),
      ...validateDataClassAllowedDatastoreReferences(
        catalogs.dataClasses,
        datastoreIndex
      ),
      ...validateEventCatalog(catalogs.events),
      ...validateEventDataClassReferences(catalogs.events, dataClassIndex),
      ...validateDataClassDeletionEventReferences(catalogs.dataClasses, eventIndex),
      ...validateExternalProviderCatalog(catalogs.externalProviders),
      ...validateServiceRepositoryReferences(catalogs.services, repositoryIndex),
      ...validateServiceDependencyReferences(catalogs.services, serviceIndex),
      ...validateDatastoreOwnerReferences(catalogs.datastores, repositoryIndex),
      ...validateDatastoreDataClassReferences(catalogs.datastores, dataClassIndex),
      ...validateServiceDatastoreReferences(catalogs.services, datastoreIndex),
      ...validateServiceExternalDependencyReferences(
        catalogs.services,
        externalProviderIndex
      ),
      ...validateEdgeRuntimeDirectDatastoreAccess(catalogs.services, datastoreIndex)
    ]
  };
}
