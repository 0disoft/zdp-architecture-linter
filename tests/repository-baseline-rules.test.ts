import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import {
  REPOSITORY_BASELINE_REQUIRED_FILES,
  validateRepositoryBaselineFiles
} from '../src/repository-baseline-rules.ts';

describe('repository baseline rules', () => {
  test('skips repository baseline checks when no repository root is selected', async () => {
    const diagnostics = await validateRepositoryBaselineFiles(undefined);

    expect(diagnostics).toEqual([]);
  });

  test('passes when required baseline files exist', async () => {
    await withRepositoryRoot(
      Object.fromEntries(
        REPOSITORY_BASELINE_REQUIRED_FILES.map((fileName) => [fileName, 'ok\n'])
      ),
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryBaselineFiles(repositoryRoot);

        expect(diagnostics).toEqual([]);
      }
    );
  });

  test('fails when required baseline files are missing', async () => {
    await withRepositoryRoot(
      {
        '.gitattributes': '* text=auto eol=lf\n',
        'AGENTS.md': '# Agents\n'
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryBaselineFiles(repositoryRoot);

        expect(diagnostics).toEqual([
          {
            ruleId: 'ZDP-REPO-BASELINE-001',
            severity: 'error',
            file: '.editorconfig',
            path: 'repository.root',
            message:
              'Repository root is missing required baseline file `.editorconfig`.'
          },
          {
            ruleId: 'ZDP-REPO-BASELINE-001',
            severity: 'error',
            file: 'README.md',
            path: 'repository.root',
            message: 'Repository root is missing required baseline file `README.md`.'
          }
        ]);
      }
    );
  });
});

async function withRepositoryRoot(
  files: Record<string, string>,
  callback: (repositoryRoot: string) => Promise<void>
): Promise<void> {
  const repositoryRoot = await mkdtemp(join(tmpdir(), 'zdp-repo-baseline-'));

  try {
    for (const [relativePath, source] of Object.entries(files)) {
      const absolutePath = join(repositoryRoot, relativePath);

      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, source, 'utf8');
    }

    await callback(repositoryRoot);
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true });
  }
}
