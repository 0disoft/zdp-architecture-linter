import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { validateRepositoryAutomationContract } from '../src/rules/index.ts';
import { buildRepositoryIndex } from '../src/repository-rules.ts';

const repositoryIndex = buildRepositoryIndex({
  repositories: [
    {
      name: 'zdp-web-public',
      status: 'reserved',
      repo_stage: 'deploy_unit',
      kind: 'deploy_unit',
      area: 'frontend',
      purpose: 'Public web surface.',
      owner: '0disoft',
      risk_level: 'low'
    },
    {
      name: 'zdp-ai-retrieval',
      status: 'reserved',
      repo_stage: 'logical_only',
      kind: 'logical_boundary',
      area: 'ai',
      purpose: 'Retrieval boundary.',
      owner: '0disoft',
      risk_level: 'high'
    },
    {
      name: 'zdp-desktop-tauri',
      status: 'reserved',
      repo_stage: 'deploy_unit',
      kind: 'deploy_unit',
      area: 'frontend',
      purpose: 'Tauri desktop shell boundary.',
      owner: '0disoft',
      risk_level: 'medium'
    },
    {
      name: 'zdp-desktop-wails',
      status: 'reserved',
      repo_stage: 'deploy_unit',
      kind: 'deploy_unit',
      area: 'frontend',
      purpose: 'Wails desktop shell boundary.',
      owner: '0disoft',
      risk_level: 'medium'
    }
  ]
});

describe('repository automation contracts', () => {
  test('passes when a deploy unit declares CI and matching ruleset checks', () => {
    const diagnostics = validateRepositoryAutomationContract({
      repositoryIndex,
      repositoryServiceContract: createServiceContract({
        automation: {
          ci: {
            required: true,
            provider: 'github-actions',
            workflow_names: ['CI'],
            required_status_checks: ['CI'],
            private_dependency_token_required: false,
            required_secrets: []
          },
          ruleset: {
            required: true,
            required_status_checks: ['CI']
          }
        }
      })
    });

    expect(diagnostics).toEqual([]);
  });

  test('passes when CI is disabled with an explicit missing reason', () => {
    const diagnostics = validateRepositoryAutomationContract({
      repositoryIndex,
      repositoryServiceContract: createServiceContract({
        automation: {
          ci: {
            required: false,
            workflow_names: [],
            required_status_checks: [],
            missing_reason: 'No executable code yet.',
            private_dependency_token_required: false,
            required_secrets: []
          }
        }
      })
    });

    expect(diagnostics).toEqual([]);
  });

  test('passes when one dependency update bot owns the repository', async () => {
    await withRepositoryRoot(
      {
        'renovate.json': '{ "extends": ["config:recommended"] }\n'
      },
      async (repositoryRoot) => {
        const diagnostics = validateRepositoryAutomationContract({
          repositoryRoot,
          repositoryIndex,
          repositoryServiceContract: createServiceContract({
            automation: {
              ci: {
                required: true,
                provider: 'github-actions',
                workflow_names: ['CI'],
                required_status_checks: ['CI'],
                private_dependency_token_required: false,
                required_secrets: []
              },
              dependency_updates: {
                renovate_enabled: true,
                dependabot_enabled: false,
                conflict_policy: 'Renovate owns dependency updates.'
              },
              ruleset: {
                required: true,
                required_status_checks: ['CI']
              }
            }
          })
        });

        expect(diagnostics).toEqual([]);
      }
    );
  });

  test('skips non-deploy-unit repository service contracts', () => {
    const diagnostics = validateRepositoryAutomationContract({
      repositoryIndex,
      repositoryServiceContract: createServiceContract({
        service: {
          id: 'ai-retrieval',
          repo: 'zdp-ai-retrieval'
        }
      })
    });

    expect(diagnostics).toEqual([]);
  });

  test('warns when a deploy unit omits the CI contract', () => {
    const diagnostics = validateRepositoryAutomationContract({
      repositoryIndex,
      repositoryServiceContract: createServiceContract()
    });

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-AUTO-001',
        severity: 'warning',
        file: 'service.yaml',
        path: 'automation.ci',
        message:
          'Deploy unit service contract should declare `automation.ci` or an explicit CI missing reason.'
      }
    ]);
  });

  test('warns when disabled CI omits a missing reason', () => {
    const diagnostics = validateRepositoryAutomationContract({
      repositoryIndex,
      repositoryServiceContract: createServiceContract({
        automation: {
          ci: {
            required: false,
            workflow_names: [],
            required_status_checks: [],
            private_dependency_token_required: false,
            required_secrets: []
          }
        }
      })
    });

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-AUTO-001',
        severity: 'warning',
        file: 'service.yaml',
        path: 'automation.ci.missing_reason',
        message:
          'Deploy unit service contract with CI disabled should declare `automation.ci.missing_reason`.'
      }
    ]);
  });

  test('warns when Renovate and Dependabot are both enabled in service.yaml', () => {
    const diagnostics = validateRepositoryAutomationContract({
      repositoryIndex,
      repositoryServiceContract: createServiceContract({
        automation: {
          ci: {
            required: true,
            provider: 'github-actions',
            workflow_names: ['CI'],
            required_status_checks: ['CI'],
            private_dependency_token_required: false,
            required_secrets: []
          },
          dependency_updates: {
            renovate_enabled: true,
            dependabot_enabled: true,
            conflict_policy: 'Both bots are active.'
          },
          ruleset: {
            required: true,
            required_status_checks: ['CI']
          }
        }
      })
    });

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-AUTO-002',
        severity: 'warning',
        file: 'service.yaml',
        path: 'automation.dependency_updates',
        message:
          'Deploy unit service contract should not enable Renovate and Dependabot in the same repository; choose one dependency update owner or document a migration by disabling one bot.'
      }
    ]);
  });

  test('warns when Renovate and Dependabot config files both exist', async () => {
    await withRepositoryRoot(
      {
        'renovate.json': '{ "extends": ["config:recommended"] }\n',
        '.github/dependabot.yml': 'version: 2\nupdates: []\n'
      },
      async (repositoryRoot) => {
        const diagnostics = validateRepositoryAutomationContract({
          repositoryRoot,
          repositoryIndex,
          repositoryServiceContract: createServiceContract({
            automation: {
              ci: {
                required: true,
                provider: 'github-actions',
                workflow_names: ['CI'],
                required_status_checks: ['CI'],
                private_dependency_token_required: false,
                required_secrets: []
              },
              dependency_updates: {
                renovate_enabled: false,
                dependabot_enabled: false,
                conflict_policy: 'No bot is declared yet.'
              },
              ruleset: {
                required: true,
                required_status_checks: ['CI']
              }
            }
          })
        });

        expect(diagnostics).toEqual([
          {
            ruleId: 'ZDP-AUTO-002',
            severity: 'warning',
            file: 'service.yaml',
            path: 'repository.root',
            message:
              'Deploy unit service contract should not enable Renovate and Dependabot in the same repository; choose one dependency update owner or document a migration by disabling one bot.'
          }
        ]);
      }
    );
  });

  test('warns when ruleset checks drift from CI required checks', () => {
    const diagnostics = validateRepositoryAutomationContract({
      repositoryIndex,
      repositoryServiceContract: createServiceContract({
        automation: {
          ci: {
            required: true,
            workflow_names: ['CI'],
            required_status_checks: ['CI / test'],
            private_dependency_token_required: false,
            required_secrets: []
          },
          ruleset: {
            required: true,
            required_status_checks: ['CI / build']
          }
        }
      })
    });

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-AUTO-003',
        severity: 'warning',
        file: 'service.yaml',
        path: 'automation.ruleset.required_status_checks',
        message:
          'Ruleset required status checks should match `automation.ci.required_status_checks`.'
      }
    ]);
  });

  test('passes when release helper declares version and changelog policies', () => {
    const diagnostics = validateRepositoryAutomationContract({
      repositoryIndex,
      repositoryServiceContract: createServiceContract({
        automation: {
          ci: {
            required: true,
            workflow_names: ['CI'],
            required_status_checks: ['CI'],
            private_dependency_token_required: false,
            required_secrets: []
          },
          release_helper: {
            enabled: true,
            version_source_of_truth: 'package.json version field',
            changelog_policy: 'CHANGELOG.md is updated before release PR merge.'
          }
        }
      })
    });

    expect(diagnostics).toEqual([]);
  });

  test('warns when release helper is enabled without version and changelog policies', () => {
    const diagnostics = validateRepositoryAutomationContract({
      repositoryIndex,
      repositoryServiceContract: createServiceContract({
        automation: {
          ci: {
            required: true,
            workflow_names: ['CI'],
            required_status_checks: ['CI'],
            private_dependency_token_required: false,
            required_secrets: []
          },
          release_helper: {
            enabled: true
          }
        }
      })
    });

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-AUTO-004',
        severity: 'warning',
        file: 'service.yaml',
        path: 'automation.release_helper',
        message:
          'Deploy unit release helper should declare `automation.release_helper.version_source_of_truth` and `automation.release_helper.changelog_policy`.'
      }
    ]);
  });

  test('warns when release helper config exists without service.yaml policies', async () => {
    await withRepositoryRoot(
      {
        'release-please-config.json': '{ "packages": { ".": {} } }\n'
      },
      async (repositoryRoot) => {
        const diagnostics = validateRepositoryAutomationContract({
          repositoryRoot,
          repositoryIndex,
          repositoryServiceContract: createServiceContract({
            automation: {
              ci: {
                required: true,
                workflow_names: ['CI'],
                required_status_checks: ['CI'],
                private_dependency_token_required: false,
                required_secrets: []
              }
            }
          })
        });

        expect(diagnostics).toEqual([
          {
            ruleId: 'ZDP-AUTO-004',
            severity: 'warning',
            file: 'service.yaml',
            path: 'automation.release_helper',
            message:
              'Deploy unit release helper should declare `automation.release_helper.version_source_of_truth` and `automation.release_helper.changelog_policy`.'
          }
        ]);
      }
    );
  });

  test('passes when issue forms and PR template warn against sensitive submissions', async () => {
    await withRepositoryRoot(
      {
        '.github/ISSUE_TEMPLATE/bug.yml': sensitiveSubmissionWarningText(),
        '.github/PULL_REQUEST_TEMPLATE.md': sensitiveSubmissionWarningText()
      },
      async (repositoryRoot) => {
        const diagnostics = validateRepositoryAutomationContract({
          repositoryRoot,
          repositoryIndex,
          repositoryServiceContract: createServiceContract({
            automation: {
              ci: {
                required: true,
                workflow_names: ['CI'],
                required_status_checks: ['CI'],
                private_dependency_token_required: false,
                required_secrets: []
              },
              templates: {
                issue_forms_secret_warning: true,
                pr_template_secret_warning: true,
                forbidden_submission_classes: [
                  'secrets',
                  'payment payloads',
                  'customer raw data'
                ]
              }
            }
          })
        });

        expect(diagnostics).toEqual([]);
      }
    );
  });

  test('warns when template files exist without service.yaml warnings', async () => {
    await withRepositoryRoot(
      {
        '.github/ISSUE_TEMPLATE/bug.yml': sensitiveSubmissionWarningText(),
        '.github/PULL_REQUEST_TEMPLATE.md': sensitiveSubmissionWarningText()
      },
      async (repositoryRoot) => {
        const diagnostics = validateRepositoryAutomationContract({
          repositoryRoot,
          repositoryIndex,
          repositoryServiceContract: createServiceContract({
            automation: {
              ci: {
                required: true,
                workflow_names: ['CI'],
                required_status_checks: ['CI'],
                private_dependency_token_required: false,
                required_secrets: []
              },
              templates: {
                issue_forms_secret_warning: false,
                pr_template_secret_warning: false,
                forbidden_submission_classes: ['secrets']
              }
            }
          })
        });

        expect(diagnostics).toEqual([
          {
            ruleId: 'ZDP-AUTO-005',
            severity: 'warning',
            file: 'service.yaml',
            path: 'automation.templates',
            message:
              'Issue forms and PR templates should warn users not to submit secrets, payment payloads, or customer raw data, and `automation.templates` should declare those forbidden submission classes.'
          }
        ]);
      }
    );
  });

  test('warns when template files omit sensitive submission text', async () => {
    await withRepositoryRoot(
      {
        '.github/ISSUE_TEMPLATE/bug.yml': 'name: Bug\nbody: []\n',
        '.github/PULL_REQUEST_TEMPLATE.md': '## Summary\n'
      },
      async (repositoryRoot) => {
        const diagnostics = validateRepositoryAutomationContract({
          repositoryRoot,
          repositoryIndex,
          repositoryServiceContract: createServiceContract({
            automation: {
              ci: {
                required: true,
                workflow_names: ['CI'],
                required_status_checks: ['CI'],
                private_dependency_token_required: false,
                required_secrets: []
              },
              templates: {
                issue_forms_secret_warning: true,
                pr_template_secret_warning: true,
                forbidden_submission_classes: [
                  'secrets',
                  'payment payloads',
                  'customer raw data'
                ]
              }
            }
          })
        });

        expect(diagnostics).toEqual([
          {
            ruleId: 'ZDP-AUTO-005',
            severity: 'warning',
            file: 'service.yaml',
            path: 'automation.templates',
            message:
              'Issue forms and PR templates should warn users not to submit secrets, payment payloads, or customer raw data, and `automation.templates` should declare those forbidden submission classes.'
          }
        ]);
      }
    );
  });

  test('passes when auto-merge declares required checks and review guardrails', () => {
    const diagnostics = validateRepositoryAutomationContract({
      repositoryIndex,
      repositoryServiceContract: createServiceContract({
        automation: {
          ci: {
            required: true,
            workflow_names: ['CI'],
            required_status_checks: ['CI'],
            private_dependency_token_required: false,
            required_secrets: []
          },
          auto_merge: {
            enabled: true,
            required_checks: ['CI'],
            owner_review_required: true,
            major_update_allowed: false
          }
        }
      })
    });

    expect(diagnostics).toEqual([]);
  });

  test('warns when auto-merge lacks checks, owner review, or major update guard', () => {
    const diagnostics = validateRepositoryAutomationContract({
      repositoryIndex,
      repositoryServiceContract: createServiceContract({
        automation: {
          ci: {
            required: true,
            workflow_names: ['CI'],
            required_status_checks: ['CI'],
            private_dependency_token_required: false,
            required_secrets: []
          },
          auto_merge: {
            enabled: true,
            required_checks: [],
            owner_review_required: false,
            major_update_allowed: true
          }
        }
      })
    });

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-AUTO-006',
        severity: 'warning',
        file: 'service.yaml',
        path: 'automation.auto_merge',
        message:
          'Deploy unit auto-merge should declare required checks, require owner review, and keep major updates out of auto-merge.'
      }
    ]);
  });

  test('passes when stale bot exempts bug and security issues', () => {
    const diagnostics = validateRepositoryAutomationContract({
      repositoryIndex,
      repositoryServiceContract: createServiceContract({
        automation: {
          ci: {
            required: true,
            workflow_names: ['CI'],
            required_status_checks: ['CI'],
            private_dependency_token_required: false,
            required_secrets: []
          },
          stale_bot: {
            enabled: true,
            exempt_labels: ['bug', 'security', 'privacy'],
            security_issue_auto_close_allowed: false
          }
        }
      })
    });

    expect(diagnostics).toEqual([]);
  });

  test('warns when stale bot can close bug or security issues', () => {
    const diagnostics = validateRepositoryAutomationContract({
      repositoryIndex,
      repositoryServiceContract: createServiceContract({
        automation: {
          ci: {
            required: true,
            workflow_names: ['CI'],
            required_status_checks: ['CI'],
            private_dependency_token_required: false,
            required_secrets: []
          },
          stale_bot: {
            enabled: true,
            exempt_labels: ['triage'],
            security_issue_auto_close_allowed: true
          }
        }
      })
    });

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-AUTO-007',
        severity: 'warning',
        file: 'service.yaml',
        path: 'automation.stale_bot',
        message:
          'Deploy unit stale bot should exempt bug and security labels, and must not auto-close security issues.'
      }
    ]);
  });

  test('passes when Tauri desktop shell evidence CI matches its service contract', async () => {
    await withRepositoryRoot(
      {
        '.github/workflows/tauri-contract-evidence.yml': tauriContractEvidenceWorkflow()
      },
      async (repositoryRoot) => {
        const diagnostics = validateRepositoryAutomationContract({
          repositoryRoot,
          repositoryIndex,
          repositoryServiceContract: createServiceContract({
            service: {
              id: 'desktop-tauri',
              repo: 'zdp-desktop-tauri'
            },
            automation: {
              ci: {
                required: false,
                provider: 'github-actions',
                workflow_names: ['Tauri Contract Evidence'],
                required_status_checks: [],
                missing_reason: 'Manual contract evidence workflow is present before product activation.',
                private_dependency_token_required: false,
                required_secrets: []
              }
            }
          })
        });

        expect(diagnostics).toEqual([]);
      }
    );
  });

  test('warns when Tauri desktop shell evidence CI adds pull_request_target', async () => {
    await withRepositoryRoot(
      {
        '.github/workflows/tauri-contract-evidence.yml': tauriContractEvidenceWorkflow().replace(
          '  workflow_dispatch:',
          '  workflow_dispatch:\n  pull_request_target:'
        )
      },
      async (repositoryRoot) => {
        const diagnostics = validateRepositoryAutomationContract({
          repositoryRoot,
          repositoryIndex,
          repositoryServiceContract: createServiceContract({
            service: {
              id: 'desktop-tauri',
              repo: 'zdp-desktop-tauri'
            },
            automation: {
              ci: {
                required: false,
                provider: 'github-actions',
                workflow_names: ['Tauri Contract Evidence'],
                required_status_checks: [],
                missing_reason: 'Manual contract evidence workflow is present before product activation.',
                private_dependency_token_required: false,
                required_secrets: []
              }
            }
          })
        });

        expect(diagnostics).toEqual([
          {
            ruleId: 'ZDP-AUTO-008',
            severity: 'warning',
            file: 'service.yaml',
            path: 'repository.root',
            message:
              'Desktop shell evidence CI should keep the manual Tauri/Wails evidence workflow, short-lived desktop-shell evidence artifact, and non-activation boundary aligned with the service contract.'
          }
        ]);
      }
    );
  });

  test('warns when Tauri desktop shell evidence CI can drift from the contract-only boundary', async () => {
    await withRepositoryRoot(
      {
        '.github/workflows/tauri-contract-evidence.yml': [
          'name: Tauri Contract Evidence',
          '"on":',
          '  workflow_dispatch:',
          '  push:',
          'jobs:',
          '  contract-evidence:',
          '    runs-on: windows-latest',
          '    steps:',
          '      - run: tauri build'
        ].join('\n')
      },
      async (repositoryRoot) => {
        const diagnostics = validateRepositoryAutomationContract({
          repositoryRoot,
          repositoryIndex,
          repositoryServiceContract: createServiceContract({
            service: {
              id: 'desktop-tauri',
              repo: 'zdp-desktop-tauri'
            },
            automation: {
              ci: {
                required: false,
                provider: 'github-actions',
                workflow_names: ['Tauri Contract Evidence'],
                required_status_checks: [],
                missing_reason: 'Manual contract evidence workflow is present before product activation.',
                private_dependency_token_required: false,
                required_secrets: []
              }
            }
          })
        });

        expect(diagnostics).toEqual([
          {
            ruleId: 'ZDP-AUTO-008',
            severity: 'warning',
            file: 'service.yaml',
            path: 'repository.root',
            message:
              'Desktop shell evidence CI should keep the manual Tauri/Wails evidence workflow, short-lived desktop-shell evidence artifact, and non-activation boundary aligned with the service contract.'
          }
        ]);
      }
    );
  });

  test('passes when Wails desktop shell evidence CI records Tauri baseline and smoke receipts', async () => {
    await withRepositoryRoot(
      {
        '.github/workflows/wails-windows-smoke.yml': wailsWindowsSmokeWorkflow()
      },
      async (repositoryRoot) => {
        const diagnostics = validateRepositoryAutomationContract({
          repositoryRoot,
          repositoryIndex,
          repositoryServiceContract: createServiceContract({
            service: {
              id: 'desktop-wails',
              repo: 'zdp-desktop-wails'
            },
            automation: {
              ci: {
                required: false,
                provider: 'github-actions',
                workflow_names: ['Wails Windows Smoke'],
                required_status_checks: [],
                missing_reason: 'Manual Windows smoke workflow is present before product activation.',
                private_dependency_token_required: true,
                required_secrets: [
                  'ZDP_DESKTOP_TAURI_DEPLOY_KEY',
                  'ZDP_DESKTOP_TAURI_READ_TOKEN'
                ]
              }
            }
          })
        });

        expect(diagnostics).toEqual([]);
      }
    );
  });

  test('warns when Wails desktop shell evidence CI adds pull_request_target', async () => {
    await withRepositoryRoot(
      {
        '.github/workflows/wails-windows-smoke.yml': wailsWindowsSmokeWorkflow().replace(
          '  workflow_dispatch:',
          '  workflow_dispatch:\n  pull_request_target:'
        )
      },
      async (repositoryRoot) => {
        const diagnostics = validateRepositoryAutomationContract({
          repositoryRoot,
          repositoryIndex,
          repositoryServiceContract: createServiceContract({
            service: {
              id: 'desktop-wails',
              repo: 'zdp-desktop-wails'
            },
            automation: {
              ci: {
                required: false,
                provider: 'github-actions',
                workflow_names: ['Wails Windows Smoke'],
                required_status_checks: [],
                missing_reason: 'Manual Windows smoke workflow is present before product activation.',
                private_dependency_token_required: true,
                required_secrets: [
                  'ZDP_DESKTOP_TAURI_DEPLOY_KEY',
                  'ZDP_DESKTOP_TAURI_READ_TOKEN'
                ]
              }
            }
          })
        });

        expect(diagnostics).toEqual([
          {
            ruleId: 'ZDP-AUTO-008',
            severity: 'warning',
            file: 'service.yaml',
            path: 'repository.root',
            message:
              'Desktop shell evidence CI should keep the manual Tauri/Wails evidence workflow, short-lived desktop-shell evidence artifact, and non-activation boundary aligned with the service contract.'
          }
        ]);
      }
    );
  });

  test('warns when Wails desktop shell evidence CI loses the Tauri checkout fallback', async () => {
    await withRepositoryRoot(
      {
        '.github/workflows/wails-windows-smoke.yml': [
          'name: Wails Windows Smoke',
          '"on":',
          '  workflow_dispatch:',
          'permissions:',
          '  contents: read',
          'jobs:',
          '  windows-smoke:',
          '    runs-on: windows-latest',
          '    steps:',
          '      - run: bun scripts/collect-desktop-shell-evidence.ts --write',
          '      - uses: actions/upload-artifact@v7',
          '        with:',
          '          name: desktop-shell-evidence-summary',
          '          path: .task/desktop-shell-evidence/summary.json',
          '          retention-days: 3',
          '      - uses: actions/upload-artifact@v7',
          '        with:',
          '          name: wails-dev-smoke-receipt',
          '          path: .task/wails-dev-smoke/receipt.json',
          '          retention-days: 3'
        ].join('\n')
      },
      async (repositoryRoot) => {
        const diagnostics = validateRepositoryAutomationContract({
          repositoryRoot,
          repositoryIndex,
          repositoryServiceContract: createServiceContract({
            service: {
              id: 'desktop-wails',
              repo: 'zdp-desktop-wails'
            },
            automation: {
              ci: {
                required: false,
                provider: 'github-actions',
                workflow_names: ['Wails Windows Smoke'],
                required_status_checks: [],
                missing_reason: 'Manual Windows smoke workflow is present before product activation.',
                private_dependency_token_required: true,
                required_secrets: [
                  'ZDP_DESKTOP_TAURI_DEPLOY_KEY',
                  'ZDP_DESKTOP_TAURI_READ_TOKEN'
                ]
              }
            }
          })
        });

        expect(diagnostics).toEqual([
          {
            ruleId: 'ZDP-AUTO-008',
            severity: 'warning',
            file: 'service.yaml',
            path: 'repository.root',
            message:
              'Desktop shell evidence CI should keep the manual Tauri/Wails evidence workflow, short-lived desktop-shell evidence artifact, and non-activation boundary aligned with the service contract.'
          }
        ]);
      }
    );
  });

  test('warns when desktop shell service contract omits the evidence workflow name', () => {
    const diagnostics = validateRepositoryAutomationContract({
      repositoryIndex,
      repositoryServiceContract: createServiceContract({
        service: {
          id: 'desktop-wails',
          repo: 'zdp-desktop-wails'
        },
        automation: {
          ci: {
            required: false,
            provider: 'github-actions',
            workflow_names: [],
            required_status_checks: [],
            missing_reason: 'Manual Windows smoke workflow is present before product activation.',
            private_dependency_token_required: true,
            required_secrets: [
              'ZDP_DESKTOP_TAURI_DEPLOY_KEY',
              'ZDP_DESKTOP_TAURI_READ_TOKEN'
            ]
          }
        }
      })
    });

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-AUTO-008',
        severity: 'warning',
        file: 'service.yaml',
        path: 'automation.ci.workflow_names',
        message:
          'Desktop shell evidence CI should keep the manual Tauri/Wails evidence workflow, short-lived desktop-shell evidence artifact, and non-activation boundary aligned with the service contract.'
      }
    ]);
  });
});

function createServiceContract(
  overrides: {
    readonly service?: Record<string, unknown>;
    readonly automation?: Record<string, unknown>;
  } = {}
): Record<string, unknown> {
  return {
    service: {
      id: 'web-public',
      repo: 'zdp-web-public',
      ...(overrides.service ?? {})
    },
    ...(overrides.automation === undefined
      ? {}
      : { automation: overrides.automation })
  };
}

async function withRepositoryRoot(
  files: Record<string, string>,
  callback: (repositoryRoot: string) => Promise<void>
): Promise<void> {
  const repositoryRoot = await mkdtemp(
    join(tmpdir(), 'zdp-architecture-linter-automation-')
  );

  try {
    for (const [file, source] of Object.entries(files)) {
      const fullPath = join(repositoryRoot, file);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, source, 'utf8');
    }

    await callback(repositoryRoot);
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true });
  }
}

function sensitiveSubmissionWarningText(): string {
  return [
    'Do not submit secrets, tokens, API keys, or credentials.',
    'Do not include payment payloads, payment data, or card data.',
    'Do not paste customer raw data or customer data.'
  ].join('\n');
}

function tauriContractEvidenceWorkflow(): string {
  return [
    'name: Tauri Contract Evidence',
    '"on":',
    '  workflow_dispatch:',
    'permissions:',
    '  contents: read',
    'jobs:',
    '  contract-evidence:',
    '    runs-on: windows-latest',
    '    steps:',
    '      - uses: actions/checkout@v7',
    '      - uses: actions/checkout@v7',
    '        with:',
    '          repository: 0disoft/zdp-design-system',
    '      - run: bun scripts/collect-desktop-shell-evidence.ts --write',
    '      - uses: actions/upload-artifact@v7',
    '        with:',
    '          name: desktop-shell-evidence-summary',
    '          path: .task/desktop-shell-evidence/summary.json',
    '          retention-days: 3'
  ].join('\n');
}

function wailsWindowsSmokeWorkflow(): string {
  return [
    'name: Wails Windows Smoke',
    '"on":',
    '  workflow_dispatch:',
    'permissions:',
    '  contents: read',
    'jobs:',
    '  windows-smoke:',
    '    runs-on: windows-latest',
    '    env:',
    '      ZDP_DESKTOP_TAURI_ROOT: ${{ github.workspace }}/zdp-desktop-tauri',
    '      ZDP_DESKTOP_TAURI_DEPLOY_KEY: ${{ secrets.ZDP_DESKTOP_TAURI_DEPLOY_KEY }}',
    '      ZDP_DESKTOP_TAURI_READ_TOKEN: ${{ secrets.ZDP_DESKTOP_TAURI_READ_TOKEN }}',
    '    steps:',
    '      - name: Checkout zdp-desktop-tauri with deploy key',
    '        uses: actions/checkout@v7',
    '        with:',
    '          repository: 0disoft/zdp-desktop-tauri',
    '      - name: Checkout zdp-desktop-tauri with token',
    '        uses: actions/checkout@v7',
    '        with:',
    '          repository: 0disoft/zdp-desktop-tauri',
    '      - run: bun scripts/collect-desktop-shell-evidence.ts --write',
    '      - uses: actions/upload-artifact@v7',
    '        with:',
    '          name: wails-dev-smoke-receipt',
    '          path: .task/wails-dev-smoke/receipt.json',
    '          retention-days: 3',
    '      - uses: actions/upload-artifact@v7',
    '        with:',
    '          name: desktop-shell-evidence-summary',
    '          path: .task/desktop-shell-evidence/summary.json',
    '          retention-days: 3'
  ].join('\n');
}
