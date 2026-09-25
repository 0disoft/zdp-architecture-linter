import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import {
  createMinimalArchitectureFiles,
  runCli,
  withArchitectureFiles
} from './cli-test-helpers.ts';

const GIT_BACKED_CLI_TEST_TIMEOUT_MS = 30_000;

describe('diff CLI state transition gate', () => {
  test('fails on a newly promoted service without transition evidence', async () => {
    await withArchitectureFiles(
      createMinimalArchitectureFiles({
        'rules/tier.rules.yaml': `
schema_version: "0.3"
state_transition_evidence:
  schema_version: "1"
  evidence_max_age_days: 30
  required_evidence_fields:
    - evidence_refs
    - runbook_ref
    - rollback_ref
    - observability_ref
    - monthly_budget_limit_usd
  service_statuses_requiring_evidence:
    - active
    - scaling
  operational_asset_statuses_requiring_evidence:
    - active
rules: []
`,
        'catalogs/services.yaml': `
services:
  - id: public-web
    repo: zdp-web-public
    status: experiment
`
      }),
      async ({ architectureRoot }) => {
        await initGitRepository(architectureRoot);
        await writeFile(
          join(architectureRoot, 'catalogs/services.yaml'),
          `
services:
  - id: public-web
    repo: zdp-web-public
    status: active
`.trimStart(),
          'utf8'
        );

        const result = await runCli([
          'diff',
          '--architecture',
          architectureRoot,
          '--base',
          'HEAD',
          '--fail-on-new-error',
          '--json'
        ]);

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toBe('');

        const report = JSON.parse(result.stdout) as {
          readonly diagnostics: {
            readonly added: ReadonlyArray<{
              readonly ruleId: string;
              readonly path: string;
            }>;
          };
        };

        expect(report.diagnostics.added).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              ruleId: 'ZDP-STATE-TRANSITION-001',
              path: 'services[id=public-web].transition_evidence'
            })
          ])
        );
      }
    );
  }, GIT_BACKED_CLI_TEST_TIMEOUT_MS);
});

async function initGitRepository(repositoryRoot: string): Promise<void> {
  await runGit(repositoryRoot, ['init']);
  await runGit(repositoryRoot, ['config', 'user.email', 'test@example.com']);
  await runGit(repositoryRoot, ['config', 'user.name', 'Test']);
  await runGit(repositoryRoot, ['add', '.']);
  await runGit(repositoryRoot, ['commit', '-m', 'base']);
}

async function runGit(
  repositoryRoot: string,
  args: readonly string[]
): Promise<void> {
  const childProcess = Bun.spawn({
    cmd: ['git', ...args],
    cwd: repositoryRoot,
    stdout: 'pipe',
    stderr: 'pipe'
  });
  const [exitCode, stderr] = await Promise.all([
    childProcess.exited,
    new Response(childProcess.stderr).text()
  ]);

  if (exitCode !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${stderr}`);
  }
}
