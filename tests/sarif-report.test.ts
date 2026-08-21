import { describe, expect, test } from 'bun:test';
import {
  getDiagnosticFingerprint,
  type Diagnostic
} from '../src/diagnostics.ts';
import { createSarifReport } from '../src/sarif-report.ts';

const WARNING: Diagnostic = {
  ruleId: 'ZDP-WARN-002',
  severity: 'warning',
  file: '.\\catalogs\\a file.yaml',
  path: 'repositories[0:zdp-web].create_when',
  message: 'Promotion evidence is missing.',
  sourceProof: 'docs/30-platform-registry-cli.md#promotion',
  helpUri: 'https://example.invalid/zdp-warn-002'
};

const ERROR: Diagnostic = {
  ruleId: 'ZDP-ERROR-001',
  severity: 'error',
  file: 'service.yaml',
  path: 'data.datastores[0]',
  message: 'Direct datastore ownership is not declared.'
};

describe('SARIF report', () => {
  test('emits SARIF 2.1.0 rules, locations, metadata, and stable fingerprints', () => {
    const report = createSarifReport({
      diagnostics: [WARNING, ERROR]
    });
    const run = report.runs[0];

    expect(report.$schema).toBe(
      'https://json.schemastore.org/sarif-2.1.0.json'
    );
    expect(report.version).toBe('2.1.0');
    expect(run).toBeDefined();
    expect(run?.tool.driver.name).toBe('zdp-architecture-linter');
    expect(run?.tool.driver.rules.map((rule) => rule.id)).toEqual([
      'ZDP-ERROR-001',
      'ZDP-WARN-002'
    ]);
    expect(run?.tool.driver.rules[1]).toEqual(
      expect.objectContaining({
        id: 'ZDP-WARN-002',
        helpUri: 'https://example.invalid/zdp-warn-002',
        properties: {
          sourceProofs: ['docs/30-platform-registry-cli.md#promotion']
        }
      })
    );

    const warningResult = run?.results[0];
    const warningFingerprint = getDiagnosticFingerprint(WARNING);

    expect(warningResult).toEqual(
      expect.objectContaining({
        ruleId: 'ZDP-WARN-002',
        ruleIndex: 1,
        level: 'warning',
        message: {
          text: 'Promotion evidence is missing.'
        },
        partialFingerprints: {
          primaryLocationLineHash: `${warningFingerprint}:1`,
          'zdpDiagnostic/v1': warningFingerprint
        },
        properties: {
          zdpPath: 'repositories[0:zdp-web].create_when',
          zdpFingerprint: warningFingerprint,
          sourceProof: 'docs/30-platform-registry-cli.md#promotion'
        }
      })
    );
    expect(
      warningResult?.locations[0].physicalLocation.artifactLocation.uri
    ).toBe('catalogs/a%20file.yaml');
    expect(
      warningResult?.locations[0].logicalLocations[0].fullyQualifiedName
    ).toBe('repositories[0:zdp-web].create_when');
  });

  test('redacts absolute paths and unsafe metadata', () => {
    const report = createSarifReport({
      diagnostics: [{
        ...ERROR,
        file: 'C:\\Users\\private\\service.yaml',
        sourceProof: 'private payload with spaces',
        helpUri: 'https://example.invalid/rule?token=secret'
      }]
    });
    const run = report.runs[0];
    expect(run?.results[0]?.locations[0].physicalLocation.artifactLocation.uri).toBe('unknown');
    expect(run?.results[0]?.properties.sourceProof).toBeUndefined();
    expect(run?.tool.driver.rules[0]?.helpUri).toContain('github.com/0disoft/zdp-architecture-linter');
  });

  test('emits a valid empty run when validation has no diagnostics', () => {
    const report = createSarifReport({ diagnostics: [] });
    const run = report.runs[0];

    expect(run?.tool.driver.rules).toEqual([]);
    expect(run?.results).toEqual([]);
  });
});
