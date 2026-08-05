import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';

export interface ArchitectureCatalogs {
  readonly repositories: RepositoriesCatalog;
  readonly splitTriggers: SplitTriggersCatalog;
  readonly repositoryRoadmapText?: string;
  readonly services: ServicesCatalog;
  readonly datastores: DatastoresCatalog;
  readonly dataClasses: DataClassesCatalog;
  readonly costBudgets?: CostBudgetsCatalog;
  readonly sloTiers?: SloTiersCatalog;
  readonly events: EventsCatalog;
  readonly externalProviders: ExternalProvidersCatalog;
  readonly operationalAssets?: OperationalAssetsCatalog;
  readonly supportSourceAdapters?: SupportSourceAdaptersCatalog;
  readonly repositoryRules: RepositoryRulesCatalog;
  readonly moneyRules: MoneyRulesCatalog;
  readonly providerRules: ProviderRulesCatalog;
  readonly aiDataAccessRules: AiDataAccessRulesCatalog;
  readonly aiInferenceRules?: AiInferenceRulesCatalog;
  readonly dataAccessRules: DataAccessRulesCatalog;
  readonly tierRules: TierRulesCatalog;
  readonly apiRules?: ApiRulesCatalog;
  readonly tokenRules?: TokenRulesCatalog;
}

export interface RepositoriesCatalog {
  readonly repositories?: unknown;
}

export interface SplitTriggersCatalog {
  readonly split_triggers?: unknown;
}

export interface ServicesCatalog {
  readonly services?: unknown;
}

export interface DatastoresCatalog {
  readonly datastores?: unknown;
}

export interface DataClassesCatalog {
  readonly schema_version?: unknown;
  readonly data_classes?: unknown;
  readonly deletion_pipeline?: unknown;
}

export interface CostBudgetsCatalog {
  readonly service_budgets?: unknown;
  readonly product_unit_budgets?: unknown;
  readonly automatic_action_policies?: unknown;
}

export interface SloTiersCatalog {
  readonly tiers?: unknown;
  readonly service_tier_mapping?: unknown;
}

export interface EventsCatalog {
  readonly events?: unknown;
}

export interface ExternalProvidersCatalog {
  readonly providers?: unknown;
}

export interface OperationalAssetsCatalog {
  readonly schema_version?: unknown;
  readonly policy?: unknown;
  readonly assets?: unknown;
}

export interface SupportSourceAdaptersCatalog {
  readonly schema_version?: unknown;
  readonly adapters?: unknown;
}

export interface RepositoryRulesCatalog {
  readonly repository_area_rules?: unknown;
}

export interface MoneyRulesCatalog {
  readonly rules?: unknown;
}

export interface ProviderRulesCatalog {
  readonly rules?: unknown;
}

export interface AiDataAccessRulesCatalog {
  readonly rules?: unknown;
}

export interface AiInferenceRulesCatalog {
  readonly rules?: unknown;
}

export interface DataAccessRulesCatalog {
  readonly rules?: unknown;
}

export interface TierRulesCatalog {
  readonly rules?: unknown;
}

export interface ApiRulesCatalog {
  readonly rules?: unknown;
}

export interface TokenRulesCatalog {
  readonly rules?: unknown;
}

/**
 * mf:anchor zdp.architecture-linter.catalog-loader
 * purpose: Locate the architecture input loader that defines which zdp-architecture catalogs, rules, schemas, and roadmap text become linter source truth.
 * search: architecture catalogs, YAML loader, repository rules, roadmap evidence, policy source
 * invariant: Linter policy comes from zdp-architecture files here instead of hardcoded platform policy in rule evaluators.
 * risk: dependency, data_consistency
 */
export async function loadArchitectureCatalogs(
  architectureRoot: string
): Promise<ArchitectureCatalogs> {
  const [
    repositories,
    splitTriggers,
    repositoryRoadmap,
    extendedRoadmap,
    services,
    datastores,
    dataClasses,
    costBudgets,
    sloTiers,
    events,
    externalProviders,
    operationalAssets,
    supportSourceAdapters,
    repositoryRules,
    moneyRules,
    providerRules,
    aiDataAccessRules,
    aiInferenceRules,
    dataAccessRules,
    tierRules,
    apiRules,
    tokenRules
  ] = await settleInCanonicalOrder([
    loadYamlFile<RepositoriesCatalog>(
      architectureRoot,
      'catalogs/repositories.yaml'
    ),
    loadOptionalYamlFile<SplitTriggersCatalog>(
      architectureRoot,
      'catalogs/split-triggers.yaml',
      { split_triggers: [] }
    ),
    loadTextFile(architectureRoot, 'ROADMAP.md'),
    loadTextFile(architectureRoot, 'docs/26-eighteen-month-roadmap.md'),
    loadYamlFile<ServicesCatalog>(architectureRoot, 'catalogs/services.yaml'),
    loadYamlFile<DatastoresCatalog>(
      architectureRoot,
      'catalogs/datastores.yaml'
    ),
    loadYamlFile<DataClassesCatalog>(
      architectureRoot,
      'catalogs/data-classes.yaml'
    ),
    loadYamlFile<CostBudgetsCatalog>(
      architectureRoot,
      'catalogs/cost-budgets.yaml'
    ),
    loadYamlFile<SloTiersCatalog>(architectureRoot, 'catalogs/slo-tiers.yaml'),
    loadYamlFile<EventsCatalog>(architectureRoot, 'catalogs/events.yaml'),
    loadYamlFile<ExternalProvidersCatalog>(
      architectureRoot,
      'catalogs/external-providers.yaml'
    ),
    loadYamlFile<OperationalAssetsCatalog>(
      architectureRoot,
      'catalogs/operational-assets.yaml'
    ),
    loadOptionalYamlFile<SupportSourceAdaptersCatalog | undefined>(
      architectureRoot,
      'catalogs/support-source-adapters.yaml',
      undefined
    ),
    loadYamlFile<RepositoryRulesCatalog>(
      architectureRoot,
      'rules/repository.rules.yaml'
    ),
    loadYamlFile<MoneyRulesCatalog>(architectureRoot, 'rules/money.rules.yaml'),
    loadYamlFile<ProviderRulesCatalog>(
      architectureRoot,
      'rules/provider.rules.yaml'
    ),
    loadYamlFile<AiDataAccessRulesCatalog>(
      architectureRoot,
      'rules/ai-data-access.rules.yaml'
    ),
    loadOptionalYamlFile<AiInferenceRulesCatalog | undefined>(
      architectureRoot,
      'rules/ai-inference.rules.yaml',
      undefined
    ),
    loadYamlFile<DataAccessRulesCatalog>(
      architectureRoot,
      'rules/data-access.rules.yaml'
    ),
    loadYamlFile<TierRulesCatalog>(architectureRoot, 'rules/tier.rules.yaml'),
    loadOptionalYamlFile<ApiRulesCatalog | undefined>(
      architectureRoot,
      'rules/api.rules.yaml',
      undefined
    ),
    loadOptionalYamlFile<TokenRulesCatalog | undefined>(
      architectureRoot,
      'rules/token.rules.yaml',
      undefined
    )
  ] as const);

  return {
    repositories,
    splitTriggers,
    repositoryRoadmapText: [repositoryRoadmap, extendedRoadmap].join('\n'),
    services,
    datastores,
    dataClasses,
    costBudgets,
    sloTiers,
    events,
    externalProviders,
    operationalAssets,
    supportSourceAdapters,
    repositoryRules,
    moneyRules,
    providerRules,
    aiDataAccessRules,
    aiInferenceRules,
    dataAccessRules,
    tierRules,
    apiRules,
    tokenRules
  };
}

async function settleInCanonicalOrder<const T extends readonly unknown[]>(
  promises: { readonly [Index in keyof T]: Promise<T[Index]> }
): Promise<T> {
  const results = await Promise.allSettled(promises);

  for (const result of results) {
    if (result.status === 'rejected') {
      throw result.reason;
    }
  }

  return results.map((result) =>
    result.status === 'fulfilled' ? result.value : undefined
  ) as unknown as T;
}

async function loadYamlFile<T>(root: string, relativePath: string): Promise<T> {
  const source = await readFile(join(root, relativePath), 'utf8');
  const parsed = parse(source) as unknown;

  return parsed as T;
}

async function loadOptionalYamlFile<T>(
  root: string,
  relativePath: string,
  fallback: T
): Promise<T> {
  try {
    return await loadYamlFile<T>(root, relativePath);
  } catch (error) {
    if (isMissingPathError(error)) {
      return fallback;
    }

    throw error;
  }
}

async function loadTextFile(root: string, relativePath: string): Promise<string> {
  return readFile(join(root, relativePath), 'utf8');
}

function isMissingPathError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}
