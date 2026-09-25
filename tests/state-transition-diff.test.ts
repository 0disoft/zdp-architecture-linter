import { describe, expect, test } from 'bun:test';
import type { ArchitectureCatalogs } from '../src/catalog-loader.ts';
import { createArchitectureDiffReport } from '../src/architecture-diff-report.ts';
import { createStateTransitionDiagnostics } from '../src/state-transition-diff.ts';

const observedAt = new Date('2026-08-22T00:00:00Z');

describe('evidence-backed state transitions', () => {
  test('blocks service promotion and asset activation without transition evidence', () => {
    const baseCatalogs = createCatalogs({
      services: {
        services: [
          {
            id: 'public-web',
            repo: 'zdp-web-public',
            status: 'experiment'
          }
        ]
      },
      operationalAssets: {
        assets: [
          {
            id: 'worker-public-web',
            status: 'registered-not-live'
          }
        ]
      }
    });
    const headCatalogs = createCatalogs({
      services: {
        services: [
          {
            id: 'public-web',
            repo: 'zdp-web-public',
            status: 'active'
          }
        ]
      },
      operationalAssets: {
        assets: [
          {
            id: 'worker-public-web',
            status: 'active'
          }
        ]
      }
    });
    const report = createArchitectureDiffReport({
      baseCatalogs,
      headCatalogs,
      baseDiagnostics: [],
      headDiagnostics: [],
      observedAt
    });

    expect(report.changes.operationalAssets?.changed).toEqual([
      'worker-public-web'
    ]);
    expect(report.diagnostics.added).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: 'ZDP-STATE-TRANSITION-001',
          file: 'catalogs/services.yaml',
          path: 'services[id=public-web].transition_evidence'
        }),
        expect.objectContaining({
          ruleId: 'ZDP-STATE-TRANSITION-002',
          file: 'catalogs/operational-assets.yaml',
          path: 'assets[id=worker-public-web].transition_evidence'
        })
      ])
    );
  });

  test('accepts fresh evidence with explicit operating and cost references', () => {
    const evidence = {
      from_status: 'experiment',
      to_status: 'active',
      verified_at: '2026-08-21',
      evidence_refs: ['repo://zdp-web-public@abc123'],
      runbook_ref: 'RUNBOOK.md#public-web',
      rollback_ref: 'RUNBOOK.md#rollback',
      observability_ref: 'docs/11-operations-observability.md#public-web',
      monthly_budget_limit_usd: 25
    };
    const assetEvidence = {
      from_status: 'registered-not-live',
      to_status: 'active',
      verified_at: '2026-08-21',
      evidence_refs: ['cloudflare-worker-version://public-web/abc123'],
      runbook_ref: 'RUNBOOK.md#public-web',
      rollback_ref: 'RUNBOOK.md#rollback',
      observability_ref: 'docs/11-operations-observability.md#public-web',
      monthly_budget_limit_usd: 25
    };
    const diagnostics = createStateTransitionDiagnostics({
      baseCatalogs: createCatalogs({
        services: {
          services: [
            {
              id: 'public-web',
              status: 'experiment'
            }
          ]
        },
        operationalAssets: {
          assets: [
            {
              id: 'worker-public-web',
              status: 'registered-not-live'
            }
          ]
        }
      }),
      headCatalogs: createCatalogs({
        services: {
          services: [
            {
              id: 'public-web',
              status: 'active',
              transition_evidence: evidence
            }
          ]
        },
        operationalAssets: {
          assets: [
            {
              id: 'worker-public-web',
              status: 'active',
              transition_evidence: assetEvidence,
              evidence: {
                last_verified_at: '2026-08-21',
                refs: ['cloudflare-worker-version://public-web/abc123']
              }
            }
          ]
        }
      }),
      observedAt
    });

    expect(diagnostics).toEqual([]);
  });

  test('treats direct creation in a gated status as an absent-to-status transition', () => {
    const diagnostics = createStateTransitionDiagnostics({
      baseCatalogs: createCatalogs(),
      headCatalogs: createCatalogs({
        services: {
          services: [
            {
              id: 'new-live-service',
              status: 'active',
              transition_evidence: {
                from_status: 'experiment',
                to_status: 'active',
                verified_at: '2026-08-22',
                evidence_refs: ['repo://new-live-service@abc123'],
                runbook_ref: 'RUNBOOK.md',
                rollback_ref: 'RUNBOOK.md#rollback',
                observability_ref: 'docs/observability.md',
                monthly_budget_limit_usd: 10
              }
            }
          ]
        }
      }),
      observedAt
    });

    expect(diagnostics).toEqual([
      expect.objectContaining({
        ruleId: 'ZDP-STATE-TRANSITION-001',
        message: expect.stringContaining('from_status must equal absent')
      })
    ]);
  });

  test('rejects stale or unbound operational evidence', () => {
    const diagnostics = createStateTransitionDiagnostics({
      baseCatalogs: createCatalogs({
        operationalAssets: {
          assets: [
            {
              id: 'worker-public-web',
              status: 'registered-not-live'
            }
          ]
        }
      }),
      headCatalogs: createCatalogs({
        operationalAssets: {
          assets: [
            {
              id: 'worker-public-web',
              status: 'active',
              transition_evidence: {
                from_status: 'registered-not-live',
                to_status: 'active',
                verified_at: '2026-06-01',
                evidence_refs: ['repo://missing-from-asset-evidence'],
                runbook_ref: 'RUNBOOK.md',
                rollback_ref: 'RUNBOOK.md#rollback',
                observability_ref: 'docs/observability.md',
                monthly_budget_limit_usd: 10
              },
              evidence: {
                last_verified_at: '2026-08-21',
                refs: ['repo://different-evidence']
              }
            }
          ]
        }
      }),
      observedAt
    });

    expect(diagnostics).toEqual([
      expect.objectContaining({
        ruleId: 'ZDP-STATE-TRANSITION-002',
        message: expect.stringContaining('exceeds evidence_max_age_days=30')
      })
    ]);
    expect(diagnostics[0]?.message).toContain(
      'verified_at must match evidence.last_verified_at'
    );
    expect(diagnostics[0]?.message).toContain(
      'evidence_refs must also appear in operational asset evidence.refs'
    );
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
    tierRules: {
      state_transition_evidence: {
        schema_version: '1',
        evidence_max_age_days: 30,
        required_evidence_fields: [
          'evidence_refs',
          'runbook_ref',
          'rollback_ref',
          'observability_ref',
          'monthly_budget_limit_usd'
        ],
        service_statuses_requiring_evidence: ['active', 'scaling'],
        operational_asset_statuses_requiring_evidence: ['active']
      }
    } as ArchitectureCatalogs['tierRules'],
    ...partial
  };
}
