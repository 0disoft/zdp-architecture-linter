import { describe, expect, test } from 'bun:test';
import { buildArchitectureGraph } from '../src/architecture-graph.ts';
import {
  createArchitecturePackReport,
  formatArchitecturePackReportText
} from '../src/architecture-pack-report.ts';

describe('architecture pack report', () => {
  test('summarizes repository, service, data, event, and provider context', () => {
    const graph = buildArchitectureGraph({
      catalogs: {
        repositories: {
          repositories: [
            {
              name: 'zdp-products-lab',
              status: 'reserved',
              repo_stage: 'deploy_unit',
              kind: 'deploy_unit',
              area: 'labs',
              purpose: 'Product experiment lab.',
              owner: '0disoft',
              risk_level: 'medium',
              owns_data: ['product-specs'],
              create_when: ['First product spec is ready.'],
              split_trigger: ['A product needs independent deployment.']
            }
          ]
        },
        splitTriggers: {
          split_triggers: []
        },
        services: {
          services: [
            {
              id: 'products-lab-api',
              repo: 'zdp-products-lab',
              tier: 'tier3',
              runtime: 'bun',
              dependencies: ['core-api'],
              direct_datastore_access: ['products_postgres'],
              data: {
                classes: ['product-specs']
              },
              events: {
                produced: [
                  {
                    id: 'product.spec.created'
                  }
                ],
                consumed: ['core.account.created']
              },
              external_dependencies: ['openai']
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
      }
    });

    const report = createArchitecturePackReport({
      graph,
      repo: 'zdp-products-lab',
      task: 'Add product spec fixture'
    });

    expect(report).toEqual({
      repo: {
        name: 'zdp-products-lab',
        status: 'reserved',
        repoStage: 'deploy_unit',
        kind: 'deploy_unit',
        area: 'labs',
        purpose: 'Product experiment lab.',
        owner: '0disoft',
        riskLevel: 'medium',
        currentLocation: null,
        createWhen: ['First product spec is ready.'],
        splitTrigger: ['A product needs independent deployment.'],
        ownsData: ['product-specs']
      },
      task: 'Add product spec fixture',
      services: [
        {
          id: 'products-lab-api',
          repo: 'zdp-products-lab',
          tier: 'tier3',
          runtime: 'bun',
          directDatastoreAccess: ['products_postgres'],
          datastoreDependencies: [],
          serviceDependencies: ['core-api'],
          dataClasses: ['product-specs'],
          producedEvents: ['product.spec.created'],
          consumedEvents: ['core.account.created'],
          externalProviders: ['openai']
        }
      ],
      data: {
        ownedClasses: ['product-specs'],
        serviceDataClasses: ['product-specs'],
        directDatastores: ['products_postgres'],
        datastoreDependencies: []
      },
      events: {
        produced: ['product.spec.created'],
        consumed: ['core.account.created']
      },
      externalProviders: ['openai'],
      boundaries: []
    });
  });

  test('formats a compact markdown pack', () => {
    const text = formatArchitecturePackReportText({
      repo: {
        name: 'zdp-core-identity',
        status: 'reserved',
        repoStage: 'logical_only',
        kind: 'logical_boundary',
        area: 'core',
        purpose: 'Identity boundary.',
        owner: '0disoft',
        riskLevel: 'high',
        currentLocation: 'zdp-core-platform/crates/identity',
        createWhen: [],
        splitTrigger: ['Security audit requires isolated deployment.'],
        ownsData: ['identity']
      },
      task: 'Write service contract',
      services: [],
      data: {
        ownedClasses: ['identity'],
        serviceDataClasses: [],
        directDatastores: [],
        datastoreDependencies: []
      },
      events: {
        produced: [],
        consumed: []
      },
      externalProviders: [],
      boundaries: [
        'repo_stage가 logical_only이므로 실제 독립 저장소 생성 대상인지 catalog의 create_when/current_location을 먼저 확인한다.'
      ]
    });

    expect(text).toContain('# zdp-core-identity 작업 팩');
    expect(text).toContain('작업: Write service contract');
    expect(text).toContain('- 단계: logical_only');
    expect(text).toContain('- Security audit requires isolated deployment.');
    expect(text).toContain('- 소유 데이터: identity');
  });

  test('fails when a requested repository is not registered', () => {
    const graph = buildArchitectureGraph({
      catalogs: {
        repositories: {
          repositories: []
        },
        splitTriggers: {
          split_triggers: []
        },
        services: {},
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
      }
    });

    expect(() =>
      createArchitecturePackReport({
        graph,
        repo: 'zdp-missing',
        task: 'Test'
      })
    ).toThrow('Repository `zdp-missing` was not found in catalogs/repositories.yaml.');
  });
});
