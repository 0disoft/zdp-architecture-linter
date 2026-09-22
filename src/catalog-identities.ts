import type { ArchitectureCatalogs } from './catalog-loader.ts';
import type { Diagnostic } from './diagnostics.ts';

export function validateCatalogIdentities(catalogs: ArchitectureCatalogs): readonly Diagnostic[] {
  const collections: ReadonlyArray<readonly [unknown, string, string, string]> = [
    [catalogs.repositories, 'repositories', 'name', 'catalogs/repositories.yaml'],
    [catalogs.services, 'services', 'id', 'catalogs/services.yaml'],
    [catalogs.datastores, 'datastores', 'id', 'catalogs/datastores.yaml'],
    [catalogs.dataClasses, 'data_classes', 'id', 'catalogs/data-classes.yaml'],
    [catalogs.events, 'events', 'id', 'catalogs/events.yaml'],
    [catalogs.externalProviders, 'providers', 'id', 'catalogs/external-providers.yaml'],
    [catalogs.operationalAssets, 'assets', 'id', 'catalogs/operational-assets.yaml'],
    [catalogs.supportSourceAdapters, 'adapters', 'id', 'catalogs/support-source-adapters.yaml'],
    [catalogs.splitTriggers, 'split_triggers', 'domain', 'catalogs/split-triggers.yaml'],
    [catalogs.costBudgets, 'service_budgets', 'id', 'catalogs/cost-budgets.yaml'],
    [catalogs.costBudgets, 'product_unit_budgets', 'id', 'catalogs/cost-budgets.yaml'],
    [catalogs.costBudgets, 'automatic_action_policies', 'id', 'catalogs/cost-budgets.yaml'],
    [catalogs.sloTiers, 'tiers', 'id', 'catalogs/slo-tiers.yaml']
  ];
  return collections.flatMap(([value, collection, identity, file]) =>
    validateCollectionIdentities(isRecord(value) ? value[collection] : undefined, file, collection, identity)
  );
}

export function validateCollectionIdentities(value: unknown, file: string, collection: string, identity: string): readonly Diagnostic[] {
  if (!Array.isArray(value)) return [];
  const seen = new Map<string, number>();
  const diagnostics: Diagnostic[] = [];
  for (const [index, item] of value.entries()) {
    if (!isRecord(item)) continue;
    const raw = item[identity];
    if (typeof raw !== 'string' || raw.trim().length === 0) continue;
    const id = raw.trim();
    const first = seen.get(id);
    if (first !== undefined) {
      diagnostics.push({
        ruleId: 'ZDP-CATALOG-ID-001', severity: 'error', file,
        path: `${collection}[${index}].${identity}`,
        message: `Duplicate catalog identity; the first declaration is ${collection}[${first}].${identity}. Remove or rename the duplicate before building indexes.`
      });
    } else seen.set(id, index);
  }
  return diagnostics;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
