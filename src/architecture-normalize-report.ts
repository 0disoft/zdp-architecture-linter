import type {
  ArchitectureGraph,
  ArchitectureGraphNodes
} from './architecture-graph.ts';
import type { ValidationResult } from './diagnostics.ts';

export interface ArchitectureNormalizeReport {
  readonly schemaVersion: 1;
  readonly summary: ArchitectureNormalizeSummary;
  readonly repositories: ArchitectureGraphNodes['repositories'];
  readonly services: ArchitectureGraphNodes['services'];
  readonly datastores: ArchitectureGraphNodes['datastores'];
  readonly dataClasses: ArchitectureGraphNodes['dataClasses'];
  readonly events: ArchitectureGraphNodes['events'];
  readonly externalProviders: ArchitectureGraphNodes['externalProviders'];
  readonly supportSourceAdapters: readonly SupportSourceAdapterRegistryEntry[];
  readonly edges: ArchitectureGraph['edges'];
  readonly validation: ArchitectureNormalizeValidationSummary;
}

export interface ArchitectureNormalizeSummary {
  readonly repositories: number;
  readonly services: number;
  readonly datastores: number;
  readonly dataClasses: number;
  readonly events: number;
  readonly externalProviders: number;
  readonly supportSourceAdapters: number;
  readonly edges: number;
}

export interface ArchitectureNormalizeValidationSummary {
  readonly diagnostics: number;
  readonly errors: number;
  readonly warnings: number;
}

export interface SupportSourceAdapterRegistryEntry {
  readonly id: string;
  readonly status: string | null;
  readonly ownerRepo: string | null;
  readonly productId: string | null;
  readonly sourceService: string | null;
  readonly caseKinds: readonly string[];
  readonly projectionSchemaVersions: readonly number[];
  readonly adminApiVersions: readonly number[];
  readonly activationState: string | null;
}

export function createArchitectureNormalizeReport(input: {
  readonly graph: ArchitectureGraph;
  readonly validation: ValidationResult;
}): ArchitectureNormalizeReport {
  return {
    schemaVersion: 1,
    summary: {
      repositories: input.graph.nodes.repositories.length,
      services: input.graph.nodes.services.length,
      datastores: input.graph.nodes.datastores.length,
      dataClasses: input.graph.nodes.dataClasses.length,
      events: input.graph.nodes.events.length,
      externalProviders: input.graph.nodes.externalProviders.length,
      supportSourceAdapters: normalizeSupportSourceAdapters(input.graph.catalogs.supportSourceAdapters).length,
      edges: input.graph.edges.length
    },
    repositories: input.graph.nodes.repositories,
    services: input.graph.nodes.services,
    datastores: input.graph.nodes.datastores,
    dataClasses: input.graph.nodes.dataClasses,
    events: input.graph.nodes.events,
    externalProviders: input.graph.nodes.externalProviders,
    supportSourceAdapters: normalizeSupportSourceAdapters(input.graph.catalogs.supportSourceAdapters),
    edges: input.graph.edges,
    validation: summarizeValidation(input.validation)
  };
}

export function formatArchitectureNormalizeReportText(
  report: ArchitectureNormalizeReport
): string {
  return [
    'zdp-arch: normalized architecture registry',
    `schemaVersion: ${report.schemaVersion}`,
    `repositories: ${report.summary.repositories}`,
    `services: ${report.summary.services}`,
    `datastores: ${report.summary.datastores}`,
    `dataClasses: ${report.summary.dataClasses}`,
    `events: ${report.summary.events}`,
    `externalProviders: ${report.summary.externalProviders}`,
    `supportSourceAdapters: ${report.summary.supportSourceAdapters}`,
    `edges: ${report.summary.edges}`,
    `diagnostics: ${report.validation.diagnostics} (${report.validation.errors} errors, ${report.validation.warnings} warnings)`
  ].join('\n');
}

function normalizeSupportSourceAdapters(value: unknown): readonly SupportSourceAdapterRegistryEntry[] {
  if (!isRecord(value) || !Array.isArray(value.adapters)) return [];
  return value.adapters.filter(isRecord).flatMap((adapter) => {
    if (typeof adapter.id !== 'string') return [];
    const activation = isRecord(adapter.activation) ? adapter.activation : null;
    return [{
      id: adapter.id,
      status: readString(adapter.status),
      ownerRepo: readString(adapter.owner_repo),
      productId: readString(adapter.product_id),
      sourceService: readString(adapter.source_service),
      caseKinds: readStringArray(adapter.case_kinds),
      projectionSchemaVersions: readNumberArray(adapter.projection_schema_versions),
      adminApiVersions: readNumberArray(adapter.admin_api_versions),
      activationState: readString(activation?.state)
    }];
  });
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function readStringArray(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function readNumberArray(value: unknown): readonly number[] {
  return Array.isArray(value) ? value.filter((item): item is number => typeof item === 'number') : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function summarizeValidation(
  validation: ValidationResult
): ArchitectureNormalizeValidationSummary {
  const errors = validation.diagnostics.filter(
    (diagnostic) => diagnostic.severity === 'error'
  ).length;
  const warnings = validation.diagnostics.filter(
    (diagnostic) => diagnostic.severity === 'warning'
  ).length;

  return {
    diagnostics: validation.diagnostics.length,
    errors,
    warnings
  };
}
