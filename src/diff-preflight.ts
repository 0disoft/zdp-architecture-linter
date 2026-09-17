import { CliFailure } from './cli-error-report.ts';
import { formatDiagnostic, hasErrors, type ValidationResult } from './diagnostics.ts';

/** Baseline policy debt is comparable; an unreadable input model is not. */
export function assertComparablePreflight(input: {
  readonly base: ValidationResult;
  readonly head: ValidationResult;
}): void {
  const failedSides = (['base', 'head'] as const).filter((side) => hasErrors(input[side]));
  if (failedSides.length === 0) return;
  throw new CliFailure({
    code: 'validation_failed',
    publicMessage: 'Architecture comparison is blocked because input preflight failed.',
    message: [
      'Architecture comparison is blocked because input preflight failed.',
      ...failedSides.flatMap((side) => input[side].diagnostics.map((diagnostic) => `${side}: ${formatDiagnostic(diagnostic)}`))
    ].join('\n'),
    details: {
      comparisonStatus: 'comparison_blocked',
      failedSides,
      baseDiagnostics: input.base.diagnostics,
      headDiagnostics: input.head.diagnostics
    }
  });
}
