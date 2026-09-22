import { createHash } from 'node:crypto';

export type DiagnosticSeverity = 'error' | 'warning';
export interface Diagnostic {
  readonly ruleId: string;
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  readonly file: string;
  readonly path: string;
  readonly fingerprint?: string;
  readonly sourceProof?: string;
  readonly helpUri?: string;
  readonly schemaError?: {
    readonly keyword: string;
    readonly instancePath: string;
    readonly schemaPath: string;
    readonly missingProperty?: string;
    readonly additionalProperty?: string;
  };
}
export interface ValidationResult { readonly diagnostics: readonly Diagnostic[]; }
const DIAGNOSTIC_FINGERPRINT_NAMESPACE = 'zdp-architecture-linter/diagnostic/v1';

export function hasErrors(result: ValidationResult): boolean {
  return result.diagnostics.some((diagnostic) => diagnostic.severity === 'error');
}
export function getDiagnosticFingerprint(diagnostic: Diagnostic): string {
  return fingerprint(diagnostic, DIAGNOSTIC_FINGERPRINT_NAMESPACE, diagnostic.path.trim());
}
export function getStableDiagnosticFingerprint(diagnostic: Diagnostic): string {
  const path = diagnostic.path.trim().replace(/\[(?:\d+:|id=)([^\]]+)\]/g, (_match: string, id: string) => `[@${JSON.stringify(id)}]`);
  return fingerprint(diagnostic, 'zdp-architecture-linter/diagnostic/v2', path);
}
function fingerprint(diagnostic: Diagnostic, namespace: string, path: string): string {
  const explicitFingerprint = diagnostic.fingerprint?.trim();
  if (explicitFingerprint !== undefined && explicitFingerprint.length > 0) return explicitFingerprint;
  return createHash('sha256').update([namespace, diagnostic.ruleId.trim(), normalizeDiagnosticFile(diagnostic.file), path].join('\0')).digest('hex');
}
export function formatDiagnostic(diagnostic: Diagnostic): string {
  return [`[${diagnostic.severity}] ${diagnostic.ruleId}`, diagnostic.file, diagnostic.path, diagnostic.message].join(' ');
}
function normalizeDiagnosticFile(file: string): string {
  return file.trim().replaceAll('\\', '/').replace(/^\.\/+/, '');
}
