import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { validateRepositoryPrivacyContract } from '../src/privacy-contract-rules.ts';

describe('privacy access broker contract rules', () => {
  test('passes when the privacy broker repository declares privacy contracts', async () => {
    await withRepositoryRoot(createValidPrivacyFiles(), async (repositoryRoot) => {
      const diagnostics = await validateRepositoryPrivacyContract({
        repositoryRoot,
        repositoryServiceContract: createPrivacyServiceContract()
      });

      expect(diagnostics).toEqual([]);
    });
  });

  test('skips repositories that are not zdp-privacy-access-broker', async () => {
    await withRepositoryRoot({}, async (repositoryRoot) => {
      const diagnostics = await validateRepositoryPrivacyContract({
        repositoryRoot,
        repositoryServiceContract: {
          service: {
            repo: 'zdp-growth-lab'
          }
        }
      });

      expect(diagnostics).toEqual([]);
    });
  });

  test('fails when required privacy broker contract files are missing', async () => {
    await withRepositoryRoot({}, async (repositoryRoot) => {
      const diagnostics = await validateRepositoryPrivacyContract({
        repositoryRoot,
        repositoryServiceContract: createPrivacyServiceContract()
      });

      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-PRIVACY-001',
        severity: 'error',
        file: 'contracts/privacy-access-policy.yaml',
        path: 'repository.root',
        message:
          'Privacy broker repository must include `contracts/privacy-access-policy.yaml`.'
      });
      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-PRIVACY-001',
        severity: 'error',
        file: 'contracts/capability-grants.yaml',
        path: 'repository.root',
        message:
          'Privacy broker repository must include `contracts/capability-grants.yaml`.'
      });
      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-PRIVACY-001',
        severity: 'error',
        file: 'contracts/data-minimization.yaml',
        path: 'repository.root',
        message:
          'Privacy broker repository must include `contracts/data-minimization.yaml`.'
      });
      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-PRIVACY-001',
        severity: 'error',
        file: 'contracts/access-capability.yaml',
        path: 'repository.root',
        message:
          'Privacy broker repository must include `contracts/access-capability.yaml`.'
      });
    });
  });

  test('fails when a privacy broker contract file is not valid YAML', async () => {
    await withRepositoryRoot(
      {
        ...createValidPrivacyFiles(),
        'contracts/privacy-access-policy.yaml': 'contract: [broken'
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryPrivacyContract({
          repositoryRoot,
          repositoryServiceContract: createPrivacyServiceContract()
        });

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]).toMatchObject({
          ruleId: 'ZDP-PRIVACY-001',
          severity: 'error',
          file: 'contracts/privacy-access-policy.yaml',
          path: 'yaml'
        });
      }
    );
  });

  test('fails when privacy access policy drifts open', async () => {
    await withRepositoryRoot(
      {
        ...createValidPrivacyFiles(),
        'contracts/privacy-access-policy.yaml': `
contract:
  version: 1
  status: draft
decision_owner: zdp-privacy-access-broker
default_decision: allow
request_context_required:
  - actor_id
required_checks:
  - authenticated_actor
forbidden_decisions:
  - final_authorization_for_product_feature
forbidden_outputs:
  - raw_oauth_token
fail_closed_when_missing:
  - actor_id
audit_events_required:
  - privacy.access.denied
break_glass:
  requires:
    - reason
  forbidden:
    - permanent_exception
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryPrivacyContract({
          repositoryRoot,
          repositoryServiceContract: createPrivacyServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-PRIVACY-001',
          severity: 'error',
          file: 'contracts/privacy-access-policy.yaml',
          path: 'default_decision',
          message: 'Privacy access policy must default to `deny`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-PRIVACY-001',
          severity: 'error',
          file: 'contracts/privacy-access-policy.yaml',
          path: 'request_context_required',
          message:
            'Privacy broker contract `contracts/privacy-access-policy.yaml` must include `tenant_id` in `request_context_required`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-PRIVACY-001',
          severity: 'error',
          file: 'contracts/privacy-access-policy.yaml',
          path: 'forbidden_outputs',
          message:
            'Privacy broker contract `contracts/privacy-access-policy.yaml` must include `unrestricted_source_payload` in `forbidden_outputs`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-PRIVACY-001',
          severity: 'error',
          file: 'contracts/privacy-access-policy.yaml',
          path: 'break_glass.requires',
          message:
            'Privacy broker contract `contracts/privacy-access-policy.yaml` must include `human_approval` in `break_glass.requires`.'
        });
      }
    );
  });

  test('fails when capability grants drift', async () => {
    await withRepositoryRoot(
      {
        ...createValidPrivacyFiles(),
        'contracts/capability-grants.yaml': `
contract:
  version: 1
  status: draft
grant_owner: zdp-privacy-access-broker
token_shape: jwt
max_ttl_seconds: 3600
grant_request_required:
  - actor_id
grant_record_required:
  - grant_id
forbidden_operations:
  - read_raw_secret
delegation:
  onward_delegation_allowed: true
  bearer_logging_allowed: true
  persist_in_product_repo_allowed: true
revocation:
  supported: false
  triggers: []
audit:
  reason_required: false
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryPrivacyContract({
          repositoryRoot,
          repositoryServiceContract: createPrivacyServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-PRIVACY-001',
          severity: 'error',
          file: 'contracts/capability-grants.yaml',
          path: 'token_shape',
          message: 'Privacy capability grants must use opaque tokens.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-PRIVACY-001',
          severity: 'error',
          file: 'contracts/capability-grants.yaml',
          path: 'max_ttl_seconds',
          message: 'Privacy capability max TTL must be 300 seconds or less.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-PRIVACY-001',
          severity: 'error',
          file: 'contracts/capability-grants.yaml',
          path: 'delegation.persist_in_product_repo_allowed',
          message:
            'Privacy capability persistence in product repositories must be disabled.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-PRIVACY-001',
          severity: 'error',
          file: 'contracts/capability-grants.yaml',
          path: 'revocation.supported',
          message: 'Privacy capabilities must support revocation.'
        });
      }
    );
  });

  test('fails when data minimization allows raw outputs', async () => {
    await withRepositoryRoot(
      {
        ...createValidPrivacyFiles(),
        'contracts/data-minimization.yaml': `
contract:
  version: 1
  status: draft
minimization_owner: zdp-privacy-access-broker
default_output: raw_payload
allowed_output_shapes:
  - masked_summary
forbidden_output_shapes:
  - token_value
required_redactions:
  - token
purpose_limits:
  growth_or_analytics:
    allowed_shapes:
      - subject_level_event_stream
    forbidden_shapes:
      - raw_payload
retention:
  raw_source_retention_allowed: true
  deletion_requires_evidence: false
logging:
  log_raw_payload: true
  log_capability_token: true
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryPrivacyContract({
          repositoryRoot,
          repositoryServiceContract: createPrivacyServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-PRIVACY-001',
          severity: 'error',
          file: 'contracts/data-minimization.yaml',
          path: 'default_output',
          message: 'Privacy data minimization must default to `deny`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-PRIVACY-001',
          severity: 'error',
          file: 'contracts/data-minimization.yaml',
          path: 'purpose_limits.growth_or_analytics.forbidden_shapes',
          message:
            'Privacy broker contract `contracts/data-minimization.yaml` must include `subject_level_event_stream` in `purpose_limits.growth_or_analytics.forbidden_shapes`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-PRIVACY-001',
          severity: 'error',
          file: 'contracts/data-minimization.yaml',
          path: 'logging.log_raw_payload',
          message: 'Privacy minimization must not log raw payloads.'
        });
      }
    );
  });

  test('fails when service contract stops requiring the privacy gate', async () => {
    await withRepositoryRoot(createValidPrivacyFiles(), async (repositoryRoot) => {
      const diagnostics = await validateRepositoryPrivacyContract({
        repositoryRoot,
        repositoryServiceContract: {
          ...createPrivacyServiceContract(),
          policy_gates: {
            required_linter_rules: ['ZDP-REPO-BASELINE-001']
          }
        }
      });

      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-PRIVACY-001',
        severity: 'error',
        file: 'service.yaml',
        path: 'policy_gates.required_linter_rules',
        message:
          'Privacy broker service contract must require `ZDP-PRIVACY-001`.'
      });
    });
  });
});

async function withRepositoryRoot(
  files: Record<string, string>,
  callback: (repositoryRoot: string) => Promise<void>
): Promise<void> {
  const repositoryRoot = await mkdtemp(join(tmpdir(), 'zdp-privacy-contract-'));

  try {
    for (const [relativePath, source] of Object.entries(files)) {
      const absolutePath = join(repositoryRoot, relativePath);

      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, source.trimStart(), 'utf8');
    }

    await callback(repositoryRoot);
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true });
  }
}

function createPrivacyServiceContract(): Record<string, unknown> {
  return {
    service: {
      repo: 'zdp-privacy-access-broker',
      status: 'experiment'
    },
    domain: {
      regulated: true
    },
    data: {
      owner_domain: 'privacy',
      pii_level: 'high'
    },
    access: {
      object_level_auth_required: true
    },
    audit: {
      required: true
    },
    dependencies: {
      services: ['zdp-privacy-access-broker', 'core-api', 'core-audit', 'platform-observability']
    },
    human_review_required: [
      'data access policy changes',
      'masking and consent withdrawal changes',
      'break-glass access',
      'new capability output shape'
    ],
    exit: {
      kill_criteria: [
        'AI, connectors, or products read source user data without broker mediation',
        'privacy broker returns OAuth tokens, raw credentials, or unbounded source exports',
        'growth or analytics consumers receive subject-level raw event streams'
      ]
    },
    policy_gates: {
      required_linter_rules: ['ZDP-REPO-BASELINE-001', 'ZDP-PRIVACY-001']
    }
  };
}

function createValidPrivacyFiles(): Record<string, string> {
  return {
    'contracts/privacy-access-policy.yaml': `
contract:
  version: 1
  status: draft
decision_owner: zdp-privacy-access-broker
default_decision: deny
request_context_required:
  - actor_id
  - tenant_id
  - subject_id
  - purpose
  - resource_kind
  - resource_scope
  - consent_reference
  - permission_reference
  - audit_context
required_checks:
  - authenticated_actor
  - tenant_boundary
  - object_level_permission
  - explicit_purpose
  - active_consent
  - data_minimization
  - source_system_allowed
  - audit_event_prepared
forbidden_decisions:
  - final_authorization_for_product_feature
  - entitlement_decision
  - billing_or_ledger_decision
  - access_based_only_on_client_role
forbidden_outputs:
  - raw_oauth_token
  - provider_refresh_token
  - authorization_header
  - cookie
  - unrestricted_source_payload
  - full_mailbox_export
  - full_message_history_export
  - full_file_corpus_export
fail_closed_when_missing:
  - actor_id
  - tenant_id
  - subject_id
  - purpose
  - resource_scope
  - consent_reference
  - permission_reference
  - audit_context
audit_events_required:
  - privacy.access.allowed
  - privacy.access.denied
  - privacy.capability.issued
  - privacy.masking.applied
  - privacy.break_glass.used
break_glass:
  requires:
    - human_approval
    - reason
    - time_limit
    - target_scope
    - audit_event
  forbidden:
    - silent_superuser_access
    - permanent_exception
    - raw_secret_return
`,
    'contracts/capability-grants.yaml': `
contract:
  version: 1
  status: draft
grant_owner: zdp-privacy-access-broker
token_shape: opaque
max_ttl_seconds: 300
grant_request_required:
  - actor_id
  - tenant_id
  - subject_id
  - requester_service
  - purpose
  - resource_kind
  - resource_scope
  - allowed_operations
  - consent_reference
  - permission_reference
  - idempotency_key
  - request_id
  - trace_id
grant_record_required:
  - grant_id
  - issued_at
  - expires_at
  - actor_id
  - tenant_id
  - subject_id
  - requester_service
  - purpose
  - resource_scope
  - allowed_operations
  - audit_event_id
forbidden_operations:
  - read_raw_secret
  - read_raw_oauth_token
  - read_unbounded_content
  - write_source_content
  - mutate_entitlement
  - mutate_ledger
  - bypass_consent
delegation:
  onward_delegation_allowed: false
  bearer_logging_allowed: false
  persist_in_product_repo_allowed: false
revocation:
  supported: true
  triggers:
    - consent_withdrawn
    - permission_changed
    - tenant_membership_removed
    - break_glass_window_expired
audit:
  reason_required: true
`,
    'contracts/data-minimization.yaml': `
contract:
  version: 1
  status: draft
minimization_owner: zdp-privacy-access-broker
default_output: deny
allowed_output_shapes:
  - masked_summary
  - masked_excerpt
  - limited_metadata
  - aggregate_count
  - policy_decision
forbidden_output_shapes:
  - raw_payload
  - raw_mail_body
  - raw_message_body
  - raw_file_body
  - raw_prompt_body
  - raw_payment_payload
  - credential_value
  - token_value
required_redactions:
  - email_address
  - phone_number
  - physical_address
  - government_identifier
  - payment_identifier
  - authorization_header
  - cookie
  - secret
  - token
  - provider_credential
purpose_limits:
  growth_or_analytics:
    allowed_shapes:
      - aggregate_count
    forbidden_shapes:
      - raw_payload
      - subject_level_event_stream
      - reidentification_key
retention:
  raw_source_retention_allowed: false
  deletion_requires_evidence: true
logging:
  log_raw_payload: false
  log_capability_token: false
`,
    'contracts/access-capability.yaml': `
contract:
  version: 1
  status: draft
capability:
  max_ttl_seconds: 300
  requires:
    - actor_id
    - tenant_id
    - purpose
    - resource_scope
    - consent_reference
forbidden:
  - raw_oauth_token_return
  - unscoped_source_data_access
  - unaudited_ai_data_access
`
  };
}
