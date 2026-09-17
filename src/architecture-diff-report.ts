import { formatDiagnostic, type Diagnostic } from './diagnostics.ts';
import { formatArchitectureDiffReportText as formatSummary, type ArchitectureDiffReport } from './architecture-diff-core.ts';
export { createArchitectureDiffReport } from './architecture-diff-core.ts';
export type {
  ArchitectureDiffReport, ArchitectureCatalogChanges, CatalogCollectionDiff, CreateArchitectureDiffReportInput
} from './architecture-diff-core.ts';

/** Keep the machine-readable diff unchanged and put actionable failures first. */
export function formatArchitectureDiffReportText(report: ArchitectureDiffReport): string {
  const summary = formatSummary(report);
  const headingEnd = summary.indexOf('\n');
  const added = [...report.diagnostics.added].sort(compareDiagnostics);
  const details = added.length === 0 ? ['No new diagnostics.'] : added.map((diagnostic) =>
    formatDiagnostic(diagnostic).replaceAll('\r', '\\r').replaceAll('\n', '\\n')
  );
  return [summary.slice(0, headingEnd), '', '## added diagnostics', ...details, summary.slice(headingEnd)].join('\n');
}
function compareDiagnostics(left: Diagnostic, right: Diagnostic): number {
  return Number(left.severity !== 'error') - Number(right.severity !== 'error') ||
    left.file.localeCompare(right.file) || left.path.localeCompare(right.path) || left.ruleId.localeCompare(right.ruleId);
}
