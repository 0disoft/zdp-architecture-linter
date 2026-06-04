import { describe, expect, test } from 'bun:test';
import {
  validateCostBudgetCatalog,
  validateSloTierCatalog
} from '../src/operational-catalog-rules.ts';
import { buildRepositoryIndex } from '../src/repository-rules.ts';
import { buildServiceIndex } from '../src/service-rules.ts';

describe('cost budget catalog', () => {
  test('passes when budgets and automatic actions are internally consistent', () => {
    const diagnostics = validateCostBudgetCatalog({
      service_budgets: [
        {
          id: 'cloudflare-workers',
          monthly_budget_usd: 50,
          warn_at_percent: 80,
          block_at_percent: 100
        }
      ],
      product_unit_budgets: [
        {
          id: 'ai-answer',
          unit_budget_usd: 0.05
        },
        {
          id: 'payment',
          unit_budget_expression: 'PSP fee + 0.01 USD'
        }
      ],
      automatic_action_policies: [
        {
          target_budget: 'cloudflare-workers'
        }
      ]
    });

    expect(diagnostics).toEqual([]);
  });

  test('fails when budgets are malformed or action policies target unknown budgets', () => {
    const diagnostics = validateCostBudgetCatalog({
      service_budgets: [
        {
          id: 'ai-tokens',
          monthly_budget_usd: 100,
          warn_at_percent: 95,
          block_at_percent: 90
        },
        {
          id: 'ai-tokens',
          monthly_budget_usd: -1
        }
      ],
      product_unit_budgets: [
        {
          id: 'ai-answer'
        }
      ],
      automatic_action_policies: [
        {
          target_budget: 'missing-budget'
        }
      ]
    });

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-COST-001',
        severity: 'error',
        file: 'catalogs/cost-budgets.yaml',
        path: 'service_budgets[0].warn_at_percent',
        message: '`warn_at_percent` must not be greater than `block_at_percent`.'
      },
      {
        ruleId: 'ZDP-COST-001',
        severity: 'error',
        file: 'catalogs/cost-budgets.yaml',
        path: 'service_budgets[1].id',
        message: 'Budget id `ai-tokens` is duplicated.'
      },
      {
        ruleId: 'ZDP-COST-001',
        severity: 'error',
        file: 'catalogs/cost-budgets.yaml',
        path: 'service_budgets[1].monthly_budget_usd',
        message: 'Service budget must declare non-negative `monthly_budget_usd`.'
      },
      {
        ruleId: 'ZDP-COST-001',
        severity: 'error',
        file: 'catalogs/cost-budgets.yaml',
        path: 'product_unit_budgets[0].unit_budget_usd',
        message:
          'Product unit budget must declare `unit_budget_usd` or `unit_budget_expression`.'
      },
      {
        ruleId: 'ZDP-COST-001',
        severity: 'error',
        file: 'catalogs/cost-budgets.yaml',
        path: 'automatic_action_policies[0].target_budget',
        message:
          'Automatic action policy references unknown service budget `missing-budget`.'
      }
    ]);
  });
});

describe('SLO tier catalog', () => {
  test('passes when tier mapping targets known repositories or services', () => {
    const diagnostics = validateSloTierCatalog(
      {
        tiers: [
          {
            id: 'critical',
            availability_target_percent: 99.9,
            latency_p95_ms: 300,
            error_rate_threshold_percent: 0.1
          }
        ],
        service_tier_mapping: {
          'zdp-core-identity': 'critical',
          'core-api': 'critical'
        }
      },
      buildRepositoryIndex({
        repositories: [
          {
            name: 'zdp-core-identity'
          }
        ]
      }),
      buildServiceIndex({
        services: [
          {
            id: 'core-api'
          }
        ]
      })
    );

    expect(diagnostics).toEqual([]);
  });

  test('fails when tier mapping references unknown tiers or targets', () => {
    const diagnostics = validateSloTierCatalog(
      {
        tiers: [
          {
            id: 'critical',
            availability_target_percent: 99.9,
            latency_p95_ms: 300,
            error_rate_threshold_percent: 0.1
          }
        ],
        service_tier_mapping: {
          'zdp-unknown': 'gold'
        }
      },
      buildRepositoryIndex({
        repositories: []
      }),
      buildServiceIndex({
        services: []
      })
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-SLO-001',
        severity: 'error',
        file: 'catalogs/slo-tiers.yaml',
        path: 'service_tier_mapping.zdp-unknown',
        message: 'Service tier mapping references unknown SLO tier `gold`.'
      },
      {
        ruleId: 'ZDP-SLO-001',
        severity: 'error',
        file: 'catalogs/slo-tiers.yaml',
        path: 'service_tier_mapping.zdp-unknown',
        message:
          'Service tier mapping target `zdp-unknown` is not a known repository or service id.'
      }
    ]);
  });
});
