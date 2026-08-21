import {
  buildAiSensitiveDataPolicy,
  buildAiUserDataPolicy,
  validateAiSensitiveDataContracts,
  validateAiUserDataContracts
} from './ai-contract-rules.ts';
import {
  buildAiInferencePolicy,
  validateAiInferenceRepositories
} from './ai-inference-rules.ts';
import { validateRepositoryAiPlatformContract } from './ai-platform-contract-rules.ts';
import { validateRepositoryAiInferenceContract } from './ai-inference-contract-rules.ts';
import { validateRepositoryAgentReviewPlaybookContract } from './agent-review-playbook-contract-rules.ts';
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
  validateDataClassDatastoreReciprocity,
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
import type { Diagnostic, ValidationResult } from './diagnostics.ts';
import {
  validateDataClassDeletionEventReferences,
  validateEventCatalog,
  validateEventDataClassReferences,
  validateEventPiiFloor,
  validateEventRepositoryReferences
} from './event-rules.ts';
import { validateEventSchemaReferences } from './event-schema-validation.ts';
import { validateFixtureExpectations } from './fixture-validation.ts';
import { runTasksInOrder } from './ordered-task-runner.ts';
import { validateRepositoryServiceFixtureExpectations } from './repository-service-fixture-validation.ts';
import {
  buildProviderCatalogWebhookPolicy,
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
import { validateRepositoryTokenContracts } from './token-contract-rules.ts';
import {
  buildTokenRawChainConsumptionPolicy,
  validateTokenRawChainConsumptionContracts
} from './token-service-rules.ts';
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
import { validateRepositorySecretExposureContract } from './xcut-secret-rules.ts';
import { validateRepositoryTermSheetContract } from './xcut-term-rules.ts';
import { validateRepositoryTimeContract } from './xcut-time-rules.ts';
import { validateRepositoryErrorEnvelopeContract } from './xcut-error-rules.ts';
import { validateRepositoryI18nContract } from './xcut-i18n-rules.ts';
import { validateRepositoryFeedContract } from './xcut-feed-rules.ts';
import { validateRepositoryColorContract } from './xcut-color-rules.ts';
import { validateRepositoryA11yContract } from './xcut-a11y-rules.ts';
import { validateRepositoryPerformanceContract } from './xcut-perf-rules.ts';
import { validateRepositorySecurityHeaderContract } from './xcut-secheader-rules.ts';
import { validateRepositoryAssetContract } from './xcut-asset-rules.ts';
import { validateRepositoryLlmsContract } from './xcut-llms-rules.ts';
import { validateSupportSourceRegistrationFixtures } from './support-source-registry-validation.ts';
import {
  loadValidationContext,
  type ValidationContext
} from './validation-context.ts';

export type ValidateArchitectureInput =
  | {
      readonly architectureRoot: string;
      readonly repositoryRoot?: string;
    }
  | {
      readonly context: ValidationContext;
    };

interface RepositoryContractValidatorInput {
  readonly repositoryRoot: string;
  readonly repositoryServiceContract: unknown;
}

type RepositoryContractValidator = (
  input: RepositoryContractValidatorInput
) => readonly Diagnostic[] | Promise<readonly Diagnostic[]>;

/**
 * mf:anchor zdp.architecture-linter.repository-contract-registry
 * purpose: Locate the registry that fans repository service.yaml contracts into repo-specific policy validators.
 * search: repository contract validator, service.yaml policy, contract registry, repo-specific rules
 * invariant: Repository-specific validators stay centralized here so validation coverage is visible and not hidden in CLI branches.
 * risk: data_consistency, dependency
 */
const REPOSITORY_CONTRACT_VALIDATORS: readonly RepositoryContractValidator[] = [
  validateRepositoryAgentReviewPlaybookContract,
  validateRepositoryAiPlatformContract,
  validateRepositoryAiInferenceContract,
  validateRepositoryWebpubContract,
  validateRepositorySecretExposureContract,
  validateRepositoryTermSheetContract,
  validateRepositoryTimeContract,
  validateRepositoryErrorEnvelopeContract,
  validateRepositoryI18nContract,
  validateRepositoryFeedContract,
  validateRepositoryColorContract,
  validateRepositoryA11yContract,
  validateRepositoryPerformanceContract,
  validateRepositorySecurityHeaderContract,
  validateRepositoryAssetContract,
  validateRepositoryLlmsContract,
  validateRepositoryCoreContract,
  validateRepositoryAppShellContract,
  validateRepositoryRuntimeContract,
  validateRepositoryApiContractsContract,
  validateRepositoryLibsContract,
  validateRepositoryLocalizationContract,
  validateRepositoryClientSdksContract,
  validateRepositoryEdgeContract,
  validateRepositoryObservabilityContract,
  validateRepositoryInfraContract,
  validateRepositorySecurityContract,
  validateRepositoryTokenContracts,
  validateRepositoryDataPlatformContract,
  validateRepositoryGrowthLabContract,
  validateRepositoryPrivacyContract,
  validateRepositoryCredentialVaultContract,
  validateRepositoryConnectorsContract,
  validateRepositoryMoneyPlatformContract
] as const;

async function validateRepositoryContractRegistry(input: {
  readonly repositoryRoot: string | undefined;
  readonly repositoryServiceContract: unknown;
}): Promise<readonly Diagnostic[]> {
  const repositoryRoot = input.repositoryRoot;
  if (repositoryRoot === undefined) {
    return [];
  }

  const diagnosticGroups = await runTasksInOrder<readonly Diagnostic[]>(
    REPOSITORY_CONTRACT_VALIDATORS.map((validateRepositoryContract) => () =>
      validateRepositoryContract({
        repositoryRoot,
        repositoryServiceContract: input.repositoryServiceContract
      })
    )
  );

  return diagnosticGroups.flat();
}

/**
 * mf:anchor zdp.architecture-linter.validation-pipeline
 * purpose: Locate the full architecture validation pipeline that combines catalog checks, fixture checks, repository root checks, and contract diagnostics.
 * search: validateArchitecture, diagnostics pipeline, fixture validation, repository root, policy rules
 * invariant: Architecture validation reports diagnostics from source catalogs and optional repository roots without mutating architecture inputs.
 * risk: data_consistency, state
 */
export async function validateArchitecture(
  input: ValidateArchitectureInput
): Promise<ValidationResult> {
  const context =
    'context' in input
      ? input.context
      : await loadValidationContext({
          architectureRoot: input.architectureRoot,
          repositoryRoot: input.repositoryRoot
        });
  const {
    architectureRoot,
    repositoryRoot,
    catalogSchemaPreflight,
    catalogs
  } = context;

  if (catalogSchemaPreflight.validation.diagnostics.length > 0) {
    return catalogSchemaPreflight.validation;
  }

  const [repositoryServiceContract, graph] = await Promise.all([
    context.getRepositoryServiceContract(),
    context.getGraph()
  ]);
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
  const providerCatalogWebhookPolicy = buildProviderCatalogWebhookPolicy(
    catalogs.providerRules
  );
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
  const aiInferencePolicy = buildAiInferencePolicy(catalogs.aiInferenceRules);
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
  const tokenRawChainConsumptionPolicy = buildTokenRawChainConsumptionPolicy(
    catalogs.tokenRules,
    datastoreIndex
  );

  const [
    fixtureDiagnostics,
    repositoryServiceFixtureDiagnostics,
    serviceSchemaDiagnostics,
    supportSourceRegistrationFixtureDiagnostics,
    repositoryServiceDiagnostics,
    repositoryBaselineDiagnostics,
    repositoryMarkdownDiagnostics,
    repositoryContractDiagnostics,
    eventSchemaDiagnostics
  ] = await runTasksInOrder<readonly Diagnostic[]>([
    () =>
      validateFixtureExpectations({
        architectureRoot,
        repositoryIndex,
        datastoreIndex,
        dataClassIndex,
        eventIndex,
        serviceDataCatalogPolicy,
        serviceDataOwnershipPolicy,
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
        publicApiContractPolicy,
        tokenRawChainConsumptionPolicy
      }),
    () =>
      validateRepositoryServiceFixtureExpectations({
        architectureRoot,
        repositoryIndex,
        serviceIndex,
        dataClassIndex,
        datastoreIndex,
        eventIndex,
        externalProviderIndex
      }),
    () => validateServiceSchemaFixtures(architectureRoot),
    () =>
      validateSupportSourceRegistrationFixtures({
        architectureRoot,
        catalog: catalogs.supportSourceAdapters
      }),
    () =>
      repositoryRoot === undefined
        ? []
        : validateRepositoryServiceContract({
            architectureRoot,
            repositoryRoot,
            repositoryServiceContract
          }),
    () => validateRepositoryBaselineFiles(repositoryRoot),
    () =>
      repositoryRoot === undefined
        ? []
        : validateRepositoryRootMarkdownFiles({
            repositoryRoot,
            repositoryServiceContract: repositoryServiceContract?.value ?? null,
            repositoryIndex
          }),
    () =>
      validateRepositoryContractRegistry({
        repositoryRoot,
        repositoryServiceContract: repositoryServiceContract?.value ?? null
      }),
    () =>
      validateEventSchemaReferences({
        architectureRoot,
        value: catalogs.events
      })
  ]);
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
          ),
          ...validateTokenRawChainConsumptionContracts(
            repositoryServiceContractCatalog,
            tokenRawChainConsumptionPolicy,
            repositoryIndex
          )
        ]);
  const repositoryAutomationDiagnostics =
    repositoryServiceContract === null
      ? []
      : validateRepositoryAutomationContract({
          repositoryRoot,
          repositoryServiceContract: repositoryServiceContract.value,
          repositoryIndex
        });

  return {
    diagnostics: [
      ...validateRepositoriesCatalog(
        catalogs.repositories,
        repositoryAreaRules,
        repositoryRoadmapEvidence,
        repositoryPolicyNoteRules
      ),
      ...validateAiInferenceRepositories(catalogs.repositories, aiInferencePolicy),
      ...validateSplitTriggerCatalog(catalogs.splitTriggers, repositoryIndex),
      ...validateRepositorySplitCandidates(catalogs.repositories),
      ...validateDataClassCatalog(catalogs.dataClasses),
      ...validateDataClassAllowedDatastoreReferences(
        catalogs.dataClasses,
        datastoreIndex
      ),
      ...eventSchemaDiagnostics,
      ...validateEventCatalog(catalogs.events),
      ...validateEventDataClassReferences(catalogs.events, dataClassIndex),
      ...validateEventPiiFloor(catalogs.events, dataClassIndex),
      ...validateEventRepositoryReferences(catalogs.events, repositoryIndex),
      ...validateDataClassDeletionEventReferences(catalogs.dataClasses, eventIndex),
      ...validateCostBudgetCatalog(catalogs.costBudgets),
      ...validateSloTierCatalog(catalogs.sloTiers, repositoryIndex, serviceIndex),
      ...validateExternalProviderCatalog(
        catalogs.externalProviders,
        providerCatalogWebhookPolicy
      ),
      ...validateServiceRepositoryReferences(catalogs.services, repositoryIndex),
      ...validateServiceDependencyReferences(catalogs.services, serviceIndex),
      ...validateDatastoreOwnerReferences(catalogs.datastores, repositoryIndex),
      ...validateDatastoreDataClassReferences(catalogs.datastores, dataClassIndex),
      ...validateDataClassDatastoreReciprocity(
        catalogs.dataClasses,
        catalogs.datastores
      ),
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
      ...validateTokenRawChainConsumptionContracts(
        catalogs.services,
        tokenRawChainConsumptionPolicy,
        repositoryIndex
      ),
      ...fixtureDiagnostics,
      ...repositoryServiceFixtureDiagnostics,
      ...serviceSchemaDiagnostics,
      ...supportSourceRegistrationFixtureDiagnostics,
      ...repositoryBaselineDiagnostics,
      ...repositoryMarkdownDiagnostics,
      ...repositoryContractDiagnostics,
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
