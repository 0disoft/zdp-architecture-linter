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
