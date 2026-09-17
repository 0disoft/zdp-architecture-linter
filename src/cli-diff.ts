import { createArchitectureDiffReport, formatArchitectureDiffReportText } from './architecture-diff-report.ts';
import { loadArchitectureSnapshot } from './git-architecture-snapshot.ts';
import { validateArchitecture } from './validation.ts';
import { loadValidationContext } from './validation-context.ts';

export interface DiffCommand {
  readonly architectureRoot: string;
  readonly base: string;
  readonly head?: string;
  readonly failOnNewError: boolean;
  readonly json: boolean;
}

/** Keep snapshot cleanup and diff execution separate from argument parsing. */
export async function runCliDiff(command: DiffCommand): Promise<number> {
  const snapshots: Awaited<ReturnType<typeof loadArchitectureSnapshot>>[] = [];
  try {
    const baseSnapshot = await loadArchitectureSnapshot({ architectureRoot: command.architectureRoot, ref: command.base });
    snapshots.push(baseSnapshot);
    const headSnapshot = await loadArchitectureSnapshot({ architectureRoot: command.architectureRoot, ref: command.head });
    snapshots.push(headSnapshot);
    const [baseContext, headContext] = await Promise.all([
      loadValidationContext({ architectureRoot: baseSnapshot.root }),
      loadValidationContext({ architectureRoot: headSnapshot.root })
    ]);
    const [baseValidation, headValidation] = await Promise.all([
      validateArchitecture({ context: baseContext }),
      validateArchitecture({ context: headContext })
    ]);
    const report = createArchitectureDiffReport({
      baseCatalogs: baseContext.catalogs,
      headCatalogs: headContext.catalogs,
      baseDiagnostics: baseValidation.diagnostics,
      headDiagnostics: headValidation.diagnostics
    });
    console.log(command.json ? JSON.stringify(report, null, 2) : formatArchitectureDiffReportText(report));
    return command.failOnNewError && report.diagnostics.added.some((diagnostic) => diagnostic.severity === 'error') ? 1 : 0;
  } finally {
    await Promise.all(snapshots.map((snapshot) => snapshot.cleanup()));
  }
}
