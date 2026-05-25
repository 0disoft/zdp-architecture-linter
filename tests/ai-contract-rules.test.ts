import { describe, expect, test } from 'bun:test';
import {
  buildAiUserDataPolicy,
  validateAiUserDataContracts
} from '../src/ai-contract-rules.ts';

const aiUserDataPolicy = buildAiUserDataPolicy({
  rules: [
    {
      id: 'ZDP-AI-001',
      assertions: {
        require_any: {
          'dependencies.services': ['zdp-privacy-access-broker']
        },
        require_values: {
          'audit.required': true
        },
        require_fields: ['access.permission_model'],
        forbid_values: {
          'access.permission_model': ['none']
        }
      }
    }
  ]
});

describe('AI user data contracts', () => {
  test('passes when AI user data access uses privacy broker, audit, and permission model', () => {
    const diagnostics = validateAiUserDataContracts(
      {
        services: [
          {
            id: 'ai-answer-engine',
            data: {
              ai_user_data: true
            },
            dependencies: {
              services: ['zdp-privacy-access-broker']
            },
            audit: {
              required: true
            },
            access: {
              permission_model: 'rebac'
            }
          }
        ]
      },
      aiUserDataPolicy
    );

    expect(diagnostics).toEqual([]);
  });

  test('passes when a service does not access AI user data', () => {
    const diagnostics = validateAiUserDataContracts(
      {
        services: [
          {
            id: 'ai-gateway-service',
            data: {
              ai_user_data: false
            }
          }
        ]
      },
      aiUserDataPolicy
    );

    expect(diagnostics).toEqual([]);
  });

  test('supports the legacy flat dependency list used by the central service catalog', () => {
    const diagnostics = validateAiUserDataContracts(
      {
        services: [
          {
            id: 'ai-answer-engine',
            data: {
              ai_user_data: true
            },
            dependencies: ['zdp-privacy-access-broker'],
            audit: {
              required: true
            },
            access: {
              permission_model: 'custom'
            }
          }
        ]
      },
      aiUserDataPolicy
    );

    expect(diagnostics).toEqual([]);
  });

  test('fails when AI user data access omits required controls', () => {
    const diagnostics = validateAiUserDataContracts(
      {
        services: [
          {
            id: 'ai-answer-engine',
            data: {
              ai_user_data: true
            },
            dependencies: {
              services: ['ai-retrieval']
            },
            audit: {
              required: false
            },
            access: {
              permission_model: 'none'
            }
          }
        ]
      },
      aiUserDataPolicy
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-AI-001',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:ai-answer-engine].audit.required',
        message:
          'AI user data service `ai-answer-engine` must set `audit.required` to `true`.'
      },
      {
        ruleId: 'ZDP-AI-001',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:ai-answer-engine].access.permission_model',
        message:
          'AI user data service `ai-answer-engine` must not set `access.permission_model` to `none`.'
      },
      {
        ruleId: 'ZDP-AI-001',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:ai-answer-engine].dependencies.services',
        message:
          'AI user data service `ai-answer-engine` must depend on one of: `zdp-privacy-access-broker`.'
      }
    ]);
  });

  test('fails when the permission model is missing', () => {
    const diagnostics = validateAiUserDataContracts(
      {
        services: [
          {
            id: 'ai-answer-engine',
            data: {
              ai_user_data: true
            },
            dependencies: {
              services: ['zdp-privacy-access-broker']
            },
            audit: {
              required: true
            },
            access: {}
          }
        ]
      },
      aiUserDataPolicy
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-AI-001',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:ai-answer-engine].access.permission_model',
        message:
          'AI user data service `ai-answer-engine` is missing required field `access.permission_model`.'
      }
    ]);
  });
});
