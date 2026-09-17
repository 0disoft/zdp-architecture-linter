import { statSync } from 'node:fs';
import type { ArchitectureCatalogs } from './catalog-loader.ts';
import { getStableDiagnosticFingerprint, type Diagnostic } from './diagnostics.ts';
import { validateEventSchemaCompatibility } from './event-schema-compatibility.ts';
import { createStateTransitionDiagnostics } from './state-transition-diff.ts';

export type EventSchemaCompatibilityStatus =
  | { readonly status: 'checked' }
  | { readonly status: 'not_run'; readonly reason: 'source_roots_not_provided' };
export interface ArchitectureDiffReport {
  readonly changes: ArchitectureCatalogChanges;
  readonly diagnostics: { readonly added: readonly Diagnostic[]; readonly resolved: readonly Diagnostic[]; };
  readonly riskNotes: readonly string[];
  readonly eventSchemaCompatibility?: EventSchemaCompatibilityStatus;
}
export interface ArchitectureCatalogChanges {
  readonly repositories: CatalogCollectionDiff; readonly services: CatalogCollectionDiff;
  readonly datastores: CatalogCollectionDiff; readonly events: CatalogCollectionDiff;
  readonly operationalAssets?: CatalogCollectionDiff;
}
export interface CatalogCollectionDiff { readonly added: readonly string[]; readonly removed: readonly string[]; readonly changed: readonly string[]; }
export interface CreateArchitectureDiffReportInput {
  readonly baseCatalogs: ArchitectureCatalogs; readonly headCatalogs: ArchitectureCatalogs;
  readonly baseDiagnostics: readonly Diagnostic[]; readonly headDiagnostics: readonly Diagnostic[];
  readonly observedAt?: Date;
  readonly sourceRoots?: { readonly baseArchitectureRoot: string; readonly headArchitectureRoot: string; };
}
interface CollectionItem { readonly id: string; readonly value: unknown; }
type CollectionName = keyof ArchitectureCatalogChanges;
const EMPTY_COLLECTION_DIFF: CatalogCollectionDiff = { added: [], removed: [], changed: [] };

export function createArchitectureDiffReport(input: CreateArchitectureDiffReportInput): ArchitectureDiffReport {
  const repositories = diffCollection(getCollection(input.baseCatalogs.repositories.repositories, 'name'), getCollection(input.headCatalogs.repositories.repositories, 'name'));
  const services = diffCollection(getCollection(input.baseCatalogs.services.services, 'id'), getCollection(input.headCatalogs.services.services, 'id'));
  const datastores = diffCollection(getCollection(input.baseCatalogs.datastores.datastores, 'id'), getCollection(input.headCatalogs.datastores.datastores, 'id'));
  const events = diffCollection(getCollection(input.baseCatalogs.events.events, 'id'), getCollection(input.headCatalogs.events.events, 'id'));
  const compatibility = checkEventCompatibility(input.sourceRoots);
  const operationalAssets = diffCollection(getCollection(input.baseCatalogs.operationalAssets?.assets, 'id'), getCollection(input.headCatalogs.operationalAssets?.assets, 'id'));
  const diagnostics = diffDiagnostics(input.baseDiagnostics, [...input.headDiagnostics, ...compatibility.diagnostics]);
  const transitionDiagnostics = createStateTransitionDiagnostics({ baseCatalogs: input.baseCatalogs, headCatalogs: input.headCatalogs, observedAt: input.observedAt });
  return {
    changes: { repositories, services, datastores, events, operationalAssets },
    diagnostics: { added: [...diagnostics.added, ...transitionDiagnostics], resolved: diagnostics.resolved },
    eventSchemaCompatibility: compatibility.result,
    riskNotes: [
      ...createRepositoryRiskNotes(input.baseCatalogs, input.headCatalogs, repositories),
      ...createServiceRiskNotes(input.baseCatalogs, input.headCatalogs, services),
      ...createOperationalAssetRiskNotes(input.baseCatalogs, input.headCatalogs, operationalAssets)
    ]
  };
}
export function formatArchitectureDiffReportText(report: ArchitectureDiffReport): string {
  return [
    '# zdp-arch diff', '',
    ...formatCollection('repositories', report.changes.repositories), '',
    ...formatCollection('services', report.changes.services), '',
    ...formatCollection('datastores', report.changes.datastores), '',
    ...formatCollection('events', report.changes.events), '',
    ...formatCollection('operationalAssets', report.changes.operationalAssets ?? EMPTY_COLLECTION_DIFF), '',
    '## diagnostics', `- added: ${report.diagnostics.added.length}`, `- resolved: ${report.diagnostics.resolved.length}`, '',
    '## event schema compatibility', report.eventSchemaCompatibility?.status === 'checked' ? 'checked' : 'not_run: source roots were not provided', '',
    '## risk notes', ...formatList(report.riskNotes)
  ].join('\n');
}
function checkEventCompatibility(roots: CreateArchitectureDiffReportInput['sourceRoots']): { readonly diagnostics: readonly Diagnostic[]; readonly result: EventSchemaCompatibilityStatus; } {
  if (roots === undefined) return { diagnostics: [], result: { status: 'not_run', reason: 'source_roots_not_provided' } };
  for (const root of [roots.baseArchitectureRoot, roots.headArchitectureRoot]) {
    if (typeof root !== 'string' || root.trim().length === 0) throw new Error('Event compatibility source roots must be non-empty paths.');
    if (!statSync(root).isDirectory()) throw new Error('Event compatibility source roots must be directories.');
  }
  return { diagnostics: validateEventSchemaCompatibility(roots), result: { status: 'checked' } };
}
function diffCollection(baseItems: readonly CollectionItem[], headItems: readonly CollectionItem[]): CatalogCollectionDiff {
  const baseById = mapById(baseItems); const headById = mapById(headItems);
  const baseIds = new Set(baseById.keys()); const headIds = new Set(headById.keys());
  return {
    added: [...headIds].filter((id) => !baseIds.has(id)).sort(), removed: [...baseIds].filter((id) => !headIds.has(id)).sort(),
    changed: [...headIds].filter((id) => baseIds.has(id)).filter((id) => stableStringify(baseById.get(id)) !== stableStringify(headById.get(id))).sort()
  };
}
function getCollection(value: unknown, idField: string): readonly CollectionItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const id = item[idField]; if (typeof id !== 'string') return [];
    const normalizedId = id.trim(); return normalizedId.length > 0 ? [{ id: normalizedId, value: item }] : [];
  });
}
function diffDiagnostics(baseDiagnostics: readonly Diagnostic[], headDiagnostics: readonly Diagnostic[]): ArchitectureDiffReport['diagnostics'] {
  const baseByKey = new Map(baseDiagnostics.map((diagnostic) => [diagnosticKey(diagnostic), diagnostic]));
  const headByKey = new Map(headDiagnostics.map((diagnostic) => [diagnosticKey(diagnostic), diagnostic]));
  return {
    added: [...headByKey.entries()].filter(([key]) => !baseByKey.has(key)).map(([, diagnostic]) => diagnostic),
    resolved: [...baseByKey.entries()].filter(([key]) => !headByKey.has(key)).map(([, diagnostic]) => diagnostic)
  };
}
function createRepositoryRiskNotes(base: ArchitectureCatalogs, head: ArchitectureCatalogs, diff: CatalogCollectionDiff): readonly string[] {
  const before = mapById(getCollection(base.repositories.repositories, 'name')); const after = mapById(getCollection(head.repositories.repositories, 'name'));
  return diff.changed.flatMap((id) => createFieldChangeNotes({ collection: 'repositories', id, baseValue: before.get(id), headValue: after.get(id), fields: ['repo_stage', 'kind', 'owner', 'risk_level', 'area', 'agent_review'] }));
}
function createServiceRiskNotes(base: ArchitectureCatalogs, head: ArchitectureCatalogs, diff: CatalogCollectionDiff): readonly string[] {
  const before = mapById(getCollection(base.services.services, 'id')); const after = mapById(getCollection(head.services.services, 'id'));
  return diff.changed.flatMap((id) => createFieldChangeNotes({ collection: 'services', id, baseValue: before.get(id), headValue: after.get(id), fields: [
    'direct_datastore_access', 'dependencies.datastores', 'data.money_movement', 'data.ai_user_data', 'data.payment_data', 'data.crypto_key_material', 'runtime', 'tier', 'status'
  ] }));
}
function createOperationalAssetRiskNotes(base: ArchitectureCatalogs, head: ArchitectureCatalogs, diff: CatalogCollectionDiff): readonly string[] {
  const before = mapById(getCollection(base.operationalAssets?.assets, 'id')); const after = mapById(getCollection(head.operationalAssets?.assets, 'id'));
  return diff.changed.flatMap((id) => createFieldChangeNotes({ collection: 'operationalAssets', id, baseValue: before.get(id), headValue: after.get(id), fields: ['status', 'environment', 'criticality', 'security.public_access'] }));
}
function createFieldChangeNotes(input: { readonly collection: CollectionName; readonly id: string; readonly baseValue: unknown; readonly headValue: unknown; readonly fields: readonly string[]; }): readonly string[] {
  return input.fields.filter((field) => stableStringify(readPath(input.baseValue, field)) !== stableStringify(readPath(input.headValue, field))).map((field) =>
    `${input.collection}.${input.id}: ${field} changed from ${formatValue(readPath(input.baseValue, field))} to ${formatValue(readPath(input.headValue, field))}`);
}
function readPath(value: unknown, path: string): unknown { return path.split('.').reduce<unknown>((current, segment) => isRecord(current) ? current[segment] : undefined, value); }
function mapById(items: readonly CollectionItem[]): Map<string, unknown> { return new Map(items.map((item) => [item.id, item.value])); }
function diagnosticKey(diagnostic: Diagnostic): string { return JSON.stringify([getStableDiagnosticFingerprint(diagnostic), diagnostic.severity]); }
function stableStringify(value: unknown): string { return JSON.stringify(sortValue(value)); }
function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
}
function formatCollection(name: CollectionName, diff: CatalogCollectionDiff): readonly string[] { return [`## ${name}`, `- added: ${formatInlineList(diff.added)}`, `- removed: ${formatInlineList(diff.removed)}`, `- changed: ${formatInlineList(diff.changed)}`]; }
function formatList(values: readonly string[]): readonly string[] { return values.length === 0 ? ['- none'] : values.map((value) => `- ${value}`); }
function formatInlineList(values: readonly string[]): string { return values.length === 0 ? 'none' : values.join(', '); }
function formatValue(value: unknown): string { return value === undefined ? 'undefined' : stableStringify(value); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
