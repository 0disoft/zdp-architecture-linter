import { formatDiagnostic, type Diagnostic } from './diagnostics.ts';
import {
  createArchitectureDiffReport as createCoreReport,
  formatArchitectureDiffReportText as formatSummary,
  type ArchitectureDiffReport as CoreReport,
  type CreateArchitectureDiffReportInput
} from './architecture-diff-core.ts';
import { diffArchitectureInputs, type ArchitectureInputChange } from './architecture-input-diff.ts';
export type { ArchitectureCatalogChanges, CatalogCollectionDiff, CreateArchitectureDiffReportInput } from './architecture-diff-core.ts';
export interface ArchitectureDiffReport extends CoreReport {
  readonly inputChanges?: readonly ArchitectureInputChange[];
}

export function createArchitectureDiffReport(input: CreateArchitectureDiffReportInput): ArchitectureDiffReport {
  return { ...createCoreReport(input), inputChanges: diffArchitectureInputs(input.baseCatalogs, input.headCatalogs) };
}
export function formatArchitectureDiffReportText(report: ArchitectureDiffReport): string {
  const summary = formatSummary(report);
  const headingEnd = summary.indexOf('\n');
  const added = [...report.diagnostics.added].sort(compareDiagnostics);
  const details = added.length === 0 ? ['No new diagnostics.'] : added.map((diagnostic) => formatDiagnostic(diagnostic).replaceAll('\r', '\\r').replaceAll('\n', '\\n'));
  const changes = report.inputChanges?.flatMap((change) => [
    `${change.status}: ${change.files.join(', ')} (fields: ${change.fields.join(', ')})`,
    ...Object.entries(change.collections).map(([name, collection]) =>
      `  ${name}: added=${collection.added.join(',') || 'none'} removed=${collection.removed.join(',') || 'none'} changed=${collection.changed.join(',') || 'none'}`)
  ]) ?? [];
  return [summary.slice(0, headingEnd), '', '## added diagnostics', ...details,
    ...(report.inputChanges === undefined ? [] : ['', '## input changes', ...(changes.length > 0 ? changes : ['No input changes.'])]),
    summary.slice(headingEnd)
  ].join('\n');
}
function compareDiagnostics(left: Diagnostic, right: Diagnostic): number {
  return Number(left.severity !== 'error') - Number(right.severity !== 'error') || left.file.localeCompare(right.file) || left.path.localeCompare(right.path) || left.ruleId.localeCompare(right.ruleId);
}
