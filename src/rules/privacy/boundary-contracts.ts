import type { Diagnostic } from '../../diagnostics.ts';
import {
  PRIVACY_REPOSITORY_NAME,
  validateExactStringArrayEntries,
  validateExactValue,
  validateMaxNumber,
  validatePositiveSafeInteger,
  validateRequiredStringArrayEntries
} from './contract-helpers.ts';

export const PRIVACY_ACCESS_POLICY_FILE = 'contracts/privacy-access-policy.yaml';
export const CAPABILITY_GRANTS_FILE = 'contracts/capability-grants.yaml';
export const DATA_MINIMIZATION_FILE = 'contracts/data-minimization.yaml';
export const ACCESS_CAPABILITY_FILE = 'contracts/access-capability.yaml';

const REQUIRED_POLICY_CONTEXT = [
  'actor_id',
  'tenant_id',
  'subject_id',
  'purpose',
  'resource_kind',
  'resource_scope',
  'consent_reference',
  'permission_reference',
  'audit_context'
] as const;

const REQUIRED_POLICY_CHECKS = [
  'authenticated_actor',
  'tenant_boundary',
  'object_level_permission',
  'explicit_purpose',
  'active_consent',
  'data_minimization',
  'source_system_allowed',
  'audit_event_prepared'
] as const;

const REQUIRED_ALLOWED_CALLERS = [
  'zdp-ai-platform',
  'zdp-connectors-platform',
  'zdp-comm-platform',
  'zdp-web-apps'
] as const;

const REQUIRED_FORBIDDEN_DECISIONS = [
  'final_authorization_for_product_feature',
  'entitlement_decision',
  'billing_or_ledger_decision',
  'access_based_only_on_client_role'
] as const;

const REQUIRED_FORBIDDEN_OUTPUTS = [
  'raw_oauth_token',
  'provider_refresh_token',
  'authorization_header',
  'cookie',
  'unrestricted_source_payload',
  'full_mailbox_export',
  'full_message_history_export',
  'full_file_corpus_export'
] as const;

const REQUIRED_AUDIT_EVENTS = [
  'privacy.access.allowed',
  'privacy.access.denied',
  'privacy.capability.issued',
  'privacy.masking.applied',
  'privacy.break_glass.used'
] as const;

const REQUIRED_BREAK_GLASS_FIELDS = [
  'human_approval',
  'reason',
  'time_limit',
  'target_scope',
  'audit_event'
] as const;

const REQUIRED_CAPABILITY_REQUEST_FIELDS = [
  'actor_id',
  'tenant_id',
  'subject_id',
  'requester_service',
  'purpose',
  'resource_kind',
  'resource_scope',
  'allowed_operations',
  'consent_reference',
  'permission_reference',
  'idempotency_key',
  'request_id',
  'trace_id'
] as const;

const REQUIRED_CAPABILITY_RECORD_FIELDS = [
  'grant_id',
  'issued_at',
  'expires_at',
  'actor_id',
  'tenant_id',
  'subject_id',
  'requester_service',
  'purpose',
  'resource_scope',
  'allowed_operations',
  'audit_event_id'
] as const;

const REQUIRED_ALLOWED_CAPABILITY_OPERATIONS = [
  'read_masked_summary',
  'read_masked_excerpt',
  'search_limited_metadata',
  'request_human_review'
] as const;

const REQUIRED_FORBIDDEN_OPERATIONS = [
  'read_raw_secret',
  'read_raw_oauth_token',
  'read_unbounded_content',
  'write_source_content',
  'mutate_entitlement',
  'mutate_ledger',
  'bypass_consent'
] as const;

const REQUIRED_POLICY_CONSENT_CACHE_INVALIDATION_TRIGGERS = [
  'consent_withdrawn',
  'permission_changed',
  'tenant_membership_removed',
  'break_glass_window_expired'
] as const;

const REQUIRED_STATELESS_CONSENT_TOKEN_EXCEPTION_FIELDS = [
  'architecture_decision',
  'revocation_plan',
  'audit_correlation',
  'no_raw_subject_data_claims'
] as const;

const REQUIRED_ALLOWED_OUTPUT_SHAPES = [
  'masked_summary',
  'masked_excerpt',
  'limited_metadata',
  'aggregate_count',
  'policy_decision'
] as const;

const REQUIRED_REDACTIONS = [
  'email_address',
  'phone_number',
  'physical_address',
  'government_identifier',
  'payment_identifier',
  'authorization_header',
  'cookie',
  'secret',
  'token',
  'provider_credential'
] as const;

const REQUIRED_FORBIDDEN_OUTPUT_SHAPES = [
  'raw_payload',
  'raw_mail_body',
  'raw_message_body',
  'raw_file_body',
  'raw_prompt_body',
  'raw_payment_payload',
  'credential_value',
  'token_value'
] as const;

const REQUIRED_GROWTH_FORBIDDEN_SHAPES = [
  'raw_payload',
  'subject_level_event_stream',
  'reidentification_key'
] as const;

const REQUIRED_GROWTH_ALLOWED_SHAPES = ['aggregate_count'] as const;

const REQUIRED_AI_ANSWER_DRAFT_FORBIDDEN_SHAPES = [
  'raw_payload',
  'credential_value'
] as const;

const REQUIRED_CONNECTOR_SYNC_FORBIDDEN_SHAPES = [
  'raw_oauth_token',
  'raw_payload'
] as const;

const REQUIRED_POLICY_LOG_IDENTIFIERS = [
  'request_id',
  'trace_id',
  'actor_id',
  'tenant_id',
  'purpose'
] as const;


export function validateAccessPolicyContract(value: unknown): readonly Diagnostic[] {
  return [
    ...validateExactValue({
      value,
      file: PRIVACY_ACCESS_POLICY_FILE,
      path: 'decision_owner',
      expected: PRIVACY_REPOSITORY_NAME,
      message: 'Privacy access policy must be owned by `zdp-privacy-access-broker`.'
    }),
    ...validateExactValue({
      value,
      file: PRIVACY_ACCESS_POLICY_FILE,
      path: 'default_decision',
      expected: 'deny',
      message: 'Privacy access policy must default to `deny`.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: PRIVACY_ACCESS_POLICY_FILE,
      path: 'request_context_required',
      field: 'request_context_required',
      requiredEntries: REQUIRED_POLICY_CONTEXT
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: PRIVACY_ACCESS_POLICY_FILE,
      path: 'required_checks',
      field: 'required_checks',
      requiredEntries: REQUIRED_POLICY_CHECKS
    }),
    ...validateExactStringArrayEntries({
      value,
      file: PRIVACY_ACCESS_POLICY_FILE,
      path: 'allowed_callers',
      field: 'allowed_callers',
      expectedEntries: REQUIRED_ALLOWED_CALLERS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: PRIVACY_ACCESS_POLICY_FILE,
      path: 'forbidden_decisions',
      field: 'forbidden_decisions',
      requiredEntries: REQUIRED_FORBIDDEN_DECISIONS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: PRIVACY_ACCESS_POLICY_FILE,
      path: 'forbidden_outputs',
      field: 'forbidden_outputs',
      requiredEntries: REQUIRED_FORBIDDEN_OUTPUTS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: PRIVACY_ACCESS_POLICY_FILE,
      path: 'fail_closed_when_missing',
      field: 'fail_closed_when_missing',
      requiredEntries: REQUIRED_POLICY_CONTEXT.filter(
        (entry) => entry !== 'resource_kind'
      )
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: PRIVACY_ACCESS_POLICY_FILE,
      path: 'audit_events_required',
      field: 'audit_events_required',
      requiredEntries: REQUIRED_AUDIT_EVENTS
    }),
    ...validateExactValue({
      value,
      file: PRIVACY_ACCESS_POLICY_FILE,
      path: 'break_glass.allowed',
      expected: true,
      message: 'Break-glass policy must be explicitly allowed and governed.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: PRIVACY_ACCESS_POLICY_FILE,
      path: 'break_glass.requires',
      field: 'break_glass.requires',
      requiredEntries: REQUIRED_BREAK_GLASS_FIELDS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: PRIVACY_ACCESS_POLICY_FILE,
      path: 'break_glass.forbidden',
      field: 'break_glass.forbidden',
      requiredEntries: [
        'silent_superuser_access',
        'permanent_exception',
        'raw_secret_return'
      ]
    })
  ];
}

export function validateCapabilityGrantsContract(value: unknown): readonly Diagnostic[] {
  return [
    ...validateExactValue({
      value,
      file: CAPABILITY_GRANTS_FILE,
      path: 'grant_owner',
      expected: PRIVACY_REPOSITORY_NAME,
      message: 'Privacy capability grants must be owned by `zdp-privacy-access-broker`.'
    }),
    ...validateExactValue({
      value,
      file: CAPABILITY_GRANTS_FILE,
      path: 'token_shape',
      expected: 'opaque',
      message: 'Privacy capability grants must use opaque tokens.'
    }),
    ...validatePositiveSafeInteger({
      value,
      file: CAPABILITY_GRANTS_FILE,
      path: 'max_ttl_seconds',
      message:
        'Privacy capability max TTL must be a positive integer number of seconds.'
    }),
    ...validateMaxNumber({
      value,
      file: CAPABILITY_GRANTS_FILE,
      path: 'max_ttl_seconds',
      max: 300,
      message: 'Privacy capability max TTL must be 300 seconds or less.'
    }),
    ...validateExactValue({
      value,
      file: CAPABILITY_GRANTS_FILE,
      path: 'renewal_policy',
      expected: 'recheck_policy_and_consent',
      message: 'Privacy capability renewal must recheck policy and consent.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: CAPABILITY_GRANTS_FILE,
      path: 'grant_request_required',
      field: 'grant_request_required',
      requiredEntries: REQUIRED_CAPABILITY_REQUEST_FIELDS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: CAPABILITY_GRANTS_FILE,
      path: 'grant_record_required',
      field: 'grant_record_required',
      requiredEntries: REQUIRED_CAPABILITY_RECORD_FIELDS
    }),
    ...validateExactStringArrayEntries({
      value,
      file: CAPABILITY_GRANTS_FILE,
      path: 'allowed_operations',
      field: 'allowed_operations',
      expectedEntries: REQUIRED_ALLOWED_CAPABILITY_OPERATIONS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: CAPABILITY_GRANTS_FILE,
      path: 'forbidden_operations',
      field: 'forbidden_operations',
      requiredEntries: REQUIRED_FORBIDDEN_OPERATIONS
    }),
    ...validateExactValue({
      value,
      file: CAPABILITY_GRANTS_FILE,
      path: 'delegation.onward_delegation_allowed',
      expected: false,
      message: 'Privacy capability onward delegation must be disabled.'
    }),
    ...validateExactValue({
      value,
      file: CAPABILITY_GRANTS_FILE,
      path: 'delegation.bearer_logging_allowed',
      expected: false,
      message: 'Privacy capability bearer logging must be disabled.'
    }),
    ...validateExactValue({
      value,
      file: CAPABILITY_GRANTS_FILE,
      path: 'delegation.persist_in_product_repo_allowed',
      expected: false,
      message: 'Privacy capability persistence in product repositories must be disabled.'
    }),
    ...validateExactValue({
      value,
      file: CAPABILITY_GRANTS_FILE,
      path: 'delegation.usable_without_policy_recheck',
      expected: false,
      message: 'Privacy capability use must require policy recheck.'
    }),
    ...validateExactValue({
      value,
      file: CAPABILITY_GRANTS_FILE,
      path: 'revocation.supported',
      expected: true,
      message: 'Privacy capabilities must support revocation.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: CAPABILITY_GRANTS_FILE,
      path: 'revocation.triggers',
      field: 'revocation.triggers',
      requiredEntries: [
        ...REQUIRED_POLICY_CONSENT_CACHE_INVALIDATION_TRIGGERS
      ]
    }),
    ...validateExactValue({
      value,
      file: CAPABILITY_GRANTS_FILE,
      path: 'load_shedding.policy_consent_cache.allowed',
      expected: true,
      message:
        'Privacy policy and consent cache must remain explicitly allowed as bounded metadata.'
    }),
    ...validateExactValue({
      value,
      file: CAPABILITY_GRANTS_FILE,
      path: 'load_shedding.policy_consent_cache.scope',
      expected: 'decision_metadata_only',
      message: 'Privacy policy and consent cache must be limited to decision metadata.'
    }),
    ...validatePositiveSafeInteger({
      value,
      file: CAPABILITY_GRANTS_FILE,
      path: 'load_shedding.policy_consent_cache.max_ttl_seconds',
      message:
        'Privacy policy consent cache max TTL must be a positive integer number of seconds.'
    }),
    ...validateMaxNumber({
      value,
      file: CAPABILITY_GRANTS_FILE,
      path: 'load_shedding.policy_consent_cache.max_ttl_seconds',
      max: 30,
      message: 'Privacy policy consent cache max TTL must be 30 seconds or less.'
    }),
    ...validateExactValue({
      value,
      file: CAPABILITY_GRANTS_FILE,
      path: 'load_shedding.policy_consent_cache.raw_subject_data_allowed',
      expected: false,
      message: 'Privacy policy and consent cache must not store raw subject data.'
    }),
    ...validateExactValue({
      value,
      file: CAPABILITY_GRANTS_FILE,
      path: 'load_shedding.policy_consent_cache.consent_snapshot_payload_allowed',
      expected: false,
      message: 'Privacy policy and consent cache must not store consent snapshot payloads.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: CAPABILITY_GRANTS_FILE,
      path: 'load_shedding.policy_consent_cache.invalidation_required',
      field: 'load_shedding.policy_consent_cache.invalidation_required',
      requiredEntries: REQUIRED_POLICY_CONSENT_CACHE_INVALIDATION_TRIGGERS
    }),
    ...validateExactValue({
      value,
      file: CAPABILITY_GRANTS_FILE,
      path: 'load_shedding.stateless_consent_token.allowed_by_default',
      expected: false,
      message: 'Privacy stateless consent tokens must not be allowed by default.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: CAPABILITY_GRANTS_FILE,
      path: 'load_shedding.stateless_consent_token.exception_requires',
      field: 'load_shedding.stateless_consent_token.exception_requires',
      requiredEntries: REQUIRED_STATELESS_CONSENT_TOKEN_EXCEPTION_FIELDS
    }),
    ...validateExactValue({
      value,
      file: CAPABILITY_GRANTS_FILE,
      path: 'audit.reason_required',
      expected: true,
      message: 'Privacy capability audit must require a reason.'
    })
  ];
}

export function validateDataMinimizationContract(value: unknown): readonly Diagnostic[] {
  return [
    ...validateExactValue({
      value,
      file: DATA_MINIMIZATION_FILE,
      path: 'minimization_owner',
      expected: PRIVACY_REPOSITORY_NAME,
      message: 'Privacy data minimization must be owned by `zdp-privacy-access-broker`.'
    }),
    ...validateExactValue({
      value,
      file: DATA_MINIMIZATION_FILE,
      path: 'default_output',
      expected: 'deny',
      message: 'Privacy data minimization must default to `deny`.'
    }),
    ...validateExactStringArrayEntries({
      value,
      file: DATA_MINIMIZATION_FILE,
      path: 'allowed_output_shapes',
      field: 'allowed_output_shapes',
      expectedEntries: REQUIRED_ALLOWED_OUTPUT_SHAPES
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: DATA_MINIMIZATION_FILE,
      path: 'forbidden_output_shapes',
      field: 'forbidden_output_shapes',
      requiredEntries: REQUIRED_FORBIDDEN_OUTPUT_SHAPES
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: DATA_MINIMIZATION_FILE,
      path: 'required_redactions',
      field: 'required_redactions',
      requiredEntries: REQUIRED_REDACTIONS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: DATA_MINIMIZATION_FILE,
      path: 'purpose_limits.ai_answer_draft.forbidden_shapes',
      field: 'purpose_limits.ai_answer_draft.forbidden_shapes',
      requiredEntries: REQUIRED_AI_ANSWER_DRAFT_FORBIDDEN_SHAPES
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: DATA_MINIMIZATION_FILE,
      path: 'purpose_limits.connector_sync.forbidden_shapes',
      field: 'purpose_limits.connector_sync.forbidden_shapes',
      requiredEntries: REQUIRED_CONNECTOR_SYNC_FORBIDDEN_SHAPES
    }),
    ...validateExactStringArrayEntries({
      value,
      file: DATA_MINIMIZATION_FILE,
      path: 'purpose_limits.growth_or_analytics.allowed_shapes',
      field: 'purpose_limits.growth_or_analytics.allowed_shapes',
      expectedEntries: REQUIRED_GROWTH_ALLOWED_SHAPES
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: DATA_MINIMIZATION_FILE,
      path: 'purpose_limits.growth_or_analytics.forbidden_shapes',
      field: 'purpose_limits.growth_or_analytics.forbidden_shapes',
      requiredEntries: REQUIRED_GROWTH_FORBIDDEN_SHAPES
    }),
    ...validateExactValue({
      value,
      file: DATA_MINIMIZATION_FILE,
      path: 'retention.raw_source_retention_allowed',
      expected: false,
      message: 'Privacy minimization must not allow raw source retention.'
    }),
    ...validatePositiveSafeInteger({
      value,
      file: DATA_MINIMIZATION_FILE,
      path: 'retention.derived_decision_retention_days',
      message:
        'Privacy minimization derived decision retention must be a positive integer number of days.'
    }),
    ...validateMaxNumber({
      value,
      file: DATA_MINIMIZATION_FILE,
      path: 'retention.derived_decision_retention_days',
      max: 30,
      message: 'Privacy minimization derived decision retention must be 30 days or less.'
    }),
    ...validateExactValue({
      value,
      file: DATA_MINIMIZATION_FILE,
      path: 'retention.audit_retention_policy',
      expected: 'core-audit-retention',
      message:
        'Privacy minimization audit evidence must use the core audit retention policy.'
    }),
    ...validateExactValue({
      value,
      file: DATA_MINIMIZATION_FILE,
      path: 'retention.deletion_requires_evidence',
      expected: true,
      message: 'Privacy minimization deletion must require evidence.'
    }),
    ...validateExactValue({
      value,
      file: DATA_MINIMIZATION_FILE,
      path: 'logging.log_raw_payload',
      expected: false,
      message: 'Privacy minimization must not log raw payloads.'
    }),
    ...validateExactValue({
      value,
      file: DATA_MINIMIZATION_FILE,
      path: 'logging.log_capability_token',
      expected: false,
      message: 'Privacy minimization must not log capability tokens.'
    }),
    ...validateExactValue({
      value,
      file: DATA_MINIMIZATION_FILE,
      path: 'logging.log_policy_inputs',
      expected: 'bounded_metadata_only',
      message:
        'Privacy minimization may log only bounded metadata policy inputs.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: DATA_MINIMIZATION_FILE,
      path: 'logging.required_identifiers',
      field: 'logging.required_identifiers',
      requiredEntries: REQUIRED_POLICY_LOG_IDENTIFIERS
    }),
    ...validateExactValue({
      value,
      file: DATA_MINIMIZATION_FILE,
      path: 'implementation_guards.masking_required_before_output',
      expected: true,
      message: 'Privacy minimization must require masking before output.'
    }),
    ...validateExactValue({
      value,
      file: DATA_MINIMIZATION_FILE,
      path: 'implementation_guards.raw_source_response_allowed',
      expected: false,
      message: 'Privacy minimization must not allow raw source responses.'
    }),
    ...validateExactValue({
      value,
      file: DATA_MINIMIZATION_FILE,
      path: 'implementation_guards.redaction_evidence_required',
      expected: true,
      message: 'Privacy minimization must require redaction evidence.'
    }),
    ...validateExactValue({
      value,
      file: DATA_MINIMIZATION_FILE,
      path: 'implementation_guards.source_proxy_route_requires_masking_review',
      expected: true,
      message:
        'Privacy minimization must require masking review before source proxy routes are added.'
    })
  ];
}

export function validateAccessCapabilityContract(value: unknown): readonly Diagnostic[] {
  return [
    ...validatePositiveSafeInteger({
      value,
      file: ACCESS_CAPABILITY_FILE,
      path: 'capability.max_ttl_seconds',
      message:
        'Legacy privacy access capability max TTL must be a positive integer number of seconds.'
    }),
    ...validateMaxNumber({
      value,
      file: ACCESS_CAPABILITY_FILE,
      path: 'capability.max_ttl_seconds',
      max: 300,
      message: 'Legacy privacy access capability max TTL must be 300 seconds or less.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: ACCESS_CAPABILITY_FILE,
      path: 'capability.requires',
      field: 'capability.requires',
      requiredEntries: [
        'actor_id',
        'tenant_id',
        'purpose',
        'resource_scope',
        'consent_reference'
      ]
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: ACCESS_CAPABILITY_FILE,
      path: 'forbidden',
      field: 'forbidden',
      requiredEntries: [
        'raw_oauth_token_return',
        'unscoped_source_data_access',
        'unaudited_ai_data_access'
      ]
    })
  ];
}
