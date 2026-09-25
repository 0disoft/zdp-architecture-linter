import { describe, expect, test } from 'bun:test';
import {
  getDiagnosticFingerprint,
  type Diagnostic
} from '../src/diagnostics.ts';

const BASE_DIAGNOSTIC: Diagnostic = {
  ruleId: 'ZDP-TEST-001',
  severity: 'error',
  file: 'catalogs/repositories.yaml',
  path: 'repositories[0:zdp-api].owner',
  message: 'Repository owner is missing.'
};

describe('diagnostic fingerprint', () => {
  test('derives a deterministic versioned SHA-256 identity', () => {
    expect(getDiagnosticFingerprint(BASE_DIAGNOSTIC)).toBe(
      'c8d19a02859980c11766608194f066ba38a3e9e8a5e25364cd22e2c80cb995d8'
    );
  });

  test('ignores presentation-only message and severity changes', () => {
    expect(
      getDiagnosticFingerprint({
        ...BASE_DIAGNOSTIC,
        severity: 'warning',
        message: 'Choose and declare the repository owner.'
      })
    ).toBe(getDiagnosticFingerprint(BASE_DIAGNOSTIC));
  });

  test('normalizes relative path aliases and Windows separators', () => {
    expect(
      getDiagnosticFingerprint({
        ...BASE_DIAGNOSTIC,
        file: '.\\catalogs\\repositories.yaml'
      })
    ).toBe(getDiagnosticFingerprint(BASE_DIAGNOSTIC));
  });

  test('changes when the logical rule location changes', () => {
    expect(
      getDiagnosticFingerprint({
        ...BASE_DIAGNOSTIC,
        path: 'repositories[0:zdp-api].risk_level'
      })
    ).not.toBe(getDiagnosticFingerprint(BASE_DIAGNOSTIC));
  });

  test('uses an explicit producer fingerprint when supplied', () => {
    expect(
      getDiagnosticFingerprint({
        ...BASE_DIAGNOSTIC,
        fingerprint: '  zdp-api-owner-missing/v1  '
      })
    ).toBe('zdp-api-owner-missing/v1');
  });
});
