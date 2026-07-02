import { describe, expect, test } from 'bun:test';
import type { ArchitectureCatalogs } from '../src/catalog-loader.ts';
import {
  createArchitectureDiffReport,
  formatArchitectureDiffReportText
} from '../src/architecture-diff-report.ts';

describe('architecture diff report', () => {
  test('summarizes core catalog ID changes and risky field changes', () => {
    const report = createArchitectureDiffReport({
      baseCatalogs: createCatalogs({
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
              name: 'zdp-web-public',
              status: 'reserved',
              repo_stage: 'deploy_unit',
              kind: 'deploy_unit',
              area: 'web',
              purpose: 'Public web.',
              owner: '0disoft',
              risk_level: 'low',
              agent_review: {
                status: 'included',
                playbook_repo: 'zdp-agent-review-playbooks',
                group_id: 'group-02',
                cadence: 'nightly',
                run_scope: 'six-lens-raw-and-reducer',
                output_policy: 'local_ignored'
              }
            }
          ]
        },
        services: {
          services: [
            {
              id: 'core-api',
              repo: 'zdp-core-platform',
              tier: 'tier1',
              runtime: 'axum',
              direct_datastore_access: ['core_postgres']
            }
          ]
        }
      }),
      headCatalogs: createCatalogs({
        repositories: {
          repositories: [
            {
              name: 'zdp-core-platform',
              status: 'reserved',
              repo_stage: 'conditional_deploy_unit',
              kind: 'deploy_unit',
              area: 'core',
              purpose: 'Core platform.',
              owner: 'platform',
              risk_level: 'high',
              agent_review: {
                status: 'paused',
                cadence: 'none',
                run_scope: 'none',
                output_policy: 'none',
                reason: 'Review paused while ownership changes.'
              }
            },
            {
              name: 'zdp-edge-workers',
              status: 'reserved',
              repo_stage: 'deploy_unit',
              kind: 'deploy_unit',
              area: 'edge',
              purpose: 'Edge gateway.',
              owner: '0disoft',
              risk_level: 'medium',
              agent_review: {
                status: 'included',
                playbook_repo: 'zdp-agent-review-playbooks',
                group_id: 'group-03',
                cadence: 'nightly',
                run_scope: 'six-lens-raw-and-reducer',
                output_policy: 'local_ignored'
              }
            }
          ]
        },
        services: {
          services: [
            {
              id: 'core-api',
              repo: 'zdp-core-platform',
              tier: 'tier0',
              runtime: 'axum',
              direct_datastore_access: ['core_postgres', 'audit_postgres']
            }
          ]
        }
      }),
      baseDiagnostics: [
        {
          ruleId: 'ZDP-OLD',
          severity: 'warning',
          file: 'catalogs/repositories.yaml',
          path: 'repositories[0]',
          message: 'old warning'
        }
      ],
      headDiagnostics: [
        {
          ruleId: 'ZDP-NEW',
          severity: 'error',
          file: 'catalogs/services.yaml',
          path: 'services[0]',
          message: 'new error'
        }
      ]
    });

    expect(report.changes.repositories).toEqual({
      added: ['zdp-edge-workers'],
      removed: ['zdp-web-public'],
      changed: ['zdp-core-platform']
    });
    expect(report.changes.services.changed).toEqual(['core-api']);
    expect(report.diagnostics.added.map((diagnostic) => diagnostic.ruleId)).toEqual([
      'ZDP-NEW'
    ]);
    expect(report.diagnostics.resolved.map((diagnostic) => diagnostic.ruleId)).toEqual([
      'ZDP-OLD'
    ]);
    expect(report.riskNotes).toContain(
      'repositories.zdp-core-platform: repo_stage changed from "deploy_unit" to "conditional_deploy_unit"'
    );
    expect(report.riskNotes).toContain(
      'repositories.zdp-core-platform: owner changed from "0disoft" to "platform"'
    );
    expect(report.riskNotes).toContain(
      'repositories.zdp-core-platform: agent_review changed from {"cadence":"nightly","group_id":"group-01","output_policy":"local_ignored","playbook_repo":"zdp-agent-review-playbooks","run_scope":"six-lens-raw-and-reducer","status":"included"} to {"cadence":"none","output_policy":"none","reason":"Review paused while ownership changes.","run_scope":"none","status":"paused"}'
    );
    expect(report.riskNotes).toContain(
      'services.core-api: direct_datastore_access changed from ["core_postgres"] to ["core_postgres","audit_postgres"]'
    );
    expect(report.riskNotes).toContain(
      'services.core-api: tier changed from "tier1" to "tier0"'
    );
  });

  test('formats a compact text report', () => {
    const text = formatArchitectureDiffReportText({
      changes: {
        repositories: {
          added: ['zdp-edge-workers'],
          removed: [],
          changed: []
        },
        services: {
          added: [],
          removed: [],
          changed: []
        },
        datastores: {
          added: [],
          removed: [],
          changed: []
        },
        events: {
          added: [],
          removed: [],
          changed: []
        }
      },
      diagnostics: {
        added: [],
        resolved: []
      },
      riskNotes: []
    });

    expect(text).toContain('# zdp-arch diff');
    expect(text).toContain('## repositories');
    expect(text).toContain('- added: zdp-edge-workers');
    expect(text).toContain('## risk notes');
    expect(text).toContain('- none');
  });
});

function createCatalogs(
  partial: Partial<ArchitectureCatalogs>
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
