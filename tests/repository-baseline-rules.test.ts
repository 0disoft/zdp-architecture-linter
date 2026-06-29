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
      createBaselineFiles(),
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryBaselineFiles(repositoryRoot);

        expect(diagnostics).toEqual([]);
      }
    );
  });

  test('fails when baseline files omit required line-ending policy text', async () => {
    await withRepositoryRoot(
      {
        ...createBaselineFiles(),
        '.editorconfig': 'root = true\n[*]\ncharset = utf-8\n',
        '.gitattributes': '*.png binary\n'
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
              'Repository baseline file `.editorconfig` must include `end_of_line = lf`.'
          },
          {
            ruleId: 'ZDP-REPO-BASELINE-001',
            severity: 'error',
            file: '.editorconfig',
            path: 'repository.root',
            message:
              'Repository baseline file `.editorconfig` must include `insert_final_newline = true`.'
          },
          {
            ruleId: 'ZDP-REPO-BASELINE-001',
            severity: 'error',
            file: '.editorconfig',
            path: 'repository.root',
            message:
              'Repository baseline file `.editorconfig` must include `indent_style = space`.'
          },
          {
            ruleId: 'ZDP-REPO-BASELINE-001',
            severity: 'error',
            file: '.editorconfig',
            path: 'repository.root',
            message:
              'Repository baseline file `.editorconfig` must include `indent_size = 2`.'
          },
          {
            ruleId: 'ZDP-REPO-BASELINE-001',
            severity: 'error',
            file: '.editorconfig',
            path: 'repository.root',
            message:
              'Repository baseline file `.editorconfig` must include `trim_trailing_whitespace = true`.'
          },
          {
            ruleId: 'ZDP-REPO-BASELINE-001',
            severity: 'error',
            file: '.gitattributes',
            path: 'repository.root',
            message:
              'Repository baseline file `.gitattributes` must include `* text=auto eol=lf`.'
          }
        ]);
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
        'EXPERIMENT.md': '# Experiment\n',
        'RUNBOOK.md': '# Runbook\n',
        'product-spec.md': '# Product spec\n'
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

  test('fails when an operational tier2 repository is missing RUNBOOK.md', async () => {
    await withRepositoryRoot({}, async (repositoryRoot) => {
      const diagnostics = await validateRepositoryRootMarkdownFiles({
        repositoryRoot,
        repositoryServiceContract: {
          service: {
            repo: 'zdp-desktop-tauri',
            tier: 'tier2'
          }
        },
        repositoryIndex: createRepositoryIndex({
          name: 'zdp-desktop-tauri',
          repoStage: 'conditional_deploy_unit',
          kind: 'deploy_unit',
          area: 'desktop',
          riskLevel: 'medium'
        })
      });

      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-REPO-MARKDOWN-003',
        severity: 'error',
        file: 'RUNBOOK.md',
        path: 'repository.root',
        message:
          'Operational repository `zdp-desktop-tauri` must include root `RUNBOOK.md`.'
      });
    });
  });

  test('fails when a high-risk sensitive repository is missing SECURITY.md and BOUNDARY.md', async () => {
    await withRepositoryRoot(
      {
        'RUNBOOK.md': '# Runbook\n'
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryRootMarkdownFiles({
          repositoryRoot,
          repositoryServiceContract: {
            service: {
              repo: 'zdp-ai-platform',
              tier: 'tier1',
              risk_level: 'critical'
            },
            data: {
              ai_user_data: true,
              datastores: []
            }
          },
          repositoryIndex: createRepositoryIndex({
            name: 'zdp-ai-platform',
            repoStage: 'deploy_unit',
            kind: 'deploy_unit',
            area: 'ai',
            riskLevel: 'critical'
          })
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-REPO-MARKDOWN-004',
          severity: 'error',
          file: 'SECURITY.md',
          path: 'repository.root',
          message:
            'Sensitive repository `zdp-ai-platform` must include root `SECURITY.md`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-REPO-MARKDOWN-005',
          severity: 'error',
          file: 'BOUNDARY.md',
          path: 'repository.root',
          message:
            'Boundary-heavy repository `zdp-ai-platform` must include root `BOUNDARY.md`.'
        });
      }
    );
  });

  test('fails when zdp-products-lab is missing product-spec.md', async () => {
    await withRepositoryRoot(
      {
        'EXPERIMENT.md': '# Experiment\n',
        'RUNBOOK.md': '# Runbook\n'
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryRootMarkdownFiles({
          repositoryRoot,
          repositoryServiceContract: {
            service: {
              repo: 'zdp-products-lab',
              tier: 'tier3'
            }
          },
          repositoryIndex: createRepositoryIndex({
            name: 'zdp-products-lab',
            repoStage: 'deploy_unit',
            kind: 'deploy_unit',
            area: 'labs',
            riskLevel: 'low'
          })
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-REPO-MARKDOWN-006',
          severity: 'error',
          file: 'product-spec.md',
          path: 'repository.root',
          message:
            'Product repository `zdp-products-lab` must include root `product-spec.md`.'
        });
      }
    );
  });

  test('skips EXPERIMENT.md when the repository is not a lab', async () => {
    await withRepositoryRoot({}, async (repositoryRoot) => {
      const diagnostics = await validateRepositoryRootMarkdownFiles({
        repositoryRoot,
        repositoryServiceContract: {
          service: {
            repo: 'zdp-core-platform'
          }
        },
        repositoryIndex: createRepositoryIndex({
          name: 'zdp-core-platform',
          repoStage: 'deploy_unit',
          kind: 'deploy_unit',
          area: 'core'
        })
      });

      expect(diagnostics).toEqual([]);
    });
  });

  test('passes when a CLI repository includes CONTRIBUTING.md and CHANGELOG.md', async () => {
    await withRepositoryRoot(
      {
        'CONTRIBUTING.md': '# Contributing\n',
        'CHANGELOG.md': '# Changelog\n'
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryRootMarkdownFiles({
          repositoryRoot,
          repositoryServiceContract: {
            service: {
              repo: 'zdp-architecture-linter'
            },
            runtime: {
              core: 'local-cli'
            }
          },
          repositoryIndex: createRepositoryIndex({
            name: 'zdp-architecture-linter',
            repoStage: 'deploy_unit',
            kind: 'deploy_unit',
            area: 'architecture',
            purpose: 'Architecture policy validator.'
          })
        });

        expect(diagnostics).toEqual([]);
      }
    );
  });

  test('fails when a CLI repository is missing CONTRIBUTING.md and CHANGELOG.md', async () => {
    await withRepositoryRoot({}, async (repositoryRoot) => {
      const diagnostics = await validateRepositoryRootMarkdownFiles({
        repositoryRoot,
        repositoryServiceContract: {
          service: {
            repo: 'zdp-architecture-linter'
          },
          runtime: {
            core: 'local-cli'
          }
        },
        repositoryIndex: createRepositoryIndex({
          name: 'zdp-architecture-linter',
          repoStage: 'deploy_unit',
          kind: 'deploy_unit',
          area: 'architecture',
          purpose: 'Architecture policy validator.'
        })
      });

      expect(diagnostics).toEqual([
        {
          ruleId: 'ZDP-REPO-MARKDOWN-002',
          severity: 'error',
          file: 'CONTRIBUTING.md',
          path: 'repository.root',
          message:
            'Package, CLI, or template repository `zdp-architecture-linter` must include root `CONTRIBUTING.md`.'
        },
        {
          ruleId: 'ZDP-REPO-MARKDOWN-002',
          severity: 'error',
          file: 'CHANGELOG.md',
          path: 'repository.root',
          message:
            'Package, CLI, or template repository `zdp-architecture-linter` must include root `CHANGELOG.md`.'
        }
      ]);
    });
  });

  test('treats package and template purpose text as package tooling', async () => {
    await withRepositoryRoot(
      {
        'CONTRIBUTING.md': '# Contributing\n'
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryRootMarkdownFiles({
          repositoryRoot,
          repositoryServiceContract: {
            service: {
              repo: 'zdp-libs-ts'
            }
          },
          repositoryIndex: createRepositoryIndex({
            name: 'zdp-libs-ts',
            repoStage: 'deploy_unit',
            kind: 'deploy_unit',
            area: 'platform',
            purpose: 'ZDP 계약 스키마, 이벤트 계약, SDK 공통 코드'
          })
        });

        expect(diagnostics).toEqual([
          {
            ruleId: 'ZDP-REPO-MARKDOWN-002',
            severity: 'error',
            file: 'CHANGELOG.md',
            path: 'repository.root',
            message:
              'Package, CLI, or template repository `zdp-libs-ts` must include root `CHANGELOG.md`.'
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

function createRepositoryIndex(repository: {
  readonly name: string;
  readonly repoStage: string;
  readonly kind: string;
  readonly area: string;
  readonly purpose?: string;
  readonly riskLevel?: string;
  readonly ownsData?: readonly string[];
  readonly splitTargets?: readonly string[];
}): RepositoryIndex {
  return {
    byName: new Map([
      [
        repository.name,
        {
          ...repository,
          status: null,
          purpose: repository.purpose ?? null,
          riskLevel: repository.riskLevel ?? null,
          ownsData: repository.ownsData ?? [],
          splitTargets: repository.splitTargets ?? [],
          securityBoundary: null,
          path: `repositories[0:${repository.name}]`
        }
      ]
    ])
  };
}

function createBaselineFiles(): Record<string, string> {
  return {
    '.editorconfig': [
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
    '.gitattributes': '* text=auto eol=lf\n',
    'AGENTS.md': '# Agents\n',
    'README.md': '# Readme\n'
  };
}
