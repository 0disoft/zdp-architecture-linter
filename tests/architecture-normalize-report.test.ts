import { describe, expect, test } from 'bun:test';
import { buildArchitectureGraph } from '../src/architecture-graph.ts';
import {
  createArchitectureNormalizeReport,
  formatArchitectureNormalizeReportText
} from '../src/architecture-normalize-report.ts';

describe('architecture normalize report', () => {
  test('returns normalized graph nodes, edges, and validation summary', () => {
    const graph = buildArchitectureGraph({
      catalogs: {
        repositories: {
          repositories: [
            {
              name: 'zdp-core-platform',
              repo_stage: 'deploy_unit',
              kind: 'deploy_unit',
              area: 'core'
            }
          ]
        },
        splitTriggers: {
          split_triggers: []
        },
        services: {
          services: [
            {
              id: 'core-api',
              repo: 'zdp-core-platform',
              direct_datastore_access: ['core_postgres']
            }
          ]
        },
        datastores: {
          datastores: [
            {
              id: 'core_postgres',
              kind: 'postgresql',
              owner_repo: 'zdp-core-platform'
            }
          ]
        },
        dataClasses: {
          data_classes: []
        },
        events: {
          events: []
        },
        externalProviders: {
          providers: []
        },
        repositoryRules: {},
        moneyRules: {},
        providerRules: {},
        aiDataAccessRules: {},
        dataAccessRules: {},
        tierRules: {}
      }
    });
    const report = createArchitectureNormalizeReport({
      graph,
      validation: {
        diagnostics: [
          {
            ruleId: 'ZDP-WARN',
            severity: 'warning',
            file: 'catalogs/repositories.yaml',
            path: 'repositories[0]',
            message: 'warning'
          }
        ]
      }
    });

    expect(report.schemaVersion).toBe(1);
    expect(report.summary).toEqual({
      repositories: 1,
      services: 1,
      datastores: 1,
      dataClasses: 0,
      events: 0,
      externalProviders: 0,
      edges: 3
    });
    expect(report.repositories[0]?.id).toBe('zdp-core-platform');
    expect(report.services[0]?.id).toBe('core-api');
    expect(report.datastores[0]?.id).toBe('core_postgres');
    expect(report.edges.map((edge) => edge.type)).toEqual([
      'service-owned-by-repository',
      'service-accesses-datastore',
      'datastore-owned-by-repository'
    ]);
    expect(report.validation).toEqual({
      diagnostics: 1,
      errors: 0,
      warnings: 1
    });
  });

  test('formats a compact text summary', () => {
    const text = formatArchitectureNormalizeReportText({
      schemaVersion: 1,
      summary: {
        repositories: 1,
        services: 2,
        datastores: 3,
        dataClasses: 4,
        events: 5,
        externalProviders: 6,
        edges: 7
      },
      repositories: [],
      services: [],
      datastores: [],
      dataClasses: [],
      events: [],
      externalProviders: [],
      edges: [],
      validation: {
        diagnostics: 1,
        errors: 0,
        warnings: 1
      }
    });

    expect(text).toBe(
      [
        'zdp-arch: normalized architecture registry',
        'schemaVersion: 1',
        'repositories: 1',
        'services: 2',
        'datastores: 3',
        'dataClasses: 4',
        'events: 5',
        'externalProviders: 6',
        'edges: 7',
        'diagnostics: 1 (0 errors, 1 warnings)'
      ].join('\n')
    );
  });
});
