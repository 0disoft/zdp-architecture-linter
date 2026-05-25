import { describe, expect, test } from 'bun:test';
import {
  buildPublicApiContractPolicy,
  validatePublicApiContracts
} from '../src/api-rules.ts';

const publicApiContractPolicy = buildPublicApiContractPolicy({
  rules: [
    {
      id: 'ZDP-API-001',
      condition: {
        expression: 'domain.public_api == true or api.exposure in [partner, public]'
      },
      assertions: {
        require_values: {
          'api.openapi_required': true
        },
        require_fields: [
          'api.versioning',
          'api.rate_limit_policy',
          'api.deprecation_policy'
        ]
      }
    }
  ]
});

describe('public API contracts', () => {
  test('passes when a public API declares OpenAPI and lifecycle policies', () => {
    const diagnostics = validatePublicApiContracts(
      {
        services: [
          {
            id: 'core-public-api',
            domain: {
              public_api: true
            },
            api: {
              openapi_required: true,
              versioning: 'semver',
              rate_limit_policy: 'public-default',
              deprecation_policy: '90-days'
            }
          }
        ]
      },
      publicApiContractPolicy
    );

    expect(diagnostics).toEqual([]);
  });

  test('passes when a partner API exposure declares lifecycle policies', () => {
    const diagnostics = validatePublicApiContracts(
      {
        services: [
          {
            id: 'partner-api',
            api: {
              exposure: 'partner',
              openapi_required: true,
              versioning: 'date-versioned',
              rate_limit_policy: 'partner-default',
              deprecation_policy: 'contract-notice'
            }
          }
        ]
      },
      publicApiContractPolicy
    );

    expect(diagnostics).toEqual([]);
  });

  test('passes when an internal API omits public API policies', () => {
    const diagnostics = validatePublicApiContracts(
      {
        services: [
          {
            id: 'internal-api',
            domain: {
              public_api: false
            },
            api: {
              exposure: 'internal'
            }
          }
        ]
      },
      publicApiContractPolicy
    );

    expect(diagnostics).toEqual([]);
  });

  test('fails when a public API omits OpenAPI and lifecycle policies', () => {
    const diagnostics = validatePublicApiContracts(
      {
        services: [
          {
            id: 'core-public-api',
            domain: {
              public_api: true
            },
            api: {
              openapi_required: false
            }
          }
        ]
      },
      publicApiContractPolicy
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-API-001',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:core-public-api].api.versioning',
        message: 'Public API service `core-public-api` must set `api.versioning`.'
      },
      {
        ruleId: 'ZDP-API-001',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:core-public-api].api.rate_limit_policy',
        message:
          'Public API service `core-public-api` must set `api.rate_limit_policy`.'
      },
      {
        ruleId: 'ZDP-API-001',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:core-public-api].api.deprecation_policy',
        message:
          'Public API service `core-public-api` must set `api.deprecation_policy`.'
      },
      {
        ruleId: 'ZDP-API-001',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:core-public-api].api.openapi_required',
        message:
          'Public API service `core-public-api` must set `api.openapi_required` to `true`.'
      }
    ]);
  });

  test('fails when a public exposure omits API policies', () => {
    const diagnostics = validatePublicApiContracts(
      {
        services: [
          {
            id: 'public-web-api',
            api: {
              exposure: 'public'
            }
          }
        ]
      },
      publicApiContractPolicy
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-API-001',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:public-web-api].api.versioning',
        message: 'Public API service `public-web-api` must set `api.versioning`.'
      },
      {
        ruleId: 'ZDP-API-001',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:public-web-api].api.rate_limit_policy',
        message:
          'Public API service `public-web-api` must set `api.rate_limit_policy`.'
      },
      {
        ruleId: 'ZDP-API-001',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:public-web-api].api.deprecation_policy',
        message:
          'Public API service `public-web-api` must set `api.deprecation_policy`.'
      },
      {
        ruleId: 'ZDP-API-001',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:public-web-api].api.openapi_required',
        message:
          'Public API service `public-web-api` must set `api.openapi_required` to `true`.'
      }
    ]);
  });

  test('fails when services is not an array', () => {
    const diagnostics = validatePublicApiContracts(
      { services: 'public-api' },
      publicApiContractPolicy
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-API-001',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services',
        message: '`services` must be a YAML array.'
      }
    ]);
  });
});
