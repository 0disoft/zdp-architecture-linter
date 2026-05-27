import { describe, expect, test } from 'bun:test';
import {
  buildTierCriticalControlsPolicy,
  buildTierOperationalContractPolicy,
  buildTier3RiskyExperimentPolicy,
  validateTierCriticalControls,
  validateTierOperationalContracts,
  validateTier3RiskyExperimentContracts
} from '../src/tier-rules.ts';

const tierOperationalContractPolicy = buildTierOperationalContractPolicy({
  rules: [
    {
      id: 'ZDP-TIER-001',
      condition: {
        expression: 'service.tier in [tier2, tier1, tier0]'
      },
      assertions: {
        require_fields: [
          'reliability.slo_availability',
          'reliability.slo_latency_p95_ms',
          'observability.otel.service_name',
          'cost.cost_center',
          'service.runbook_url'
        ],
        require_values: {
          'reliability.backup_required': true
        }
      }
    }
  ]
});

const tierCriticalControlsPolicy = buildTierCriticalControlsPolicy({
  rules: [
    {
      id: 'ZDP-TIER-002',
      condition: {
        expression: 'service.tier == tier0'
      },
      assertions: {
        require_fields: [
          'release.change_approval',
          'access.break_glass_policy',
          'data.encryption_key_owner'
        ],
        require_values: {
          'audit.immutable': true
        }
      }
    }
  ]
});

const tier3RiskyExperimentPolicy = buildTier3RiskyExperimentPolicy({
  rules: [
    {
      id: 'ZDP-TIER-WARN-001',
      condition: {
        all: [
          'service.tier == tier3',
          'risky_operational_surface == true'
        ]
      },
      assertions: {
        require_fields: [
          'cost.cost_center',
          'cost.monthly_budget_limit_usd',
          'exit.kill_criteria',
          'observability.otel.service_name'
        ]
      }
    }
  ]
});

describe('tier operational contracts', () => {
  test('passes when a tier2 service declares the required operating contract', () => {
    const diagnostics = validateTierOperationalContracts(
      {
        services: [
          {
            id: 'core-api',
            service: {
              tier: 'tier2',
              runbook_url: 'https://runbooks.example/core-api'
            },
            reliability: {
              slo_availability: '99.5%',
              slo_latency_p95_ms: 300,
              backup_required: true
            },
            observability: {
              otel: {
                service_name: 'core-api'
              }
            },
            cost: {
              cost_center: 'core'
            }
          }
        ]
      },
      tierOperationalContractPolicy
    );

    expect(diagnostics).toEqual([]);
  });

  test('passes when a tier3 service omits tier2 operating fields', () => {
    const diagnostics = validateTierOperationalContracts(
      {
        services: [
          {
            id: 'prototype',
            service: {
              tier: 'tier3'
            }
          }
        ]
      },
      tierOperationalContractPolicy
    );

    expect(diagnostics).toEqual([]);
  });

  test('supports the legacy flat tier field used by lightweight catalog entries', () => {
    const diagnostics = validateTierOperationalContracts(
      {
        services: [
          {
            id: 'public-api',
            tier: 'tier1',
            service: {
              runbook_url: 'https://runbooks.example/public-api'
            },
            reliability: {
              slo_availability: '99.9%',
              slo_latency_p95_ms: 150,
              backup_required: true
            },
            observability: {
              otel: {
                service_name: 'public-api'
              }
            },
            cost: {
              cost_center: 'platform'
            }
          }
        ]
      },
      tierOperationalContractPolicy
    );

    expect(diagnostics).toEqual([]);
  });

  test('fails when a tier1 service omits required fields and backup contract', () => {
    const diagnostics = validateTierOperationalContracts(
      {
        services: [
          {
            id: 'public-api',
            service: {
              tier: 'tier1'
            },
            reliability: {
              backup_required: false
            },
            observability: {
              otel: {}
            },
            cost: {}
          }
        ]
      },
      tierOperationalContractPolicy
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-TIER-001',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:public-api].reliability.slo_availability',
        message:
          'Tier `tier1` service `public-api` must set `reliability.slo_availability`.'
      },
      {
        ruleId: 'ZDP-TIER-001',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:public-api].reliability.slo_latency_p95_ms',
        message:
          'Tier `tier1` service `public-api` must set `reliability.slo_latency_p95_ms`.'
      },
      {
        ruleId: 'ZDP-TIER-001',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:public-api].observability.otel.service_name',
        message:
          'Tier `tier1` service `public-api` must set `observability.otel.service_name`.'
      },
      {
        ruleId: 'ZDP-TIER-001',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:public-api].cost.cost_center',
        message: 'Tier `tier1` service `public-api` must set `cost.cost_center`.'
      },
      {
        ruleId: 'ZDP-TIER-001',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:public-api].service.runbook_url',
        message:
          'Tier `tier1` service `public-api` must set `service.runbook_url`.'
      },
      {
        ruleId: 'ZDP-TIER-001',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:public-api].reliability.backup_required',
        message:
          'Tier `tier1` service `public-api` must set `reliability.backup_required` to `true`.'
      }
    ]);
  });

  test('fails when services is not an array', () => {
    const diagnostics = validateTierOperationalContracts(
      { services: 'core-api' },
      tierOperationalContractPolicy
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-TIER-001',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services',
        message: '`services` must be a YAML array.'
      }
    ]);
  });
});

describe('tier3 risky experiment contracts', () => {
  test('passes when a low-risk tier3 experiment omits operating fields', () => {
    const diagnostics = validateTier3RiskyExperimentContracts(
      {
        services: [
          {
            id: 'static-prototype',
            service: {
              tier: 'tier3'
            }
          }
        ]
      },
      tier3RiskyExperimentPolicy
    );

    expect(diagnostics).toEqual([]);
  });

  test('warns when a risky tier3 experiment omits minimal operating fields', () => {
    const diagnostics = validateTier3RiskyExperimentContracts(
      {
        services: [
          {
            id: 'lead-form-prototype',
            service: {
              tier: 'tier3'
            },
            api: {
              exposure: 'public'
            },
            providers: [
              {
                id: 'resend'
              }
            ],
            cost: {},
            exit: {},
            observability: {
              otel: {}
            }
          }
        ]
      },
      tier3RiskyExperimentPolicy
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-TIER-WARN-001',
        severity: 'warning',
        file: 'catalogs/services.yaml',
        path: 'services[0:lead-form-prototype].cost.cost_center',
        message:
          'Risky tier3 service `lead-form-prototype` should set `cost.cost_center`.'
      },
      {
        ruleId: 'ZDP-TIER-WARN-001',
        severity: 'warning',
        file: 'catalogs/services.yaml',
        path: 'services[0:lead-form-prototype].cost.monthly_budget_limit_usd',
        message:
          'Risky tier3 service `lead-form-prototype` should set `cost.monthly_budget_limit_usd`.'
      },
      {
        ruleId: 'ZDP-TIER-WARN-001',
        severity: 'warning',
        file: 'catalogs/services.yaml',
        path: 'services[0:lead-form-prototype].exit.kill_criteria',
        message:
          'Risky tier3 service `lead-form-prototype` should set `exit.kill_criteria`.'
      },
      {
        ruleId: 'ZDP-TIER-WARN-001',
        severity: 'warning',
        file: 'catalogs/services.yaml',
        path: 'services[0:lead-form-prototype].observability.otel.service_name',
        message:
          'Risky tier3 service `lead-form-prototype` should set `observability.otel.service_name`.'
      }
    ]);
  });

  test('passes when a risky tier3 experiment declares minimal operating fields', () => {
    const diagnostics = validateTier3RiskyExperimentContracts(
      {
        services: [
          {
            id: 'lead-form-prototype',
            tier: 'tier3',
            api: {
              exposure: 'public'
            },
            cost: {
              cost_center: 'lab',
              monthly_budget_limit_usd: 25
            },
            exit: {
              kill_criteria: ['no qualified leads after 30 days']
            },
            observability: {
              otel: {
                service_name: 'lead-form-prototype'
              }
            }
          }
        ]
      },
      tier3RiskyExperimentPolicy
    );

    expect(diagnostics).toEqual([]);
  });
});

describe('tier critical controls', () => {
  test('passes when a tier0 service declares critical controls', () => {
    const diagnostics = validateTierCriticalControls(
      {
        services: [
          {
            id: 'ledger-writer',
            service: {
              tier: 'tier0'
            },
            release: {
              change_approval: 'required'
            },
            access: {
              break_glass_policy: 'two-person-approval'
            },
            data: {
              encryption_key_owner: 'security'
            },
            audit: {
              immutable: true
            }
          }
        ]
      },
      tierCriticalControlsPolicy
    );

    expect(diagnostics).toEqual([]);
  });

  test('passes when a tier1 service omits tier0-only controls', () => {
    const diagnostics = validateTierCriticalControls(
      {
        services: [
          {
            id: 'public-api',
            service: {
              tier: 'tier1'
            }
          }
        ]
      },
      tierCriticalControlsPolicy
    );

    expect(diagnostics).toEqual([]);
  });

  test('supports the legacy flat tier field for tier0 controls', () => {
    const diagnostics = validateTierCriticalControls(
      {
        services: [
          {
            id: 'core-audit',
            tier: 'tier0',
            release: {
              change_approval: 'required'
            },
            access: {
              break_glass_policy: 'security-break-glass'
            },
            data: {
              encryption_key_owner: 'core-security'
            },
            audit: {
              immutable: true
            }
          }
        ]
      },
      tierCriticalControlsPolicy
    );

    expect(diagnostics).toEqual([]);
  });

  test('fails when a tier0 service omits critical controls', () => {
    const diagnostics = validateTierCriticalControls(
      {
        services: [
          {
            id: 'ledger-writer',
            service: {
              tier: 'tier0'
            },
            release: {},
            access: {},
            data: {},
            audit: {
              immutable: false
            }
          }
        ]
      },
      tierCriticalControlsPolicy
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-TIER-002',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:ledger-writer].release.change_approval',
        message:
          'Tier `tier0` service `ledger-writer` must set `release.change_approval`.'
      },
      {
        ruleId: 'ZDP-TIER-002',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:ledger-writer].access.break_glass_policy',
        message:
          'Tier `tier0` service `ledger-writer` must set `access.break_glass_policy`.'
      },
      {
        ruleId: 'ZDP-TIER-002',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:ledger-writer].data.encryption_key_owner',
        message:
          'Tier `tier0` service `ledger-writer` must set `data.encryption_key_owner`.'
      },
      {
        ruleId: 'ZDP-TIER-002',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:ledger-writer].audit.immutable',
        message:
          'Tier `tier0` service `ledger-writer` must set `audit.immutable` to `true`.'
      }
    ]);
  });

  test('fails when a tier0 service sets non-meaningful critical control values', () => {
    const diagnostics = validateTierCriticalControls(
      {
        services: [
          {
            id: 'payments-core',
            service: {
              tier: 'tier0'
            },
            release: {
              change_approval: false
            },
            access: {
              break_glass_policy: {}
            },
            data: {
              encryption_key_owner: 0
            },
            audit: {
              immutable: true
            }
          }
        ]
      },
      tierCriticalControlsPolicy
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-TIER-002',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:payments-core].release.change_approval',
        message:
          'Tier `tier0` service `payments-core` must set `release.change_approval`.'
      },
      {
        ruleId: 'ZDP-TIER-002',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:payments-core].access.break_glass_policy',
        message:
          'Tier `tier0` service `payments-core` must set `access.break_glass_policy`.'
      },
      {
        ruleId: 'ZDP-TIER-002',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:payments-core].data.encryption_key_owner',
        message:
          'Tier `tier0` service `payments-core` must set `data.encryption_key_owner`.'
      }
    ]);
  });

  test('fails when services is not an array for tier0 controls', () => {
    const diagnostics = validateTierCriticalControls(
      { services: 'ledger-writer' },
      tierCriticalControlsPolicy
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-TIER-002',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services',
        message: '`services` must be a YAML array.'
      }
    ]);
  });
});
