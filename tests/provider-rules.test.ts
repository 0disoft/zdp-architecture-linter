import { describe, expect, test } from 'bun:test';
import {
  buildProviderCatalogWebhookPolicy,
  buildProviderContractPolicy,
  buildExternalProviderIndex,
  buildProviderWebhookPolicy,
  validateExternalProviderCatalog,
  validateServiceExternalDependencyReferences,
  validateServiceProviderContracts,
  validateServiceProviderWebhooks
} from '../src/provider-rules.ts';

const providerContractPolicy = buildProviderContractPolicy({
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
});

const providerWebhookPolicy = buildProviderWebhookPolicy({
  rules: [
    {
      id: 'ZDP-PROVIDER-002',
      assertions: {
        require_fields: [
          'providers[].webhook.replay_supported',
          'providers[].webhook.signature_required'
        ]
      }
    }
  ]
});

const providerCatalogWebhookPolicy = buildProviderCatalogWebhookPolicy({
  rules: [
    {
      id: 'ZDP-PROVIDER-003',
      condition: {
        any_category: ['psp', 'psp-router']
      },
      assertions: {
        require_fields: [
          'providers[].webhook_intake.signature_verification_required',
          'providers[].webhook_intake.replay_handling_required',
          'providers[].webhook_intake.event_id_deduplication_required',
          'providers[].webhook_intake.provider_contract_evidence_required'
        ]
      }
    }
  ]
});

describe('external provider catalog', () => {
  test('passes when providers have ids', () => {
    const diagnostics = validateExternalProviderCatalog({
      providers: [
        {
          id: 'openai',
          status: 'candidate'
        }
      ]
    });

    expect(diagnostics).toEqual([]);
  });

  test('fails when a provider id is missing', () => {
    const diagnostics = validateExternalProviderCatalog({
      providers: [
        {
          status: 'candidate'
        }
      ]
    });

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-REF-005',
        severity: 'error',
        file: 'catalogs/external-providers.yaml',
        path: 'providers[0].id',
        message: 'External provider entry is missing required field `id`.'
      }
    ]);
  });

  test('passes PSP providers with complete webhook intake policy', () => {
    const diagnostics = validateExternalProviderCatalog(
      {
        providers: [
          {
            id: 'example-psp',
            categories: ['payment-processor', 'psp'],
            webhook_intake: {
              signature_verification_required: true,
              replay_handling_required: true,
              event_id_deduplication_required: true,
              provider_contract_evidence_required: true
            }
          }
        ]
      },
      providerCatalogWebhookPolicy
    );

    expect(diagnostics).toEqual([]);
  });

  test('does not require webhook intake policy from non-PSP providers', () => {
    const diagnostics = validateExternalProviderCatalog(
      {
        providers: [
          {
            id: 'example-email',
            categories: ['transactional-email']
          }
        ]
      },
      providerCatalogWebhookPolicy
    );

    expect(diagnostics).toEqual([]);
  });

  test('fails when a PSP provider omits webhook intake policy', () => {
    const diagnostics = validateExternalProviderCatalog(
      {
        providers: [
          {
            id: 'example-psp',
            categories: ['psp']
          }
        ]
      },
      providerCatalogWebhookPolicy
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-PROVIDER-003',
        severity: 'error',
        file: 'catalogs/external-providers.yaml',
        path: 'providers[0:example-psp].webhook_intake',
        message: 'PSP provider entry must declare a `webhook_intake` policy object.'
      }
    ]);
  });

  test('fails when a PSP provider disables required webhook intake controls', () => {
    const diagnostics = validateExternalProviderCatalog(
      {
        providers: [
          {
            id: 'example-psp',
            categories: ['psp-router'],
            webhook_intake: {
              signature_verification_required: false,
              replay_handling_required: true,
              event_id_deduplication_required: false,
              provider_contract_evidence_required: true
            }
          }
        ]
      },
      providerCatalogWebhookPolicy
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-PROVIDER-003',
        severity: 'error',
        file: 'catalogs/external-providers.yaml',
        path:
          'providers[0:example-psp].webhook_intake.signature_verification_required',
        message:
          'PSP provider webhook intake field `signature_verification_required` must be set to true.'
      },
      {
        ruleId: 'ZDP-PROVIDER-003',
        severity: 'error',
        file: 'catalogs/external-providers.yaml',
        path:
          'providers[0:example-psp].webhook_intake.event_id_deduplication_required',
        message:
          'PSP provider webhook intake field `event_id_deduplication_required` must be set to true.'
      }
    ]);
  });
});

describe('service external dependency references', () => {
  test('passes when external dependencies reference known providers', () => {
    const diagnostics = validateServiceExternalDependencyReferences(
      {
        services: [
          {
            id: 'ai-gateway-service',
            external_dependencies: ['openai']
          }
        ]
      },
      buildExternalProviderIndex({
        providers: [{ id: 'openai', status: 'candidate' }]
      })
    );

    expect(diagnostics).toEqual([]);
  });

  test('fails when external dependencies reference unknown providers', () => {
    const diagnostics = validateServiceExternalDependencyReferences(
      {
        services: [
          {
            id: 'ai-gateway-service',
            external_dependencies: ['ghost-ai']
          }
        ]
      },
      buildExternalProviderIndex({
        providers: [{ id: 'openai', status: 'candidate' }]
      })
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-REF-005',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:ai-gateway-service].external_dependencies[0]',
        message: 'Service references unknown external provider `ghost-ai`.'
      }
    ]);
  });

  test('fails when external dependencies is not an array', () => {
    const diagnostics = validateServiceExternalDependencyReferences(
      {
        services: [
          {
            id: 'ai-gateway-service',
            external_dependencies: 'openai'
          }
        ]
      },
      buildExternalProviderIndex({
        providers: [{ id: 'openai', status: 'candidate' }]
      })
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-REF-005',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:ai-gateway-service].external_dependencies',
        message: '`external_dependencies` must be a YAML array when present.'
      }
    ]);
  });
});

describe('service provider contracts', () => {
  test('passes when provider entries declare transmitted data, secret owner, and allowed environments', () => {
    const diagnostics = validateServiceProviderContracts(
      {
        services: [
          {
            id: 'ai-gateway-service',
            providers: [
              {
                id: 'openai',
                data_sent: ['prompt-fragments', 'model-routing-metadata'],
                secret_owner: 'zdp-privacy-credential-vault',
                allowed_envs: ['staging', 'production']
              }
            ]
          }
        ]
      },
      providerContractPolicy
    );

    expect(diagnostics).toEqual([]);
  });

  test('passes when no provider contract block is present', () => {
    const diagnostics = validateServiceProviderContracts(
      {
        services: [
          {
            id: 'legacy-ai-gateway',
            external_dependencies: ['openai']
          }
        ]
      },
      providerContractPolicy
    );

    expect(diagnostics).toEqual([]);
  });

  test('fails when providers is not an array', () => {
    const diagnostics = validateServiceProviderContracts(
      {
        services: [
          {
            id: 'ai-gateway-service',
            providers: 'openai'
          }
        ]
      },
      providerContractPolicy
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-PROVIDER-001',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:ai-gateway-service].providers',
        message: '`providers` must be a YAML array when present.'
      }
    ]);
  });

  test('fails when provider entries omit required contract fields', () => {
    const diagnostics = validateServiceProviderContracts(
      {
        services: [
          {
            id: 'payment-webhook-handler',
            providers: [
              {
                id: 'stripe',
                data_sent: [],
                allowed_envs: ['production']
              }
            ]
          }
        ]
      },
      providerContractPolicy
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-PROVIDER-001',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:payment-webhook-handler].providers[0].data_sent',
        message: 'Provider entry is missing required field `data_sent`.'
      },
      {
        ruleId: 'ZDP-PROVIDER-001',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:payment-webhook-handler].providers[0].secret_owner',
        message: 'Provider entry is missing required field `secret_owner`.'
      }
    ]);
  });

  test('fails when provider entry is not an object', () => {
    const diagnostics = validateServiceProviderContracts(
      {
        services: [
          {
            id: 'payment-webhook-handler',
            providers: ['stripe']
          }
        ]
      },
      providerContractPolicy
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-PROVIDER-001',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:payment-webhook-handler].providers[0]',
        message: 'Provider entry must be a YAML object.'
      }
    ]);
  });
});

describe('service provider webhooks', () => {
  test('passes when enabled webhooks declare replay and signature handling', () => {
    const diagnostics = validateServiceProviderWebhooks(
      {
        services: [
          {
            id: 'payment-webhook-handler',
            providers: [
              {
                id: 'stripe',
                webhook: {
                  enabled: true,
                  replay_supported: true,
                  signature_required: true
                }
              }
            ]
          }
        ]
      },
      providerWebhookPolicy
    );

    expect(diagnostics).toEqual([]);
  });

  test('passes when webhook is disabled or absent', () => {
    const diagnostics = validateServiceProviderWebhooks(
      {
        services: [
          {
            id: 'ai-gateway-service',
            providers: [
              {
                id: 'openai'
              },
              {
                id: 'anthropic',
                webhook: {
                  enabled: false
                }
              }
            ]
          }
        ]
      },
      providerWebhookPolicy
    );

    expect(diagnostics).toEqual([]);
  });

  test('fails when enabled webhook omits replay and signature fields', () => {
    const diagnostics = validateServiceProviderWebhooks(
      {
        services: [
          {
            id: 'payment-webhook-handler',
            providers: [
              {
                id: 'stripe',
                webhook: {
                  enabled: true
                }
              }
            ]
          }
        ]
      },
      providerWebhookPolicy
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-PROVIDER-002',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path:
          'services[0:payment-webhook-handler].providers[0].webhook.replay_supported',
        message:
          'Provider webhook field `replay_supported` must be set to true when webhook is enabled.'
      },
      {
        ruleId: 'ZDP-PROVIDER-002',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path:
          'services[0:payment-webhook-handler].providers[0].webhook.signature_required',
        message:
          'Provider webhook field `signature_required` must be set to true when webhook is enabled.'
      }
    ]);
  });

  test('fails when enabled webhook sets replay and signature controls to false', () => {
    const diagnostics = validateServiceProviderWebhooks(
      {
        services: [
          {
            id: 'payment-webhook-handler',
            providers: [
              {
                id: 'stripe',
                webhook: {
                  enabled: true,
                  replay_supported: false,
                  signature_required: false
                }
              }
            ]
          }
        ]
      },
      providerWebhookPolicy
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-PROVIDER-002',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path:
          'services[0:payment-webhook-handler].providers[0].webhook.replay_supported',
        message:
          'Provider webhook field `replay_supported` must be set to true when webhook is enabled.'
      },
      {
        ruleId: 'ZDP-PROVIDER-002',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path:
          'services[0:payment-webhook-handler].providers[0].webhook.signature_required',
        message:
          'Provider webhook field `signature_required` must be set to true when webhook is enabled.'
      }
    ]);
  });

  test('fails when webhook is not an object', () => {
    const diagnostics = validateServiceProviderWebhooks(
      {
        services: [
          {
            id: 'payment-webhook-handler',
            providers: [
              {
                id: 'stripe',
                webhook: true
              }
            ]
          }
        ]
      },
      providerWebhookPolicy
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-PROVIDER-002',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:payment-webhook-handler].providers[0].webhook',
        message: '`webhook` must be a YAML object when present.'
      }
    ]);
  });
});
