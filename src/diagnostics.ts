export type DiagnosticSeverity = 'error' | 'warning';

export interface Diagnostic {
  readonly ruleId: string;
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  readonly file: string;
  readonly path: string;
}

export interface ValidationResult {
  readonly diagnostics: readonly Diagnostic[];
}

export function hasErrors(result: ValidationResult): boolean {
  return result.diagnostics.some((diagnostic) => diagnostic.severity === 'error');
}

export function formatDiagnostic(diagnostic: Diagnostic): string {
  return [
    `[${diagnostic.severity}] ${diagnostic.ruleId}`,
    diagnostic.file,
    diagnostic.path,
    diagnostic.message
  ].join(' ');
}

