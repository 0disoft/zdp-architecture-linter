import { describe, expect, test } from 'bun:test';
import {
  createMinimalArchitectureFiles,
  runCli,
  withArchitectureFiles
} from './cli-test-helpers.ts';

describe('validate CLI', () => {
  test('returns success when validation only produces warnings', async () => {
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
`
      }),
      async ({ architectureRoot }) => {
        const result = await runCli([
          'validate',
          '--architecture',
          architectureRoot,
          '--json'
        ]);

        expect(result.exitCode).toBe(0);
        expect(result.stderr).toBe('');

        const report = JSON.parse(result.stdout) as ValidateCliReport;

        expect(report.diagnostics).toEqual([
          {
            ruleId: 'ZDP-REPO-WARN-001',
            severity: 'warning',
            file: 'catalogs/repositories.yaml',
            path: 'repositories[0:zdp-mobile-flutter].create_when',
            message:
              'Repository with repo_stage `conditional_deploy_unit` should declare `create_when` evidence.'
          }
        ]);
      }
    );
  });

  test('warns when a reserved deploy unit has no roadmap evidence', async () => {
    await withArchitectureFiles(
      createMinimalArchitectureFiles({
        'catalogs/repositories.yaml': `
repositories:
  - name: zdp-admin-console
    status: reserved
    repo_stage: deploy_unit
    kind: deploy_unit
    area: admin
    purpose: Admin console.
    owner: 0disoft
    risk_level: high
`
      }),
      async ({ architectureRoot }) => {
        const result = await runCli([
          'validate',
          '--architecture',
          architectureRoot,
          '--json'
        ]);

        expect(result.exitCode).toBe(0);
        expect(result.stderr).toBe('');

        const report = JSON.parse(result.stdout) as ValidateCliReport;

        expect(report.diagnostics).toEqual([
          {
            ruleId: 'ZDP-REPO-WARN-002',
            severity: 'warning',
            file: 'catalogs/repositories.yaml',
            path: 'repositories[0:zdp-admin-console].name',
            message:
              'Reserved deploy unit `zdp-admin-console` should appear in ROADMAP.md or docs/26-eighteen-month-roadmap.md.'
          }
        ]);
      }
    );
  });
});

interface ValidateCliReport {
  readonly diagnostics: readonly unknown[];
}
