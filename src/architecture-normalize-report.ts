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
  readonly edges: number;
}

export interface ArchitectureNormalizeValidationSummary {
  readonly diagnostics: number;
  readonly errors: number;
  readonly warnings: number;
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
      edges: input.graph.edges.length
    },
    repositories: input.graph.nodes.repositories,
    services: input.graph.nodes.services,
    datastores: input.graph.nodes.datastores,
    dataClasses: input.graph.nodes.dataClasses,
    events: input.graph.nodes.events,
    externalProviders: input.graph.nodes.externalProviders,
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
    `edges: ${report.summary.edges}`,
    `diagnostics: ${report.validation.diagnostics} (${report.validation.errors} errors, ${report.validation.warnings} warnings)`
  ].join('\n');
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
