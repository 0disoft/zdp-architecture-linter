import { expect, test } from 'bun:test';
import { validateOperatingPolicies, validateOperatingPolicyExtensions } from '../src/operating-policy-rules.ts';

function inputs(): [any, any, any] {
  const delivery = { critical: 'always', high: 'always', medium: 'business-hours', low: 'next-business-day', lab: 'none' };
  return [{ schema_version: '2', automation_status: 'policy-only', unit_definitions: { answer: 'Answer' },
    action_definitions: { notify: { effect: 'notify', description: 'Notify operator' }, block: { effect: 'block', description: 'Reject usage' } },
    service_budgets: [{ id: 'ai', warn_at_percent: 70, block_at_percent: 90 }], product_unit_budgets: [{ id: 'answer', unit: 'answer' }],
    automatic_action_policies: [{ target_budget: 'ai', steps: [{ threshold_percent: 70, actions: ['notify'] }, { threshold_percent: 90, actions: ['block'] }] }]
  }, { schema_version: '2', required_deploy_unit_coverage: true,
    immediate_incident_classes: ['payment-approval-mismatch', 'ledger-imbalance', 'privileged-access-misuse'],
    tiers: Object.entries(delivery).map(([id, notification_policy]) => ({ id, alerting: { notification_policy,
      night_delay_minutes: notification_policy === 'always' ? 0 : null, weekend_delay_minutes: notification_policy === 'always' ? 0 : null,
      sustained_failure_minutes: notification_policy === 'always' ? 2 : null, consecutive_failures: null } })),
    service_tier_mapping: { 'critical-api': 'critical' }
  }, { repositories: [{ name: 'critical-api', repo_stage: 'deploy_unit' }] }];
}
test('current v2 policy is validated by the linter while v1 catalogs remain compatible', () => {
  expect(validateOperatingPolicyExtensions(...inputs())).toEqual([]);
  expect(validateOperatingPolicyExtensions({ service_budgets: [] }, { tiers: [] }, { repositories: [] })).toEqual([]);
});
test('silenced critical alerts, missing emergencies and null units are rejected', () => {
  const [cost, slo, repositories] = inputs();
  cost.unit_definitions.answer = null;
  slo.tiers.find((tier: any) => tier.id === 'critical').alerting.notification_policy = 'none';
  delete slo.immediate_incident_classes;
  const errors = validateOperatingPolicies(cost, slo, repositories);
  expect(errors.some((d) => d.path === 'unit_definitions.answer')).toBe(true);
  expect(errors.some((d) => d.path.endsWith('notification_policy'))).toBe(true);
  expect(errors.some((d) => d.path === 'immediate_incident_classes')).toBe(true);
});
test('v2 cannot silently fall back to v1 by omitting the extended fields', () => {
  expect(validateOperatingPolicyExtensions({ schema_version: '2' }, { schema_version: '2' }, { repositories: [] }).length).toBeGreaterThan(0);
});
