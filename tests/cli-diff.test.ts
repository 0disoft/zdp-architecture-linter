import { readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import {
  createMinimalArchitectureFiles,
  runCli,
  withArchitectureFiles
} from './cli-test-helpers.ts';

const GIT_BACKED_CLI_TEST_TIMEOUT_MS = 15_000;

describe('diff CLI', () => {
  test('compares a git ref with the current worktree', async () => {
    await withArchitectureFiles(
      createMinimalArchitectureFiles({
        'catalogs/repositories.yaml': `
repositories:
  - name: zdp-core-platform
    status: reserved
    repo_stage: deploy_unit
    kind: deploy_unit
    area: core
    purpose: Core platform.
    owner: 0disoft
    risk_level: high
`,
        'catalogs/services.yaml': `
services:
  - id: core-api
    repo: zdp-core-platform
    tier: tier1
    runtime: axum
    direct_datastore_access:
      - core_postgres
`,
        'catalogs/datastores.yaml': `
datastores:
  - id: core_postgres
    kind: postgresql
    owner_repo: zdp-core-platform
    hosted_on: hetzner
    data_classes: []
`
      }),
      async ({ architectureRoot }) => {
        await initGitRepository(architectureRoot);
        await writeFile(
          join(architectureRoot, 'catalogs/repositories.yaml'),
          `
repositories:
  - name: zdp-core-platform
    status: reserved
    repo_stage: conditional_deploy_unit
    kind: deploy_unit
    area: core
    purpose: Core platform.
    owner: platform
    risk_level: high
  - name: zdp-edge-workers
    status: reserved
    repo_stage: deploy_unit
    kind: deploy_unit
    area: edge
    purpose: Edge gateway.
    owner: 0disoft
    risk_level: medium
`.trimStart(),
          'utf8'
        );

        const result = await runCli([
          'diff',
          '--architecture',
          architectureRoot,
          '--base',
          'HEAD',
          '--json'
        ]);

        expect(result.exitCode).toBe(0);
        expect(result.stderr).toBe('');

        const report = JSON.parse(result.stdout) as DiffCliReport;

        expect(report.changes.repositories.added).toEqual(['zdp-edge-workers']);
        expect(report.changes.repositories.changed).toEqual(['zdp-core-platform']);
        expect(report.riskNotes).toContain(
          'repositories.zdp-core-platform: repo_stage changed from "deploy_unit" to "conditional_deploy_unit"'
        );
        expect(report.riskNotes).toContain(
          'repositories.zdp-core-platform: owner changed from "0disoft" to "platform"'
        );
      }
    );
  }, GIT_BACKED_CLI_TEST_TIMEOUT_MS);

  test('prints usage when base ref is missing', async () => {
    const result = await runCli(['diff', '--architecture', '.']);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain(
      'zdp-arch diff --architecture <path> --base <git-ref> [--head <git-ref|worktree>] [--json]'
    );
  });

  test('cleans a base snapshot when the head ref fails to load', async () => {
    await withArchitectureFiles(
      createMinimalArchitectureFiles({}),
      async ({ architectureRoot }) => {
        await initGitRepository(architectureRoot);

        const before = await listDiffSnapshotDirectories();
        const result = await runCli([
          'diff',
          '--architecture',
          architectureRoot,
          '--base',
          'HEAD',
          '--head',
          'refs/heads/does-not-exist',
          '--json'
        ]);
        const after = await listDiffSnapshotDirectories();

        expect(result.exitCode).toBe(1);
        expect(result.stdout).toBe('');
        expect([...after].filter((entry) => !before.has(entry))).toEqual([]);
      }
    );
  }, GIT_BACKED_CLI_TEST_TIMEOUT_MS);
});

interface DiffCliReport {
  readonly changes: {
    readonly repositories: {
      readonly added: readonly string[];
      readonly changed: readonly string[];
    };
  };
  readonly riskNotes: readonly string[];
}

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

async function listDiffSnapshotDirectories(): Promise<Set<string>> {
  const entries = await readdir(tmpdir(), { withFileTypes: true });

  return new Set(
    entries
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('zdp-arch-diff-'))
      .map((entry) => entry.name)
  );
}
