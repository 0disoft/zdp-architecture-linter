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
              status: 'reserved',
              repo_stage: 'deploy_unit',
              kind: 'deploy_unit',
              area: 'core',
              agent_review: {
                status: 'included',
                playbook_repo: 'zdp-agent-review-playbooks',
                group_id: 'group-01',
                cadence: 'nightly',
                run_scope: 'six-lens-raw-and-reducer',
                output_policy: 'local_ignored'
              }
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
              status: 'experiment',
              dependencies: ['auth-api'],
              direct_datastore_access: ['core_postgres'],
              external_dependencies: ['openai'],
              data: {
                classes: ['identity']
              },
              events: {
                produced: ['core.account.created']
              }
            },
            {
              id: 'auth-api',
              repo: 'zdp-core-platform',
              status: 'reserved'
            }
          ]
        },
        datastores: {
          datastores: [
            {
              id: 'core_postgres',
              status: 'active',
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
              id: 'core.account.created',
              owner_repo: 'zdp-core-platform',
              emitted_by: ['zdp-core-platform'],
              consumed_by: ['zdp-core-platform'],
              data_classes: ['identity']
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
    expect(graph.indexes.services.byId.has('auth-api')).toBe(true);
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
        status: 'reserved',
        area: 'core',
        kind: 'deploy_unit',
        repoStage: 'deploy_unit',
        agentReview: {
          status: 'included',
          playbookRepo: 'zdp-agent-review-playbooks',
          groupId: 'group-01',
          cadence: 'nightly',
          runScope: 'six-lens-raw-and-reducer',
          outputPolicy: 'local_ignored',
          since: null,
          removedAt: null,
          reason: null
        }
      }
    ]);
    expect(graph.nodes.services).toEqual([
      {
        id: 'core-api',
        file: 'catalogs/services.yaml',
        path: 'services[0:core-api]',
        source: 'catalog',
        repo: 'zdp-core-platform',
        status: 'experiment'
      },
      {
        id: 'auth-api',
        file: 'catalogs/services.yaml',
        path: 'services[1:auth-api]',
        source: 'catalog',
        repo: 'zdp-core-platform',
        status: 'reserved'
      }
    ]);
    expect(graph.nodes.datastores[0]).toEqual({
      id: 'core_postgres',
      file: 'catalogs/datastores.yaml',
      path: 'datastores[0:core_postgres]',
      source: 'catalog',
      status: 'active',
      kind: 'postgresql',
      ownerRepo: 'zdp-core-platform'
    });
    expect(graph.edges).toEqual([
      {
        type: 'service-owned-by-repository',
        from: { kind: 'service', id: 'core-api' },
        to: { kind: 'repository', id: 'zdp-core-platform' },
        file: 'catalogs/services.yaml',
        path: 'services[0:core-api].repo',
        source: 'catalog'
      },
      {
        type: 'service-depends-on-service',
        from: { kind: 'service', id: 'core-api' },
        to: { kind: 'service', id: 'auth-api' },
        file: 'catalogs/services.yaml',
        path: 'services[0:core-api].dependencies[0]',
        source: 'catalog'
      },
      {
        type: 'service-accesses-datastore',
        from: { kind: 'service', id: 'core-api' },
        to: { kind: 'datastore', id: 'core_postgres' },
        file: 'catalogs/services.yaml',
        path: 'services[0:core-api].direct_datastore_access[0]',
        source: 'catalog'
      },
      {
        type: 'service-uses-data-class',
        from: { kind: 'service', id: 'core-api' },
        to: { kind: 'dataClass', id: 'identity' },
        file: 'catalogs/services.yaml',
        path: 'services[0:core-api].data.classes[0]',
        source: 'catalog'
      },
      {
        type: 'service-uses-provider',
        from: { kind: 'service', id: 'core-api' },
        to: { kind: 'externalProvider', id: 'openai' },
        file: 'catalogs/services.yaml',
        path: 'services[0:core-api].external_dependencies[0]',
        source: 'catalog'
      },
      {
        type: 'service-produces-event',
        from: { kind: 'service', id: 'core-api' },
        to: { kind: 'event', id: 'core.account.created' },
        file: 'catalogs/services.yaml',
        path: 'services[0:core-api].events.produced[0]',
        source: 'catalog'
      },
      {
        type: 'service-owned-by-repository',
        from: { kind: 'service', id: 'auth-api' },
        to: { kind: 'repository', id: 'zdp-core-platform' },
        file: 'catalogs/services.yaml',
        path: 'services[1:auth-api].repo',
        source: 'catalog'
      },
      {
        type: 'datastore-owned-by-repository',
        from: { kind: 'datastore', id: 'core_postgres' },
        to: { kind: 'repository', id: 'zdp-core-platform' },
        file: 'catalogs/datastores.yaml',
        path: 'datastores[0:core_postgres].owner_repo',
        source: 'catalog'
      },
      {
        type: 'event-owned-by-repository',
        from: { kind: 'event', id: 'core.account.created' },
        to: { kind: 'repository', id: 'zdp-core-platform' },
        file: 'catalogs/events.yaml',
        path: 'events[0:core.account.created].owner_repo',
        source: 'catalog'
      },
      {
        type: 'event-emitted-by-repository',
        from: { kind: 'event', id: 'core.account.created' },
        to: { kind: 'repository', id: 'zdp-core-platform' },
        file: 'catalogs/events.yaml',
        path: 'events[0:core.account.created].emitted_by[0]',
        source: 'catalog'
      },
      {
        type: 'event-consumed-by-repository',
        from: { kind: 'event', id: 'core.account.created' },
        to: { kind: 'repository', id: 'zdp-core-platform' },
        file: 'catalogs/events.yaml',
        path: 'events[0:core.account.created].consumed_by[0]',
        source: 'catalog'
      },
      {
        type: 'event-carries-data-class',
        from: { kind: 'event', id: 'core.account.created' },
        to: { kind: 'dataClass', id: 'identity' },
        file: 'catalogs/events.yaml',
        path: 'events[0:core.account.created].data_classes[0]',
        source: 'catalog'
      }
    ]);
  });

  test('adds a repository service contract as a service node', () => {
    const graph = buildArchitectureGraph({
      catalogs: {
        repositories: {},
        splitTriggers: {
          split_triggers: []
        },
        services: {
          services: [
            {
              id: 'architecture-linter',
              repo: 'zdp-architecture-linter',
              status: 'reserved'
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
          repo: 'zdp-architecture-linter',
          status: 'reserved'
        },
        runtime: {
          core: 'local-cli'
        },
        data: {
          datastores: ['core_postgres']
        },
        dependencies: {
          services: ['core-api'],
          datastores: ['core_postgres']
        }
      }
    });

    expect(graph.repositoryServiceContractCatalog).toEqual({
      services: [
        expect.objectContaining({
          id: 'architecture-linter',
          repo: 'zdp-architecture-linter',
          runtime: 'local-cli',
          direct_datastore_access: ['core_postgres']
        })
      ]
    });
    expect(graph.nodes.services).toEqual([
      {
        id: 'architecture-linter',
        file: 'catalogs/services.yaml',
        path: 'services[0:architecture-linter]',
        source: 'catalog',
        repo: 'zdp-architecture-linter',
        status: 'reserved'
      },
      {
        id: 'architecture-linter',
        file: 'service.yaml',
        path: 'service',
        source: 'repository-service-contract',
        repo: 'zdp-architecture-linter',
        status: 'reserved'
      }
    ]);
    expect(graph.edges).toEqual([
      {
        type: 'service-owned-by-repository',
        from: { kind: 'service', id: 'architecture-linter' },
        to: { kind: 'repository', id: 'zdp-architecture-linter' },
        file: 'catalogs/services.yaml',
        path: 'services[0:architecture-linter].repo',
        source: 'catalog'
      },
      {
        type: 'service-owned-by-repository',
        from: { kind: 'service', id: 'architecture-linter' },
        to: { kind: 'repository', id: 'zdp-architecture-linter' },
        file: 'service.yaml',
        path: 'service.repo',
        source: 'repository-service-contract'
      },
      {
        type: 'service-depends-on-service',
        from: { kind: 'service', id: 'architecture-linter' },
        to: { kind: 'service', id: 'core-api' },
        file: 'service.yaml',
        path: 'dependencies.services[0]',
        source: 'repository-service-contract'
      },
      {
        type: 'service-accesses-datastore',
        from: { kind: 'service', id: 'architecture-linter' },
        to: { kind: 'datastore', id: 'core_postgres' },
        file: 'service.yaml',
        path: 'data.datastores[0]',
        source: 'repository-service-contract'
      },
      {
        type: 'service-depends-on-datastore',
        from: { kind: 'service', id: 'architecture-linter' },
        to: { kind: 'datastore', id: 'core_postgres' },
        file: 'service.yaml',
        path: 'dependencies.datastores[0]',
        source: 'repository-service-contract'
      }
    ]);
  });
});
