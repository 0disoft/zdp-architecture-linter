import { describe, expect, test } from 'bun:test';
import {
  buildAiSensitiveDataPolicy,
  buildAiUserDataPolicy,
  validateAiSensitiveDataContracts,
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

const aiSensitiveDataPolicy = buildAiSensitiveDataPolicy({
  rules: [
    {
      id: 'ZDP-AI-002',
      assertions: {
        require_values: {
          'ai.provider_policy.no_prompt_training_required': true
        },
        require_any: {
          'ai.provider_policy': [
            'zero_data_retention_required',
            'retention_exception_ref'
          ]
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

describe('AI sensitive data contracts', () => {
  test('passes when sensitive AI data requires no training and zero retention', () => {
    const diagnostics = validateAiSensitiveDataContracts(
      {
        services: [
          {
            id: 'ai-answer-engine',
            ai: {
              sensitive_data: true,
              provider_policy: {
                no_prompt_training_required: true,
                zero_data_retention_required: true
              }
            }
          }
        ]
      },
      aiSensitiveDataPolicy
    );

    expect(diagnostics).toEqual([]);
  });

  test('passes when AI user data has a retention exception reference', () => {
    const diagnostics = validateAiSensitiveDataContracts(
      {
        services: [
          {
            id: 'ai-answer-engine',
            data: {
              ai_user_data: true
            },
            ai: {
              provider_policy: {
                no_prompt_training_required: true,
                retention_exception_ref: 'docs/adr/ai-retention-exception.md'
              }
            }
          }
        ]
      },
      aiSensitiveDataPolicy
    );

    expect(diagnostics).toEqual([]);
  });

  test('passes when a service does not handle sensitive AI data', () => {
    const diagnostics = validateAiSensitiveDataContracts(
      {
        services: [
          {
            id: 'ai-gateway-service',
            ai: {
              sensitive_data: false
            }
          }
        ]
      },
      aiSensitiveDataPolicy
    );

    expect(diagnostics).toEqual([]);
  });

  test('fails when sensitive AI data omits provider policy controls', () => {
    const diagnostics = validateAiSensitiveDataContracts(
      {
        services: [
          {
            id: 'ai-answer-engine',
            ai: {
              sensitive_data: true,
              provider_policy: {
                no_prompt_training_required: false,
                zero_data_retention_required: false,
                retention_exception_ref: ''
              }
            }
          }
        ]
      },
      aiSensitiveDataPolicy
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-AI-002',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path:
          'services[0:ai-answer-engine].ai.provider_policy.no_prompt_training_required',
        message:
          'AI sensitive data service `ai-answer-engine` must set `ai.provider_policy.no_prompt_training_required` to `true`.'
      },
      {
        ruleId: 'ZDP-AI-002',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:ai-answer-engine].ai.provider_policy',
        message:
          'AI sensitive data service `ai-answer-engine` must set one of: `ai.provider_policy.zero_data_retention_required`, `ai.provider_policy.retention_exception_ref`.'
      }
    ]);
  });
});
