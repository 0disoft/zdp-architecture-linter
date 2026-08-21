import { describe, expect, test } from 'bun:test';
import {
  createMinimalArchitectureFiles,
  runCli,
  withArchitectureFiles
} from './cli-test-helpers.ts';

describe('compliance CLI', () => {
  test('returns evidence-incomplete with exit zero after static validation passes', async () => {
    await withArchitectureFiles(
      createMinimalArchitectureFiles({
        'catalogs/repositories.yaml': `
repositories:
  - name: zdp-test-platform
    status: active
    repo_stage: deploy_unit
    kind: deploy_unit
    area: platform
    purpose: Test platform repository.
    owner: 0disoft
    risk_level: low
    agent_review:
      status: included
      playbook_repo: zdp-agent-review-playbooks
      group_id: group-01
      cadence: nightly
      run_scope: six-lens-raw-and-reducer
      output_policy: local_ignored
`,
        'catalogs/services.yaml': `
services:
  - id: test-platform
    repo: zdp-test-platform
`,
        'repo/.editorconfig': [
          'root = true',
          '',
          '[*]',
          'charset = utf-8',
          'end_of_line = lf',
          'insert_final_newline = true',
          'indent_style = space',
          'indent_size = 2',
          'trim_trailing_whitespace = true',
          ''
        ].join('\n'),
        'repo/.gitattributes': '* text=auto eol=lf\n',
        'repo/AGENTS.md': '# Agents\n',
        'repo/README.md': '# Repository\n',
        'repo/service.yaml': `
service:
  id: test-platform
  repo: zdp-test-platform
`
      }),
      async ({ architectureRoot, repositoryRoot }) => {
        const result = await runCli([
          'compliance',
          '--architecture',
          architectureRoot,
          '--repository',
          repositoryRoot,
          '--json'
        ]);

        expect(result.exitCode).toBe(0);
        expect(result.stderr).toBe('');

        const report = JSON.parse(result.stdout) as ComplianceCliReport;
        expect(report.status).toBe('evidence_incomplete');
        expect(report.declaration).toEqual({
          status: 'declared',
          evidence: ['service.yaml']
        });
        expect(report.verification.status).not.toBe('failed');
        expect(report.implementation.status).toBe('unknown');
        expect(report.live.status).toBe('unknown');
      }
    );
  });

  test('returns a JSON report and non-zero exit when service.yaml is missing', async () => {
    await withArchitectureFiles(
      createMinimalArchitectureFiles({}),
      async ({ architectureRoot, repositoryRoot }) => {
        const result = await runCli([
          'compliance',
          '--architecture',
          architectureRoot,
          '--repository',
          repositoryRoot,
          '--json'
        ]);

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toBe('');

        const report = JSON.parse(result.stdout) as ComplianceCliReport;
        expect(report.schemaVersion).toBe(
          'zdp.architecture.contract-compliance-report.v1'
        );
        expect(report.mode).toBe('report-only');
        expect(report.status).toBe('failed');
        expect(report.declaration).toEqual({ status: 'missing', evidence: [] });
        expect(report.implementation.status).toBe('unknown');
        expect(report.live.status).toBe('unknown');
      }
    );
  });

  test('returns a redacted JSON failure when service.yaml is malformed', async () => {
    await withArchitectureFiles(
      createMinimalArchitectureFiles({
        'repo/service.yaml': 'service: [\n'
      }),
      async ({ architectureRoot, repositoryRoot }) => {
        const result = await runCli([
          'compliance',
          '--architecture',
          architectureRoot,
          '--repository',
          repositoryRoot,
          '--json'
        ]);

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toBe('');
        expect(JSON.parse(result.stdout)).toEqual({
          schemaVersion: 'zdp.architecture.contract-compliance-report.v1',
          mode: 'report-only',
          status: 'failed',
          repositoryRoot,
          error: {
            code: 'repository_or_architecture_input_unreadable_or_invalid',
            message: 'Repository or architecture input is unreadable or invalid.'
          }
        });
        expect(result.stdout).not.toContain('service: [');
      }
    );
  });

  test('prints usage when repository is missing', async () => {
    const result = await runCli([
      'compliance',
      '--architecture',
      'architecture-root'
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain(
      'zdp-arch compliance --architecture <path> --repository <path> [--json]'
    );
  });
});

interface ComplianceCliReport {
  readonly schemaVersion: string;
  readonly mode: string;
  readonly status: string;
  readonly declaration: {
    readonly status: string;
    readonly evidence: readonly string[];
  };
  readonly implementation: { readonly status: string };
  readonly verification: { readonly status: string };
  readonly live: { readonly status: string };
}
