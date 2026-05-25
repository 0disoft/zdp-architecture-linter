import { describe, expect, test } from 'bun:test';
import { buildArchitectureGraph } from '../src/architecture-graph.ts';

describe('architecture graph', () => {
  test('builds indexes and graph nodes from architecture catalogs', () => {
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
      }
    });

    expect(graph.indexes.repositories.byName.has('zdp-core-platform')).toBe(true);
    expect(graph.indexes.services.byId.has('core-api')).toBe(true);
    expect(graph.indexes.datastores.byId.has('core_postgres')).toBe(true);
    expect(graph.indexes.dataClasses.byId.has('identity')).toBe(true);
    expect(graph.indexes.events.byId.has('core.account.created')).toBe(true);
    expect(graph.indexes.externalProviders.byId.has('openai')).toBe(true);
    expect(graph.nodes.repositories).toEqual([
      {
        id: 'zdp-core-platform',
        file: 'catalogs/repositories.yaml',
        path: 'repositories[0:zdp-core-platform]',
        source: 'catalog',
        area: 'core',
        kind: 'deploy_unit',
        repoStage: 'deploy_unit'
      }
    ]);
    expect(graph.nodes.services).toEqual([
      {
        id: 'core-api',
        file: 'catalogs/services.yaml',
        path: 'services[0:core-api]',
        source: 'catalog',
        repo: 'zdp-core-platform'
      }
    ]);
    expect(graph.nodes.datastores[0]).toEqual({
      id: 'core_postgres',
      file: 'catalogs/datastores.yaml',
      path: 'datastores[0:core_postgres]',
      source: 'catalog',
      kind: 'postgresql',
      ownerRepo: 'zdp-core-platform'
    });
  });

  test('adds a repository service contract as a service node', () => {
    const graph = buildArchitectureGraph({
      catalogs: {
        repositories: {},
        services: {
          services: [
            {
              id: 'architecture-linter',
              repo: 'zdp-architecture-linter'
            }
          ]
        },
        datastores: {},
        dataClasses: {},
        events: {},
        externalProviders: {},
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
        },
        runtime: {
          core: 'local-cli'
        },
        data: {
          datastores: []
        }
      }
    });

    expect(graph.repositoryServiceContractCatalog).toEqual({
      services: [
        expect.objectContaining({
          id: 'architecture-linter',
          repo: 'zdp-architecture-linter',
          runtime: 'local-cli',
          direct_datastore_access: []
        })
      ]
    });
    expect(graph.nodes.services).toEqual([
      {
        id: 'architecture-linter',
        file: 'catalogs/services.yaml',
        path: 'services[0:architecture-linter]',
        source: 'catalog',
        repo: 'zdp-architecture-linter'
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
});
