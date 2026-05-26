import { describe, expect, test } from 'bun:test';
import {
  createMinimalArchitectureFiles,
  runCli,
  withArchitectureFiles
} from './cli-test-helpers.ts';

describe('check-split CLI', () => {
  test('returns split diagnostics without unrelated validation warnings', async () => {
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
`,
        'catalogs/split-triggers.yaml': `
split_triggers:
  - domain: web_docs
    current_location: zdp-web-public/apps/docs
    future_repo: zdp-web-docs
    split_when:
      - docs site traffic exceeds marketing site
`
      }),
      async ({ architectureRoot }) => {
        const result = await runCli([
          'check-split',
          '--architecture',
          architectureRoot,
          '--json'
        ]);

        expect(result.exitCode).toBe(0);
        expect(result.stderr).toBe('');

        const report = JSON.parse(result.stdout) as CheckSplitCliReport;

        expect(report.diagnostics).toEqual([
          {
            ruleId: 'ZDP-SPLIT-001',
            severity: 'warning',
            file: 'catalogs/split-triggers.yaml',
            path: 'split_triggers[0:web_docs].future_repo',
            message:
              'Split trigger future repo `zdp-web-docs` should be registered in repositories.yaml before it is used as a split target.'
          }
        ]);
      }
    );
  });
});

interface CheckSplitCliReport {
  readonly diagnostics: readonly unknown[];
}
