import type { ArchitectureGraph } from './architecture-graph.ts';

export type ArchitectureListKind = 'repos' | 'services';

export type ArchitectureListReport =
  | ArchitectureRepositoryListReport
  | ArchitectureServiceListReport;

export interface ArchitectureRepositoryListReport {
  readonly schemaVersion: 1;
  readonly kind: 'repos';
  readonly filters: {
    readonly stage?: string;
    readonly area?: string;
    readonly agentReviewStatus?: string;
  };
  readonly count: number;
  readonly items: readonly ArchitectureRepositoryListItem[];
}

export interface ArchitectureServiceListReport {
  readonly schemaVersion: 1;
  readonly kind: 'services';
  readonly filters: {
    readonly repo?: string;
  };
  readonly count: number;
  readonly items: readonly ArchitectureServiceListItem[];
}

export interface ArchitectureRepositoryListItem {
  readonly name: string;
  readonly area: string | null;
  readonly kind: string | null;
  readonly repoStage: string | null;
  readonly owner: string | null;
  readonly riskLevel: string | null;
  readonly agentReviewStatus: string | null;
}

export interface ArchitectureServiceListItem {
  readonly id: string;
  readonly repo: string | null;
  readonly tier: string | null;
  readonly runtime: string | null;
  readonly directDatastoreAccess: readonly string[];
}

export function createArchitectureListReport(input: {
  readonly graph: ArchitectureGraph;
  readonly kind: 'repos';
  readonly filters?: {
    readonly stage?: string;
    readonly area?: string;
    readonly agentReviewStatus?: string;
  };
}): ArchitectureRepositoryListReport;
export function createArchitectureListReport(input: {
  readonly graph: ArchitectureGraph;
  readonly kind: 'services';
  readonly filters?: {
    readonly repo?: string;
  };
}): ArchitectureServiceListReport;
export function createArchitectureListReport(input: {
  readonly graph: ArchitectureGraph;
  readonly kind: ArchitectureListKind;
  readonly filters?: Record<string, string | undefined>;
}): ArchitectureListReport {
  if (input.kind === 'repos') {
    const filters = {
      stage: normalizeFilter(input.filters?.stage),
      area: normalizeFilter(input.filters?.area),
      agentReviewStatus: normalizeFilter(input.filters?.agentReviewStatus)
    };
    const items = readRepositoryItems(input.graph.indexes.repositories.byName)
      .filter((item) => matchesOptionalFilter(item.repoStage, filters.stage))
      .filter((item) => matchesOptionalFilter(item.area, filters.area))
      .filter((item) =>
        matchesOptionalFilter(item.agentReviewStatus, filters.agentReviewStatus)
      );

    return {
      schemaVersion: 1,
      kind: 'repos',
      filters,
      count: items.length,
      items
    };
  }

  const filters = {
    repo: normalizeFilter(input.filters?.repo)
  };
  const items = readServiceItems(input.graph.catalogs.services)
    .filter((item) => matchesOptionalFilter(item.repo, filters.repo));

  return {
    schemaVersion: 1,
    kind: 'services',
    filters,
    count: items.length,
    items
  };
}

export function formatArchitectureListReportText(
  report: ArchitectureListReport
): string {
  const lines = [
    `zdp-arch: ${report.kind}`,
    formatFilters(report.filters),
    `count: ${report.count}`
  ].filter((line) => line.length > 0);

  for (const item of report.items) {
    lines.push(formatListItem(item));
  }

  return lines.join('\n');
}

function readRepositoryItems(
  repositoriesByName: ReadonlyMap<
    string,
    {
      readonly name: string;
      readonly area: string | null;
      readonly kind: string | null;
      readonly repoStage: string | null;
      readonly owner: string | null;
      readonly riskLevel: string | null;
      readonly agentReview: { readonly status: string | null } | null;
    }
  >
): readonly ArchitectureRepositoryListItem[] {
  return Array.from(repositoriesByName.values())
    .map((entry): ArchitectureRepositoryListItem => ({
      name: entry.name,
      area: entry.area,
      kind: entry.kind,
      repoStage: entry.repoStage,
      owner: entry.owner,
      riskLevel: entry.riskLevel,
      agentReviewStatus: entry.agentReview?.status ?? null
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function readServiceItems(value: unknown): readonly ArchitectureServiceListItem[] {
  if (!isRecord(value) || !Array.isArray(value.services)) {
    return [];
  }

  return value.services
    .flatMap((entry): ArchitectureServiceListItem[] => {
      if (!isRecord(entry)) {
        return [];
      }

      const id = readString(entry, 'id');

      if (id === null) {
        return [];
      }

      return [
        {
          id,
          repo: readString(entry, 'repo'),
          tier: readString(entry, 'tier'),
          runtime: readString(entry, 'runtime'),
          directDatastoreAccess: readStringArray(entry.direct_datastore_access)
        }
      ];
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

function formatFilters(filters: Readonly<Record<string, string | undefined>>): string {
  const entries = Object.entries(filters)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([key, value]) => `${key}=${value}`);

  return entries.length === 0 ? '' : `filters: ${entries.join(' ')}`;
}

function formatListItem(
  item: ArchitectureRepositoryListItem | ArchitectureServiceListItem
): string {
  if ('name' in item) {
    return [
      `- ${item.name}`,
      `area=${formatValue(item.area)}`,
      `kind=${formatValue(item.kind)}`,
      `repoStage=${formatValue(item.repoStage)}`,
      `owner=${formatValue(item.owner)}`,
      `riskLevel=${formatValue(item.riskLevel)}`,
      `agentReviewStatus=${formatValue(item.agentReviewStatus)}`
    ].join(' ');
  }

  return [
    `- ${item.id}`,
    `repo=${formatValue(item.repo)}`,
    `tier=${formatValue(item.tier)}`,
    `runtime=${formatValue(item.runtime)}`,
    `directDatastoreAccess=${formatArrayValue(item.directDatastoreAccess)}`
  ].join(' ');
}

function matchesOptionalFilter(
  value: string | null,
  filter: string | undefined
): boolean {
  return filter === undefined || value === filter;
}

function normalizeFilter(value: string | undefined): string | undefined {
  const trimmed = value?.trim();

  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
}

function formatValue(value: string | null): string {
  return value ?? '-';
}

function formatArrayValue(value: readonly string[]): string {
  return value.length === 0 ? '-' : value.join(',');
}

function readString(value: Record<string, unknown>, field: string): string | null {
  const candidate = value[field];

  return typeof candidate === 'string' && candidate.trim().length > 0
    ? candidate.trim()
    : null;
}

function readStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) =>
    typeof entry === 'string' && entry.trim().length > 0 ? [entry.trim()] : []
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
