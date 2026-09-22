import type { ArchitectureCatalogs } from './catalog-loader.ts';
import type { CatalogCollectionDiff } from './architecture-diff-core.ts';
interface CollectionDescriptor { readonly field: string; readonly identity: string; }
interface InputDescriptor { readonly files: readonly string[]; readonly collections: readonly CollectionDescriptor[]; }

/** Exhaustive against the loader's public output: adding an input requires a diff mapping. */
export const ARCHITECTURE_INPUTS = {
  repositories: { files: ['catalogs/repositories.yaml'], collections: [{ field: 'repositories', identity: 'name' }] },
  splitTriggers: { files: ['catalogs/split-triggers.yaml'], collections: [{ field: 'split_triggers', identity: 'domain' }] },
  repositoryRoadmapText: { files: ['ROADMAP.md', 'docs/26-eighteen-month-roadmap.md'], collections: [] },
  services: { files: ['catalogs/services.yaml'], collections: [{ field: 'services', identity: 'id' }] },
  datastores: { files: ['catalogs/datastores.yaml'], collections: [{ field: 'datastores', identity: 'id' }] },
  dataClasses: { files: ['catalogs/data-classes.yaml'], collections: [{ field: 'data_classes', identity: 'id' }] },
  costBudgets: { files: ['catalogs/cost-budgets.yaml'], collections: [{ field: 'service_budgets', identity: 'id' }, { field: 'product_unit_budgets', identity: 'id' }, { field: 'automatic_action_policies', identity: 'id' }] },
  sloTiers: { files: ['catalogs/slo-tiers.yaml'], collections: [{ field: 'tiers', identity: 'id' }] },
  events: { files: ['catalogs/events.yaml'], collections: [{ field: 'events', identity: 'id' }] },
  externalProviders: { files: ['catalogs/external-providers.yaml'], collections: [{ field: 'providers', identity: 'id' }] },
  operationalAssets: { files: ['catalogs/operational-assets.yaml'], collections: [{ field: 'assets', identity: 'id' }] },
  supportSourceAdapters: { files: ['catalogs/support-source-adapters.yaml'], collections: [{ field: 'adapters', identity: 'id' }] },
  repositoryRules: { files: ['rules/repository.rules.yaml'], collections: [] },
  moneyRules: { files: ['rules/money.rules.yaml'], collections: [{ field: 'rules', identity: 'id' }] },
  providerRules: { files: ['rules/provider.rules.yaml'], collections: [{ field: 'rules', identity: 'id' }] },
  aiDataAccessRules: { files: ['rules/ai-data-access.rules.yaml'], collections: [{ field: 'rules', identity: 'id' }] },
  aiInferenceRules: { files: ['rules/ai-inference.rules.yaml'], collections: [{ field: 'rules', identity: 'id' }] },
  dataAccessRules: { files: ['rules/data-access.rules.yaml'], collections: [{ field: 'rules', identity: 'id' }] },
  tierRules: { files: ['rules/tier.rules.yaml'], collections: [{ field: 'rules', identity: 'id' }] },
  apiRules: { files: ['rules/api.rules.yaml'], collections: [{ field: 'rules', identity: 'id' }] },
  tokenRules: { files: ['rules/token.rules.yaml'], collections: [{ field: 'rules', identity: 'id' }] }
} as const satisfies Readonly<Record<keyof ArchitectureCatalogs, InputDescriptor>>;

export interface ArchitectureInputChange {
  readonly name: keyof ArchitectureCatalogs;
  readonly files: readonly string[];
  readonly status: 'added' | 'removed' | 'changed';
  readonly fields: readonly string[];
  readonly collections: Readonly<Record<string, CatalogCollectionDiff>>;
}

export function diffArchitectureInputs(base: ArchitectureCatalogs, head: ArchitectureCatalogs): readonly ArchitectureInputChange[] {
  return (Object.keys(ARCHITECTURE_INPUTS) as (keyof ArchitectureCatalogs)[]).flatMap((name) => {
    const descriptor: InputDescriptor = ARCHITECTURE_INPUTS[name];
    const before = normalizeInput(base[name], descriptor);
    const after = normalizeInput(head[name], descriptor);
    if (stable(before) === stable(after)) return [];
    const fields = isRecord(before) && isRecord(after)
      ? [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((field) => stable(before[field]) !== stable(after[field])).sort()
      : ['$'];
    const collections = Object.fromEntries(descriptor.collections.map(({ field, identity }) => [field, diffCollection(
      isRecord(base[name]) ? base[name][field] : undefined,
      isRecord(head[name]) ? head[name][field] : undefined,
      identity
    )]));
    return [{ name, files: descriptor.files, status: base[name] === undefined ? 'added' : head[name] === undefined ? 'removed' : 'changed', fields, collections }];
  });
}
function normalizeInput(value: unknown, descriptor: InputDescriptor): unknown {
  if (!isRecord(value)) return value;
  const normalized = { ...value };
  for (const { field, identity } of descriptor.collections) {
    const collection = value[field];
    if (Array.isArray(collection) && collection.every((item) => isRecord(item) && typeof item[identity] === 'string')) {
      normalized[field] = [...collection].sort((left, right) => String(left[identity]).trim().localeCompare(String(right[identity]).trim()));
    }
  }
  return normalized;
}
function diffCollection(base: unknown, head: unknown, identity: string): CatalogCollectionDiff {
  const index = (value: unknown): Map<string, unknown> => {
    const map = new Map<string, unknown>();
    if (!Array.isArray(value)) return map;
    for (const item of value) {
      if (!isRecord(item) || typeof item[identity] !== 'string') continue;
      const id = (item[identity] as string).trim();
      if (id.length === 0) continue;
      if (map.has(id)) throw new Error('Cannot diff a collection with duplicate identities.');
      map.set(id, item);
    }
    return map;
  };
  const before = index(base);
  const after = index(head);
  return {
    added: [...after.keys()].filter((id) => !before.has(id)).sort(),
    removed: [...before.keys()].filter((id) => !after.has(id)).sort(),
    changed: [...after.keys()].filter((id) => before.has(id) && stable(before.get(id)) !== stable(after.get(id))).sort()
  };
}
function stable(value: unknown): string | undefined { return JSON.stringify(sort(value)); }
function sort(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sort);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sort(value[key])]));
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
