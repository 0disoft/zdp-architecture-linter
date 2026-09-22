import { describe, expect, test } from 'bun:test';
import { validateRuleCatalogShape } from '../src/rule-catalog-shape.ts';

const file = 'rules/money.rules.yaml';

describe('policy input shape preflight', () => {
  test('does not turn malformed input into an empty policy', () => {
    for (const value of [null, [], false, {}, { rules: {} }, { rules: null }]) {
      expect(validateRuleCatalogShape(value, file).some((item) => item.severity === 'error')).toBe(true);
    }
  });
  test('keeps an explicitly empty rule list valid', () => {
    expect(validateRuleCatalogShape({ rules: [] }, file)).toEqual([]);
  });
  test('accepts the scalar and datastore predicate forms used by central policy', () => {
    for (const forbidden of [true, false, 'json_rpc', ['ledger_postgres'], { datastore_owner_area: ['core', 'money'] }]) {
      expect(validateRuleCatalogShape({ rules: [{ id: 'policy', assertions: { forbid_values: { field: forbidden } } }] }, 'rules/token.rules.yaml')).toEqual([]);
    }
    for (const forbidden of [null, '', {}, { datastore_owner_area: 'core' }, [null]]) {
      expect(validateRuleCatalogShape({ rules: [{ id: 'policy', assertions: { forbid_values: { field: forbidden } } }] }, 'rules/token.rules.yaml').length).toBeGreaterThan(0);
    }
  });
  test('rejects malformed interpreted assertions and duplicate rule ids', () => {
    for (const assertions of [null, [], 'disabled', { require_values: [] }, { require_any: { 'dependencies.services': 'ledger' } }, { require_values: { 'audit.required': 'true' } }]) {
      expect(validateRuleCatalogShape({ rules: [{ id: 'ZDP-MONEY-001', assertions }] }, file).length).toBeGreaterThan(0);
    }
    expect(validateRuleCatalogShape({ rules: [{ id: 'x' }, { id: 'x' }] }, file).some((item) => item.path.endsWith('.id'))).toBe(true);
    expect(validateRuleCatalogShape({ rules: [{ id: 'ZDP-MONEY-001' }] }, file).length).toBe(1);
  });
  test('accepts policy values without hardcoding service ids or tiers', () => {
    expect(validateRuleCatalogShape({ rules: [{
      id: 'ZDP-MONEY-001',
      assertions: {
        require_values: { 'service.tier': 'example-tier', 'audit.required': true, 'idempotency.required': false },
        require_any: { 'dependencies.services': ['example-ledger'] }
      }
    }] }, file)).toEqual([]);
  });
});
