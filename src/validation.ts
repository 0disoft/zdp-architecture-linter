import { loadArchitectureCatalogs } from './catalog-loader.ts';
import {
  buildAiSensitiveDataPolicy,
  buildAiUserDataPolicy,
  validateAiSensitiveDataContracts,
  validateAiUserDataContracts
} from './ai-contract-rules.ts';
import {
  buildPublicApiContractPolicy,
  validatePublicApiContracts
} from './api-rules.ts';
import {
  buildDataClassIndex,
  buildServiceDataCatalogPolicy,
  buildServiceDataOwnershipPolicy,
  validateDataClassAllowedDatastoreReferences,
  validateDataClassCatalog,
  validateDatastoreDataClassReferences,
  validateServiceDataCatalogReferences,
  validateServiceDataOwnershipContracts
} from './data-class-rules.ts';
import {
  buildLedgerDatastoreDependencyPolicy,
  validateAiDirectNonOwnedDatastoreAccess,
  validateEdgeRuntimeDirectDatastoreAccess,
  validateLedgerDatastoreDependencyAccess,
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
  buildProviderContractPolicy,
  buildExternalProviderIndex,
  buildProviderWebhookPolicy,
  validateExternalProviderCatalog,
  validateServiceExternalDependencyReferences,
  validateServiceProviderContracts,
  validateServiceProviderWebhooks
} from './provider-rules.ts';
import {
  buildCreditMonetizationPolicy,
  buildMoneyMovementPolicy,
  buildPaymentDataFrontendPolicy,
  validateCreditMonetizationContracts,
  validateMoneyMovementContracts,
  validatePaymentDataFrontendContracts
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
import {
  buildTierCriticalControlsPolicy,
  buildTierOperationalContractPolicy,
  validateTierCriticalControls,
  validateTierOperationalContracts
} from './tier-rules.ts';

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
  const paymentDataFrontendPolicy = buildPaymentDataFrontendPolicy(
    catalogs.moneyRules
  );
  const creditMonetizationPolicy = buildCreditMonetizationPolicy(
    catalogs.moneyRules
  );
  const providerContractPolicy = buildProviderContractPolicy(catalogs.providerRules);
  const providerWebhookPolicy = buildProviderWebhookPolicy(catalogs.providerRules);
  const serviceDataCatalogPolicy = buildServiceDataCatalogPolicy(
    catalogs.dataAccessRules
  );
  const serviceDataOwnershipPolicy = buildServiceDataOwnershipPolicy(
    catalogs.dataAccessRules
  );
  const ledgerDatastoreDependencyPolicy = buildLedgerDatastoreDependencyPolicy(
    catalogs.dataAccessRules
  );
  const aiUserDataPolicy = buildAiUserDataPolicy(catalogs.aiDataAccessRules);
  const aiSensitiveDataPolicy = buildAiSensitiveDataPolicy(
    catalogs.aiDataAccessRules
  );
  const tierOperationalContractPolicy = buildTierOperationalContractPolicy(
    catalogs.tierRules
  );
  const tierCriticalControlsPolicy = buildTierCriticalControlsPolicy(
    catalogs.tierRules
  );
  const publicApiContractPolicy = buildPublicApiContractPolicy(catalogs.tierRules);

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
      ...validateServiceDataCatalogReferences(
        catalogs.services,
        serviceDataCatalogPolicy,
        dataClassIndex,
        datastoreIndex
      ),
      ...validateServiceDataOwnershipContracts(
        catalogs.services,
        serviceDataOwnershipPolicy
      ),
      ...validateServiceExternalDependencyReferences(
        catalogs.services,
        externalProviderIndex
      ),
      ...validateServiceProviderContracts(
        catalogs.services,
        providerContractPolicy
      ),
      ...validateServiceProviderWebhooks(
        catalogs.services,
        providerWebhookPolicy
      ),
      ...validateAiUserDataContracts(catalogs.services, aiUserDataPolicy),
      ...validateAiSensitiveDataContracts(
        catalogs.services,
        aiSensitiveDataPolicy
      ),
      ...validateProductLikeDirectSensitiveDatastoreAccess(
        catalogs.services,
        repositoryIndex,
        datastoreIndex
      ),
      ...validateLedgerDatastoreDependencyAccess(
        catalogs.services,
        ledgerDatastoreDependencyPolicy
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
      ...validateMoneyMovementContracts(catalogs.services, moneyMovementPolicy),
      ...validatePaymentDataFrontendContracts(
        catalogs.services,
        paymentDataFrontendPolicy
      ),
      ...validateCreditMonetizationContracts(
        catalogs.services,
        creditMonetizationPolicy
      ),
      ...validateTierOperationalContracts(
        catalogs.services,
        tierOperationalContractPolicy
      ),
      ...validateTierCriticalControls(
        catalogs.services,
        tierCriticalControlsPolicy
      ),
      ...validatePublicApiContracts(
        catalogs.services,
        publicApiContractPolicy
      )
    ]
  };
}
