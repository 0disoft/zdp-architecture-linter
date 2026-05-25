import { describe, expect, test } from 'bun:test';
import {
  buildExternalProviderIndex,
  validateExternalProviderCatalog,
  validateServiceExternalDependencyReferences
} from '../src/provider-rules.ts';

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
