import { describe, expect, test } from 'bun:test';
import type { ArchitectureCatalogs } from '../src/catalog-loader.ts';
import { createStateTransitionDiagnostics } from '../src/state-transition-diff.ts';

const policy = {
  schema_version: 1,
  evidence_max_age_days: 30,
  required_evidence_fields: ['evidence_refs', 'runbook_ref'],
  service_statuses_requiring_evidence: ['active', 'scaling'],
  operational_asset_statuses_requiring_evidence: ['active']
};
const observedAt = new Date('2026-09-17T00:00:00Z');

function catalogs(status: string, evidencePolicy: unknown = policy): ArchitectureCatalogs {
  const tierRules = evidencePolicy === undefined ? { rules: [] } : { rules: [], state_transition_evidence: evidencePolicy };
  return {
    repositories: { repositories: [] }, splitTriggers: { split_triggers: [] },
    services: { services: [{ id: 'example', status }] }, datastores: { datastores: [] },
    dataClasses: { data_classes: [] }, events: { events: [] }, externalProviders: { providers: [] },
    operationalAssets: { assets: [] }, repositoryRules: { repository_area_rules: [] },
    moneyRules: { rules: [] }, providerRules: { rules: [] }, aiDataAccessRules: { rules: [] },
    dataAccessRules: { rules: [] }, tierRules
  };
}

describe('state transition baseline policy', () => {
  test('cannot remove the policy and promote a service in the same diff', () => {
    const head = { ...catalogs('active'), tierRules: { rules: [] } };
    const diagnostics = createStateTransitionDiagnostics({ baseCatalogs: catalogs('experiment'), headCatalogs: head, observedAt });
    expect(diagnostics.some((item) => item.ruleId === 'ZDP-STATE-TRANSITION-000')).toBe(true);
    expect(diagnostics.some((item) => item.ruleId === 'ZDP-STATE-TRANSITION-001')).toBe(true);
  });
  test('still checks a status removed from the head policy', () => {
    const diagnostics = createStateTransitionDiagnostics({
      baseCatalogs: catalogs('experiment'),
      headCatalogs: catalogs('active', { ...policy, service_statuses_requiring_evidence: ['scaling'] }), observedAt
    });
    expect(diagnostics.some((item) => item.ruleId === 'ZDP-STATE-TRANSITION-001')).toBe(true);
  });
  test('reports age relaxation independently of a promotion', () => {
    const diagnostics = createStateTransitionDiagnostics({
      baseCatalogs: catalogs('experiment'),
      headCatalogs: catalogs('experiment', { ...policy, evidence_max_age_days: 90 }), observedAt
    });
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.ruleId).toBe('ZDP-STATE-TRANSITION-000');
  });
  test('allows unchanged state and strengthening without duplicate findings', () => {
    expect(createStateTransitionDiagnostics({
      baseCatalogs: catalogs('experiment'),
      headCatalogs: catalogs('experiment', { ...policy, evidence_max_age_days: 7 }), observedAt
    })).toEqual([]);
    const diagnostics = createStateTransitionDiagnostics({ baseCatalogs: catalogs('experiment'), headCatalogs: catalogs('active'), observedAt });
    expect(diagnostics.filter((item) => item.ruleId === 'ZDP-STATE-TRANSITION-001')).toHaveLength(1);
  });
});
