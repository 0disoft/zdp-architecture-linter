import { loadArchitectureCatalogs } from './catalog-loader.ts';
import { buildArchitectureGraph } from './architecture-graph.ts';
import {
  buildAiSensitiveDataPolicy,
  buildAiUserDataPolicy,
  validateAiSensitiveDataContracts,
  validateAiUserDataContracts
} from './ai-contract-rules.ts';
import { validateChatgptAppsSdkGatewayContract } from './chatgpt-app-rules.ts';
import {
  mapServiceCatalogDiagnosticsToRepositoryServiceContract,
  validateRepositoryAutomationContract,
  validateRepositoryServiceDomainContract
} from './rules/index.ts';
import {
  buildPublicApiContractPolicy,
  validatePublicApiContracts
} from './api-rules.ts';
import { validateRepositoryApiContractsContract } from './api-contracts-rules.ts';
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
import {
  validateEventCatalogSchema,
  validateEventSchemaReferences
} from './event-schema-validation.ts';
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
  buildRepositoryPolicyNoteRules,
  type RepositoryRoadmapEvidence,
  validateRepositoriesCatalog
} from './repository-rules.ts';
import { validateRepositoryCatalogSchema } from './repository-schema-validation.ts';
import {
  validateRepositoryBaselineFiles,
  validateRepositoryRootMarkdownFiles
} from './repository-baseline-rules.ts';
import {
  validateCostBudgetCatalog,
  validateSloTierCatalog
} from './operational-catalog-rules.ts';
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
  loadRepositoryServiceContract,
  validateRepositoryServiceContract,
  validateServiceSchemaFixtures
} from './service-schema-validation.ts';
import { validateRepositoryCoreContract } from './core-contract-rules.ts';
import { validateRepositoryAppShellContract } from './app-shell-rules.ts';
import { validateRepositoryRuntimeContract } from './runtime-contract-rules.ts';
import { validateRepositoryEdgeContract } from './edge-contract-rules.ts';
import { validateRepositoryObservabilityContract } from './observability-contract-rules.ts';
import { validateRepositoryInfraContract } from './infra-contract-rules.ts';
import { validateRepositorySecurityContract } from './security-contract-rules.ts';
import { validateRepositoryDataPlatformContract } from './data-platform-contract-rules.ts';
import { validateRepositoryGrowthLabContract } from './growth-lab-contract-rules.ts';
import { validateRepositoryLibsContract } from './libs-contract-rules.ts';
import { validateRepositoryLocalizationContract } from './localization-contract-rules.ts';
import { validateRepositoryClientSdksContract } from './client-sdks-contract-rules.ts';
import { validateRepositoryMoneyPlatformContract } from './money-platform-contract-rules.ts';
import { validateRepositoryPrivacyContract } from './privacy-contract-rules.ts';
import { validateRepositoryCredentialVaultContract } from './credential-vault-contract-rules.ts';
import { validateRepositoryConnectorsContract } from './connectors-contract-rules.ts';
import {
  validateRepositorySplitCandidates,
  validateSplitTriggerCatalog
} from './split-rules.ts';
import {
  buildTierCriticalControlsPolicy,
  buildTierOperationalContractPolicy,
  buildTier3RiskyExperimentPolicy,
  validateTierCriticalControls,
  validateTierOperationalContracts,
  validateTier3RiskyExperimentContracts
} from './tier-rules.ts';
import { validateRepositoryWebpubContract } from './webpub-rules.ts';
import { validateRepositoryTermSheetContract } from './xcut-term-rules.ts';

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
  const repositoryPolicyNoteRules = buildRepositoryPolicyNoteRules(
    catalogs.repositoryRules
  );
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
  const publicApiContractPolicy = buildPublicApiContractPolicy(
    catalogs.apiRules ?? catalogs.tierRules
  );

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
  const repositoryBaselineDiagnostics = await validateRepositoryBaselineFiles(
    input.repositoryRoot
  );
  const repositoryMarkdownDiagnostics =
    input.repositoryRoot === undefined
      ? []
      : await validateRepositoryRootMarkdownFiles({
          repositoryRoot: input.repositoryRoot,
          repositoryServiceContract: repositoryServiceContract?.value ?? null,
          repositoryIndex
        });
  const repositoryWebpubDiagnostics =
    input.repositoryRoot === undefined
      ? []
      : await validateRepositoryWebpubContract({
          repositoryRoot: input.repositoryRoot,
          repositoryServiceContract: repositoryServiceContract?.value ?? null
        });
  const repositoryTermSheetDiagnostics =
    input.repositoryRoot === undefined
      ? []
      : await validateRepositoryTermSheetContract({
          repositoryRoot: input.repositoryRoot,
          repositoryServiceContract: repositoryServiceContract?.value ?? null
        });
  const repositoryCoreContractDiagnostics =
    input.repositoryRoot === undefined
      ? []
      : await validateRepositoryCoreContract({
          repositoryRoot: input.repositoryRoot,
          repositoryServiceContract: repositoryServiceContract?.value ?? null
        });
  const repositoryAppShellContractDiagnostics =
    input.repositoryRoot === undefined
      ? []
      : await validateRepositoryAppShellContract({
          repositoryRoot: input.repositoryRoot,
          repositoryServiceContract: repositoryServiceContract?.value ?? null
        });
  const repositoryRuntimeContractDiagnostics =
    input.repositoryRoot === undefined
      ? []
      : await validateRepositoryRuntimeContract({
          repositoryRoot: input.repositoryRoot,
          repositoryServiceContract: repositoryServiceContract?.value ?? null
        });
  const repositoryApiContractsContractDiagnostics =
    input.repositoryRoot === undefined
      ? []
      : await validateRepositoryApiContractsContract({
          repositoryRoot: input.repositoryRoot,
          repositoryServiceContract: repositoryServiceContract?.value ?? null
        });
  const repositoryLibsContractDiagnostics =
    input.repositoryRoot === undefined
      ? []
      : await validateRepositoryLibsContract({
          repositoryRoot: input.repositoryRoot,
          repositoryServiceContract: repositoryServiceContract?.value ?? null
        });
  const repositoryLocalizationContractDiagnostics =
    input.repositoryRoot === undefined
      ? []
      : await validateRepositoryLocalizationContract({
          repositoryRoot: input.repositoryRoot,
          repositoryServiceContract: repositoryServiceContract?.value ?? null
        });
  const repositoryClientSdksContractDiagnostics =
    input.repositoryRoot === undefined
      ? []
      : await validateRepositoryClientSdksContract({
          repositoryRoot: input.repositoryRoot,
          repositoryServiceContract: repositoryServiceContract?.value ?? null
        });
  const repositoryEdgeContractDiagnostics =
    input.repositoryRoot === undefined
      ? []
      : await validateRepositoryEdgeContract({
          repositoryRoot: input.repositoryRoot,
          repositoryServiceContract: repositoryServiceContract?.value ?? null
        });
  const repositoryObservabilityContractDiagnostics =
    input.repositoryRoot === undefined
      ? []
      : await validateRepositoryObservabilityContract({
          repositoryRoot: input.repositoryRoot,
          repositoryServiceContract: repositoryServiceContract?.value ?? null
        });
  const repositoryInfraContractDiagnostics =
    input.repositoryRoot === undefined
      ? []
      : await validateRepositoryInfraContract({
          repositoryRoot: input.repositoryRoot,
          repositoryServiceContract: repositoryServiceContract?.value ?? null
        });
  const repositorySecurityContractDiagnostics =
    input.repositoryRoot === undefined
      ? []
      : await validateRepositorySecurityContract({
          repositoryRoot: input.repositoryRoot,
          repositoryServiceContract: repositoryServiceContract?.value ?? null
        });
  const repositoryDataPlatformContractDiagnostics =
    input.repositoryRoot === undefined
      ? []
      : await validateRepositoryDataPlatformContract({
          repositoryRoot: input.repositoryRoot,
          repositoryServiceContract: repositoryServiceContract?.value ?? null
        });
  const repositoryGrowthLabContractDiagnostics =
    input.repositoryRoot === undefined
      ? []
      : await validateRepositoryGrowthLabContract({
          repositoryRoot: input.repositoryRoot,
          repositoryServiceContract: repositoryServiceContract?.value ?? null
        });
  const repositoryPrivacyContractDiagnostics =
    input.repositoryRoot === undefined
      ? []
      : await validateRepositoryPrivacyContract({
          repositoryRoot: input.repositoryRoot,
          repositoryServiceContract: repositoryServiceContract?.value ?? null
        });
  const repositoryCredentialVaultContractDiagnostics =
    input.repositoryRoot === undefined
      ? []
      : await validateRepositoryCredentialVaultContract({
          repositoryRoot: input.repositoryRoot,
          repositoryServiceContract: repositoryServiceContract?.value ?? null
        });
  const repositoryConnectorsContractDiagnostics =
    input.repositoryRoot === undefined
      ? []
      : await validateRepositoryConnectorsContract({
          repositoryRoot: input.repositoryRoot,
          repositoryServiceContract: repositoryServiceContract?.value ?? null
        });
  const repositoryMoneyPlatformContractDiagnostics =
    input.repositoryRoot === undefined
      ? []
      : await validateRepositoryMoneyPlatformContract({
          repositoryRoot: input.repositoryRoot,
          repositoryServiceContract: repositoryServiceContract?.value ?? null
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
            paymentDataFrontendPolicy,
            repositoryIndex
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
  const repositoryAutomationDiagnostics =
    repositoryServiceContract === null
      ? []
      : validateRepositoryAutomationContract({
          repositoryServiceContract: repositoryServiceContract.value,
          repositoryIndex
        });

  return {
    diagnostics: [
      ...(await validateRepositoryCatalogSchema({
        architectureRoot: input.architectureRoot,
        value: catalogs.repositories
      })),
      ...validateRepositoriesCatalog(
        catalogs.repositories,
        repositoryAreaRules,
        repositoryRoadmapEvidence,
        repositoryPolicyNoteRules
      ),
      ...validateSplitTriggerCatalog(catalogs.splitTriggers, repositoryIndex),
      ...validateRepositorySplitCandidates(catalogs.repositories),
      ...validateDataClassCatalog(catalogs.dataClasses),
      ...validateDataClassAllowedDatastoreReferences(
        catalogs.dataClasses,
        datastoreIndex
      ),
      ...(await validateEventCatalogSchema({
        architectureRoot: input.architectureRoot,
        value: catalogs.events
      })),
      ...(await validateEventSchemaReferences({
        architectureRoot: input.architectureRoot,
        value: catalogs.events
      })),
      ...validateEventCatalog(catalogs.events),
      ...validateEventDataClassReferences(catalogs.events, dataClassIndex),
      ...validateEventRepositoryReferences(catalogs.events, repositoryIndex),
      ...validateDataClassDeletionEventReferences(catalogs.dataClasses, eventIndex),
      ...validateCostBudgetCatalog(catalogs.costBudgets),
      ...validateSloTierCatalog(catalogs.sloTiers, repositoryIndex, serviceIndex),
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
      ...validateChatgptAppsSdkGatewayContract({
        repositories: catalogs.repositories,
        services: catalogs.services,
        externalProviders: catalogs.externalProviders
      }),
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
        paymentDataFrontendPolicy,
        repositoryIndex
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
      ...repositoryBaselineDiagnostics,
      ...repositoryMarkdownDiagnostics,
      ...repositoryWebpubDiagnostics,
      ...repositoryTermSheetDiagnostics,
      ...repositoryCoreContractDiagnostics,
      ...repositoryAppShellContractDiagnostics,
      ...repositoryRuntimeContractDiagnostics,
      ...repositoryApiContractsContractDiagnostics,
      ...repositoryLibsContractDiagnostics,
      ...repositoryLocalizationContractDiagnostics,
      ...repositoryClientSdksContractDiagnostics,
      ...repositoryEdgeContractDiagnostics,
      ...repositoryObservabilityContractDiagnostics,
      ...repositoryInfraContractDiagnostics,
      ...repositorySecurityContractDiagnostics,
      ...repositoryDataPlatformContractDiagnostics,
      ...repositoryGrowthLabContractDiagnostics,
      ...repositoryPrivacyContractDiagnostics,
      ...repositoryCredentialVaultContractDiagnostics,
      ...repositoryConnectorsContractDiagnostics,
      ...repositoryMoneyPlatformContractDiagnostics,
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
      ...(repositoryServiceContract === null
        ? []
        : validateRepositoryServiceDomainContract(repositoryServiceContract.value)),
      ...repositoryAutomationDiagnostics,
      ...repositoryServicePolicyDiagnostics
    ]
  };
}
