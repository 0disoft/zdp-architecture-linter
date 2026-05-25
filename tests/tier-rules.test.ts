import { describe, expect, test } from 'bun:test';
import {
  buildTierOperationalContractPolicy,
  validateTierOperationalContracts
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
