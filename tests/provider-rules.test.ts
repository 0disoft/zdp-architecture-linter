import { describe, expect, test } from 'bun:test';
import {
  buildProviderContractPolicy,
  buildExternalProviderIndex,
  validateExternalProviderCatalog,
  validateServiceExternalDependencyReferences,
  validateServiceProviderContracts
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
