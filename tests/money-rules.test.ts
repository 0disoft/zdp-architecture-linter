import { describe, expect, test } from 'bun:test';
import {
  buildMoneyMovementPolicy,
  validateMoneyMovementContracts
} from '../src/money-rules.ts';

const moneyMovementPolicy = buildMoneyMovementPolicy({
  rules: [
    {
      id: 'ZDP-MONEY-001',
      assertions: {
        require_values: {
          'service.tier': 'tier0',
          'audit.required': true,
          'idempotency.required': true
        },
        require_any: {
          'dependencies.services': ['zdp-money-ledger', 'zdp-money-platform']
        }
      }
    }
  ]
});

describe('money movement contracts', () => {
  test('passes when domain money movement uses tier0, audit, idempotency, and money dependency', () => {
    const diagnostics = validateMoneyMovementContracts(
      {
        services: [
          {
            id: 'payment-webhook-handler',
            domain: {
              money_movement: true
            },
            service: {
              tier: 'tier0'
            },
            audit: {
              required: true
            },
            idempotency: {
              required: true
            },
            dependencies: {
              services: ['zdp-money-platform']
            }
          }
        ]
      },
      moneyMovementPolicy
    );

    expect(diagnostics).toEqual([]);
  });

  test('passes when data money movement depends on the money ledger', () => {
    const diagnostics = validateMoneyMovementContracts(
      {
        services: [
          {
            id: 'ledger-writer',
            data: {
              money_movement: true
            },
            service: {
              tier: 'tier0'
            },
            audit: {
              required: true
            },
            idempotency: {
              required: true
            },
            dependencies: {
              services: ['zdp-money-ledger']
            }
          }
        ]
      },
      moneyMovementPolicy
    );

    expect(diagnostics).toEqual([]);
  });

  test('passes when a non-money service omits money-only fields', () => {
    const diagnostics = validateMoneyMovementContracts(
      {
        services: [
          {
            id: 'public-web',
            domain: {
              money_movement: false
            }
          }
        ]
      },
      moneyMovementPolicy
    );

    expect(diagnostics).toEqual([]);
  });

  test('fails when money movement omits required controls', () => {
    const diagnostics = validateMoneyMovementContracts(
      {
        services: [
          {
            id: 'checkout-api',
            domain: {
              money_movement: true
            },
            service: {
              tier: 'tier1'
            },
            audit: {
              required: false
            },
            idempotency: {
              required: false
            },
            dependencies: {
              services: ['core-api']
            }
          }
        ]
      },
      moneyMovementPolicy
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-MONEY-001',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:checkout-api].service.tier',
        message:
          'Money movement service `checkout-api` must set `service.tier` to `tier0`.'
      },
      {
        ruleId: 'ZDP-MONEY-001',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:checkout-api].audit.required',
        message:
          'Money movement service `checkout-api` must set `audit.required` to `true`.'
      },
      {
        ruleId: 'ZDP-MONEY-001',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:checkout-api].idempotency.required',
        message:
          'Money movement service `checkout-api` must set `idempotency.required` to `true`.'
      },
      {
        ruleId: 'ZDP-MONEY-001',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:checkout-api].dependencies.services',
        message:
          'Money movement service `checkout-api` must depend on one of: `zdp-money-ledger`, `zdp-money-platform`.'
      }
    ]);
  });

  test('supports the legacy flat dependency list used by the central service catalog', () => {
    const diagnostics = validateMoneyMovementContracts(
      {
        services: [
          {
            id: 'checkout-api',
            domain: {
              money_movement: true
            },
            service: {
              tier: 'tier0'
            },
            audit: {
              required: true
            },
            idempotency: {
              required: true
            },
            dependencies: ['zdp-money-platform']
          }
        ]
      },
      moneyMovementPolicy
    );

    expect(diagnostics).toEqual([]);
  });
});
