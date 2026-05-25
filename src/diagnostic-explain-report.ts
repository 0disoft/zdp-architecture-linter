import type {
  ArchitectureGraph,
  ArchitectureGraphNode
} from './architecture-graph.ts';
import type {
  ArchitectureGraphEdge,
  ArchitectureGraphEndpoint,
  ArchitectureGraphNodeKind
} from './architecture-graph-edges.ts';
import {
  formatDiagnostic,
  type Diagnostic,
  type ValidationResult
} from './diagnostics.ts';

export interface DiagnosticExplainReport {
  readonly diagnostics: readonly DiagnosticExplanation[];
}

export interface DiagnosticExplanation extends Diagnostic {
  readonly relatedEdges: readonly ArchitectureGraphEdge[];
  readonly relatedNodes: readonly RelatedGraphNode[];
}

export interface RelatedGraphNode {
  readonly kind: ArchitectureGraphNodeKind;
  readonly node: ArchitectureGraphNode;
}

export function createDiagnosticExplainReport(input: {
  readonly validation: ValidationResult;
  readonly graph: ArchitectureGraph;
}): DiagnosticExplainReport {
  return {
    diagnostics: input.validation.diagnostics.map((diagnostic) =>
      explainDiagnostic(diagnostic, input.graph)
    )
  };
}

export function formatDiagnosticExplainReportText(
  report: DiagnosticExplainReport
): string {
  if (report.diagnostics.length === 0) {
    return 'zdp-arch: explanation passed';
  }

  return report.diagnostics
    .map((diagnostic) =>
      [
        formatDiagnostic(diagnostic),
        `  relatedEdges: ${diagnostic.relatedEdges.length}`,
        `  relatedNodes: ${diagnostic.relatedNodes.length}`
      ].join('\n')
    )
    .join('\n');
}

function explainDiagnostic(
  diagnostic: Diagnostic,
  graph: ArchitectureGraph
): DiagnosticExplanation {
  const relatedEdges = graph.edges.filter((edge) =>
    isRelatedSourceLocation(diagnostic, edge)
  );

  return {
    ...diagnostic,
    relatedEdges,
    relatedNodes: findRelatedNodes(graph, relatedEdges)
  };
}

function isRelatedSourceLocation(
  diagnostic: Diagnostic,
  edge: ArchitectureGraphEdge
): boolean {
  return (
    diagnostic.file === edge.file &&
    pathsOverlap(diagnostic.path, edge.path)
  );
}

function pathsOverlap(left: string, right: string): boolean {
  return (
    left === right ||
    right.startsWith(`${left}.`) ||
    right.startsWith(`${left}[`) ||
    left.startsWith(`${right}.`) ||
    left.startsWith(`${right}[`)
  );
}

function findRelatedNodes(
  graph: ArchitectureGraph,
  edges: readonly ArchitectureGraphEdge[]
): readonly RelatedGraphNode[] {
  const nodes = new Map<string, RelatedGraphNode>();

  for (const edge of edges) {
    addEndpointNode(nodes, graph, edge.from, edge);
    addEndpointNode(nodes, graph, edge.to, edge);
  }

  return Array.from(nodes.values());
}

function addEndpointNode(
  nodes: Map<string, RelatedGraphNode>,
  graph: ArchitectureGraph,
  endpoint: ArchitectureGraphEndpoint,
  edge: ArchitectureGraphEdge
): void {
  const node = findNode(graph, endpoint, edge);

  if (node === null) {
    return;
  }

  const key = `${endpoint.kind}:${endpoint.id}:${node.file}:${node.path}`;

  if (nodes.has(key)) {
    return;
  }

  nodes.set(key, {
    kind: endpoint.kind,
    node
  });
}

function findNode(
  graph: ArchitectureGraph,
  endpoint: ArchitectureGraphEndpoint,
  edge: ArchitectureGraphEdge
): ArchitectureGraphNode | null {
  const nodes = getNodesByKind(graph, endpoint.kind);

  return (
    nodes.find(
      (node) => node.id === endpoint.id && node.source === edge.source
    ) ??
    nodes.find((node) => node.id === endpoint.id) ??
    null
  );
}

function getNodesByKind(
  graph: ArchitectureGraph,
  kind: ArchitectureGraphNodeKind
): readonly ArchitectureGraphNode[] {
  switch (kind) {
    case 'repository':
      return graph.nodes.repositories;
    case 'service':
      return graph.nodes.services;
    case 'datastore':
      return graph.nodes.datastores;
    case 'dataClass':
      return graph.nodes.dataClasses;
    case 'event':
      return graph.nodes.events;
    case 'externalProvider':
      return graph.nodes.externalProviders;
  }
}
