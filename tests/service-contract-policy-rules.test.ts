import { describe, expect, test } from 'bun:test';
import {
  buildAiUserDataPolicy,
  validateAiUserDataContracts
} from '../src/ai-contract-rules.ts';
import {
  buildPublicApiContractPolicy,
  validatePublicApiContracts
} from '../src/api-rules.ts';
import {
  buildMoneyMovementPolicy,
  validateMoneyMovementContracts
} from '../src/money-rules.ts';
import {
  buildProviderContractPolicy,
  buildProviderWebhookPolicy,
  validateServiceProviderContracts,
  validateServiceProviderWebhooks
} from '../src/provider-rules.ts';
import {
  buildRepositoryServiceContractCatalog,
  mapServiceCatalogDiagnosticsToRepositoryServiceContract
} from '../src/service-contract-policy-rules.ts';
import {
  buildTierOperationalContractPolicy,
  validateTierOperationalContracts
} from '../src/tier-rules.ts';

describe('repository service contract policy rules', () => {
  test('reuses service catalog policy checks against service.yaml', () => {
    const catalog = buildRepositoryServiceContractCatalog({
      service: {
        id: 'money-api',
        repo: 'zdp-money-platform',
        tier: 'tier3'
      },
      domain: {
        money_movement: true,
        public_api: true
      },
      data: {
        ai_user_data: true
      },
      access: {
        permission_model: 'none'
      },
      audit: {
        required: false
      },
      idempotency: {
        required: false
      },
      dependencies: {
        services: []
      },
      providers: [
        {
          id: 'stripe',
          webhook: {
            enabled: true
          }
        }
      ],
      api: {
        exposure: 'public',
        openapi_required: false
      },
      reliability: {
        backup_required: false
      }
    });

    const diagnostics = mapServiceCatalogDiagnosticsToRepositoryServiceContract([
      ...validateMoneyMovementContracts(
        catalog,
        buildMoneyMovementPolicy({
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
                  'dependencies.services': ['zdp-money-platform']
                }
              }
            }
          ]
        })
      ),
      ...validateServiceProviderContracts(
        catalog,
        buildProviderContractPolicy({
          rules: [
            {
              id: 'ZDP-PROVIDER-001',
              assertions: {
                require_fields: [
                  'providers[].data_sent',
                  'providers[].secret_owner',
                  'providers[].allowed_envs'
                ]
              }
            }
          ]
        })
      ),
      ...validateServiceProviderWebhooks(
        catalog,
        buildProviderWebhookPolicy({
          rules: [
            {
              id: 'ZDP-PROVIDER-002',
              assertions: {
                require_fields: [
                  'providers[].webhook.signature_required',
                  'providers[].webhook.replay_supported'
                ]
              }
            }
          ]
        })
      ),
      ...validateAiUserDataContracts(
        catalog,
        buildAiUserDataPolicy({
          rules: [
            {
              id: 'ZDP-AI-001',
              assertions: {
                require_values: {
                  'audit.required': true
                },
                require_any: {
                  'dependencies.services': ['zdp-privacy-access-broker']
                },
                forbid_values: {
                  'access.permission_model': ['none']
                }
              }
            }
          ]
        })
      ),
      ...validateTierOperationalContracts(
        catalog,
        buildTierOperationalContractPolicy({
          rules: [
            {
              id: 'ZDP-TIER-001',
              condition: {
                expression: 'service.tier in [tier3]'
              },
              assertions: {
                require_fields: ['service.runbook_url'],
                require_values: {
                  'reliability.backup_required': true
                }
              }
            }
          ]
        })
      ),
      ...validatePublicApiContracts(
        catalog,
        buildPublicApiContractPolicy({
          rules: [
            {
              id: 'ZDP-API-001',
              condition: {
                expression:
                  'domain.public_api == true or api.exposure in [partner,public]'
              },
              assertions: {
                require_fields: ['api.versioning'],
                require_values: {
                  'api.openapi_required': true
                }
              }
            }
          ]
        })
      )
    ]);

    expect(diagnostics.every((diagnostic) => diagnostic.file === 'service.yaml')).toBe(
      true
    );
    expect(new Set(diagnostics.map((diagnostic) => diagnostic.ruleId))).toEqual(
      new Set([
        'ZDP-MONEY-001',
        'ZDP-PROVIDER-001',
        'ZDP-PROVIDER-002',
        'ZDP-AI-001',
        'ZDP-TIER-001',
        'ZDP-API-001'
      ])
    );
    expect(diagnostics.map((diagnostic) => diagnostic.path)).toEqual(
      expect.arrayContaining([
        'service.tier',
        'providers[0].data_sent',
        'providers[0].webhook.signature_required',
        'access.permission_model',
        'service.runbook_url',
        'api.versioning'
      ])
    );
  });
});
