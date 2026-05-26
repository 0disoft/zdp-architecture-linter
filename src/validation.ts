import { loadArchitectureCatalogs } from './catalog-loader.ts';
import { buildArchitectureGraph } from './architecture-graph.ts';
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
  validateDatastoreOwnerReferences,
  validateServiceDatastoreReferences
} from './datastore-rules.ts';
import type { ValidationResult } from './diagnostics.ts';
import {
  validateDataClassDeletionEventReferences,
  validateEventCatalog,
  validateEventDataClassReferences,
  validateEventRepositoryReferences
} from './event-rules.ts';
import { validateFixtureExpectations } from './fixture-validation.ts';
import {
  buildProviderContractPolicy,
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
  type RepositoryRoadmapEvidence,
  validateRepositoriesCatalog
} from './repository-rules.ts';
import {
  validateServiceDependencyReferences,
  validateRepositoryServiceContractRepositoryReference,
  validateRepositoryServiceContractServiceCatalogReference,
  validateServiceRepositoryReferences
} from './service-rules.ts';
import {
  validateRepositoryServiceContractDataReferences,
  validateRepositoryServiceContractEventReferences,
  validateRepositoryServiceContractProviderReferences
} from './service-contract-reference-rules.ts';
import {
  mapServiceCatalogDiagnosticsToRepositoryServiceContract
} from './service-contract-policy-rules.ts';
import {
  loadRepositoryServiceContract,
  validateRepositoryServiceContract,
  validateServiceSchemaFixtures
} from './service-schema-validation.ts';
import {
  buildTierCriticalControlsPolicy,
  buildTierOperationalContractPolicy,
  buildTier3RiskyExperimentPolicy,
  validateTierCriticalControls,
  validateTierOperationalContracts,
  validateTier3RiskyExperimentContracts
} from './tier-rules.ts';

export interface ValidateArchitectureInput {
  readonly architectureRoot: string;
  readonly repositoryRoot?: string;
}

export async function validateArchitecture(
  input: ValidateArchitectureInput
): Promise<ValidationResult> {
  const catalogs = await loadArchitectureCatalogs(input.architectureRoot);
  const repositoryServiceContract =
    input.repositoryRoot === undefined
      ? null
      : await loadRepositoryServiceContract(input.repositoryRoot);
  const graph = buildArchitectureGraph({
    catalogs,
    repositoryServiceContract: repositoryServiceContract?.value ?? null
  });
  const {
    repositories: repositoryIndex,
    datastores: datastoreIndex,
    dataClasses: dataClassIndex,
    events: eventIndex,
    services: serviceIndex,
    externalProviders: externalProviderIndex
  } = graph.indexes;
  const repositoryAreaRules = buildRepositoryAreaRules(catalogs.repositoryRules);
  const repositoryRoadmapEvidence: RepositoryRoadmapEvidence = {
    text: catalogs.repositoryRoadmapText ?? ''
  };
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
  const tier3RiskyExperimentPolicy = buildTier3RiskyExperimentPolicy(
    catalogs.tierRules
  );
  const publicApiContractPolicy = buildPublicApiContractPolicy(catalogs.tierRules);

  const fixtureDiagnostics = await validateFixtureExpectations({
    architectureRoot: input.architectureRoot,
    repositoryIndex,
    datastoreIndex,
    ledgerDatastoreDependencyPolicy,
    aiUserDataPolicy,
    aiSensitiveDataPolicy,
    moneyMovementPolicy,
    paymentDataFrontendPolicy,
    creditMonetizationPolicy,
    providerContractPolicy,
    providerWebhookPolicy,
    tierOperationalContractPolicy,
    tierCriticalControlsPolicy,
    tier3RiskyExperimentPolicy,
    publicApiContractPolicy
  });
  const serviceSchemaDiagnostics = await validateServiceSchemaFixtures(
    input.architectureRoot
  );
  const repositoryServiceDiagnostics =
    input.repositoryRoot === undefined
      ? []
      : await validateRepositoryServiceContract({
          architectureRoot: input.architectureRoot,
          repositoryRoot: input.repositoryRoot
        });
  const repositoryServiceContractCatalog = graph.repositoryServiceContractCatalog;
  const repositoryServicePolicyDiagnostics =
    repositoryServiceContractCatalog === null
      ? []
      : mapServiceCatalogDiagnosticsToRepositoryServiceContract([
          ...validateProductLikeDirectSensitiveDatastoreAccess(
            repositoryServiceContractCatalog,
            repositoryIndex,
            datastoreIndex
          ),
          ...validateLedgerDatastoreDependencyAccess(
            repositoryServiceContractCatalog,
            ledgerDatastoreDependencyPolicy
          ),
          ...validateAiDirectNonOwnedDatastoreAccess(
            repositoryServiceContractCatalog,
            repositoryIndex,
            datastoreIndex
          ),
          ...validateEdgeRuntimeDirectDatastoreAccess(
            repositoryServiceContractCatalog,
            datastoreIndex
          ),
          ...validateServiceProviderContracts(
            repositoryServiceContractCatalog,
            providerContractPolicy
          ),
          ...validateServiceProviderWebhooks(
            repositoryServiceContractCatalog,
            providerWebhookPolicy
          ),
          ...validateAiUserDataContracts(
            repositoryServiceContractCatalog,
            aiUserDataPolicy
          ),
          ...validateAiSensitiveDataContracts(
            repositoryServiceContractCatalog,
            aiSensitiveDataPolicy
          ),
          ...validateMoneyMovementContracts(
            repositoryServiceContractCatalog,
            moneyMovementPolicy
          ),
          ...validatePaymentDataFrontendContracts(
            repositoryServiceContractCatalog,
            paymentDataFrontendPolicy
          ),
          ...validateCreditMonetizationContracts(
            repositoryServiceContractCatalog,
            creditMonetizationPolicy
          ),
          ...validateTierOperationalContracts(
            repositoryServiceContractCatalog,
            tierOperationalContractPolicy
          ),
          ...validateTierCriticalControls(
            repositoryServiceContractCatalog,
            tierCriticalControlsPolicy
          ),
          ...validateTier3RiskyExperimentContracts(
            repositoryServiceContractCatalog,
            tier3RiskyExperimentPolicy
          ),
          ...validatePublicApiContracts(
            repositoryServiceContractCatalog,
            publicApiContractPolicy
          )
        ]);

  return {
    diagnostics: [
      ...validateRepositoriesCatalog(
        catalogs.repositories,
        repositoryAreaRules,
        repositoryRoadmapEvidence
      ),
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
      ...validateTier3RiskyExperimentContracts(
        catalogs.services,
        tier3RiskyExperimentPolicy
      ),
      ...validatePublicApiContracts(
        catalogs.services,
        publicApiContractPolicy
      ),
      ...fixtureDiagnostics,
      ...serviceSchemaDiagnostics,
      ...repositoryServiceDiagnostics,
      ...(repositoryServiceContract === null
        ? []
        : validateRepositoryServiceContractRepositoryReference(
            repositoryServiceContract.value,
            repositoryIndex
          )),
      ...(repositoryServiceContract === null
        ? []
        : validateRepositoryServiceContractServiceCatalogReference(
            repositoryServiceContract.value,
            serviceIndex
          )),
      ...(repositoryServiceContract === null
        ? []
        : validateRepositoryServiceContractDataReferences(
            repositoryServiceContract.value,
            dataClassIndex,
            datastoreIndex
          )),
      ...(repositoryServiceContract === null
        ? []
        : validateRepositoryServiceContractProviderReferences(
            repositoryServiceContract.value,
            externalProviderIndex
          )),
      ...(repositoryServiceContract === null
        ? []
        : validateRepositoryServiceContractEventReferences(
            repositoryServiceContract.value,
            eventIndex
          )),
      ...repositoryServicePolicyDiagnostics
    ]
  };
}
