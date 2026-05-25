import { describe, expect, test } from 'bun:test';
import {
  buildRepositoryAreaRules,
  validateRepositoriesCatalog
} from '../src/repository-rules.ts';

const repositoryAreaRules = buildRepositoryAreaRules({
  repository_area_rules: {
    exact: {
      'zdp-api-contracts': 'architecture'
    },
    prefixes: [
      { prefix: 'zdp-core-', area: 'core' },
      { prefix: 'zdp-web-', area: 'frontend' },
      { prefix: 'zdp-client-', area: 'frontend' }
    ]
  }
});

describe('repository catalog required fields', () => {
  test('passes when a repository entry has the required baseline fields', () => {
    const diagnostics = validateRepositoriesCatalog({
      repositories: [
        {
          name: 'zdp-architecture-linter',
          status: 'active',
          repo_stage: 'deploy_unit',
          kind: 'deploy_unit',
          area: 'architecture',
          purpose: 'Validate ZDP architecture contracts.',
          owner: '0disoft',
          risk_level: 'high'
        }
      ]
    });

    expect(diagnostics).toEqual([]);
  });

  test('fails with stable field paths when required fields are missing', () => {
    const diagnostics = validateRepositoriesCatalog({
      repositories: [
        {
          name: 'zdp-platform-runtime',
          status: 'reserved',
          repo_stage: 'deploy_unit',
          kind: 'deploy_unit',
          area: 'platform',
          purpose: 'Runtime baseline.'
        }
      ]
    });

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-REPO-001',
        severity: 'error',
        file: 'catalogs/repositories.yaml',
        path: 'repositories[0:zdp-platform-runtime].owner',
        message: 'Repository entry is missing required field `owner`.'
      },
      {
        ruleId: 'ZDP-REPO-001',
        severity: 'error',
        file: 'catalogs/repositories.yaml',
        path: 'repositories[0:zdp-platform-runtime].risk_level',
        message: 'Repository entry is missing required field `risk_level`.'
      }
    ]);
  });
});

describe('repository area prefix compatibility', () => {
  test('passes when repository area matches the prefix rules', () => {
    const diagnostics = validateRepositoriesCatalog(
      {
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
            name: 'zdp-api-contracts',
            status: 'reserved',
            repo_stage: 'deploy_unit',
            kind: 'deploy_unit',
            area: 'architecture',
            purpose: 'API and event contracts.',
            owner: '0disoft',
            risk_level: 'medium'
          }
        ]
      },
      repositoryAreaRules
    );

    expect(diagnostics).toEqual([]);
  });

  test('fails when repository area conflicts with the prefix rules', () => {
    const diagnostics = validateRepositoriesCatalog(
      {
        repositories: [
          {
            name: 'zdp-core-access',
            status: 'reserved',
            repo_stage: 'logical_only',
            kind: 'logical_boundary',
            area: 'frontend',
            purpose: 'Access control boundary.',
            owner: '0disoft',
            risk_level: 'high'
          }
        ]
      },
      repositoryAreaRules
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-REPO-003',
        severity: 'error',
        file: 'catalogs/repositories.yaml',
        path: 'repositories[0:zdp-core-access].area',
        message:
          'Repository name `zdp-core-access` maps to area `core`, but catalog area is `frontend`.'
      }
    ]);
  });

  test('fails when repository name has no allowed area rule', () => {
    const diagnostics = validateRepositoriesCatalog(
      {
        repositories: [
          {
            name: 'zdp-unknown-thing',
            status: 'reserved',
            repo_stage: 'deploy_unit',
            kind: 'deploy_unit',
            area: 'platform',
            purpose: 'Unknown boundary.',
            owner: '0disoft',
            risk_level: 'medium'
          }
        ]
      },
      repositoryAreaRules
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-REPO-003',
        severity: 'error',
        file: 'catalogs/repositories.yaml',
        path: 'repositories[0:zdp-unknown-thing].name',
        message:
          'Repository name `zdp-unknown-thing` does not match any allowed area prefix rule.'
      }
    ]);
  });
});
