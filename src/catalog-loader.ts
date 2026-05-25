import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';

export interface ArchitectureCatalogs {
  readonly repositories: RepositoriesCatalog;
  readonly services: ServicesCatalog;
  readonly datastores: DatastoresCatalog;
  readonly dataClasses: DataClassesCatalog;
  readonly events: EventsCatalog;
  readonly externalProviders: ExternalProvidersCatalog;
  readonly repositoryRules: RepositoryRulesCatalog;
  readonly moneyRules: MoneyRulesCatalog;
  readonly providerRules: ProviderRulesCatalog;
  readonly aiDataAccessRules: AiDataAccessRulesCatalog;
  readonly dataAccessRules: DataAccessRulesCatalog;
}

export interface RepositoriesCatalog {
  readonly repositories?: unknown;
}

export interface ServicesCatalog {
  readonly services?: unknown;
}

export interface DatastoresCatalog {
  readonly datastores?: unknown;
}

export interface DataClassesCatalog {
  readonly data_classes?: unknown;
}

export interface EventsCatalog {
  readonly events?: unknown;
}

export interface ExternalProvidersCatalog {
  readonly providers?: unknown;
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

export interface DataAccessRulesCatalog {
  readonly rules?: unknown;
}

export async function loadArchitectureCatalogs(
  architectureRoot: string
): Promise<ArchitectureCatalogs> {
  return {
    repositories: await loadYamlFile<RepositoriesCatalog>(
      architectureRoot,
      'catalogs/repositories.yaml'
    ),
    services: await loadYamlFile<ServicesCatalog>(
      architectureRoot,
      'catalogs/services.yaml'
    ),
    datastores: await loadYamlFile<DatastoresCatalog>(
      architectureRoot,
      'catalogs/datastores.yaml'
    ),
    dataClasses: await loadYamlFile<DataClassesCatalog>(
      architectureRoot,
      'catalogs/data-classes.yaml'
    ),
    events: await loadYamlFile<EventsCatalog>(
      architectureRoot,
      'catalogs/events.yaml'
    ),
    externalProviders: await loadYamlFile<ExternalProvidersCatalog>(
      architectureRoot,
      'catalogs/external-providers.yaml'
    ),
    repositoryRules: await loadYamlFile<RepositoryRulesCatalog>(
      architectureRoot,
      'rules/repository.rules.yaml'
    ),
    moneyRules: await loadYamlFile<MoneyRulesCatalog>(
      architectureRoot,
      'rules/money.rules.yaml'
    ),
    providerRules: await loadYamlFile<ProviderRulesCatalog>(
      architectureRoot,
      'rules/provider.rules.yaml'
    ),
    aiDataAccessRules: await loadYamlFile<AiDataAccessRulesCatalog>(
      architectureRoot,
      'rules/ai-data-access.rules.yaml'
    ),
    dataAccessRules: await loadYamlFile<DataAccessRulesCatalog>(
      architectureRoot,
      'rules/data-access.rules.yaml'
    )
  };
}

async function loadYamlFile<T>(root: string, relativePath: string): Promise<T> {
  const source = await readFile(join(root, relativePath), 'utf8');
  const parsed = parse(source) as unknown;

  return parsed as T;
}
