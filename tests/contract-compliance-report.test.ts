import { describe, expect, test } from 'bun:test';
import {
  CONTRACT_COMPLIANCE_SCHEMA_VERSION,
  createContractComplianceFailureReport,
  createContractComplianceReport,
  formatContractComplianceReportText
} from '../src/contract-compliance-report.ts';

describe('contract compliance report', () => {
  test('keeps implementation and live status unknown after static validation passes', () => {
    const report = createContractComplianceReport({
      repositoryRoot: 'C:/workspace/zdp-test-repository',
      serviceContractDeclared: true,
      validation: { diagnostics: [] }
    });

    expect(report).toMatchObject({
      schemaVersion: CONTRACT_COMPLIANCE_SCHEMA_VERSION,
      mode: 'report-only',
      status: 'evidence_incomplete',
      declaration: {
        status: 'declared',
        evidence: ['service.yaml']
      },
      implementation: {
        status: 'unknown',
        reason: 'no_implementation_evidence_adapter'
      },
      verification: {
        status: 'passed',
        summary: { total: 0, errors: 0, warnings: 0 }
      },
      live: {
        status: 'unknown',
        reason: 'no_live_evidence_adapter'
      }
    });
    expect(report.limitations).toContain(
      'validation_without_diagnostics_does_not_prove_runtime_implementation'
    );
  });

  test('reports declaration and validation failures without discarding diagnostics', () => {
    const diagnostic = {
      ruleId: 'ZDP-TEST-001',
      severity: 'error' as const,
      message: 'test contract failed',
      file: 'service.yaml',
      path: 'service.id'
    };
    const report = createContractComplianceReport({
      repositoryRoot: 'C:/workspace/zdp-test-repository',
      serviceContractDeclared: false,
      validation: { diagnostics: [diagnostic] }
    });

    expect(report.status).toBe('failed');
    expect(report.declaration).toEqual({ status: 'missing', evidence: [] });
    expect(report.verification).toEqual({
      status: 'failed',
      diagnostics: [diagnostic],
      summary: { total: 1, errors: 1, warnings: 0 }
    });
  });

  test('formats the evidence boundary in human-readable output', () => {
    const report = createContractComplianceReport({
      repositoryRoot: 'C:/workspace/zdp-test-repository',
      serviceContractDeclared: true,
      validation: {
        diagnostics: [
          {
            ruleId: 'ZDP-TEST-002',
            severity: 'warning',
            message: 'review needed',
            file: 'service.yaml',
            path: 'service.status'
          }
        ]
      }
    });
    const text = formatContractComplianceReportText(report);

    expect(text).toContain('- status: evidence_incomplete');
    expect(text).toContain('- verification: passed_with_warnings');
    expect(text).toContain('- implementation: unknown');
    expect(text).toContain('- live: unknown');
    expect(text).toContain(
      '[warning] ZDP-TEST-002 service.yaml service.status review needed'
    );
  });

  test('redacts unreadable or invalid input failures to a stable error code', () => {
    expect(
      createContractComplianceFailureReport({
        repositoryRoot: 'C:/workspace/zdp-test-repository'
      })
    ).toEqual({
      schemaVersion: CONTRACT_COMPLIANCE_SCHEMA_VERSION,
      mode: 'report-only',
      status: 'failed',
      repositoryRoot: 'C:/workspace/zdp-test-repository',
      error: {
        code: 'repository_or_architecture_input_unreadable_or_invalid',
        message: 'Repository or architecture input is unreadable or invalid.'
      }
    });
  });
});
