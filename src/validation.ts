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
  filterDiagnosticsForSelection,
  isValidationRuleSelected,
  validationSelectionUsesInput,
  type ValidationRuleId,
  type ValidationRuleSelection
} from './rule-registry.ts';
import {
  createValidationContext,
  loadValidationContext,
  type ValidationContext
} from './validation-context.ts';

export type ValidateArchitectureInput =
  | {
      readonly architectureRoot: string;
      readonly repositoryRoot?: string;
      readonly selection?: ValidationRuleSelection;
    }
  | {
      readonly context: ValidationContext;
      readonly selection?: ValidationRuleSelection;
    };

interface RepositoryContractValidatorInput {
  readonly repositoryRoot: string;
  readonly repositoryServiceContract: unknown;
}

type RepositoryContractValidator = (
  input: RepositoryContractValidatorInput
) => readonly Diagnostic[] | Promise<readonly Diagnostic[]>;

interface RepositoryContractValidatorRegistration {
  readonly ruleId: ValidationRuleId;
  readonly validate: RepositoryContractValidator;
}

/**
 * mf:anchor zdp.architecture-linter.repository-contract-registry
 * purpose: Locate the metadata-backed registry that fans repository service.yaml contracts into repo-specific policy validators.
 * search: repository contract validator, service.yaml policy, rule registry, selective validation
 * invariant: Every repository-specific validator has a stable registry ID and can be skipped before filesystem work begins.
 * risk: data_consistency, dependency, performance
 */
const REPOSITORY_CONTRACT_VALIDATORS: readonly RepositoryContractValidatorRegistration[] = [
  {
    ruleId: 'repository.contract.agent-review-playbook',
    validate: validateRepositoryAgentReviewPlaybookContract
  },
  {
    ruleId: 'repository.contract.ai-platform',
    validate: validateRepositoryAiPlatformContract
  },
  {
    ruleId: 'repository.contract.ai-inference',
    validate: validateRepositoryAiInferenceContract
  },
  {
    ruleId: 'repository.contract.webpub',
    validate: validateRepositoryWebpubContract
  },
  {
    ruleId: 'repository.contract.secret-exposure',
    validate: validateRepositorySecretExposureContract
  },
  {
    ruleId: 'repository.contract.term-sheet',
    validate: validateRepositoryTermSheetContract
  },
  {
    ruleId: 'repository.contract.time',
    validate: validateRepositoryTimeContract
  },
  {
    ruleId: 'repository.contract.error-envelope',
    validate: validateRepositoryErrorEnvelopeContract
  },
  {
    ruleId: 'repository.contract.i18n',
    validate: validateRepositoryI18nContract
  },
  {
    ruleId: 'repository.contract.feed',
    validate: validateRepositoryFeedContract
  },
  {
    ruleId: 'repository.contract.color',
    validate: validateRepositoryColorContract
  },
  {
    ruleId: 'repository.contract.accessibility',
    validate: validateRepositoryA11yContract
  },
  {
    ruleId: 'repository.contract.performance',
    validate: validateRepositoryPerformanceContract
  },
  {
    ruleId: 'repository.contract.security-headers',
    validate: validateRepositorySecurityHeaderContract
  },
  {
    ruleId: 'repository.contract.assets',
    validate: validateRepositoryAssetContract
  },
  {
    ruleId: 'repository.contract.llms',
    validate: validateRepositoryLlmsContract
  },
  {
    ruleId: 'repository.contract.core',
    validate: validateRepositoryCoreContract
  },
  {
    ruleId: 'repository.contract.app-shell',
    validate: validateRepositoryAppShellContract
  },
  {
    ruleId: 'repository.contract.runtime',
    validate: validateRepositoryRuntimeContract
  },
  {
    ruleId: 'repository.contract.api-contracts',
    validate: validateRepositoryApiContractsContract
  },
  {
    ruleId: 'repository.contract.libs',
    validate: validateRepositoryLibsContract
  },
  {
    ruleId: 'repository.contract.localization',
    validate: validateRepositoryLocalizationContract
  },
  {
    ruleId: 'repository.contract.client-sdks',
    validate: validateRepositoryClientSdksContract
  },
  {
    ruleId: 'repository.contract.edge',
    validate: validateRepositoryEdgeContract
  },
  {
    ruleId: 'repository.contract.observability',
    validate: validateRepositoryObservabilityContract
  },
  {
    ruleId: 'repository.contract.infra',
    validate: validateRepositoryInfraContract
  },
  {
    ruleId: 'repository.contract.security',
    validate: validateRepositorySecurityContract
  },
  {
    ruleId: 'repository.contract.token',
    validate: validateRepositoryTokenContracts
  },
  {
    ruleId: 'repository.contract.data-platform',
    validate: validateRepositoryDataPlatformContract
  },
  {
    ruleId: 'repository.contract.growth-lab',
    validate: validateRepositoryGrowthLabContract
  },
  {
    ruleId: 'repository.contract.privacy',
    validate: validateRepositoryPrivacyContract
  },
  {
    ruleId: 'repository.contract.credential-vault',
    validate: validateRepositoryCredentialVaultContract
  },
  {
    ruleId: 'repository.contract.connectors',
    validate: validateRepositoryConnectorsContract
  },
  {
    ruleId: 'repository.contract.money-platform',
    validate: validateRepositoryMoneyPlatformContract
  }
] as const;

async function validateRepositoryContractRegistry(input: {
  readonly repositoryRoot: string | undefined;
  readonly repositoryServiceContract: unknown;
  readonly selection: ValidationRuleSelection | undefined;
}): Promise<readonly Diagnostic[]> {
  const repositoryRoot = repositoryRoot;
  if (repositoryRoot === undefined) return [];
  const selected = REPOSITORY_CONTRACT_VALIDATORS.filter((registration) =>
    isValidationRuleSelected(registration.ruleId, input.selection)
  );
  const groups = await runTasksInOrder<readonly Diagnostic[]>(
    selected.map((registration) => () =>
      registration.validate({
        repositoryRoot,
        repositoryServiceContract: input.repositoryServiceContract
      })
    )
  );
  return groups.flat();
}

/**
 * mf:anchor zdp.architecture-linter.validation-pipeline
 * purpose: Locate the full architecture validation pipeline that combines catalog checks, fixture checks, repository root checks, and contract diagnostics.
 * search: validateArchitecture, diagnostics pipeline, rule selection, fixture validation, repository root
 * invariant: Selectors skip unselected validators while schema preflight remains fail-closed and default execution preserves full validation.
 * risk: data_consistency, state, performance
 */
export async function validateArchitecture(
  input: ValidateArchitectureInput
): Promise<ValidationResult> {
  const selection = input.selection;
  const loadedContext =
    'context' in input
      ? input.context
      : await loadValidationContext({
          architectureRoot,
          repositoryRoot
        });
  const { architectureRoot, repositoryRoot, catalogSchemaPreflight } = loadedContext;
  if (catalogSchemaPreflight.validation.diagnostics.length > 0) {
    return catalogSchemaPreflight.validation;
  }
  const shouldLoadRepositoryContract =
    repositoryRoot !== undefined &&
    validationSelectionUsesInput(selection, 'repository-contract');
  const context = shouldLoadRepositoryContract
    ? loadedContext
    : createValidationContext({
        architectureRoot,
        repositoryRoot,
        catalogSchemaPreflight,
        repositoryServiceContract: null
      });
  const [repositoryServiceContract, graph] = await Promise.all([
    shouldLoadRepositoryContract ? context.getRepositoryServiceContract() : Promise.resolve(null),
    context.getGraph()
  ]);
  const { catalogs } = context;
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

  const catalogRepositoryDiagnostics = runSelectedRule(
    selection,
    'catalog.repositories',
    () => [
      ...validateRepositoriesCatalog(
        catalogs.repositories,
        repositoryAreaRules,
        repositoryRoadmapEvidence,
        repositoryPolicyNoteRules
      ),
      ...validateAiInferenceRepositories(catalogs.repositories, aiInferencePolicy)
    ]
  );
  const catalogSplitDiagnostics = runSelectedRule(selection, 'catalog.splits', () => [
    ...validateSplitTriggerCatalog(catalogs.splitTriggers, repositoryIndex),
    ...validateRepositorySplitCandidates(catalogs.repositories)
  ]);
  const catalogDataDiagnostics = runSelectedRule(selection, 'catalog.data', () => [
    ...validateDataClassCatalog(catalogs.dataClasses),
    ...validateDataClassAllowedDatastoreReferences(
      catalogs.dataClasses,
      datastoreIndex
    )
  ]);
  const catalogEventDiagnosticsPromise = runSelectedRuleAsync(
    selection,
    'catalog.events',
    async () => [
      ...(await validateEventSchemaReferences({
        architectureRoot: architectureRoot,
        value: catalogs.events
      })),
      ...validateEventCatalog(catalogs.events),
      ...validateEventDataClassReferences(catalogs.events, dataClassIndex),
      ...validateEventPiiFloor(catalogs.events, dataClassIndex),
      ...validateEventRepositoryReferences(catalogs.events, repositoryIndex),
      ...validateDataClassDeletionEventReferences(catalogs.dataClasses, eventIndex)
    ]
  );
  const catalogOperationDiagnostics = runSelectedRule(
    selection,
    'catalog.operations',
    () => [
      ...validateCostBudgetCatalog(catalogs.costBudgets),
      ...validateSloTierCatalog(catalogs.sloTiers, repositoryIndex, serviceIndex)
    ]
  );
  const catalogProviderDiagnostics = runSelectedRule(
    selection,
    'catalog.providers',
    () =>
      validateExternalProviderCatalog(
        catalogs.externalProviders,
        providerCatalogWebhookPolicy
      )
  );
  const catalogServiceDiagnostics = runSelectedRule(
    selection,
    'catalog.services',
    () => [
      ...validateServiceRepositoryReferences(catalogs.services, repositoryIndex),
      ...validateServiceDependencyReferences(catalogs.services, serviceIndex)
    ]
  );
  const catalogDatastoreDiagnostics = runSelectedRule(
    selection,
    'catalog.datastores',
    () => [
      ...validateDatastoreOwnerReferences(catalogs.datastores, repositoryIndex),
      ...validateDatastoreDataClassReferences(catalogs.datastores, dataClassIndex),
      ...validateDataClassDatastoreReciprocity(
        catalogs.dataClasses,
        catalogs.datastores
      ),
      ...validateServiceDatastoreReferences(catalogs.services, datastoreIndex)
    ]
  );
  const serviceDataAccessDiagnostics = runSelectedRule(
    selection,
    'service.data-access',
    () => [
      ...validateServiceDataCatalogReferences(
        catalogs.services,
        serviceDataCatalogPolicy,
        dataClassIndex,
        datastoreIndex
      ),
      ...validateServiceDataOwnershipContracts(
        catalogs.services,
        serviceDataOwnershipPolicy
      )
    ]
  );
  const serviceProviderReferenceDiagnostics = runSelectedRule(
    selection,
    'service.provider-references',
    () =>
      validateServiceExternalDependencyReferences(
        catalogs.services,
        externalProviderIndex
      )
  );
  const serviceChatgptAppsDiagnostics = runSelectedRule(
    selection,
    'service.chatgpt-apps',
    () =>
      validateChatgptAppsSdkGatewayContract({
        repositories: catalogs.repositories,
        services: catalogs.services,
        externalProviders: catalogs.externalProviders
      })
  );
  const serviceProviderDiagnostics = runSelectedRule(
    selection,
    'service.providers',
    () => [
      ...validateServiceProviderContracts(
        catalogs.services,
        providerContractPolicy
      ),
      ...validateServiceProviderWebhooks(catalogs.services, providerWebhookPolicy)
    ]
  );
  const serviceAiDiagnostics = runSelectedRule(selection, 'service.ai', () => [
    ...validateAiUserDataContracts(catalogs.services, aiUserDataPolicy),
    ...validateAiSensitiveDataContracts(catalogs.services, aiSensitiveDataPolicy)
  ]);
  const serviceDatastoreBoundaryDiagnostics = runSelectedRule(
    selection,
    'service.datastore-boundaries',
    () => [
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
      )
    ]
  );
  const serviceMoneyDiagnostics = runSelectedRule(
    selection,
    'service.money',
    () => [
      ...validateMoneyMovementContracts(catalogs.services, moneyMovementPolicy),
      ...validatePaymentDataFrontendContracts(
        catalogs.services,
        paymentDataFrontendPolicy,
        repositoryIndex
      ),
      ...validateCreditMonetizationContracts(
        catalogs.services,
        creditMonetizationPolicy
      )
    ]
  );
  const serviceTierDiagnostics = runSelectedRule(
    selection,
    'service.tiers',
    () => [
      ...validateTierOperationalContracts(
        catalogs.services,
        tierOperationalContractPolicy
      ),
      ...validateTierCriticalControls(catalogs.services, tierCriticalControlsPolicy),
      ...validateTier3RiskyExperimentContracts(
        catalogs.services,
        tier3RiskyExperimentPolicy
      )
    ]
  );
  const serviceApiDiagnostics = runSelectedRule(selection, 'service.api', () =>
    validatePublicApiContracts(catalogs.services, publicApiContractPolicy)
  );
  const serviceTokenDiagnostics = runSelectedRule(
    selection,
    'service.token',
    () =>
      validateTokenRawChainConsumptionContracts(
        catalogs.services,
        tokenRawChainConsumptionPolicy,
        repositoryIndex
      )
  );

  const fixtureDiagnosticsPromise = runSelectedRuleAsync(
    selection,
    'fixture.policy',
    () =>
      validateFixtureExpectations({
        architectureRoot: architectureRoot,
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
      })
  );
  const repositoryServiceFixtureDiagnosticsPromise = runSelectedRuleAsync(
    selection,
    'fixture.repository-service',
    () =>
      validateRepositoryServiceFixtureExpectations({
        architectureRoot: architectureRoot,
        repositoryIndex,
        serviceIndex,
        dataClassIndex,
        datastoreIndex,
        eventIndex,
        externalProviderIndex
      })
  );
  const serviceSchemaDiagnosticsPromise = runSelectedRuleAsync(
    selection,
    'fixture.service-schema',
    () => validateServiceSchemaFixtures(architectureRoot)
  );
  const supportSourceRegistrationFixtureDiagnosticsPromise = runSelectedRuleAsync(
    selection,
    'fixture.support-sources',
    () =>
      validateSupportSourceRegistrationFixtures({
        architectureRoot: architectureRoot,
        catalog: catalogs.supportSourceAdapters
      })
  );
  const repositoryBaselineDiagnosticsPromise = runSelectedRuleAsync(
    selection,
    'repository.baseline',
    () => validateRepositoryBaselineFiles(repositoryRoot)
  );
  const repositoryMarkdownDiagnosticsPromise = runSelectedRuleAsync(
    selection,
    'repository.markdown',
    () =>
      repositoryRoot === undefined
        ? []
        : validateRepositoryRootMarkdownFiles({
            repositoryRoot,
            repositoryServiceContract: repositoryServiceContract?.value ?? null,
            repositoryIndex
          })
  );
  const repositoryContractDiagnosticsPromise = validateRepositoryContractRegistry({
    repositoryRoot: repositoryRoot,
    repositoryServiceContract: repositoryServiceContract?.value ?? null,
    selection
  });
  const repositoryServiceDiagnosticsPromise = runSelectedRuleAsync(
    selection,
    'repository.service-schema',
    () =>
      repositoryRoot === undefined
        ? []
        : validateRepositoryServiceContract({
            architectureRoot,
            repositoryRoot,
            repositoryServiceContract
          })
  );
  const repositoryServiceReferenceDiagnostics = runSelectedRule(
    selection,
    'repository.service-references',
    () =>
      repositoryServiceContract === null
        ? []
        : [
            ...validateRepositoryServiceContractRepositoryReference(
              repositoryServiceContract.value,
              repositoryIndex
            ),
            ...validateRepositoryServiceContractServiceCatalogReference(
              repositoryServiceContract.value,
              serviceIndex
            ),
            ...validateRepositoryServiceContractDataReferences(
              repositoryServiceContract.value,
              dataClassIndex,
              datastoreIndex
            ),
            ...validateRepositoryServiceContractProviderReferences(
              repositoryServiceContract.value,
              externalProviderIndex
            ),
            ...validateRepositoryServiceContractEventReferences(
              repositoryServiceContract.value,
              eventIndex
            )
          ]
  );
  const repositoryDomainDiagnostics = runSelectedRule(
    selection,
    'repository.domain',
    () =>
      repositoryServiceContract === null
        ? []
        : validateRepositoryServiceDomainContract(repositoryServiceContract.value)
  );
  const repositoryAutomationDiagnostics = runSelectedRule(
    selection,
    'repository.automation',
    () =>
      repositoryServiceContract === null
        ? []
        : validateRepositoryAutomationContract({
            repositoryRoot,
            repositoryServiceContract: repositoryServiceContract.value,
            repositoryIndex
          })
  );

  const [
    catalogEventDiagnostics,
    fixtureDiagnostics,
    repositoryServiceFixtureDiagnostics,
    serviceSchemaDiagnostics,
    supportSourceRegistrationFixtureDiagnostics,
    repositoryBaselineDiagnostics,
    repositoryMarkdownDiagnostics,
    repositoryContractDiagnostics,
    repositoryServiceDiagnostics
  ] = await runTasksInOrder<readonly Diagnostic[]>([
    () => catalogEventDiagnosticsPromise,
    () => fixtureDiagnosticsPromise,
    () => repositoryServiceFixtureDiagnosticsPromise,
    () => serviceSchemaDiagnosticsPromise,
    () => supportSourceRegistrationFixtureDiagnosticsPromise,
    () => repositoryBaselineDiagnosticsPromise,
    () => repositoryMarkdownDiagnosticsPromise,
    () => repositoryContractDiagnosticsPromise,
    () => repositoryServiceDiagnosticsPromise
  ]);

  const repositoryServiceContractCatalog = graph.repositoryServiceContractCatalog;
  const repositoryServiceDataAccessDiagnostics = mapRepositoryServiceDiagnostics(
    repositoryServiceContractCatalog,
    runSelectedRule(selection, 'repository.service-data-access', () =>
      repositoryServiceContractCatalog === null
        ? []
        : [
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
            )
          ]
    )
  );
  const repositoryServiceProviderDiagnostics = mapRepositoryServiceDiagnostics(
    repositoryServiceContractCatalog,
    runSelectedRule(selection, 'repository.service-providers', () =>
      repositoryServiceContractCatalog === null
        ? []
        : [
            ...validateServiceProviderContracts(
              repositoryServiceContractCatalog,
              providerContractPolicy
            ),
            ...validateServiceProviderWebhooks(
              repositoryServiceContractCatalog,
              providerWebhookPolicy
            )
          ]
    )
  );
  const repositoryServiceAiDiagnostics = mapRepositoryServiceDiagnostics(
    repositoryServiceContractCatalog,
    runSelectedRule(selection, 'repository.service-ai', () =>
      repositoryServiceContractCatalog === null
        ? []
        : [
            ...validateAiUserDataContracts(
              repositoryServiceContractCatalog,
              aiUserDataPolicy
            ),
            ...validateAiSensitiveDataContracts(
              repositoryServiceContractCatalog,
              aiSensitiveDataPolicy
            )
          ]
    )
  );
  const repositoryServiceMoneyDiagnostics = mapRepositoryServiceDiagnostics(
    repositoryServiceContractCatalog,
    runSelectedRule(selection, 'repository.service-money', () =>
      repositoryServiceContractCatalog === null
        ? []
        : [
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
            )
          ]
    )
  );
  const repositoryServiceTierDiagnostics = mapRepositoryServiceDiagnostics(
    repositoryServiceContractCatalog,
    runSelectedRule(selection, 'repository.service-tiers', () =>
      repositoryServiceContractCatalog === null
        ? []
        : [
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
            )
          ]
    )
  );
  const repositoryServiceApiDiagnostics = mapRepositoryServiceDiagnostics(
    repositoryServiceContractCatalog,
    runSelectedRule(selection, 'repository.service-api', () =>
      repositoryServiceContractCatalog === null
        ? []
        : validatePublicApiContracts(
            repositoryServiceContractCatalog,
            publicApiContractPolicy
          )
    )
  );
  const repositoryServiceTokenDiagnostics = mapRepositoryServiceDiagnostics(
    repositoryServiceContractCatalog,
    runSelectedRule(selection, 'repository.service-token', () =>
      repositoryServiceContractCatalog === null
        ? []
        : validateTokenRawChainConsumptionContracts(
            repositoryServiceContractCatalog,
            tokenRawChainConsumptionPolicy,
            repositoryIndex
          )
    )
  );

  return {
    diagnostics: filterDiagnosticsForSelection(
      [
        ...catalogRepositoryDiagnostics,
        ...catalogSplitDiagnostics,
        ...catalogDataDiagnostics,
        ...catalogEventDiagnostics,
        ...catalogOperationDiagnostics,
        ...catalogProviderDiagnostics,
        ...catalogServiceDiagnostics,
        ...catalogDatastoreDiagnostics,
        ...serviceDataAccessDiagnostics,
        ...serviceProviderReferenceDiagnostics,
        ...serviceChatgptAppsDiagnostics,
        ...serviceProviderDiagnostics,
        ...serviceAiDiagnostics,
        ...serviceDatastoreBoundaryDiagnostics,
        ...serviceMoneyDiagnostics,
        ...serviceTierDiagnostics,
        ...serviceApiDiagnostics,
        ...serviceTokenDiagnostics,
        ...fixtureDiagnostics,
        ...repositoryServiceFixtureDiagnostics,
        ...serviceSchemaDiagnostics,
        ...supportSourceRegistrationFixtureDiagnostics,
        ...repositoryBaselineDiagnostics,
        ...repositoryMarkdownDiagnostics,
        ...repositoryContractDiagnostics,
        ...repositoryServiceDiagnostics,
        ...repositoryServiceReferenceDiagnostics,
        ...repositoryDomainDiagnostics,
        ...repositoryAutomationDiagnostics,
        ...repositoryServiceDataAccessDiagnostics,
        ...repositoryServiceProviderDiagnostics,
        ...repositoryServiceAiDiagnostics,
        ...repositoryServiceMoneyDiagnostics,
        ...repositoryServiceTierDiagnostics,
        ...repositoryServiceApiDiagnostics,
        ...repositoryServiceTokenDiagnostics
      ],
      selection
    )
  };
}

function runSelectedRule(
  selection: ValidationRuleSelection | undefined,
  ruleId: ValidationRuleId,
  validate: () => readonly Diagnostic[]
): readonly Diagnostic[] {
  return isValidationRuleSelected(ruleId, selection) ? validate() : [];
}

async function runSelectedRuleAsync(
  selection: ValidationRuleSelection | undefined,
  ruleId: ValidationRuleId,
  validate: () => readonly Diagnostic[] | Promise<readonly Diagnostic[]>
): Promise<readonly Diagnostic[]> {
  return isValidationRuleSelected(ruleId, selection) ? await validate() : [];
}

function mapRepositoryServiceDiagnostics(
  repositoryServiceContractCatalog: unknown,
  diagnostics: readonly Diagnostic[]
): readonly Diagnostic[] {
  return repositoryServiceContractCatalog === null
    ? []
    : mapServiceCatalogDiagnosticsToRepositoryServiceContract(diagnostics);
}
