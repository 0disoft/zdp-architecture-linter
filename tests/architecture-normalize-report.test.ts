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
              direct_datastore_access: ['core_postgres']
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
          data_classes: []
        },
        events: {
          events: []
        },
        externalProviders: {
          providers: []
        },
        supportSourceAdapters: {
          schema_version: '1',
          adapters: [{
            id: 'melamed-support-v1',
            status: 'candidate',
            owner_repo: 'melamed',
            product_id: 'melamed',
            source_service: 'melamed-platform',
            case_kinds: ['customer-inquiry'],
            projection_schema_versions: [1],
            admin_api_versions: [1],
            activation: { state: 'blocked' }
          }]
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
      supportSourceAdapters: 1,
      edges: 3
    });
    expect(report.repositories[0]?.id).toBe('zdp-core-platform');
    expect(report.repositories[0]?.status).toBe('reserved');
    expect(report.repositories[0]?.agentReview).toEqual({
      status: 'included',
      playbookRepo: 'zdp-agent-review-playbooks',
      groupId: 'group-01',
      cadence: 'nightly',
      runScope: 'six-lens-raw-and-reducer',
      outputPolicy: 'local_ignored',
      since: null,
      removedAt: null,
      reason: null
    });
    expect(report.services[0]?.id).toBe('core-api');
    expect(report.services[0]?.status).toBe('experiment');
    expect(report.datastores[0]?.id).toBe('core_postgres');
    expect(report.datastores[0]?.status).toBe('active');
    expect(report.supportSourceAdapters).toEqual([{
      id: 'melamed-support-v1',
      status: 'candidate',
      ownerRepo: 'melamed',
      productId: 'melamed',
      sourceService: 'melamed-platform',
      caseKinds: ['customer-inquiry'],
      projectionSchemaVersions: [1],
      adminApiVersions: [1],
      activationState: 'blocked'
    }]);
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
        supportSourceAdapters: 7,
        edges: 8
      },
      repositories: [],
      services: [],
      datastores: [],
      dataClasses: [],
      events: [],
      externalProviders: [],
      supportSourceAdapters: [],
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
        'supportSourceAdapters: 7',
        'edges: 8',
        'diagnostics: 1 (0 errors, 1 warnings)'
      ].join('\n')
    );
  });
});
