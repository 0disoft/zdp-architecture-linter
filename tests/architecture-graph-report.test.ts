import { describe, expect, test } from 'bun:test';
import { buildArchitectureGraph } from '../src/architecture-graph.ts';
import {
  createArchitectureGraphReport,
  formatArchitectureGraphReportText
} from '../src/architecture-graph-report.ts';

describe('architecture graph report', () => {
  test('summarizes graph node counts and preserves node details', () => {
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
        services: {
          services: [
            {
              id: 'core-api',
              repo: 'zdp-core-platform'
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
          data_classes: [
            {
              id: 'identity'
            }
          ]
        },
        events: {
          events: [
            {
              id: 'core.account.created'
            }
          ]
        },
        externalProviders: {
          providers: [
            {
              id: 'openai'
            }
          ]
        },
        repositoryRules: {},
        moneyRules: {},
        providerRules: {},
        aiDataAccessRules: {},
        dataAccessRules: {},
        tierRules: {}
      },
      repositoryServiceContract: {
        service: {
          id: 'architecture-linter',
          repo: 'zdp-architecture-linter'
        }
      }
    });

    const report = createArchitectureGraphReport(graph);

    expect(report.summary).toEqual({
      repositories: 1,
      services: 2,
      datastores: 1,
      dataClasses: 1,
      events: 1,
      externalProviders: 1
    });
    expect(report.nodes.services).toEqual([
      {
        id: 'core-api',
        file: 'catalogs/services.yaml',
        path: 'services[0:core-api]',
        source: 'catalog',
        repo: 'zdp-core-platform'
      },
      {
        id: 'architecture-linter',
        file: 'service.yaml',
        path: 'service',
        source: 'repository-service-contract',
        repo: 'zdp-architecture-linter'
      }
    ]);
  });

  test('formats a compact text summary for humans', () => {
    const text = formatArchitectureGraphReportText({
      summary: {
        repositories: 2,
        services: 3,
        datastores: 4,
        dataClasses: 5,
        events: 6,
        externalProviders: 7
      },
      nodes: {
        repositories: [],
        services: [],
        datastores: [],
        dataClasses: [],
        events: [],
        externalProviders: []
      }
    });

    expect(text).toBe(
      [
        'zdp-arch: graph loaded',
        'repositories: 2',
        'services: 3',
        'datastores: 4',
        'dataClasses: 5',
        'events: 6',
        'externalProviders: 7'
      ].join('\n')
    );
  });
});
