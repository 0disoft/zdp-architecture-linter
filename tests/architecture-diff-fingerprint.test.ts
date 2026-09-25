import { describe, expect, test } from 'bun:test';
import type { ArchitectureCatalogs } from '../src/catalog-loader.ts';
import { createArchitectureDiffReport } from '../src/architecture-diff-report.ts';

describe('architecture diff diagnostic identity', () => {
  test('does not report message-only diagnostic edits as added and resolved', () => {
    const report = createArchitectureDiffReport({
      baseCatalogs: createCatalogs(),
      headCatalogs: createCatalogs(),
      baseDiagnostics: [
        {
          ruleId: 'ZDP-REPO-001',
          severity: 'error',
          file: 'catalogs/repositories.yaml',
          path: 'repositories[0:zdp-api].owner',
          message: 'Repository owner is missing.'
        }
      ],
      headDiagnostics: [
        {
          ruleId: 'ZDP-REPO-001',
          severity: 'error',
          file: 'catalogs/repositories.yaml',
          path: 'repositories[0:zdp-api].owner',
          message: 'Declare the repository owner.'
        }
      ]
    });

    expect(report.diagnostics).toEqual({
      added: [],
      resolved: []
    });
  });

  test('continues to expose severity changes as diagnostic changes', () => {
    const report = createArchitectureDiffReport({
      baseCatalogs: createCatalogs(),
      headCatalogs: createCatalogs(),
      baseDiagnostics: [
        {
          ruleId: 'ZDP-REPO-001',
          severity: 'warning',
          file: 'catalogs/repositories.yaml',
          path: 'repositories[0:zdp-api].owner',
          message: 'Repository owner is missing.'
        }
      ],
      headDiagnostics: [
        {
          ruleId: 'ZDP-REPO-001',
          severity: 'error',
          file: 'catalogs/repositories.yaml',
          path: 'repositories[0:zdp-api].owner',
          message: 'Repository owner is missing.'
        }
      ]
    });

    expect(report.diagnostics.added).toHaveLength(1);
    expect(report.diagnostics.resolved).toHaveLength(1);
  });
});

function createCatalogs(
  partial: Partial<ArchitectureCatalogs> = {}
): ArchitectureCatalogs {
  return {
    repositories: {},
    splitTriggers: {
      split_triggers: []
    },
    repositoryRoadmapText: '',
    services: {},
    datastores: {},
    dataClasses: {},
    costBudgets: {},
    sloTiers: {},
    events: {},
    externalProviders: {},
    repositoryRules: {},
    moneyRules: {},
    providerRules: {},
    aiDataAccessRules: {},
    dataAccessRules: {},
    tierRules: {},
    ...partial
  };
}
