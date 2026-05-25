import { describe, expect, test } from 'bun:test';
import { validateRepositoriesCatalog } from '../src/repository-rules.ts';

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
        path: 'repositories[0].owner',
        message: 'Repository entry is missing required field `owner`.'
      },
      {
        ruleId: 'ZDP-REPO-001',
        severity: 'error',
        file: 'catalogs/repositories.yaml',
        path: 'repositories[0].risk_level',
        message: 'Repository entry is missing required field `risk_level`.'
      }
    ]);
  });
});

