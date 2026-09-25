import { describe, expect, test } from 'bun:test';
import {
  createMinimalArchitectureFiles,
  runCli,
  withArchitectureFiles
} from './cli-test-helpers.ts';

describe('validate SARIF output', () => {
  test('emits upload-ready SARIF while preserving warning exit semantics', async () => {
    await withArchitectureFiles(
      createMinimalArchitectureFiles({
        'catalogs/repositories.yaml': `
repositories:
  - name: zdp-mobile-flutter
    status: reserved
    repo_stage: conditional_deploy_unit
    kind: deploy_unit
    area: mobile
    purpose: Mobile app shell.
    owner: 0disoft
    risk_level: medium
    agent_review:
      status: candidate
      cadence: none
      run_scope: none
      output_policy: none
      reason: Conditional repository is not reviewed until promotion.
`
      }),
      async ({ architectureRoot }) => {
        const result = await runCli([
          'validate',
          '--architecture',
          architectureRoot,
          '--format',
          'sarif'
        ]);

        expect(result.exitCode).toBe(0);
        expect(result.stderr).toBe('');

        const report = JSON.parse(result.stdout) as SarifCliReport;
        const sarifResult = report.runs[0]?.results[0];

        expect(report.version).toBe('2.1.0');
        expect(report.runs[0]?.tool.driver.rules[0]?.id).toBe(
          'ZDP-REPO-WARN-001'
        );
        expect(sarifResult).toEqual(
          expect.objectContaining({
            ruleId: 'ZDP-REPO-WARN-001',
            level: 'warning'
          })
        );
        expect(
          sarifResult?.locations[0]?.physicalLocation.artifactLocation.uri
        ).toBe('catalogs/repositories.yaml');
        expect(
          sarifResult?.locations[0]?.logicalLocations[0]?.fullyQualifiedName
        ).toBe('repositories[0:zdp-mobile-flutter].create_when');
        expect(
          sarifResult?.partialFingerprints.primaryLocationLineHash
        ).toMatch(/^[a-f0-9]{64}:1$/);
        expect(sarifResult?.partialFingerprints['zdpDiagnostic/v1']).toMatch(
          /^[a-f0-9]{64}$/
        );
      }
    );
  });

  test('rejects ambiguous JSON and SARIF output flags', async () => {
    const result = await runCli([
      'validate',
      '--architecture',
      '.',
      '--json',
      '--format',
      'sarif'
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe('');
    const failure = JSON.parse(result.stdout) as { schemaVersion: string };
    expect(failure.schemaVersion).toBe('zdp.architecture.cli-error.v1');
  });

  test('rejects SARIF on commands that do not return validation diagnostics', async () => {
    const result = await runCli([
      'graph',
      '--architecture',
      '.',
      '--format',
      'sarif'
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
  });
});

interface SarifCliReport {
  readonly version: string;
  readonly runs: readonly {
    readonly tool: {
      readonly driver: {
        readonly rules: readonly { readonly id: string }[];
      };
    };
    readonly results: readonly {
      readonly ruleId: string;
      readonly level: string;
      readonly locations: readonly {
        readonly physicalLocation: {
          readonly artifactLocation: {
            readonly uri: string;
          };
        };
        readonly logicalLocations: readonly {
          readonly fullyQualifiedName: string;
        }[];
      }[];
      readonly partialFingerprints: {
        readonly primaryLocationLineHash: string;
        readonly 'zdpDiagnostic/v1': string;
      };
    }[];
  }[];
}
