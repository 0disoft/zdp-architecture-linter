import { describe, expect, test } from 'bun:test';
import {
  buildAiInferencePolicy,
  validateAiInferenceRepositories
} from '../src/ai-inference-rules.ts';

const policy = buildAiInferencePolicy({
  rules: [
    {
      id: 'ZDP-AI-INFERENCE-001',
      selector: { 'execution_plane.kind': 'ai_inference' },
      assertions: {
        require_values: {
          'execution_plane.request_contract': 'zdp.inference.execution.v1',
          'execution_plane.closed_fields': true,
          'execution_plane.raw_engine_option_passthrough': false,
          'security_boundary.raw_user_data_access': 'forbidden'
        },
        require_exact_lists: {
          'execution_plane.normal_callers': ['zdp-ai-platform']
        },
        require_same_values: {
          'execution_plane.selection_owner': 'execution_plane.normal_callers[0]',
          'execution_plane.external_facade_owner': 'execution_plane.normal_callers[0]'
        },
        require_fields: [
          'execution_plane.provider_lifecycle_owner',
          'execution_plane.provider_credential_owner'
        ],
        require_owned_data: [
          'inference-runtime-profiles',
          'loaded-artifact-verification-state',
          'model-serving-receipts'
        ],
        forbid_owned_data: ['model-routing-policy']
      }
    }
  ]
});

function validRepository(): Record<string, unknown> {
  return {
    name: 'zdp-ai-inference',
    execution_plane: {
      kind: 'ai_inference',
      normal_callers: ['zdp-ai-platform'],
      request_contract: 'zdp.inference.execution.v1',
      closed_fields: true,
      raw_engine_option_passthrough: false,
      selection_owner: 'zdp-ai-platform',
      external_facade_owner: 'zdp-ai-platform',
      provider_lifecycle_owner: 'zdp-platform-infra',
      provider_credential_owner: 'zdp-privacy-credential-vault'
    },
    security_boundary: { raw_user_data_access: 'forbidden' },
    owns_data: [
      'inference-runtime-profiles',
      'loaded-artifact-verification-state',
      'model-serving-receipts'
    ]
  };
}

describe('AI inference repository policy', () => {
  test('passes for a closed execution plane behind the platform caller', () => {
    expect(
      validateAiInferenceRepositories({ repositories: [validRepository()] }, policy)
    ).toEqual([]);
  });

  test('rejects direct callers, raw passthrough, and routing ownership', () => {
    const repository = validRepository();
    repository.execution_plane = {
      ...(repository.execution_plane as Record<string, unknown>),
      normal_callers: ['zdp-product-example'],
      raw_engine_option_passthrough: true,
      selection_owner: 'zdp-ai-inference'
    };
    repository.owns_data = [
      'inference-runtime-profiles',
      'model-serving-receipts',
      'model-routing-policy'
    ];

    const diagnostics = validateAiInferenceRepositories(
      { repositories: [repository] },
      policy
    );
    expect(diagnostics.map((item) => item.path)).toEqual([
      'repositories[0:zdp-ai-inference].execution_plane.raw_engine_option_passthrough',
      'repositories[0:zdp-ai-inference].execution_plane.normal_callers',
      'repositories[0:zdp-ai-inference].execution_plane.selection_owner',
      'repositories[0:zdp-ai-inference].execution_plane.external_facade_owner',
      'repositories[0:zdp-ai-inference].owns_data',
      'repositories[0:zdp-ai-inference].owns_data'
    ]);
    expect(diagnostics.every((item) => item.ruleId === 'ZDP-AI-INFERENCE-001')).toBe(true);
  });

  test('does not overmatch repositories without the execution-plane selector', () => {
    expect(
      validateAiInferenceRepositories(
        { repositories: [{ name: 'zdp-ai-platform', area: 'ai' }] },
        policy
      )
    ).toEqual([]);
  });
});
