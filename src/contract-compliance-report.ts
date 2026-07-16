import {
  formatDiagnostic,
  type Diagnostic,
  type ValidationResult
} from './diagnostics.ts';

export const CONTRACT_COMPLIANCE_SCHEMA_VERSION =
  'zdp.architecture.contract-compliance-report.v1' as const;

export interface ContractComplianceReport {
  readonly schemaVersion: typeof CONTRACT_COMPLIANCE_SCHEMA_VERSION;
  readonly mode: 'report-only';
  readonly status: 'failed' | 'evidence_incomplete';
  readonly repositoryRoot: string;
  readonly declaration: {
    readonly status: 'declared' | 'missing';
    readonly evidence: readonly string[];
  };
  readonly implementation: {
    readonly status: 'unknown';
    readonly reason: 'no_implementation_evidence_adapter';
  };
  readonly verification: {
    readonly status: 'passed' | 'passed_with_warnings' | 'failed';
    readonly diagnostics: readonly Diagnostic[];
    readonly summary: {
      readonly total: number;
      readonly errors: number;
      readonly warnings: number;
    };
  };
  readonly live: {
    readonly status: 'unknown';
    readonly reason: 'no_live_evidence_adapter';
  };
  readonly limitations: readonly string[];
}

export interface ContractComplianceFailureReport {
  readonly schemaVersion: typeof CONTRACT_COMPLIANCE_SCHEMA_VERSION;
  readonly mode: 'report-only';
  readonly status: 'failed';
  readonly repositoryRoot: string;
  readonly error: {
    readonly code: 'repository_or_architecture_input_unreadable_or_invalid';
  };
}

export function createContractComplianceReport(input: {
  readonly repositoryRoot: string;
  readonly serviceContractDeclared: boolean;
  readonly validation: ValidationResult;
}): ContractComplianceReport {
  const errors = countSeverity(input.validation.diagnostics, 'error');
  const warnings = countSeverity(input.validation.diagnostics, 'warning');
  const verificationStatus =
    errors > 0
      ? 'failed'
      : warnings > 0
        ? 'passed_with_warnings'
        : 'passed';

  return {
    schemaVersion: CONTRACT_COMPLIANCE_SCHEMA_VERSION,
    mode: 'report-only',
    status:
      !input.serviceContractDeclared || errors > 0
        ? 'failed'
        : 'evidence_incomplete',
    repositoryRoot: input.repositoryRoot,
    declaration: {
      status: input.serviceContractDeclared ? 'declared' : 'missing',
      evidence: input.serviceContractDeclared ? ['service.yaml'] : []
    },
    implementation: {
      status: 'unknown',
      reason: 'no_implementation_evidence_adapter'
    },
    verification: {
      status: verificationStatus,
      diagnostics: input.validation.diagnostics,
      summary: {
        total: input.validation.diagnostics.length,
        errors,
        warnings
      }
    },
    live: {
      status: 'unknown',
      reason: 'no_live_evidence_adapter'
    },
    limitations: [
      'validation_without_diagnostics_does_not_prove_runtime_implementation',
      'repository_source_does_not_prove_live_deployment_or_health'
    ]
  };
}

export function formatContractComplianceReportText(
  report: ContractComplianceReport
): string {
  return [
    '# zdp-arch compliance',
    '',
    `- status: ${report.status}`,
    `- repository: ${report.repositoryRoot}`,
    `- declaration: ${report.declaration.status}`,
    `- implementation: ${report.implementation.status}`,
    `- verification: ${report.verification.status}`,
    `- live: ${report.live.status}`,
    `- diagnostics: ${report.verification.summary.total} (${report.verification.summary.errors} errors, ${report.verification.summary.warnings} warnings)`,
    '',
    '## diagnostics',
    ...(report.verification.diagnostics.length === 0
      ? ['- none']
      : report.verification.diagnostics.map((diagnostic) =>
          formatDiagnostic(diagnostic)
        )),
    '',
    '## limitations',
    ...report.limitations.map((limitation) => `- ${limitation}`)
  ].join('\n');
}

export function createContractComplianceFailureReport(input: {
  readonly repositoryRoot: string;
}): ContractComplianceFailureReport {
  return {
    schemaVersion: CONTRACT_COMPLIANCE_SCHEMA_VERSION,
    mode: 'report-only',
    status: 'failed',
    repositoryRoot: input.repositoryRoot,
    error: {
      code: 'repository_or_architecture_input_unreadable_or_invalid'
    }
  };
}

function countSeverity(
  diagnostics: readonly Diagnostic[],
  severity: Diagnostic['severity']
): number {
  return diagnostics.filter((diagnostic) => diagnostic.severity === severity)
    .length;
}
