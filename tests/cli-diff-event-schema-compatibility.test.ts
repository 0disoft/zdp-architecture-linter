import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import {
  createMinimalArchitectureFiles,
  runCli,
  withArchitectureFiles
} from './cli-test-helpers.ts';

const GIT_BACKED_CLI_TEST_TIMEOUT_MS = 30_000;

describe('diff CLI event schema compatibility gate', () => {
  test('fails when a published event schema changes without a version bump', async () => {
    const schemaRef = 'schemas/events/job-state.v1.json';

    await withArchitectureFiles(
      createMinimalArchitectureFiles({
        [schemaRef]: JSON.stringify(createEventSchema(schemaRef, false))
      }),
      async ({ architectureRoot }) => {
        await initGitRepository(architectureRoot);
        await writeFile(
          join(architectureRoot, schemaRef),
          `${JSON.stringify(createEventSchema(schemaRef, true), null, 2)}\n`,
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
              readonly file: string;
            }>;
          };
        };

        expect(report.diagnostics.added).toContainEqual(
          expect.objectContaining({
            ruleId: 'ZDP-EVENT-004',
            file: schemaRef
          })
        );
      }
    );
  }, GIT_BACKED_CLI_TEST_TIMEOUT_MS);
});

function createEventSchema(
  schemaRef: string,
  breaking: boolean
): Record<string, unknown> {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: `https://zdp.zerodi.dev/${schemaRef}`,
    type: 'object',
    additionalProperties: false,
    required: breaking
      ? ['event_id', 'schema_version', 'state', 'note']
      : ['event_id', 'schema_version', 'state'],
    properties: {
      event_id: { type: 'string' },
      schema_version: { type: 'integer', const: 1 },
      state: { type: 'string', enum: ['ready', 'done'] },
      ...(breaking ? { note: { type: 'string' } } : {})
    }
  };
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
