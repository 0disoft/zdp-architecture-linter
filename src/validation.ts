import { loadArchitectureCatalogs } from './catalog-loader.ts';
import {
  buildDataClassIndex,
  validateDataClassAllowedDatastoreReferences,
  validateDataClassCatalog,
  validateDatastoreDataClassReferences
} from './data-class-rules.ts';
import {
  validateAiDirectNonOwnedDatastoreAccess,
  validateEdgeRuntimeDirectDatastoreAccess,
  validateProductLikeDirectSensitiveDatastoreAccess
} from './data-access-rules.ts';
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
  validateEventDataClassReferences,
  validateEventRepositoryReferences
} from './event-rules.ts';
import {
  buildExternalProviderIndex,
  validateExternalProviderCatalog,
  validateServiceExternalDependencyReferences
} from './provider-rules.ts';
import {
  buildMoneyMovementPolicy,
  validateMoneyMovementContracts
} from './money-rules.ts';
import {
  buildRepositoryAreaRules,
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
  const repositoryAreaRules = buildRepositoryAreaRules(catalogs.repositoryRules);
  const moneyMovementPolicy = buildMoneyMovementPolicy(catalogs.moneyRules);

  return {
    diagnostics: [
      ...validateRepositoriesCatalog(catalogs.repositories, repositoryAreaRules),
      ...validateDataClassCatalog(catalogs.dataClasses),
      ...validateDataClassAllowedDatastoreReferences(
        catalogs.dataClasses,
        datastoreIndex
      ),
      ...validateEventCatalog(catalogs.events),
      ...validateEventDataClassReferences(catalogs.events, dataClassIndex),
      ...validateEventRepositoryReferences(catalogs.events, repositoryIndex),
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
      ...validateProductLikeDirectSensitiveDatastoreAccess(
        catalogs.services,
        repositoryIndex,
        datastoreIndex
      ),
      ...validateAiDirectNonOwnedDatastoreAccess(
        catalogs.services,
        repositoryIndex,
        datastoreIndex
      ),
      ...validateEdgeRuntimeDirectDatastoreAccess(
        catalogs.services,
        datastoreIndex
      ),
      ...validateMoneyMovementContracts(catalogs.services, moneyMovementPolicy)
    ]
  };
}
