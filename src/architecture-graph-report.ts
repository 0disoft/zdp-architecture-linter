import type { ArchitectureGraph, ArchitectureGraphNodes } from './architecture-graph.ts';

export interface ArchitectureGraphReport {
  readonly summary: ArchitectureGraphNodeSummary;
  readonly nodes: ArchitectureGraphNodes;
  readonly edges: ArchitectureGraph['edges'];
}

export interface ArchitectureGraphNodeSummary {
  readonly repositories: number;
  readonly services: number;
  readonly datastores: number;
  readonly dataClasses: number;
  readonly events: number;
  readonly externalProviders: number;
  readonly edges: number;
}

export function createArchitectureGraphReport(
  graph: ArchitectureGraph
): ArchitectureGraphReport {
  return {
    summary: {
      repositories: graph.nodes.repositories.length,
      services: graph.nodes.services.length,
      datastores: graph.nodes.datastores.length,
      dataClasses: graph.nodes.dataClasses.length,
      events: graph.nodes.events.length,
      externalProviders: graph.nodes.externalProviders.length,
      edges: graph.edges.length
    },
    nodes: graph.nodes,
    edges: graph.edges
  };
}

export function formatArchitectureGraphReportText(
  report: ArchitectureGraphReport
): string {
  return [
    'zdp-arch: graph loaded',
    `repositories: ${report.summary.repositories}`,
    `services: ${report.summary.services}`,
    `datastores: ${report.summary.datastores}`,
    `dataClasses: ${report.summary.dataClasses}`,
    `events: ${report.summary.events}`,
    `externalProviders: ${report.summary.externalProviders}`,
    `edges: ${report.summary.edges}`
  ].join('\n');
}
