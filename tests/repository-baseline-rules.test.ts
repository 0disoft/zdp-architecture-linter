import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import {
  REPOSITORY_BASELINE_REQUIRED_FILES,
  validateRepositoryBaselineFiles,
  validateRepositoryRootMarkdownFiles
} from '../src/repository-baseline-rules.ts';
import type { RepositoryIndex } from '../src/repository-rules.ts';

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

describe('repository root markdown rules', () => {
  test('passes when a lab repository includes EXPERIMENT.md', async () => {
    await withRepositoryRoot(
      {
        'EXPERIMENT.md': '# Experiment\n'
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryRootMarkdownFiles({
          repositoryRoot,
          repositoryServiceContract: {
            service: {
              repo: 'zdp-labs-jiffy'
            }
          },
          repositoryIndex: createRepositoryIndex({
            name: 'zdp-labs-jiffy',
            repoStage: 'lab_only',
            kind: 'lab',
            area: 'labs'
          })
        });

        expect(diagnostics).toEqual([]);
      }
    );
  });

  test('fails when a lab repository is missing EXPERIMENT.md', async () => {
    await withRepositoryRoot({}, async (repositoryRoot) => {
      const diagnostics = await validateRepositoryRootMarkdownFiles({
        repositoryRoot,
        repositoryServiceContract: {
          service: {
            repo: 'zdp-labs-prasso'
          }
        },
        repositoryIndex: createRepositoryIndex({
          name: 'zdp-labs-prasso',
          repoStage: 'lab_only',
          kind: 'lab',
          area: 'labs'
        })
      });

      expect(diagnostics).toEqual([
        {
          ruleId: 'ZDP-REPO-MARKDOWN-001',
          severity: 'error',
          file: 'EXPERIMENT.md',
          path: 'repository.root',
          message:
            'Lab repository `zdp-labs-prasso` must include root `EXPERIMENT.md`.'
        }
      ]);
    });
  });

  test('skips EXPERIMENT.md when the repository is not a lab', async () => {
    await withRepositoryRoot({}, async (repositoryRoot) => {
      const diagnostics = await validateRepositoryRootMarkdownFiles({
        repositoryRoot,
        repositoryServiceContract: {
          service: {
            repo: 'zdp-architecture-linter'
          }
        },
        repositoryIndex: createRepositoryIndex({
          name: 'zdp-architecture-linter',
          repoStage: 'deploy_unit',
          kind: 'tooling',
          area: 'architecture'
        })
      });

      expect(diagnostics).toEqual([]);
    });
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

function createRepositoryIndex(repository: {
  readonly name: string;
  readonly repoStage: string;
  readonly kind: string;
  readonly area: string;
}): RepositoryIndex {
  return {
    byName: new Map([
      [
        repository.name,
        {
          ...repository,
          path: `repositories[0:${repository.name}]`
        }
      ]
    ])
  };
}
