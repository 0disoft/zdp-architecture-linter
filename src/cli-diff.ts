import { createArchitectureDiffReport, formatArchitectureDiffReportText } from './architecture-diff-report.ts';
import { assertComparablePreflight } from './diff-preflight.ts';
import {
  assertManifestUnchanged, hashArchitectureInputs, loadDiffValidationContext,
  loadProvenanceSnapshot, readLinterVersion, type DiffProvenance
} from './diff-provenance.ts';
import { validateArchitecture } from './validation.ts';

export interface DiffCommand {
  readonly architectureRoot: string; readonly base: string; readonly head?: string;
  readonly failOnNewError: boolean; readonly json: boolean;
}
export async function runCliDiff(command: DiffCommand): Promise<number> {
  const observedAt = new Date();
  const snapshots: Awaited<ReturnType<typeof loadProvenanceSnapshot>>[] = [];
  try {
    const base = await loadProvenanceSnapshot(command.architectureRoot, command.base); snapshots.push(base);
    const head = await loadProvenanceSnapshot(command.architectureRoot, command.head); snapshots.push(head);
    const [baseInput, headInput, version] = await Promise.all([
      hashArchitectureInputs(base.snapshot.root), hashArchitectureInputs(head.snapshot.root), readLinterVersion()
    ]);
    const [baseContext, headContext] = await Promise.all([
      loadDiffValidationContext(base.snapshot.root, observedAt), loadDiffValidationContext(head.snapshot.root, observedAt)
    ]);
    assertComparablePreflight({ base: baseContext.catalogSchemaPreflight.validation, head: headContext.catalogSchemaPreflight.validation });
    const [baseValidation, headValidation] = await Promise.all([validateArchitecture({ context: baseContext }), validateArchitecture({ context: headContext })]);
    const result = createArchitectureDiffReport({
      baseCatalogs: baseContext.catalogs, headCatalogs: headContext.catalogs,
      baseDiagnostics: baseValidation.diagnostics, headDiagnostics: headValidation.diagnostics, observedAt,
      sourceRoots: { baseArchitectureRoot: base.snapshot.root, headArchitectureRoot: head.snapshot.root }
    });
    if (base.source.kind === 'worktree') assertManifestUnchanged(baseInput, await hashArchitectureInputs(base.snapshot.root));
    if (head.source.kind === 'worktree') assertManifestUnchanged(headInput, await hashArchitectureInputs(head.snapshot.root));
    const provenance: DiffProvenance = {
      schemaVersion: 'zdp-architecture-linter/diff-provenance/v1', observedAt: observedAt.toISOString(),
      tool: { version, bunVersion: Bun.version },
      base: { ...base.source, input: baseInput }, head: { ...head.source, input: headInput }
    };
    const report = { ...result, provenance };
    console.log(command.json ? JSON.stringify(report, null, 2) : formatArchitectureDiffReportText(report));
    if (report.eventSchemaCompatibility?.status !== 'checked') return 1;
    return command.failOnNewError && report.diagnostics.added.some((diagnostic) => diagnostic.severity === 'error') ? 1 : 0;
  } finally { await Promise.all(snapshots.map(({ snapshot }) => snapshot.cleanup())); }
}
