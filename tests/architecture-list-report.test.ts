import { describe, expect, test } from 'bun:test';
import { buildArchitectureGraph } from '../src/architecture-graph.ts';
import {
  createArchitectureListReport,
  formatArchitectureListReportText
} from '../src/architecture-list-report.ts';

describe('architecture list report', () => {
  test('returns repository items with stage and area filters', () => {
    const graph = buildArchitectureGraph({
      catalogs: createListCatalogs()
    });
    const report = createArchitectureListReport({
      graph,
      kind: 'repos',
      filters: {
        stage: 'deploy_unit',
        area: 'core',
        agentReviewStatus: 'included'
      }
    });

    expect(report).toEqual({
      schemaVersion: 1,
      kind: 'repos',
      filters: {
        stage: 'deploy_unit',
        area: 'core',
        agentReviewStatus: 'included'
      },
      count: 1,
      items: [
        {
          name: 'zdp-core-platform',
          area: 'core',
          kind: 'deploy_unit',
          repoStage: 'deploy_unit',
          owner: '0disoft',
          riskLevel: 'high',
          agentReviewStatus: 'included'
        }
      ]
    });
  });

  test('returns service items with repo filter', () => {
    const graph = buildArchitectureGraph({
      catalogs: createListCatalogs()
    });
    const report = createArchitectureListReport({
      graph,
      kind: 'services',
      filters: {
        repo: 'zdp-core-platform'
      }
    });

    expect(report.items).toEqual([
      {
        id: 'core-api',
        repo: 'zdp-core-platform',
        tier: 'tier1',
        runtime: 'axum',
        directDatastoreAccess: ['core_postgres']
      }
    ]);
  });

  test('formats text output for both list kinds', () => {
    const reposText = formatArchitectureListReportText({
      schemaVersion: 1,
      kind: 'repos',
      filters: {
        stage: 'deploy_unit'
      },
      count: 1,
      items: [
        {
          name: 'zdp-core-platform',
          area: 'core',
          kind: 'deploy_unit',
          repoStage: 'deploy_unit',
          owner: '0disoft',
          riskLevel: 'high',
          agentReviewStatus: 'included'
        }
      ]
    });
    const servicesText = formatArchitectureListReportText({
      schemaVersion: 1,
      kind: 'services',
      filters: {},
      count: 1,
      items: [
        {
          id: 'core-api',
          repo: 'zdp-core-platform',
          tier: 'tier1',
          runtime: 'axum',
          directDatastoreAccess: ['core_postgres']
        }
      ]
    });

    expect(reposText).toBe(
      [
        'zdp-arch: repos',
        'filters: stage=deploy_unit',
        'count: 1',
        '- zdp-core-platform area=core kind=deploy_unit repoStage=deploy_unit owner=0disoft riskLevel=high agentReviewStatus=included'
      ].join('\n')
    );
    expect(servicesText).toBe(
      [
        'zdp-arch: services',
        'count: 1',
        '- core-api repo=zdp-core-platform tier=tier1 runtime=axum directDatastoreAccess=core_postgres'
      ].join('\n')
    );
  });
});

function createListCatalogs() {
  return {
    repositories: {
      repositories: [
        {
          name: 'zdp-core-platform',
          status: 'reserved',
          repo_stage: 'deploy_unit',
          kind: 'deploy_unit',
          area: 'core',
          purpose: 'Core platform.',
          owner: '0disoft',
          risk_level: 'high',
          agent_review: {
            status: 'included',
            playbook_repo: 'zdp-agent-review-playbooks',
            group_id: 'group-01',
            cadence: 'nightly',
            run_scope: 'six-lens-raw-and-reducer',
            output_policy: 'local_ignored'
          }
        },
        {
          name: 'zdp-ai-memory',
          status: 'reserved',
          repo_stage: 'logical_only',
          kind: 'logical_boundary',
          area: 'ai',
          purpose: 'AI memory boundary.',
          owner: '0disoft',
          risk_level: 'high',
          agent_review: {
            status: 'excluded',
            cadence: 'none',
            run_scope: 'none',
            output_policy: 'none',
            reason: 'Logical boundary is not reviewed directly.'
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
          tier: 'tier1',
          runtime: 'axum',
          direct_datastore_access: ['core_postgres']
        },
        {
          id: 'ai-memory-service',
          repo: 'zdp-ai-platform',
          tier: 'tier2',
          runtime: 'axum',
          direct_datastore_access: ['ai_memory_postgres']
        }
      ]
    },
    datastores: {
      datastores: [
        {
          id: 'core_postgres',
          kind: 'postgresql',
          owner_repo: 'zdp-core-platform',
          hosted_on: 'hetzner',
          data_classes: []
        },
        {
          id: 'ai_memory_postgres',
          kind: 'postgresql',
          owner_repo: 'zdp-ai-platform',
          hosted_on: 'hetzner',
          data_classes: []
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
  };
}
