import { describe, expect, test } from 'bun:test';
import {
  buildCreditMonetizationPolicy,
  buildMoneyMovementPolicy,
  buildPaymentDataFrontendPolicy,
  validateCreditMonetizationContracts,
  validateMoneyMovementContracts,
  validatePaymentDataFrontendContracts
} from '../src/money-rules.ts';
import { buildRepositoryIndex } from '../src/repository-rules.ts';

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

const paymentDataFrontendPolicy = buildPaymentDataFrontendPolicy({
  rules: [
    {
      id: 'ZDP-MONEY-002',
      assertions: {
        forbid_values: {
          'service.repo': [
            'zdp-web-apps',
            'zdp-web-public',
            'zdp-products-lab'
          ]
        }
      }
    }
  ]
});

const creditMonetizationPolicy = buildCreditMonetizationPolicy({
  rules: [
    {
      id: 'ZDP-MONEY-003',
      assertions: {
        require_values: {
          'monetization.credit_policy.wallet_scope': 'common_zdp_wallet',
          'monetization.credit_policy.ledger_owner': 'zdp-money-ledger'
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

  test('fails when money movement marker uses a non-boolean type', () => {
    const diagnostics = validateMoneyMovementContracts(
      {
        services: [
          {
            id: 'checkout-api',
            domain: {
              money_movement: 'true'
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
        path: 'services[0:checkout-api].domain.money_movement',
        message:
          'Money movement marker `domain.money_movement` must be a boolean.'
      }
    ]);
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

describe('payment data frontend contracts', () => {
  test('passes when payment data belongs to the money platform', () => {
    const diagnostics = validatePaymentDataFrontendContracts(
      {
        services: [
          {
            id: 'payment-webhook-handler',
            repo: 'zdp-money-platform',
            data: {
              payment_data: true
            }
          }
        ]
      },
      paymentDataFrontendPolicy
    );

    expect(diagnostics).toEqual([]);
  });

  test('passes when a frontend service does not handle payment data', () => {
    const diagnostics = validatePaymentDataFrontendContracts(
      {
        services: [
          {
            id: 'app-console',
            repo: 'zdp-web-apps',
            data: {
              payment_data: false
            }
          }
        ]
      },
      paymentDataFrontendPolicy
    );

    expect(diagnostics).toEqual([]);
  });

  test('fails when a frontend repository declares payment data', () => {
    const diagnostics = validatePaymentDataFrontendContracts(
      {
        services: [
          {
            id: 'app-console',
            repo: 'zdp-web-apps',
            data: {
              payment_data: true
            }
          }
        ]
      },
      paymentDataFrontendPolicy
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-MONEY-002',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:app-console].repo',
        message:
          'Payment data service `app-console` must not use forbidden repository `zdp-web-apps`.'
      }
    ]);
  });

  test('fails when top-level repo is forbidden even if nested service repo is allowed', () => {
    const diagnostics = validatePaymentDataFrontendContracts(
      {
        services: [
          {
            id: 'checkout-bff',
            repo: 'zdp-web-apps',
            service: {
              repo: 'zdp-money-platform'
            },
            data: {
              payment_data: true
            }
          }
        ]
      },
      paymentDataFrontendPolicy
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-MONEY-002',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:checkout-bff].repo',
        message:
          'Payment data service `checkout-bff` must not use forbidden repository `zdp-web-apps`.'
      }
    ]);
  });

  test('fails when payment data service is owned by a lab_only lab repository not listed in forbid_values', () => {
    const diagnostics = validatePaymentDataFrontendContracts(
      {
        services: [
          {
            id: 'new-lab-checkout',
            repo: 'zdp-new-lab-payments',
            data: {
              payment_data: true
            }
          }
        ]
      },
      paymentDataFrontendPolicy,
      buildRepositoryIndex({
        repositories: [
          {
            name: 'zdp-new-lab-payments',
            repo_stage: 'lab_only',
            kind: 'lab'
          }
        ]
      })
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-MONEY-002',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:new-lab-checkout].repo',
        message:
          'Payment data service `new-lab-checkout` must not use forbidden repository `zdp-new-lab-payments`.'
      }
    ]);
  });

  test('passes when payment data service repo is not forbidden and not lab_only lab', () => {
    const diagnostics = validatePaymentDataFrontendContracts(
      {
        services: [
          {
            id: 'checkout-api',
            repo: 'zdp-products-checkout',
            data: {
              payment_data: true
            }
          }
        ]
      },
      paymentDataFrontendPolicy,
      buildRepositoryIndex({
        repositories: [
          {
            name: 'zdp-products-checkout',
            repo_stage: 'deploy_unit',
            kind: 'service'
          }
        ]
      })
    );

    expect(diagnostics).toEqual([]);
  });

  test('supports nested service repo in service.yaml contracts', () => {
    const diagnostics = validatePaymentDataFrontendContracts(
      {
        services: [
          {
            id: 'checkout-bff',
            service: {
              repo: 'zdp-products-lab'
            },
            data: {
              payment_data: true
            }
          }
        ]
      },
      paymentDataFrontendPolicy
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-MONEY-002',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:checkout-bff].service.repo',
        message:
          'Payment data service `checkout-bff` must not use forbidden repository `zdp-products-lab`.'
      }
    ]);
  });
});

describe('credit monetization contracts', () => {
  test('passes when credit monetization uses the common wallet and money ledger', () => {
    const diagnostics = validateCreditMonetizationContracts(
      {
        services: [
          {
            id: 'billing-api',
            monetization: {
              model: 'credit',
              credit_policy: {
                wallet_scope: 'common_zdp_wallet',
                ledger_owner: 'zdp-money-ledger'
              }
            },
            dependencies: {
              services: ['zdp-money-platform']
            }
          }
        ]
      },
      creditMonetizationPolicy
    );

    expect(diagnostics).toEqual([]);
  });

  test('passes when credit ad removal depends on the money ledger', () => {
    const diagnostics = validateCreditMonetizationContracts(
      {
        services: [
          {
            id: 'ads-api',
            monetization: {
              ad_policy: {
                credit_ad_removal_allowed: true
              },
              credit_policy: {
                wallet_scope: 'common_zdp_wallet',
                ledger_owner: 'zdp-money-ledger'
              }
            },
            dependencies: ['zdp-money-ledger']
          }
        ]
      },
      creditMonetizationPolicy
    );

    expect(diagnostics).toEqual([]);
  });

  test('passes when a service does not use credit monetization', () => {
    const diagnostics = validateCreditMonetizationContracts(
      {
        services: [
          {
            id: 'public-web',
            monetization: {
              model: 'none'
            }
          }
        ]
      },
      creditMonetizationPolicy
    );

    expect(diagnostics).toEqual([]);
  });

  test('fails when credit monetization omits ledger ownership controls', () => {
    const diagnostics = validateCreditMonetizationContracts(
      {
        services: [
          {
            id: 'billing-api',
            monetization: {
              credit_policy: {
                enabled: true,
                wallet_scope: 'site_wallet',
                ledger_owner: 'zdp-products-lab'
              }
            },
            dependencies: {
              services: ['core-api']
            }
          }
        ]
      },
      creditMonetizationPolicy
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-MONEY-003',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path:
          'services[0:billing-api].monetization.credit_policy.wallet_scope',
        message:
          'Credit monetization service `billing-api` must set `monetization.credit_policy.wallet_scope` to `common_zdp_wallet`.'
      },
      {
        ruleId: 'ZDP-MONEY-003',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path:
          'services[0:billing-api].monetization.credit_policy.ledger_owner',
        message:
          'Credit monetization service `billing-api` must set `monetization.credit_policy.ledger_owner` to `zdp-money-ledger`.'
      },
      {
        ruleId: 'ZDP-MONEY-003',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:billing-api].dependencies.services',
        message:
          'Credit monetization service `billing-api` must depend on one of: `zdp-money-ledger`, `zdp-money-platform`.'
      }
    ]);
  });
});
