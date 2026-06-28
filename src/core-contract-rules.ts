import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { Diagnostic } from './diagnostics.ts';
import {
  createCoreDiagnostic,
  formatError,
  hasRequiredBoundaryField,
  isMissingPathError,
  isRecord,
  readPath,
  readRepositoryName,
  readStringArrayPath,
  readStringField,
  validateExactValue,
  validateRequiredStringArrayEntries
} from './rules/core/contract-helpers.ts';
import {
  createRequiredAuthRuntimeReadinessGates,
  validateAuthRuntimeReadinessContract
} from './rules/core/auth-runtime-readiness.ts';
import {
  AUTH_DURABLE_STORAGE_ADMISSION_BOUNDARY_STATUS,
  AUTH_DURABLE_STORAGE_ADMISSION_FILE,
  AUTH_DURABLE_STORAGE_MIGRATION_READINESS_BOUNDARY_STATUS,
  AUTH_DURABLE_STORAGE_MIGRATION_READINESS_FILE,
  AUTH_DURABLE_STORAGE_MIGRATION_READINESS_STATUS,
  AUTH_DURABLE_STORAGE_TRANSACTION_OUTBOX_BOUNDARY_STATUS,
  AUTH_DURABLE_STORAGE_TRANSACTION_OUTBOX_FILE,
  AUTH_DURABLE_STORAGE_TRANSACTION_OUTBOX_STATUS,
  validateAuthDurableStorageAdmissionContract,
  validateAuthDurableStorageMigrationReadinessContract,
  validateAuthDurableStorageTransactionOutboxContract
} from './rules/core/auth-durable-storage.ts';

const CORE_REPOSITORY_NAME = 'zdp-core-platform';

const CORE_CI_WORKFLOW_FILE = '.github/workflows/ci.yml';
const CORE_BOUNDARIES_FILE = 'contracts/core-boundaries.yaml';
const COMMAND_ENVELOPE_FILE = 'contracts/command-envelope.yaml';
const AUDIT_EVENT_FILE = 'contracts/audit-event.yaml';
const CONSENT_RECORD_FILE = 'contracts/consent-record.yaml';
const CORE_DB_SCHEMA_FILE = 'contracts/core-db-schema.yaml';
const CORE_FOUNDATION_MIGRATION_FILE =
  'migrations/postgresql/0001_core_foundation.sql';
const AUTH_SESSION_RUNTIME_FILE = 'contracts/auth-session-runtime.yaml';
const AUTH_RUNTIME_READINESS_FILE = 'contracts/auth-runtime-readiness.yaml';
const AUTH_RUNTIME_ADMISSION_CONTEXT_FILE =
  'contracts/auth-runtime-admission-context.yaml';
const AUTH_RUNTIME_COMMAND_PROPAGATION_FILE =
  'contracts/auth-runtime-command-propagation.yaml';
const IDENTITY_SESSION_STORE_FILE = 'contracts/identity-session-store.yaml';
const AUTH_CREDENTIAL_VAULT_HANDOFF_FILE =
  'contracts/auth-credential-vault-handoff.yaml';
const AUTH_PASSKEY_CHALLENGE_STORE_FILE =
  'contracts/auth-passkey-challenge-store.yaml';
const AUTH_OAUTH_CALLBACK_STATE_FILE =
  'contracts/auth-oauth-callback-state.yaml';
const AUTH_AUDIT_EVENT_PERSISTENCE_FILE =
  'contracts/auth-audit-event-persistence.yaml';
const AUTH_AUDIT_STORAGE_ADAPTER_FILE =
  'contracts/auth-audit-storage-adapter.yaml';
const CORE_EVENT_OUTBOX_FILE = 'contracts/core-event-outbox.yaml';
const AUTH_IDEMPOTENCY_STORAGE_FILE = 'contracts/auth-idempotency-storage.yaml';

const AUTH_SESSION_RUNTIME_STATUS = 'contracted_no_live_handler';
const AUTH_RUNTIME_READINESS_STATUS =
  'readiness_summary_no_runtime_promotion';
const AUTH_RUNTIME_ADMISSION_CONTEXT_STATUS = 'contract_only_no_live_handler';
const AUTH_RUNTIME_ADMISSION_CONTEXT_BOUNDARY_STATUS =
  'typed_admission_boundary_no_live_handler';
const AUTH_RUNTIME_COMMAND_PROPAGATION_STATUS = 'contract_only_no_live_handler';
const AUTH_RUNTIME_COMMAND_PROPAGATION_BOUNDARY_STATUS =
  'typed_propagation_boundary_no_live_handler';
const IDENTITY_SESSION_STORE_STATUS = 'migration_shape_declared_no_adapter';
const AUTH_CREDENTIAL_VAULT_HANDOFF_STATUS =
  'contract_only_no_capability_client';
const AUTH_CREDENTIAL_VAULT_CAPABILITY_CLIENT_BOUNDARY_STATUS =
  'typed_capability_client_boundary_no_vault_client';
const AUTH_PASSKEY_CHALLENGE_STORE_STATUS = 'contract_only_no_storage';
const AUTH_PASSKEY_CHALLENGE_STORE_ADAPTER_BOUNDARY_STATUS =
  'typed_adapter_boundary_no_migration';
const AUTH_OAUTH_CALLBACK_STATE_STATUS = 'contract_only_no_storage';
const AUTH_OAUTH_CALLBACK_STATE_ADAPTER_BOUNDARY_STATUS =
  'typed_adapter_boundary_no_migration';
const AUTH_AUDIT_EVENT_PERSISTENCE_STATUS =
  'append_receipt_gate_no_durable_store';
const AUTH_AUDIT_STORAGE_ADAPTER_STATUS = 'contract_only_no_adapter';
const AUTH_AUDIT_STORAGE_ADAPTER_BOUNDARY_STATUS =
  'typed_adapter_boundary_no_migration';
const CORE_EVENT_OUTBOX_STATUS = 'migration_shape_declared_no_dispatcher';
const AUTH_IDEMPOTENCY_STORAGE_STATUS = 'contract_only_no_storage';
const IDENTITY_SESSION_STORE_ADAPTER_BOUNDARY_STATUS =
  'typed_adapter_boundary_no_migration';
const AUTH_IDEMPOTENCY_STORAGE_ADAPTER_BOUNDARY_STATUS =
  'typed_adapter_boundary_no_migration';
const AUTH_SESSION_CATALOG_SOURCE =
  'zdp-api-contracts/contracts/apis/catalog.yaml';

const REQUIRED_CORE_CI_WORKFLOW_SNIPPETS = [
  'actions/checkout@v7',
  'dtolnay/rust-toolchain@stable',
  'components: rustfmt',
  'cargo fmt --check',
  'cargo check --locked --all-targets',
  'cargo test --locked',
  'permissions:',
  'contents: read',
  'pull_request:',
  'timeout-minutes: 15'
] as const;

const REQUIRED_BOUNDARIES = [
  'identity',
  'accounts',
  'access',
  'consent',
  'audit'
] as const;

const REQUIRED_BOUNDARY_FIELDS = [
  'owns',
  'must_not_own',
  'db_schema',
  'db_role',
  'audit_required',
  'split_trigger'
] as const;

const REQUIRED_RBAC_ROLES = [
  'owner',
  'admin',
  'member',
  'viewer',
  'service_account'
] as const;

const REQUIRED_COMMAND_FIELDS = [
  'command_id',
  'actor_id',
  'tenant_id',
  'reason',
  'idempotency_key'
] as const;

const REQUIRED_AUDIT_FORBIDDEN_VALUES = [
  'raw_secret',
  'token',
  'authorization_header',
  'raw_personal_payload'
] as const;

const REQUIRED_CONSENT_FIELDS = [
  'purpose',
  'scope',
  'withdrawal_record',
  'evidence_ref'
] as const;

const REQUIRED_AUTH_SESSION_RUNTIME_OPERATIONS = [
  {
    operationId: 'core.auth.registrations.create',
    sessionEffect: 'none'
  },
  {
    operationId: 'core.auth.sessions.create',
    sessionEffect: 'issue'
  },
  {
    operationId: 'core.auth.sessions.refresh',
    sessionEffect: 'refresh'
  },
  {
    operationId: 'core.auth.sessions.revoke_current',
    sessionEffect: 'revoke'
  },
  {
    operationId: 'core.auth.recovery_requests.create',
    sessionEffect: 'none'
  },
  {
    operationId: 'core.auth.passkey_challenges.create',
    sessionEffect: 'none'
  },
  {
    operationId: 'core.auth.passkey_assertions.verify',
    sessionEffect: 'issue'
  },
  {
    operationId: 'core.auth.oauth_callbacks.accept',
    sessionEffect: 'issue'
  }
] as const;

const REQUIRED_AUTH_SESSION_HANDOFF_CONTROLS = [
  'request_id_propagation',
  'trace_id_propagation',
  'idempotency_key_scope',
  'audit_event_emission',
  'session_store_contract',
  'credential_vault_handoff',
  'passkey_challenge_store_contract',
  'oauth_callback_state_verification',
  'refresh_token_rotation_without_plaintext_storage'
] as const;

const REQUIRED_AUTH_SESSION_PROMOTION_BLOCKERS = [
  'no_identity_session_store_implementation',
  'no_credential_vault_capability_handoff_implementation',
  'no_passkey_challenge_store_implementation',
  'no_auth_audit_event_persistence_implementation',
  'no_idempotency_storage_implementation',
  'no_product_reviewer_approval'
] as const;

const REQUIRED_AUTH_SESSION_FORBIDDEN_RUNTIME_CLAIMS = [
  'live_login_handler',
  'live_session_issue_handler',
  'live_session_refresh_handler',
  'live_session_revoke_handler',
  'plaintext_refresh_token_storage',
  'provider_secret_storage',
  'product_authorization_decision'
] as const;

const REQUIRED_AUTH_RUNTIME_READINESS_GATES =
  createRequiredAuthRuntimeReadinessGates({
    authSessionRuntimeFile: AUTH_SESSION_RUNTIME_FILE,
    authRuntimeAdmissionContextFile: AUTH_RUNTIME_ADMISSION_CONTEXT_FILE,
    authRuntimeAdmissionContextBoundaryStatus:
      AUTH_RUNTIME_ADMISSION_CONTEXT_BOUNDARY_STATUS,
    authRuntimeCommandPropagationFile: AUTH_RUNTIME_COMMAND_PROPAGATION_FILE,
    identitySessionStoreFile: IDENTITY_SESSION_STORE_FILE,
    identitySessionStoreStatus: IDENTITY_SESSION_STORE_STATUS,
    identitySessionStoreAdapterBoundaryStatus:
      IDENTITY_SESSION_STORE_ADAPTER_BOUNDARY_STATUS,
    authDurableStorageAdmissionFile: AUTH_DURABLE_STORAGE_ADMISSION_FILE,
    authDurableStorageMigrationReadinessFile:
      AUTH_DURABLE_STORAGE_MIGRATION_READINESS_FILE,
    authDurableStorageMigrationReadinessStatus:
      AUTH_DURABLE_STORAGE_MIGRATION_READINESS_STATUS,
    authDurableStorageMigrationReadinessBoundaryStatus:
      AUTH_DURABLE_STORAGE_MIGRATION_READINESS_BOUNDARY_STATUS,
    authDurableStorageTransactionOutboxFile:
      AUTH_DURABLE_STORAGE_TRANSACTION_OUTBOX_FILE,
    authDurableStorageTransactionOutboxStatus:
      AUTH_DURABLE_STORAGE_TRANSACTION_OUTBOX_STATUS,
    authDurableStorageTransactionOutboxBoundaryStatus:
      AUTH_DURABLE_STORAGE_TRANSACTION_OUTBOX_BOUNDARY_STATUS,
    authCredentialVaultHandoffFile: AUTH_CREDENTIAL_VAULT_HANDOFF_FILE,
    authCredentialVaultHandoffStatus: AUTH_CREDENTIAL_VAULT_HANDOFF_STATUS,
    authCredentialVaultCapabilityClientBoundaryStatus:
      AUTH_CREDENTIAL_VAULT_CAPABILITY_CLIENT_BOUNDARY_STATUS,
    authPasskeyChallengeStoreFile: AUTH_PASSKEY_CHALLENGE_STORE_FILE,
    authPasskeyChallengeStoreStatus: AUTH_PASSKEY_CHALLENGE_STORE_STATUS,
    authPasskeyChallengeStoreAdapterBoundaryStatus:
      AUTH_PASSKEY_CHALLENGE_STORE_ADAPTER_BOUNDARY_STATUS,
    authOauthCallbackStateFile: AUTH_OAUTH_CALLBACK_STATE_FILE,
    authOauthCallbackStateStatus: AUTH_OAUTH_CALLBACK_STATE_STATUS,
    authOauthCallbackStateAdapterBoundaryStatus:
      AUTH_OAUTH_CALLBACK_STATE_ADAPTER_BOUNDARY_STATUS,
    authAuditEventPersistenceFile: AUTH_AUDIT_EVENT_PERSISTENCE_FILE,
    authAuditEventPersistenceStatus: AUTH_AUDIT_EVENT_PERSISTENCE_STATUS,
    authAuditStorageAdapterFile: AUTH_AUDIT_STORAGE_ADAPTER_FILE,
    authAuditStorageAdapterStatus: AUTH_AUDIT_STORAGE_ADAPTER_STATUS,
    authAuditStorageAdapterBoundaryStatus:
      AUTH_AUDIT_STORAGE_ADAPTER_BOUNDARY_STATUS,
    authIdempotencyStorageFile: AUTH_IDEMPOTENCY_STORAGE_FILE,
    authIdempotencyStorageStatus: AUTH_IDEMPOTENCY_STORAGE_STATUS,
    authIdempotencyStorageAdapterBoundaryStatus:
      AUTH_IDEMPOTENCY_STORAGE_ADAPTER_BOUNDARY_STATUS
  });

const AUTH_DURABLE_STORAGE_CONTRACT_REFS = {
  authSessionRuntimeStatus: AUTH_SESSION_RUNTIME_STATUS,
  authRuntimeReadinessFile: AUTH_RUNTIME_READINESS_FILE,
  authRuntimeAdmissionContextFile: AUTH_RUNTIME_ADMISSION_CONTEXT_FILE,
  authRuntimeCommandPropagationFile: AUTH_RUNTIME_COMMAND_PROPAGATION_FILE
} as const;

const REQUIRED_AUTH_RUNTIME_ADMISSION_CONTEXT_FIELDS = [
  'operation_id',
  'actor_id',
  'tenant_id',
  'request_id',
  'trace_id',
  'idempotency_key',
  'command_id',
  'requested_at',
  'session_effect',
  'audit_event_ref',
  'resource_ref'
] as const;

const REQUIRED_AUTH_RUNTIME_ADMISSION_CONTEXT_OPTIONAL_FIELDS = [
  'correlation_id',
  'causation_id',
  'source'
] as const;

const REQUIRED_AUTH_RUNTIME_ADMISSION_CONTEXT_CONTROLS = [
  'command_envelope_composition',
  'operation_id_matches_command_type',
  'operation_session_effect_match',
  'request_id_required',
  'trace_id_required',
  'idempotency_key_scope',
  'tenant_actor_scope',
  'resource_scope_required',
  'audit_event_reference',
  'correlation_causation_propagation',
  'raw_credential_payload_rejected',
  'raw_provider_payload_rejected',
  'no_live_handler'
] as const;

const REQUIRED_AUTH_RUNTIME_ADMISSION_CONTEXT_FORBIDDEN_VALUES = [
  'raw_request_body',
  'raw_secret',
  'refresh_token_plaintext',
  'oauth_refresh_token_plaintext',
  'provider_secret',
  'authorization_header',
  'cookie_header',
  'raw_provider_payload',
  'raw_provider_error',
  'password_plaintext',
  'password_hash',
  'authorization_code',
  'oauth_access_token',
  'passkey_private_key',
  'client_data_json',
  'attestation_object'
] as const;

const REQUIRED_AUTH_RUNTIME_ADMISSION_CONTEXT_FORBIDDEN_CLAIMS = [
  'live_auth_handler_ready',
  'durable_storage_ready',
  'provider_token_exchange_ready',
  'product_route_unblocked'
] as const;

const REQUIRED_AUTH_RUNTIME_COMMAND_PROPAGATION_FIELDS = [
  'operation_id',
  'session_effect',
  'actor_id',
  'tenant_id',
  'request_id',
  'trace_id',
  'idempotency_key',
  'command_id',
  'audit_event_ref',
  'resource_ref'
] as const;

const REQUIRED_AUTH_RUNTIME_COMMAND_PROPAGATION_TARGETS = [
  'session_store',
  'passkey_challenge_store',
  'oauth_callback_state_store',
  'auth_audit_event',
  'idempotency_record'
] as const;

const REQUIRED_AUTH_RUNTIME_COMMAND_PROPAGATION_CONTROLS = [
  'admission_context_source',
  'target_scope_declared',
  'request_id_preserved',
  'trace_id_preserved',
  'idempotency_key_preserved',
  'command_id_preserved',
  'audit_event_ref_preserved',
  'tenant_actor_scope_preserved',
  'resource_ref_preserved',
  'raw_credential_payload_rejected',
  'raw_provider_payload_rejected',
  'no_live_handler'
] as const;

const REQUIRED_AUTH_RUNTIME_COMMAND_PROPAGATION_FORBIDDEN_VALUES = [
  'raw_request_body',
  'raw_secret',
  'refresh_token_plaintext',
  'oauth_refresh_token_plaintext',
  'provider_secret',
  'authorization_header',
  'cookie_header',
  'raw_provider_payload',
  'raw_provider_error',
  'password_plaintext',
  'password_hash',
  'authorization_code',
  'oauth_access_token',
  'passkey_private_key',
  'client_data_json',
  'attestation_object'
] as const;

const REQUIRED_AUTH_RUNTIME_COMMAND_PROPAGATION_FORBIDDEN_CLAIMS = [
  'live_auth_handler_ready',
  'durable_request_propagation_ready',
  'durable_storage_ready',
  'provider_token_exchange_ready',
  'product_route_unblocked'
] as const;

const REQUIRED_IDENTITY_SESSION_STORE_FIELDS = [
  'session_id',
  'subject_id',
  'tenant_id',
  'session_version',
  'state',
  'issued_at',
  'expires_at',
  'refresh_token_family_id',
  'refresh_token_hash',
  'rotation_counter',
  'created_by_command_id',
  'command_id',
  'idempotency_key',
  'trace_id',
  'audit_event_ref'
] as const;

const REQUIRED_IDENTITY_SESSION_STORE_STATES = [
  'active',
  'refreshed',
  'revoked',
  'expired',
  'compromised'
] as const;

const REQUIRED_IDENTITY_SESSION_REFRESH_ROTATION_FIELDS = [
  'refresh_token_family_id',
  'refresh_token_hash',
  'previous_refresh_token_hash',
  'rotation_counter',
  'rotated_at',
  'rotated_by_command_id',
  'trace_id'
] as const;

const REQUIRED_IDENTITY_SESSION_REVOCATION_FIELDS = [
  'revoked_at',
  'revoked_by_actor_id',
  'revoke_reason',
  'revocation_command_id',
  'trace_id'
] as const;

const REQUIRED_IDENTITY_SESSION_STORE_CONTROLS = [
  'tenant_actor_scope',
  'opaque_session_id',
  'hashed_refresh_token_only',
  'refresh_token_rotation',
  'refresh_reuse_detection',
  'revoke_current_session',
  'revoke_family_on_reuse',
  'ttl_enforced_by_storage',
  'command_idempotency_reference',
  'audit_event_reference'
] as const;

const REQUIRED_IDENTITY_SESSION_STORE_UNIQUENESS = [
  'session_id',
  'refresh_token_hash',
  'created_by_command_id'
] as const;

const REQUIRED_IDENTITY_SESSION_STORE_ADAPTER_KINDS = [
  'transactional_session_store',
  'session_state_table'
] as const;

const REQUIRED_IDENTITY_SESSION_STORE_ADAPTER_FIELDS = [
  'adapter_id',
  'storage_ref',
  'transaction_boundary_ref',
  'issue_receipt_ref',
  'refresh_receipt_ref',
  'revoke_receipt_ref',
  'reuse_detection_ref',
  'migration_or_adapter_review_ref'
] as const;

const REQUIRED_IDENTITY_SESSION_STORE_ADAPTER_CONTROLS = [
  'unique_session_id_enforced_by_storage',
  'unique_refresh_token_hash_enforced_by_storage',
  'atomic_refresh_rotation',
  'reuse_detection_blocks_family',
  'revocation_state_enforced_by_storage',
  'ttl_enforced_by_storage',
  'audit_event_reference_required',
  'no_plaintext_refresh_token_storage'
] as const;

const REQUIRED_IDENTITY_SESSION_FORBIDDEN_STORAGE_VALUES = [
  'refresh_token_plaintext',
  'session_secret_plaintext',
  'oauth_refresh_token_plaintext',
  'provider_secret',
  'authorization_header',
  'cookie_header',
  'raw_provider_payload',
  'password_hash'
] as const;

const REQUIRED_AUTH_CREDENTIAL_VAULT_FIELDS = [
  'capability_ref',
  'capability_subject_id',
  'tenant_id',
  'capability_scope',
  'credential_kind',
  'issued_at',
  'expires_at',
  'created_by_command_id',
  'trace_id'
] as const;

const REQUIRED_AUTH_CREDENTIAL_VAULT_KINDS = [
  'oauth_refresh_token',
  'passkey_credential',
  'password_recovery_secret',
  'session_refresh_token_material'
] as const;

const REQUIRED_AUTH_CREDENTIAL_VAULT_SCOPES = [
  'store_credential',
  'read_credential_metadata',
  'rotate_credential',
  'revoke_credential'
] as const;

const REQUIRED_AUTH_CREDENTIAL_VAULT_CONTROLS = [
  'vault_capability_ref_only',
  'short_lived_capability',
  'tenant_actor_scope',
  'request_id_propagation',
  'trace_id_propagation',
  'command_idempotency_reference',
  'audit_event_reference',
  'no_raw_secret_return',
  'vault_access_audit_required'
] as const;

const REQUIRED_AUTH_CREDENTIAL_VAULT_CAPABILITY_CLIENT_KINDS = [
  'vault_capability_client',
  'credential_metadata_client'
] as const;

const REQUIRED_AUTH_CREDENTIAL_VAULT_CAPABILITY_CLIENT_FIELDS = [
  'client_id',
  'vault_owner_ref',
  'capability_ref',
  'capability_subject_id',
  'tenant_id',
  'credential_kind',
  'capability_scope',
  'issued_at',
  'expires_at',
  'created_by_command_id',
  'idempotency_key',
  'trace_id',
  'request_id',
  'audit_event_ref',
  'vault_access_audit_ref',
  'review_or_client_implementation_ref'
] as const;

const REQUIRED_AUTH_CREDENTIAL_VAULT_CAPABILITY_CLIENT_CONTROLS = [
  'capability_ref_only',
  'metadata_only_response',
  'short_lived_capability',
  'tenant_actor_scope',
  'request_id_propagation',
  'trace_id_propagation',
  'command_idempotency_reference',
  'audit_event_reference_required',
  'vault_access_audit_required',
  'raw_secret_material_rejected',
  'no_provider_payload_storage'
] as const;

const REQUIRED_AUTH_CREDENTIAL_VAULT_FORBIDDEN_VALUES = [
  'refresh_token_plaintext',
  'oauth_refresh_token_plaintext',
  'provider_secret',
  'passkey_private_key',
  'password_plaintext',
  'password_hash',
  'authorization_header',
  'cookie_header',
  'raw_provider_payload'
] as const;

const REQUIRED_AUTH_PASSKEY_CHALLENGE_FIELDS = [
  'challenge_id',
  'ceremony_type',
  'actor_id',
  'tenant_id',
  'challenge_hash',
  'relying_party_id',
  'state',
  'issued_at',
  'expires_at',
  'created_by_command_id',
  'idempotency_key',
  'trace_id',
  'audit_event_ref'
] as const;

const REQUIRED_AUTH_PASSKEY_CHALLENGE_RECOMMENDED_FIELDS = [
  'request_id',
  'consumed_at',
  'consumed_by_command_id',
  'expired_at'
] as const;

const REQUIRED_AUTH_PASSKEY_CHALLENGE_STATES = [
  'active',
  'consumed',
  'expired',
  'revoked'
] as const;

const REQUIRED_AUTH_PASSKEY_CHALLENGE_CEREMONY_TYPES = [
  'registration',
  'authentication',
  'recovery'
] as const;

const REQUIRED_AUTH_PASSKEY_CHALLENGE_CONTROLS = [
  'tenant_actor_scope',
  'challenge_hash_only',
  'single_use_challenge',
  'consume_requires_active_state',
  'ttl_enforced_by_storage',
  'command_idempotency_reference',
  'request_id_propagation',
  'trace_id_propagation',
  'audit_event_reference',
  'replay_rejected_after_consumption'
] as const;

const REQUIRED_AUTH_PASSKEY_CHALLENGE_UNIQUENESS = [
  'challenge_id',
  'challenge_hash',
  'created_by_command_id'
] as const;

const REQUIRED_AUTH_PASSKEY_CHALLENGE_ADAPTER_KINDS = [
  'passkey_challenge_hash_store',
  'passkey_challenge_state_table'
] as const;

const REQUIRED_AUTH_PASSKEY_CHALLENGE_ADAPTER_FIELDS = [
  'adapter_id',
  'storage_ref',
  'transaction_boundary_ref',
  'issue_receipt_ref',
  'consume_receipt_ref',
  'expire_receipt_ref',
  'migration_or_adapter_review_ref'
] as const;

const REQUIRED_AUTH_PASSKEY_CHALLENGE_ADAPTER_CONTROLS = [
  'unique_challenge_id_enforced_by_storage',
  'unique_challenge_hash_enforced_by_storage',
  'challenge_version_enforced_by_storage',
  'atomic_single_use_consume',
  'active_state_required_for_consume',
  'ttl_enforced_by_storage',
  'audit_event_reference_required',
  'no_raw_webauthn_payload_storage'
] as const;

const REQUIRED_AUTH_PASSKEY_CHALLENGE_FORBIDDEN_VALUES = [
  'passkey_challenge_plaintext',
  'client_data_json',
  'attestation_object',
  'authenticator_data',
  'signature',
  'user_handle_raw',
  'provider_secret',
  'authorization_header',
  'cookie_header',
  'raw_provider_payload'
] as const;

const REQUIRED_AUTH_OAUTH_CALLBACK_STATE_FIELDS = [
  'state_id',
  'provider_id',
  'actor_id',
  'tenant_id',
  'callback_state_hash',
  'nonce_hash',
  'pkce_verifier_ref',
  'redirect_uri_ref',
  'state',
  'issued_at',
  'expires_at',
  'created_by_command_id',
  'idempotency_key',
  'trace_id',
  'audit_event_ref'
] as const;

const REQUIRED_AUTH_OAUTH_CALLBACK_STATE_RECOMMENDED_FIELDS = [
  'request_id',
  'consumed_at',
  'consumed_by_command_id',
  'expired_at',
  'revoked_at',
  'revoked_by_command_id'
] as const;

const REQUIRED_AUTH_OAUTH_CALLBACK_STATE_STATES = [
  'active',
  'consumed',
  'expired',
  'revoked'
] as const;

const REQUIRED_AUTH_OAUTH_CALLBACK_STATE_CONTROLS = [
  'tenant_actor_scope',
  'callback_state_hash_only',
  'nonce_hash_only',
  'pkce_verifier_ref_only',
  'redirect_uri_ref_only',
  'single_use_callback_state',
  'consume_requires_active_state',
  'provider_id_scope',
  'ttl_enforced_by_storage',
  'command_idempotency_reference',
  'request_id_propagation',
  'trace_id_propagation',
  'audit_event_reference',
  'replay_rejected_after_consumption',
  'raw_provider_payload_rejected'
] as const;

const REQUIRED_AUTH_OAUTH_CALLBACK_STATE_UNIQUENESS = [
  'state_id',
  'callback_state_hash',
  'created_by_command_id'
] as const;

const REQUIRED_AUTH_OAUTH_CALLBACK_STATE_ADAPTER_KINDS = [
  'oauth_callback_state_hash_store',
  'oauth_callback_state_table'
] as const;

const REQUIRED_AUTH_OAUTH_CALLBACK_STATE_ADAPTER_FIELDS = [
  'adapter_id',
  'storage_ref',
  'transaction_boundary_ref',
  'issue_receipt_ref',
  'consume_receipt_ref',
  'expire_receipt_ref',
  'revoke_receipt_ref',
  'migration_or_adapter_review_ref'
] as const;

const REQUIRED_AUTH_OAUTH_CALLBACK_STATE_ADAPTER_CONTROLS = [
  'unique_state_id_enforced_by_storage',
  'unique_callback_state_hash_enforced_by_storage',
  'state_version_enforced_by_storage',
  'atomic_single_use_consume',
  'active_state_required_for_consume',
  'ttl_enforced_by_storage',
  'audit_event_reference_required',
  'no_raw_oauth_payload_storage'
] as const;

const REQUIRED_AUTH_OAUTH_CALLBACK_STATE_FORBIDDEN_VALUES = [
  'oauth_callback_state_plaintext',
  'callback_state_plaintext',
  'oauth_state_plaintext',
  'nonce_plaintext',
  'pkce_verifier_plaintext',
  'authorization_code',
  'oauth_access_token',
  'oauth_refresh_token_plaintext',
  'provider_secret',
  'authorization_header',
  'cookie_header',
  'raw_provider_payload',
  'raw_provider_error'
] as const;

const REQUIRED_AUTH_AUDIT_EVENT_FIELDS = [
  'event_id',
  'event_type',
  'actor_id',
  'tenant_id',
  'subject_ref',
  'auth_operation_id',
  'auth_session_effect',
  'outcome',
  'command_id',
  'idempotency_key',
  'occurred_at',
  'trace_id',
  'request_id',
  'transaction_or_outbox_ref'
] as const;

const REQUIRED_AUTH_AUDIT_EVENT_TYPES = [
  'core.auth.registration.requested',
  'core.auth.session.issued',
  'core.auth.session.refreshed',
  'core.auth.session.revoked',
  'core.auth.recovery.requested',
  'core.auth.passkey.challenge.created',
  'core.auth.passkey.assertion.verified',
  'core.auth.oauth.callback.accepted'
] as const;

const REQUIRED_AUTH_AUDIT_EVENT_CONTROLS = [
  'append_only_audit_store',
  'transaction_or_outbox_reference',
  'command_idempotency_reference',
  'request_id_propagation',
  'trace_id_propagation',
  'tenant_actor_scope',
  'redacted_summary_only',
  'evidence_ref_for_privileged_payload',
  'append_receipt_required_before_auth_success',
  'auth_failure_event_recorded',
  'audit_write_failure_blocks_auth_success'
] as const;

const REQUIRED_AUTH_AUDIT_FAILURE_EVENT_FIELDS = [
  'failure_evidence_ref'
] as const;

const REQUIRED_AUTH_AUDIT_EVENT_FORBIDDEN_VALUES = [
  'refresh_token_plaintext',
  'oauth_refresh_token_plaintext',
  'provider_secret',
  'passkey_private_key',
  'password_plaintext',
  'password_hash',
  'authorization_header',
  'cookie_header',
  'raw_provider_payload',
  'raw_error_payload'
] as const;

const REQUIRED_AUTH_AUDIT_STORAGE_ADAPTER_FIELDS = [
  'adapter_id',
  'adapter_kind',
  'owner_boundary',
  'storage_ref',
  'transaction_boundary_ref',
  'append_receipt_ref',
  'replay_or_reconciliation_ref',
  'migration_or_adapter_review_ref'
] as const;

const REQUIRED_AUTH_AUDIT_STORAGE_ADAPTER_KINDS = [
  'append_only_table',
  'transactional_outbox'
] as const;

const REQUIRED_AUTH_AUDIT_STORAGE_ADAPTER_CONTROLS = [
  'append_only_enforced_by_storage',
  'unique_event_id_enforced_by_storage',
  'transaction_or_outbox_atomicity',
  'audit_write_failure_blocks_auth_success',
  'redaction_checked_before_write',
  'raw_payload_rejected_before_write',
  'replay_or_reconciliation_path',
  'migration_or_adapter_review_required'
] as const;

const REQUIRED_AUTH_AUDIT_STORAGE_ADAPTER_FORBIDDEN_VALUES = [
  'refresh_token_plaintext',
  'oauth_refresh_token_plaintext',
  'provider_secret',
  'passkey_private_key',
  'password_plaintext',
  'password_hash',
  'authorization_header',
  'cookie_header',
  'raw_provider_payload',
  'raw_error_payload'
] as const;

const REQUIRED_CORE_EVENT_OUTBOX_PRODUCED_EVENTS = [
  'core.account.restricted',
  'core.account.restriction_cleared',
  'core.identity.email_verified',
  'core.identity.security_pin_changed',
  'core.identity.human_readiness_changed',
  'core.permission.role_assignment_changed',
  'core.access.api_key_changed',
  'core.consent.withdrawn'
] as const;

const REQUIRED_CORE_EVENT_OUTBOX_MONEY_RELEVANT_EVENTS = [
  'core.account.restricted',
  'core.account.restriction_cleared',
  'core.identity.email_verified',
  'core.identity.security_pin_changed',
  'core.identity.human_readiness_changed'
] as const;

const REQUIRED_CORE_EVENT_OUTBOX_FIELDS = [
  'cloud_event_id',
  'cloud_event_source',
  'cloud_event_type',
  'schema_version',
  'aggregate_type',
  'aggregate_id',
  'tenant_id',
  'actor_id',
  'subject_ref',
  'payload_ref',
  'redacted_summary',
  'causation_command_id',
  'idempotency_key',
  'audit_event_ref',
  'trace_id',
  'occurred_at',
  'available_at'
] as const;

const REQUIRED_CORE_EVENT_OUTBOX_DELIVERY_ATTEMPT_FIELDS = [
  'core_event_outbox_id',
  'consumer_service_id',
  'attempt_number',
  'delivery_state',
  'dispatcher_ref',
  'attempted_at',
  'audit_event_ref',
  'trace_id'
] as const;

const REQUIRED_CORE_EVENT_OUTBOX_CONTROLS = [
  'outbox_rows_are_append_only',
  'delivery_attempt_rows_are_append_only',
  'cloud_event_id_unique',
  'schema_version_positive_integer',
  'event_type_aggregate_command_unique',
  'payload_reference_only',
  'redacted_summary_only',
  'audit_event_reference_required',
  'command_idempotency_reference_required',
  'trace_reference_required',
  'dispatcher_ref_required_for_delivery_attempts',
  'no_dispatcher_claim_until_worker_exists'
] as const;

const REQUIRED_CORE_EVENT_OUTBOX_FORBIDDEN_VALUES = [
  'raw_password',
  'password_plaintext',
  'security_pin_plaintext',
  'raw_email',
  'phone_number',
  'authorization_header',
  'cookie_header',
  'refresh_token_plaintext',
  'provider_secret',
  'raw_personal_payload'
] as const;

const REQUIRED_CORE_EVENT_OUTBOX_FORBIDDEN_CLAIMS = [
  'event_dispatcher_ready',
  'event_replay_ready',
  'money_platform_realtime_sync_ready',
  'product_route_unblocked'
] as const;

const REQUIRED_AUTH_IDEMPOTENCY_STORAGE_FIELDS = [
  'idempotency_key',
  'command_id',
  'command_type',
  'actor_id',
  'tenant_id',
  'resource_ref',
  'request_fingerprint_hash',
  'processing_state',
  'final_status',
  'final_result_ref',
  'first_seen_at',
  'last_seen_at',
  'expires_at',
  'trace_id',
  'audit_event_ref'
] as const;

const REQUIRED_AUTH_IDEMPOTENCY_STORAGE_STATES = [
  'in_progress',
  'succeeded',
  'failed',
  'conflicted',
  'expired'
] as const;

const REQUIRED_AUTH_IDEMPOTENCY_STORAGE_CONTROLS = [
  'tenant_actor_scope',
  'command_type_scope',
  'resource_scope',
  'request_fingerprint_match',
  'same_request_replay_returns_saved_result',
  'different_fingerprint_conflict',
  'in_progress_duplicate_suppression',
  'ttl_enforced_by_storage',
  'atomic_claim_or_unique_constraint',
  'audit_event_reference',
  'no_raw_payload_storage'
] as const;

const REQUIRED_AUTH_IDEMPOTENCY_STORAGE_UNIQUENESS = [
  'tenant_id',
  'actor_id',
  'command_type',
  'resource_ref',
  'idempotency_key'
] as const;

const REQUIRED_AUTH_IDEMPOTENCY_STORAGE_ADAPTER_KINDS = [
  'atomic_unique_claim_table',
  'transactional_idempotency_record'
] as const;

const REQUIRED_AUTH_IDEMPOTENCY_STORAGE_ADAPTER_FIELDS = [
  'adapter_id',
  'storage_ref',
  'transaction_boundary_ref',
  'claim_receipt_ref',
  'replay_result_ref',
  'conflict_receipt_ref',
  'migration_or_adapter_review_ref'
] as const;

const REQUIRED_AUTH_IDEMPOTENCY_STORAGE_ADAPTER_CONTROLS = [
  'unique_scope_enforced_by_storage',
  'atomic_claim_or_conflict',
  'ttl_enforced_by_storage',
  'no_raw_payload_storage',
  'audit_event_reference_required'
] as const;

const REQUIRED_AUTH_IDEMPOTENCY_STORAGE_FORBIDDEN_VALUES = [
  'raw_request_body',
  'raw_secret',
  'refresh_token_plaintext',
  'oauth_refresh_token_plaintext',
  'provider_secret',
  'authorization_header',
  'cookie_header',
  'raw_provider_payload',
  'password_hash'
] as const;

export async function validateRepositoryCoreContract(input: {
  readonly repositoryRoot: string | undefined;
  readonly repositoryServiceContract: unknown;
}): Promise<readonly Diagnostic[]> {
  if (
    input.repositoryRoot === undefined ||
    readRepositoryName(input.repositoryServiceContract) !== CORE_REPOSITORY_NAME
  ) {
    return [];
  }

  const [
    ciWorkflow,
    boundaries,
    commandEnvelope,
    auditEvent,
    consentRecord,
    coreDbSchema,
    coreFoundationMigration,
    authSessionRuntime,
    authRuntimeReadiness,
    authRuntimeAdmissionContext,
    authRuntimeCommandPropagation,
    authDurableStorageAdmission,
    authDurableStorageMigrationReadiness,
    authDurableStorageTransactionOutbox,
    identitySessionStore,
    authCredentialVaultHandoff,
    authPasskeyChallengeStore,
    authOauthCallbackState,
    authAuditEventPersistence,
    authAuditStorageAdapter,
    coreEventOutbox,
    authIdempotencyStorage
  ] = await Promise.all([
      readRequiredTextFile(input.repositoryRoot, CORE_CI_WORKFLOW_FILE),
      readRequiredYamlContract(input.repositoryRoot, CORE_BOUNDARIES_FILE),
      readRequiredYamlContract(input.repositoryRoot, COMMAND_ENVELOPE_FILE),
      readRequiredYamlContract(input.repositoryRoot, AUDIT_EVENT_FILE),
      readRequiredYamlContract(input.repositoryRoot, CONSENT_RECORD_FILE),
      readRequiredYamlContract(input.repositoryRoot, CORE_DB_SCHEMA_FILE),
      readRequiredTextFile(input.repositoryRoot, CORE_FOUNDATION_MIGRATION_FILE),
      readRequiredYamlContract(input.repositoryRoot, AUTH_SESSION_RUNTIME_FILE),
      readRequiredYamlContract(input.repositoryRoot, AUTH_RUNTIME_READINESS_FILE),
      readRequiredYamlContract(input.repositoryRoot, AUTH_RUNTIME_ADMISSION_CONTEXT_FILE),
      readRequiredYamlContract(input.repositoryRoot, AUTH_RUNTIME_COMMAND_PROPAGATION_FILE),
      readRequiredYamlContract(input.repositoryRoot, AUTH_DURABLE_STORAGE_ADMISSION_FILE),
      readRequiredYamlContract(
        input.repositoryRoot,
        AUTH_DURABLE_STORAGE_MIGRATION_READINESS_FILE
      ),
      readRequiredYamlContract(
        input.repositoryRoot,
        AUTH_DURABLE_STORAGE_TRANSACTION_OUTBOX_FILE
      ),
      readRequiredYamlContract(input.repositoryRoot, IDENTITY_SESSION_STORE_FILE),
      readRequiredYamlContract(input.repositoryRoot, AUTH_CREDENTIAL_VAULT_HANDOFF_FILE),
      readRequiredYamlContract(input.repositoryRoot, AUTH_PASSKEY_CHALLENGE_STORE_FILE),
      readRequiredYamlContract(input.repositoryRoot, AUTH_OAUTH_CALLBACK_STATE_FILE),
      readRequiredYamlContract(input.repositoryRoot, AUTH_AUDIT_EVENT_PERSISTENCE_FILE),
      readRequiredYamlContract(input.repositoryRoot, AUTH_AUDIT_STORAGE_ADAPTER_FILE),
      readRequiredYamlContract(input.repositoryRoot, CORE_EVENT_OUTBOX_FILE),
      readRequiredYamlContract(input.repositoryRoot, AUTH_IDEMPOTENCY_STORAGE_FILE)
    ]);

  return [
    ...ciWorkflow.diagnostics,
    ...boundaries.diagnostics,
    ...commandEnvelope.diagnostics,
    ...auditEvent.diagnostics,
    ...consentRecord.diagnostics,
    ...coreDbSchema.diagnostics,
    ...coreFoundationMigration.diagnostics,
    ...authSessionRuntime.diagnostics,
    ...authRuntimeReadiness.diagnostics,
    ...authRuntimeAdmissionContext.diagnostics,
    ...authRuntimeCommandPropagation.diagnostics,
    ...authDurableStorageAdmission.diagnostics,
    ...authDurableStorageMigrationReadiness.diagnostics,
    ...authDurableStorageTransactionOutbox.diagnostics,
    ...identitySessionStore.diagnostics,
    ...authCredentialVaultHandoff.diagnostics,
    ...authPasskeyChallengeStore.diagnostics,
    ...authOauthCallbackState.diagnostics,
    ...authAuditEventPersistence.diagnostics,
    ...authAuditStorageAdapter.diagnostics,
    ...coreEventOutbox.diagnostics,
    ...authIdempotencyStorage.diagnostics,
    ...(ciWorkflow.value === null ? [] : validateCoreCiWorkflow(ciWorkflow.value)),
    ...(boundaries.value === null ? [] : validateCoreBoundaries(boundaries.value)),
    ...(commandEnvelope.value === null
      ? []
      : validateRequiredStringArrayEntries({
          value: commandEnvelope.value,
          file: COMMAND_ENVELOPE_FILE,
          path: 'required_fields',
          field: 'required_fields',
          requiredEntries: REQUIRED_COMMAND_FIELDS
        })),
    ...(auditEvent.value === null
      ? []
      : validateRequiredStringArrayEntries({
          value: auditEvent.value,
          file: AUDIT_EVENT_FILE,
          path: 'forbidden_payload_values',
          field: 'forbidden_payload_values',
          requiredEntries: REQUIRED_AUDIT_FORBIDDEN_VALUES
        })),
    ...(consentRecord.value === null
      ? []
      : validateConsentRecordContract(consentRecord.value)),
    ...(coreDbSchema.value === null
      ? []
      : validateCoreDbSchemaContract(coreDbSchema.value)),
    ...(coreFoundationMigration.value === null
      ? []
      : validateCoreFoundationMigration(coreFoundationMigration.value)),
    ...(authSessionRuntime.value === null
      ? []
      : validateAuthSessionRuntimeContract(authSessionRuntime.value)),
    ...(authRuntimeReadiness.value === null
      ? []
      : validateAuthRuntimeReadinessContract({
          value: authRuntimeReadiness.value,
          file: AUTH_RUNTIME_READINESS_FILE,
          status: AUTH_RUNTIME_READINESS_STATUS,
          runtimeStatus: AUTH_SESSION_RUNTIME_STATUS,
          requiredGates: REQUIRED_AUTH_RUNTIME_READINESS_GATES
        })),
    ...(authRuntimeAdmissionContext.value === null
      ? []
      : validateAuthRuntimeAdmissionContextContract(
          authRuntimeAdmissionContext.value
        )),
    ...(authRuntimeCommandPropagation.value === null
      ? []
      : validateAuthRuntimeCommandPropagationContract(
          authRuntimeCommandPropagation.value
        )),
    ...(authDurableStorageAdmission.value === null
      ? []
      : validateAuthDurableStorageAdmissionContract({
          value: authDurableStorageAdmission.value,
          refs: AUTH_DURABLE_STORAGE_CONTRACT_REFS
        })),
    ...(authDurableStorageMigrationReadiness.value === null
      ? []
      : validateAuthDurableStorageMigrationReadinessContract({
          value: authDurableStorageMigrationReadiness.value,
          refs: AUTH_DURABLE_STORAGE_CONTRACT_REFS
        })),
    ...(authDurableStorageTransactionOutbox.value === null
      ? []
      : validateAuthDurableStorageTransactionOutboxContract({
          value: authDurableStorageTransactionOutbox.value,
          refs: AUTH_DURABLE_STORAGE_CONTRACT_REFS
        })),
    ...(identitySessionStore.value === null
      ? []
      : validateIdentitySessionStoreContract(identitySessionStore.value)),
    ...(authCredentialVaultHandoff.value === null
      ? []
      : validateAuthCredentialVaultHandoffContract(authCredentialVaultHandoff.value)),
    ...(authPasskeyChallengeStore.value === null
      ? []
      : validateAuthPasskeyChallengeStoreContract(authPasskeyChallengeStore.value)),
    ...(authOauthCallbackState.value === null
      ? []
      : validateAuthOauthCallbackStateContract(authOauthCallbackState.value)),
    ...(authAuditEventPersistence.value === null
      ? []
      : validateAuthAuditEventPersistenceContract(authAuditEventPersistence.value)),
    ...(authAuditStorageAdapter.value === null
      ? []
      : validateAuthAuditStorageAdapterContract(authAuditStorageAdapter.value)),
    ...(coreEventOutbox.value === null
      ? []
      : validateCoreEventOutboxContract(coreEventOutbox.value)),
    ...(authIdempotencyStorage.value === null
      ? []
      : validateAuthIdempotencyStorageContract(authIdempotencyStorage.value))
  ];
}

async function readRequiredTextFile(
  repositoryRoot: string,
  file: string
): Promise<{
  readonly value: string | null;
  readonly diagnostics: readonly Diagnostic[];
}> {
  try {
    return {
      value: await readFile(join(repositoryRoot, file), 'utf8'),
      diagnostics: []
    };
  } catch (error) {
    if (isMissingPathError(error)) {
      return {
        value: null,
        diagnostics: [
          createCoreDiagnostic(
            file,
            'repository.root',
            `Core platform repository must include \`${file}\`.`
          )
        ]
      };
    }

    throw error;
  }
}

async function readRequiredYamlContract(
  repositoryRoot: string,
  file: string
): Promise<{
  readonly value: unknown | null;
  readonly diagnostics: readonly Diagnostic[];
}> {
  let source: string;

  try {
    source = await readFile(join(repositoryRoot, file), 'utf8');
  } catch (error) {
    if (isMissingPathError(error)) {
      return {
        value: null,
        diagnostics: [
          createCoreDiagnostic(
            file,
            'repository.root',
            `Core platform repository must include \`${file}\`.`
          )
        ]
      };
    }

    throw error;
  }

  try {
    return {
      value: parse(source) as unknown,
      diagnostics: []
    };
  } catch (error) {
    return {
      value: null,
      diagnostics: [
        createCoreDiagnostic(
          file,
          'yaml',
          `Core platform contract \`${file}\` must be valid YAML: ${formatError(
            error
          )}`
        )
      ]
    };
  }
}

function validateCoreCiWorkflow(source: string): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const snippet of REQUIRED_CORE_CI_WORKFLOW_SNIPPETS) {
    if (source.includes(snippet)) {
      continue;
    }

    diagnostics.push(
      createCoreDiagnostic(
        CORE_CI_WORKFLOW_FILE,
        'ci.workflow',
        `Core platform CI workflow must include \`${snippet}\`.`
      )
    );
  }

  return diagnostics;
}

function validateCoreBoundaries(value: unknown): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  diagnostics.push(
    ...validateRequiredStringArrayEntries({
      value,
      file: CORE_BOUNDARIES_FILE,
      path: 'permission_model.roles',
      field: 'permission_model.roles',
      requiredEntries: REQUIRED_RBAC_ROLES
    })
  );

  if (readPath(value, 'authorization.final_decision_owner') !== 'access') {
    diagnostics.push(
      createCoreDiagnostic(
        CORE_BOUNDARIES_FILE,
        'authorization.final_decision_owner',
        'Core platform final authorization owner must be `access`.'
      )
    );
  }

  const boundaries = readPath(value, 'boundaries');

  if (!Array.isArray(boundaries)) {
    diagnostics.push(
      createCoreDiagnostic(
        CORE_BOUNDARIES_FILE,
        'boundaries',
        'Core platform boundaries contract must declare a `boundaries` array.'
      )
    );
    return diagnostics;
  }

  const boundaryById = new Map<string, Record<string, unknown>>();

  for (const boundary of boundaries) {
    if (!isRecord(boundary)) {
      continue;
    }

    const id = readStringField(boundary, 'id');

    if (id !== null) {
      boundaryById.set(id, boundary);
    }
  }

  for (const boundaryId of REQUIRED_BOUNDARIES) {
    const boundary = boundaryById.get(boundaryId);

    if (boundary === undefined) {
      diagnostics.push(
        createCoreDiagnostic(
          CORE_BOUNDARIES_FILE,
          `boundaries.${boundaryId}`,
          `Core platform boundaries contract must declare \`${boundaryId}\` boundary.`
        )
      );
      continue;
    }

    for (const field of REQUIRED_BOUNDARY_FIELDS) {
      if (hasRequiredBoundaryField(boundary, field)) {
        continue;
      }

      diagnostics.push(
        createCoreDiagnostic(
          CORE_BOUNDARIES_FILE,
          `boundaries.${boundaryId}.${field}`,
          `Core platform boundary \`${boundaryId}\` must declare non-empty \`${field}\`.`
        )
      );
    }
  }

  return diagnostics;
}

function validateConsentRecordContract(value: unknown): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  diagnostics.push(
    ...validateRequiredStringArrayEntries({
      value,
      file: CONSENT_RECORD_FILE,
      path: 'required_fields',
      field: 'required_fields',
      requiredEntries: REQUIRED_CONSENT_FIELDS.filter(
        (field) => field !== 'withdrawal_record'
      )
    })
  );

  if (!isRecord(readPath(value, 'withdrawal_record'))) {
    diagnostics.push(
      createCoreDiagnostic(
        CONSENT_RECORD_FILE,
        'withdrawal_record',
        'Core platform consent contract must declare `withdrawal_record`.'
      )
    );
  }

  return diagnostics;
}

function validateAuthSessionRuntimeContract(value: unknown): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (readPath(value, 'contract.status') !== AUTH_SESSION_RUNTIME_STATUS) {
    diagnostics.push(
      createCoreDiagnostic(
        AUTH_SESSION_RUNTIME_FILE,
        'contract.status',
        `Core platform auth/session runtime contract must stay \`${AUTH_SESSION_RUNTIME_STATUS}\` until live handlers are reviewed.`
      )
    );
  }

  if (readPath(value, 'contract.catalog_source') !== AUTH_SESSION_CATALOG_SOURCE) {
    diagnostics.push(
      createCoreDiagnostic(
        AUTH_SESSION_RUNTIME_FILE,
        'contract.catalog_source',
        `Core platform auth/session runtime contract must reference \`${AUTH_SESSION_CATALOG_SOURCE}\`.`
      )
    );
  }

  const operations = readPath(value, 'required_operations');

  if (!Array.isArray(operations)) {
    diagnostics.push(
      createCoreDiagnostic(
        AUTH_SESSION_RUNTIME_FILE,
        'required_operations',
        'Core platform auth/session runtime contract must declare `required_operations`.'
      )
    );
  } else {
    diagnostics.push(...validateAuthSessionRuntimeOperations(operations));
  }

  diagnostics.push(
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_SESSION_RUNTIME_FILE,
      path: 'required_handoff_controls',
      field: 'required_handoff_controls',
      requiredEntries: REQUIRED_AUTH_SESSION_HANDOFF_CONTROLS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_SESSION_RUNTIME_FILE,
      path: 'promotion_blockers',
      field: 'promotion_blockers',
      requiredEntries: REQUIRED_AUTH_SESSION_PROMOTION_BLOCKERS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_SESSION_RUNTIME_FILE,
      path: 'forbidden_runtime_claims',
      field: 'forbidden_runtime_claims',
      requiredEntries: REQUIRED_AUTH_SESSION_FORBIDDEN_RUNTIME_CLAIMS
    })
  );

  return diagnostics;
}

function validateAuthRuntimeAdmissionContextContract(
  value: unknown
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (
    readPath(value, 'contract.status') !==
    AUTH_RUNTIME_ADMISSION_CONTEXT_STATUS
  ) {
    diagnostics.push(
      createCoreDiagnostic(
        AUTH_RUNTIME_ADMISSION_CONTEXT_FILE,
        'contract.status',
        `Core platform auth runtime admission context contract must stay \`${AUTH_RUNTIME_ADMISSION_CONTEXT_STATUS}\` until live handlers are reviewed.`
      )
    );
  }

  if (readPath(value, 'contract.owner_boundary') !== 'identity') {
    diagnostics.push(
      createCoreDiagnostic(
        AUTH_RUNTIME_ADMISSION_CONTEXT_FILE,
        'contract.owner_boundary',
        'Core platform auth runtime admission context contract must keep owner_boundary `identity`.'
      )
    );
  }

  if (readPath(value, 'contract.runtime_status') !== AUTH_SESSION_RUNTIME_STATUS) {
    diagnostics.push(
      createCoreDiagnostic(
        AUTH_RUNTIME_ADMISSION_CONTEXT_FILE,
        'contract.runtime_status',
        `Core platform auth runtime admission context contract must keep runtime_status \`${AUTH_SESSION_RUNTIME_STATUS}\`.`
      )
    );
  }

  if (
    readPath(value, 'contract.source_contract') !== AUTH_SESSION_RUNTIME_FILE
  ) {
    diagnostics.push(
      createCoreDiagnostic(
        AUTH_RUNTIME_ADMISSION_CONTEXT_FILE,
        'contract.source_contract',
        `Core platform auth runtime admission context contract must reference \`${AUTH_SESSION_RUNTIME_FILE}\`.`
      )
    );
  }

  if (
    readPath(value, 'contract.typed_boundary_status') !==
    AUTH_RUNTIME_ADMISSION_CONTEXT_BOUNDARY_STATUS
  ) {
    diagnostics.push(
      createCoreDiagnostic(
        AUTH_RUNTIME_ADMISSION_CONTEXT_FILE,
        'contract.typed_boundary_status',
        `Core platform auth runtime admission context boundary must stay \`${AUTH_RUNTIME_ADMISSION_CONTEXT_BOUNDARY_STATUS}\` until live handlers exist.`
      )
    );
  }

  diagnostics.push(
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_RUNTIME_ADMISSION_CONTEXT_FILE,
      path: 'required_context_fields',
      field: 'required_context_fields',
      requiredEntries: REQUIRED_AUTH_RUNTIME_ADMISSION_CONTEXT_FIELDS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_RUNTIME_ADMISSION_CONTEXT_FILE,
      path: 'optional_context_fields',
      field: 'optional_context_fields',
      requiredEntries: REQUIRED_AUTH_RUNTIME_ADMISSION_CONTEXT_OPTIONAL_FIELDS
    }),
    ...validateAuthRuntimeAdmissionOperations(
      readPath(value, 'supported_operations')
    ),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_RUNTIME_ADMISSION_CONTEXT_FILE,
      path: 'required_controls',
      field: 'required_controls',
      requiredEntries: REQUIRED_AUTH_RUNTIME_ADMISSION_CONTEXT_CONTROLS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_RUNTIME_ADMISSION_CONTEXT_FILE,
      path: 'forbidden_context_values',
      field: 'forbidden_context_values',
      requiredEntries: REQUIRED_AUTH_RUNTIME_ADMISSION_CONTEXT_FORBIDDEN_VALUES
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_RUNTIME_ADMISSION_CONTEXT_FILE,
      path: 'forbidden_runtime_claims',
      field: 'forbidden_runtime_claims',
      requiredEntries: REQUIRED_AUTH_RUNTIME_ADMISSION_CONTEXT_FORBIDDEN_CLAIMS
    })
  );

  return diagnostics;
}

function validateAuthRuntimeCommandPropagationContract(
  value: unknown
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (
    readPath(value, 'contract.status') !==
    AUTH_RUNTIME_COMMAND_PROPAGATION_STATUS
  ) {
    diagnostics.push(
      createCoreDiagnostic(
        AUTH_RUNTIME_COMMAND_PROPAGATION_FILE,
        'contract.status',
        `Core platform auth runtime command propagation contract must stay \`${AUTH_RUNTIME_COMMAND_PROPAGATION_STATUS}\` until live handlers are reviewed.`
      )
    );
  }

  if (readPath(value, 'contract.owner_boundary') !== 'identity') {
    diagnostics.push(
      createCoreDiagnostic(
        AUTH_RUNTIME_COMMAND_PROPAGATION_FILE,
        'contract.owner_boundary',
        'Core platform auth runtime command propagation contract must keep owner_boundary `identity`.'
      )
    );
  }

  if (readPath(value, 'contract.runtime_status') !== AUTH_SESSION_RUNTIME_STATUS) {
    diagnostics.push(
      createCoreDiagnostic(
        AUTH_RUNTIME_COMMAND_PROPAGATION_FILE,
        'contract.runtime_status',
        `Core platform auth runtime command propagation contract must keep runtime_status \`${AUTH_SESSION_RUNTIME_STATUS}\`.`
      )
    );
  }

  if (
    readPath(value, 'contract.source_contract') !==
    AUTH_RUNTIME_ADMISSION_CONTEXT_FILE
  ) {
    diagnostics.push(
      createCoreDiagnostic(
        AUTH_RUNTIME_COMMAND_PROPAGATION_FILE,
        'contract.source_contract',
        `Core platform auth runtime command propagation contract must reference \`${AUTH_RUNTIME_ADMISSION_CONTEXT_FILE}\`.`
      )
    );
  }

  if (
    readPath(value, 'contract.typed_boundary_status') !==
    AUTH_RUNTIME_COMMAND_PROPAGATION_BOUNDARY_STATUS
  ) {
    diagnostics.push(
      createCoreDiagnostic(
        AUTH_RUNTIME_COMMAND_PROPAGATION_FILE,
        'contract.typed_boundary_status',
        `Core platform auth runtime command propagation boundary must stay \`${AUTH_RUNTIME_COMMAND_PROPAGATION_BOUNDARY_STATUS}\` until live handlers exist.`
      )
    );
  }

  diagnostics.push(
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_RUNTIME_COMMAND_PROPAGATION_FILE,
      path: 'required_propagated_fields',
      field: 'required_propagated_fields',
      requiredEntries: REQUIRED_AUTH_RUNTIME_COMMAND_PROPAGATION_FIELDS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_RUNTIME_COMMAND_PROPAGATION_FILE,
      path: 'supported_targets',
      field: 'supported_targets',
      requiredEntries: REQUIRED_AUTH_RUNTIME_COMMAND_PROPAGATION_TARGETS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_RUNTIME_COMMAND_PROPAGATION_FILE,
      path: 'required_controls',
      field: 'required_controls',
      requiredEntries: REQUIRED_AUTH_RUNTIME_COMMAND_PROPAGATION_CONTROLS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_RUNTIME_COMMAND_PROPAGATION_FILE,
      path: 'forbidden_propagation_values',
      field: 'forbidden_propagation_values',
      requiredEntries: REQUIRED_AUTH_RUNTIME_COMMAND_PROPAGATION_FORBIDDEN_VALUES
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_RUNTIME_COMMAND_PROPAGATION_FILE,
      path: 'forbidden_runtime_claims',
      field: 'forbidden_runtime_claims',
      requiredEntries: REQUIRED_AUTH_RUNTIME_COMMAND_PROPAGATION_FORBIDDEN_CLAIMS
    })
  );

  return diagnostics;
}

function validateIdentitySessionStoreContract(value: unknown): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (readPath(value, 'contract.status') !== IDENTITY_SESSION_STORE_STATUS) {
    diagnostics.push(
      createCoreDiagnostic(
        IDENTITY_SESSION_STORE_FILE,
        'contract.status',
        `Core platform identity session store contract must stay \`${IDENTITY_SESSION_STORE_STATUS}\` until a migration-backed adapter exists.`
      )
    );
  }

  if (readPath(value, 'contract.owner_boundary') !== 'identity') {
    diagnostics.push(
      createCoreDiagnostic(
        IDENTITY_SESSION_STORE_FILE,
        'contract.owner_boundary',
        'Core platform identity session store contract must keep owner_boundary `identity`.'
      )
    );
  }

  if (
    readPath(value, 'adapter_contract.status') !==
    IDENTITY_SESSION_STORE_ADAPTER_BOUNDARY_STATUS
  ) {
    diagnostics.push(
      createCoreDiagnostic(
        IDENTITY_SESSION_STORE_FILE,
        'adapter_contract.status',
        `Core platform identity session store adapter boundary must stay \`${IDENTITY_SESSION_STORE_ADAPTER_BOUNDARY_STATUS}\` until a migration-backed storage implementation exists.`
      )
    );
  }

  diagnostics.push(
    ...validateRequiredStringArrayEntries({
      value,
      file: IDENTITY_SESSION_STORE_FILE,
      path: 'required_session_record_fields',
      field: 'required_session_record_fields',
      requiredEntries: REQUIRED_IDENTITY_SESSION_STORE_FIELDS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: IDENTITY_SESSION_STORE_FILE,
      path: 'state_values',
      field: 'state_values',
      requiredEntries: REQUIRED_IDENTITY_SESSION_STORE_STATES
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: IDENTITY_SESSION_STORE_FILE,
      path: 'required_refresh_rotation_fields',
      field: 'required_refresh_rotation_fields',
      requiredEntries: REQUIRED_IDENTITY_SESSION_REFRESH_ROTATION_FIELDS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: IDENTITY_SESSION_STORE_FILE,
      path: 'required_revocation_fields',
      field: 'required_revocation_fields',
      requiredEntries: REQUIRED_IDENTITY_SESSION_REVOCATION_FIELDS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: IDENTITY_SESSION_STORE_FILE,
      path: 'required_controls',
      field: 'required_controls',
      requiredEntries: REQUIRED_IDENTITY_SESSION_STORE_CONTROLS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: IDENTITY_SESSION_STORE_FILE,
      path: 'uniqueness',
      field: 'uniqueness',
      requiredEntries: REQUIRED_IDENTITY_SESSION_STORE_UNIQUENESS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: IDENTITY_SESSION_STORE_FILE,
      path: 'adapter_contract.adapter_kinds',
      field: 'adapter_contract.adapter_kinds',
      requiredEntries: REQUIRED_IDENTITY_SESSION_STORE_ADAPTER_KINDS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: IDENTITY_SESSION_STORE_FILE,
      path: 'adapter_contract.required_adapter_fields',
      field: 'adapter_contract.required_adapter_fields',
      requiredEntries: REQUIRED_IDENTITY_SESSION_STORE_ADAPTER_FIELDS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: IDENTITY_SESSION_STORE_FILE,
      path: 'adapter_contract.required_adapter_controls',
      field: 'adapter_contract.required_adapter_controls',
      requiredEntries: REQUIRED_IDENTITY_SESSION_STORE_ADAPTER_CONTROLS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: IDENTITY_SESSION_STORE_FILE,
      path: 'forbidden_storage_values',
      field: 'forbidden_storage_values',
      requiredEntries: REQUIRED_IDENTITY_SESSION_FORBIDDEN_STORAGE_VALUES
    })
  );

  return diagnostics;
}

function validateAuthCredentialVaultHandoffContract(
  value: unknown
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (
    readPath(value, 'contract.status') !== AUTH_CREDENTIAL_VAULT_HANDOFF_STATUS
  ) {
    diagnostics.push(
      createCoreDiagnostic(
        AUTH_CREDENTIAL_VAULT_HANDOFF_FILE,
        'contract.status',
        `Core platform auth credential vault handoff contract must stay \`${AUTH_CREDENTIAL_VAULT_HANDOFF_STATUS}\` until a capability client exists.`
      )
    );
  }

  if (readPath(value, 'contract.owner_boundary') !== 'identity') {
    diagnostics.push(
      createCoreDiagnostic(
        AUTH_CREDENTIAL_VAULT_HANDOFF_FILE,
        'contract.owner_boundary',
        'Core platform auth credential vault handoff contract must keep owner_boundary `identity`.'
      )
    );
  }

  if (
    readPath(value, 'contract.vault_owner_repo') !==
    'zdp-privacy-credential-vault'
  ) {
    diagnostics.push(
      createCoreDiagnostic(
        AUTH_CREDENTIAL_VAULT_HANDOFF_FILE,
        'contract.vault_owner_repo',
        'Core platform auth credential vault handoff contract must keep vault_owner_repo `zdp-privacy-credential-vault`.'
      )
    );
  }

  if (
    readPath(value, 'capability_client_contract.status') !==
    AUTH_CREDENTIAL_VAULT_CAPABILITY_CLIENT_BOUNDARY_STATUS
  ) {
    diagnostics.push(
      createCoreDiagnostic(
        AUTH_CREDENTIAL_VAULT_HANDOFF_FILE,
        'capability_client_contract.status',
        `Core platform auth credential vault capability client boundary must stay \`${AUTH_CREDENTIAL_VAULT_CAPABILITY_CLIENT_BOUNDARY_STATUS}\` until a reviewed live vault client exists.`
      )
    );
  }

  diagnostics.push(
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_CREDENTIAL_VAULT_HANDOFF_FILE,
      path: 'required_capability_fields',
      field: 'required_capability_fields',
      requiredEntries: REQUIRED_AUTH_CREDENTIAL_VAULT_FIELDS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_CREDENTIAL_VAULT_HANDOFF_FILE,
      path: 'required_credential_kinds',
      field: 'required_credential_kinds',
      requiredEntries: REQUIRED_AUTH_CREDENTIAL_VAULT_KINDS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_CREDENTIAL_VAULT_HANDOFF_FILE,
      path: 'required_scopes',
      field: 'required_scopes',
      requiredEntries: REQUIRED_AUTH_CREDENTIAL_VAULT_SCOPES
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_CREDENTIAL_VAULT_HANDOFF_FILE,
      path: 'required_handoff_controls',
      field: 'required_handoff_controls',
      requiredEntries: REQUIRED_AUTH_CREDENTIAL_VAULT_CONTROLS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_CREDENTIAL_VAULT_HANDOFF_FILE,
      path: 'capability_client_contract.client_kinds',
      field: 'capability_client_contract.client_kinds',
      requiredEntries: REQUIRED_AUTH_CREDENTIAL_VAULT_CAPABILITY_CLIENT_KINDS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_CREDENTIAL_VAULT_HANDOFF_FILE,
      path: 'capability_client_contract.required_client_fields',
      field: 'capability_client_contract.required_client_fields',
      requiredEntries: REQUIRED_AUTH_CREDENTIAL_VAULT_CAPABILITY_CLIENT_FIELDS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_CREDENTIAL_VAULT_HANDOFF_FILE,
      path: 'capability_client_contract.required_client_controls',
      field: 'capability_client_contract.required_client_controls',
      requiredEntries: REQUIRED_AUTH_CREDENTIAL_VAULT_CAPABILITY_CLIENT_CONTROLS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_CREDENTIAL_VAULT_HANDOFF_FILE,
      path: 'forbidden_payload_values',
      field: 'forbidden_payload_values',
      requiredEntries: REQUIRED_AUTH_CREDENTIAL_VAULT_FORBIDDEN_VALUES
    })
  );

  return diagnostics;
}

function validateAuthPasskeyChallengeStoreContract(
  value: unknown
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (readPath(value, 'contract.status') !== AUTH_PASSKEY_CHALLENGE_STORE_STATUS) {
    diagnostics.push(
      createCoreDiagnostic(
        AUTH_PASSKEY_CHALLENGE_STORE_FILE,
        'contract.status',
        `Core platform auth passkey challenge store contract must stay \`${AUTH_PASSKEY_CHALLENGE_STORE_STATUS}\` until durable storage exists.`
      )
    );
  }

  if (readPath(value, 'contract.owner_boundary') !== 'identity') {
    diagnostics.push(
      createCoreDiagnostic(
        AUTH_PASSKEY_CHALLENGE_STORE_FILE,
        'contract.owner_boundary',
        'Core platform auth passkey challenge store contract must keep owner_boundary `identity`.'
      )
    );
  }

  if (
    readPath(value, 'adapter_contract.status') !==
    AUTH_PASSKEY_CHALLENGE_STORE_ADAPTER_BOUNDARY_STATUS
  ) {
    diagnostics.push(
      createCoreDiagnostic(
        AUTH_PASSKEY_CHALLENGE_STORE_FILE,
        'adapter_contract.status',
        `Core platform auth passkey challenge store adapter boundary must stay \`${AUTH_PASSKEY_CHALLENGE_STORE_ADAPTER_BOUNDARY_STATUS}\` until a migration-backed storage implementation exists.`
      )
    );
  }

  diagnostics.push(
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_PASSKEY_CHALLENGE_STORE_FILE,
      path: 'required_challenge_fields',
      field: 'required_challenge_fields',
      requiredEntries: REQUIRED_AUTH_PASSKEY_CHALLENGE_FIELDS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_PASSKEY_CHALLENGE_STORE_FILE,
      path: 'recommended_challenge_fields',
      field: 'recommended_challenge_fields',
      requiredEntries: REQUIRED_AUTH_PASSKEY_CHALLENGE_RECOMMENDED_FIELDS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_PASSKEY_CHALLENGE_STORE_FILE,
      path: 'state_values',
      field: 'state_values',
      requiredEntries: REQUIRED_AUTH_PASSKEY_CHALLENGE_STATES
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_PASSKEY_CHALLENGE_STORE_FILE,
      path: 'ceremony_types',
      field: 'ceremony_types',
      requiredEntries: REQUIRED_AUTH_PASSKEY_CHALLENGE_CEREMONY_TYPES
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_PASSKEY_CHALLENGE_STORE_FILE,
      path: 'required_controls',
      field: 'required_controls',
      requiredEntries: REQUIRED_AUTH_PASSKEY_CHALLENGE_CONTROLS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_PASSKEY_CHALLENGE_STORE_FILE,
      path: 'uniqueness',
      field: 'uniqueness',
      requiredEntries: REQUIRED_AUTH_PASSKEY_CHALLENGE_UNIQUENESS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_PASSKEY_CHALLENGE_STORE_FILE,
      path: 'adapter_contract.adapter_kinds',
      field: 'adapter_contract.adapter_kinds',
      requiredEntries: REQUIRED_AUTH_PASSKEY_CHALLENGE_ADAPTER_KINDS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_PASSKEY_CHALLENGE_STORE_FILE,
      path: 'adapter_contract.required_adapter_fields',
      field: 'adapter_contract.required_adapter_fields',
      requiredEntries: REQUIRED_AUTH_PASSKEY_CHALLENGE_ADAPTER_FIELDS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_PASSKEY_CHALLENGE_STORE_FILE,
      path: 'adapter_contract.required_adapter_controls',
      field: 'adapter_contract.required_adapter_controls',
      requiredEntries: REQUIRED_AUTH_PASSKEY_CHALLENGE_ADAPTER_CONTROLS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_PASSKEY_CHALLENGE_STORE_FILE,
      path: 'forbidden_storage_values',
      field: 'forbidden_storage_values',
      requiredEntries: REQUIRED_AUTH_PASSKEY_CHALLENGE_FORBIDDEN_VALUES
    })
  );

  return diagnostics;
}

function validateAuthOauthCallbackStateContract(
  value: unknown
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (readPath(value, 'contract.status') !== AUTH_OAUTH_CALLBACK_STATE_STATUS) {
    diagnostics.push(
      createCoreDiagnostic(
        AUTH_OAUTH_CALLBACK_STATE_FILE,
        'contract.status',
        `Core platform auth OAuth callback state contract must stay \`${AUTH_OAUTH_CALLBACK_STATE_STATUS}\` until durable storage exists.`
      )
    );
  }

  if (readPath(value, 'contract.owner_boundary') !== 'identity') {
    diagnostics.push(
      createCoreDiagnostic(
        AUTH_OAUTH_CALLBACK_STATE_FILE,
        'contract.owner_boundary',
        'Core platform auth OAuth callback state contract must keep owner_boundary `identity`.'
      )
    );
  }

  if (
    readPath(value, 'adapter_contract.status') !==
    AUTH_OAUTH_CALLBACK_STATE_ADAPTER_BOUNDARY_STATUS
  ) {
    diagnostics.push(
      createCoreDiagnostic(
        AUTH_OAUTH_CALLBACK_STATE_FILE,
        'adapter_contract.status',
        `Core platform auth OAuth callback state adapter boundary must stay \`${AUTH_OAUTH_CALLBACK_STATE_ADAPTER_BOUNDARY_STATUS}\` until a migration-backed storage implementation exists.`
      )
    );
  }

  diagnostics.push(
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_OAUTH_CALLBACK_STATE_FILE,
      path: 'required_state_fields',
      field: 'required_state_fields',
      requiredEntries: REQUIRED_AUTH_OAUTH_CALLBACK_STATE_FIELDS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_OAUTH_CALLBACK_STATE_FILE,
      path: 'recommended_state_fields',
      field: 'recommended_state_fields',
      requiredEntries: REQUIRED_AUTH_OAUTH_CALLBACK_STATE_RECOMMENDED_FIELDS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_OAUTH_CALLBACK_STATE_FILE,
      path: 'state_values',
      field: 'state_values',
      requiredEntries: REQUIRED_AUTH_OAUTH_CALLBACK_STATE_STATES
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_OAUTH_CALLBACK_STATE_FILE,
      path: 'required_controls',
      field: 'required_controls',
      requiredEntries: REQUIRED_AUTH_OAUTH_CALLBACK_STATE_CONTROLS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_OAUTH_CALLBACK_STATE_FILE,
      path: 'uniqueness',
      field: 'uniqueness',
      requiredEntries: REQUIRED_AUTH_OAUTH_CALLBACK_STATE_UNIQUENESS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_OAUTH_CALLBACK_STATE_FILE,
      path: 'adapter_contract.adapter_kinds',
      field: 'adapter_contract.adapter_kinds',
      requiredEntries: REQUIRED_AUTH_OAUTH_CALLBACK_STATE_ADAPTER_KINDS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_OAUTH_CALLBACK_STATE_FILE,
      path: 'adapter_contract.required_adapter_fields',
      field: 'adapter_contract.required_adapter_fields',
      requiredEntries: REQUIRED_AUTH_OAUTH_CALLBACK_STATE_ADAPTER_FIELDS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_OAUTH_CALLBACK_STATE_FILE,
      path: 'adapter_contract.required_adapter_controls',
      field: 'adapter_contract.required_adapter_controls',
      requiredEntries: REQUIRED_AUTH_OAUTH_CALLBACK_STATE_ADAPTER_CONTROLS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_OAUTH_CALLBACK_STATE_FILE,
      path: 'forbidden_storage_values',
      field: 'forbidden_storage_values',
      requiredEntries: REQUIRED_AUTH_OAUTH_CALLBACK_STATE_FORBIDDEN_VALUES
    })
  );

  return diagnostics;
}

function validateAuthAuditEventPersistenceContract(
  value: unknown
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (readPath(value, 'contract.status') !== AUTH_AUDIT_EVENT_PERSISTENCE_STATUS) {
    diagnostics.push(
      createCoreDiagnostic(
        AUTH_AUDIT_EVENT_PERSISTENCE_FILE,
        'contract.status',
        `Core platform auth audit event persistence contract must stay \`${AUTH_AUDIT_EVENT_PERSISTENCE_STATUS}\` until durable append-only storage exists.`
      )
    );
  }

  if (readPath(value, 'contract.owner_boundary') !== 'audit') {
    diagnostics.push(
      createCoreDiagnostic(
        AUTH_AUDIT_EVENT_PERSISTENCE_FILE,
        'contract.owner_boundary',
        'Core platform auth audit event persistence contract must keep owner_boundary `audit`.'
      )
    );
  }

  if (readPath(value, 'contract.source_boundary') !== 'identity') {
    diagnostics.push(
      createCoreDiagnostic(
        AUTH_AUDIT_EVENT_PERSISTENCE_FILE,
        'contract.source_boundary',
        'Core platform auth audit event persistence contract must keep source_boundary `identity`.'
      )
    );
  }

  diagnostics.push(
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_AUDIT_EVENT_PERSISTENCE_FILE,
      path: 'required_auth_event_fields',
      field: 'required_auth_event_fields',
      requiredEntries: REQUIRED_AUTH_AUDIT_EVENT_FIELDS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_AUDIT_EVENT_PERSISTENCE_FILE,
      path: 'required_auth_event_types',
      field: 'required_auth_event_types',
      requiredEntries: REQUIRED_AUTH_AUDIT_EVENT_TYPES
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_AUDIT_EVENT_PERSISTENCE_FILE,
      path: 'required_controls',
      field: 'required_controls',
      requiredEntries: REQUIRED_AUTH_AUDIT_EVENT_CONTROLS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_AUDIT_EVENT_PERSISTENCE_FILE,
      path: 'conditional_auth_failure_event_fields',
      field: 'conditional_auth_failure_event_fields',
      requiredEntries: REQUIRED_AUTH_AUDIT_FAILURE_EVENT_FIELDS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_AUDIT_EVENT_PERSISTENCE_FILE,
      path: 'forbidden_payload_values',
      field: 'forbidden_payload_values',
      requiredEntries: REQUIRED_AUTH_AUDIT_EVENT_FORBIDDEN_VALUES
    })
  );

  return diagnostics;
}

function validateAuthAuditStorageAdapterContract(
  value: unknown
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (readPath(value, 'contract.status') !== AUTH_AUDIT_STORAGE_ADAPTER_STATUS) {
    diagnostics.push(
      createCoreDiagnostic(
        AUTH_AUDIT_STORAGE_ADAPTER_FILE,
        'contract.status',
        `Core platform auth audit storage adapter contract must stay \`${AUTH_AUDIT_STORAGE_ADAPTER_STATUS}\` until a durable adapter exists.`
      )
    );
  }

  if (readPath(value, 'contract.owner_boundary') !== 'audit') {
    diagnostics.push(
      createCoreDiagnostic(
        AUTH_AUDIT_STORAGE_ADAPTER_FILE,
        'contract.owner_boundary',
        'Core platform auth audit storage adapter contract must keep owner_boundary `audit`.'
      )
    );
  }

  if (
    readPath(value, 'contract.source_contract') !==
    AUTH_AUDIT_EVENT_PERSISTENCE_FILE
  ) {
    diagnostics.push(
      createCoreDiagnostic(
        AUTH_AUDIT_STORAGE_ADAPTER_FILE,
        'contract.source_contract',
        `Core platform auth audit storage adapter contract must reference \`${AUTH_AUDIT_EVENT_PERSISTENCE_FILE}\`.`
      )
    );
  }

  diagnostics.push(
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_AUDIT_STORAGE_ADAPTER_FILE,
      path: 'required_adapter_fields',
      field: 'required_adapter_fields',
      requiredEntries: REQUIRED_AUTH_AUDIT_STORAGE_ADAPTER_FIELDS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_AUDIT_STORAGE_ADAPTER_FILE,
      path: 'required_adapter_kinds',
      field: 'required_adapter_kinds',
      requiredEntries: REQUIRED_AUTH_AUDIT_STORAGE_ADAPTER_KINDS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_AUDIT_STORAGE_ADAPTER_FILE,
      path: 'required_controls',
      field: 'required_controls',
      requiredEntries: REQUIRED_AUTH_AUDIT_STORAGE_ADAPTER_CONTROLS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_AUDIT_STORAGE_ADAPTER_FILE,
      path: 'forbidden_storage_values',
      field: 'forbidden_storage_values',
      requiredEntries: REQUIRED_AUTH_AUDIT_STORAGE_ADAPTER_FORBIDDEN_VALUES
    })
  );

  return diagnostics;
}

function validateCoreDbSchemaContract(value: unknown): readonly Diagnostic[] {
  return [
    ...validateRequiredStringArrayEntries({
      value,
      file: CORE_DB_SCHEMA_FILE,
      path: 'contract.migration_files',
      field: 'contract.migration_files',
      requiredEntries: [CORE_FOUNDATION_MIGRATION_FILE]
    }),
    ...validateExactValue({
      value,
      file: CORE_DB_SCHEMA_FILE,
      path: 'core_events.schema_version_positive_integer_required',
      field: 'core_events.schema_version_positive_integer_required',
      expected: true,
      message:
        'Core DB schema contract must require core event outbox schema_version to be a positive integer.'
    }),
    ...validateExactValue({
      value,
      file: CORE_DB_SCHEMA_FILE,
      path: 'core_events.outbox_table',
      field: 'core_events.outbox_table',
      expected: 'audit.core_event_outbox',
      message:
        'Core DB schema contract must keep core_events.outbox_table `audit.core_event_outbox`.'
    }),
    ...validateExactValue({
      value,
      file: CORE_DB_SCHEMA_FILE,
      path: 'core_events.delivery_attempt_table',
      field: 'core_events.delivery_attempt_table',
      expected: 'audit.core_event_delivery_attempts',
      message:
        'Core DB schema contract must keep core_events.delivery_attempt_table `audit.core_event_delivery_attempts`.'
    })
  ];
}

function validateCoreFoundationMigration(source: string): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const snippet of [
    'CREATE TABLE IF NOT EXISTS audit.core_event_outbox',
    'cloud_event_id text NOT NULL UNIQUE',
    'cloud_event_type text NOT NULL CHECK',
    'schema_version integer NOT NULL CHECK (schema_version > 0)',
    'payload_ref text NOT NULL',
    'available_at timestamptz NOT NULL',
    'CREATE TABLE IF NOT EXISTS audit.core_event_delivery_attempts',
    'audit.core_event_outbox is append-only',
    'audit.core_event_delivery_attempts is append-only'
  ]) {
    if (!source.includes(snippet)) {
      diagnostics.push(
        createCoreDiagnostic(
          CORE_FOUNDATION_MIGRATION_FILE,
          'core_event_outbox.migration_shape',
          `Core foundation migration must include \`${snippet}\` for the core event outbox contract.`
        )
      );
    }
  }

  return diagnostics;
}

function validateCoreEventOutboxContract(value: unknown): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (readPath(value, 'contract.status') !== CORE_EVENT_OUTBOX_STATUS) {
    diagnostics.push(
      createCoreDiagnostic(
        CORE_EVENT_OUTBOX_FILE,
        'contract.status',
        `Core platform event outbox contract must stay \`${CORE_EVENT_OUTBOX_STATUS}\` until dispatcher and replay workers exist.`
      )
    );
  }

  if (readPath(value, 'contract.owner') !== CORE_REPOSITORY_NAME) {
    diagnostics.push(
      createCoreDiagnostic(
        CORE_EVENT_OUTBOX_FILE,
        'contract.owner',
        `Core platform event outbox contract must keep owner \`${CORE_REPOSITORY_NAME}\`.`
      )
    );
  }

  diagnostics.push(
    ...validateExactValue({
      value,
      file: CORE_EVENT_OUTBOX_FILE,
      path: 'runtime.live_dispatcher_implemented',
      field: 'runtime.live_dispatcher_implemented',
      expected: false,
      message:
        'Core platform event outbox contract must keep live_dispatcher_implemented false until dispatcher proof exists.'
    }),
    ...validateExactValue({
      value,
      file: CORE_EVENT_OUTBOX_FILE,
      path: 'runtime.consumer_inbox_implemented',
      field: 'runtime.consumer_inbox_implemented',
      expected: false,
      message:
        'Core platform event outbox contract must keep consumer_inbox_implemented false until consumer inbox proof exists.'
    }),
    ...validateExactValue({
      value,
      file: CORE_EVENT_OUTBOX_FILE,
      path: 'runtime.replay_worker_implemented',
      field: 'runtime.replay_worker_implemented',
      expected: false,
      message:
        'Core platform event outbox contract must keep replay_worker_implemented false until replay worker proof exists.'
    }),
    ...validateExactValue({
      value,
      file: CORE_EVENT_OUTBOX_FILE,
      path: 'runtime.production_route_unblocked',
      field: 'runtime.production_route_unblocked',
      expected: false,
      message:
        'Core platform event outbox contract must keep production_route_unblocked false until dispatcher and consumer proof exist.'
    }),
    ...validateExactValue({
      value,
      file: CORE_EVENT_OUTBOX_FILE,
      path: 'events.cloud_events_required',
      field: 'events.cloud_events_required',
      expected: true,
      message:
        'Core platform event outbox contract must require CloudEvents-compatible records.'
    }),
    ...validateExactValue({
      value,
      file: CORE_EVENT_OUTBOX_FILE,
      path: 'events.source',
      field: 'events.source',
      expected: CORE_REPOSITORY_NAME,
      message:
        `Core platform event outbox contract must keep events.source \`${CORE_REPOSITORY_NAME}\`.`
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: CORE_EVENT_OUTBOX_FILE,
      path: 'events.produced',
      field: 'events.produced',
      requiredEntries: REQUIRED_CORE_EVENT_OUTBOX_PRODUCED_EVENTS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: CORE_EVENT_OUTBOX_FILE,
      path: 'events.money_relevant',
      field: 'events.money_relevant',
      requiredEntries: REQUIRED_CORE_EVENT_OUTBOX_MONEY_RELEVANT_EVENTS
    }),
    ...validateExactValue({
      value,
      file: CORE_EVENT_OUTBOX_FILE,
      path: 'storage.outbox_table',
      field: 'storage.outbox_table',
      expected: 'audit.core_event_outbox',
      message:
        'Core platform event outbox contract must keep storage.outbox_table `audit.core_event_outbox`.'
    }),
    ...validateExactValue({
      value,
      file: CORE_EVENT_OUTBOX_FILE,
      path: 'storage.delivery_attempt_table',
      field: 'storage.delivery_attempt_table',
      expected: 'audit.core_event_delivery_attempts',
      message:
        'Core platform event outbox contract must keep storage.delivery_attempt_table `audit.core_event_delivery_attempts`.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: CORE_EVENT_OUTBOX_FILE,
      path: 'storage.append_only_tables',
      field: 'storage.append_only_tables',
      requiredEntries: [
        'audit.core_event_outbox',
        'audit.core_event_delivery_attempts'
      ]
    }),
    ...validateExactValue({
      value,
      file: CORE_EVENT_OUTBOX_FILE,
      path: 'storage.payload_ref_only',
      field: 'storage.payload_ref_only',
      expected: true,
      message:
        'Core platform event outbox contract must keep payload_ref_only true.'
    }),
    ...validateExactValue({
      value,
      file: CORE_EVENT_OUTBOX_FILE,
      path: 'storage.inline_personal_payload_allowed',
      field: 'storage.inline_personal_payload_allowed',
      expected: false,
      message:
        'Core platform event outbox contract must keep inline_personal_payload_allowed false.'
    }),
    ...validateExactValue({
      value,
      file: CORE_EVENT_OUTBOX_FILE,
      path: 'storage.inline_secret_payload_allowed',
      field: 'storage.inline_secret_payload_allowed',
      expected: false,
      message:
        'Core platform event outbox contract must keep inline_secret_payload_allowed false.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: CORE_EVENT_OUTBOX_FILE,
      path: 'required_outbox_fields',
      field: 'required_outbox_fields',
      requiredEntries: REQUIRED_CORE_EVENT_OUTBOX_FIELDS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: CORE_EVENT_OUTBOX_FILE,
      path: 'required_delivery_attempt_fields',
      field: 'required_delivery_attempt_fields',
      requiredEntries: REQUIRED_CORE_EVENT_OUTBOX_DELIVERY_ATTEMPT_FIELDS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: CORE_EVENT_OUTBOX_FILE,
      path: 'controls',
      field: 'controls',
      requiredEntries: REQUIRED_CORE_EVENT_OUTBOX_CONTROLS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: CORE_EVENT_OUTBOX_FILE,
      path: 'forbidden_values',
      field: 'forbidden_values',
      requiredEntries: REQUIRED_CORE_EVENT_OUTBOX_FORBIDDEN_VALUES
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: CORE_EVENT_OUTBOX_FILE,
      path: 'forbidden_claims',
      field: 'forbidden_claims',
      requiredEntries: REQUIRED_CORE_EVENT_OUTBOX_FORBIDDEN_CLAIMS
    })
  );

  return diagnostics;
}

function validateAuthIdempotencyStorageContract(
  value: unknown
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (readPath(value, 'contract.status') !== AUTH_IDEMPOTENCY_STORAGE_STATUS) {
    diagnostics.push(
      createCoreDiagnostic(
        AUTH_IDEMPOTENCY_STORAGE_FILE,
        'contract.status',
        `Core platform auth idempotency storage contract must stay \`${AUTH_IDEMPOTENCY_STORAGE_STATUS}\` until durable storage exists.`
      )
    );
  }

  if (readPath(value, 'contract.owner_boundary') !== 'identity') {
    diagnostics.push(
      createCoreDiagnostic(
        AUTH_IDEMPOTENCY_STORAGE_FILE,
        'contract.owner_boundary',
        'Core platform auth idempotency storage contract must keep owner_boundary `identity`.'
      )
    );
  }

  if (
    readPath(value, 'adapter_contract.status') !==
    AUTH_IDEMPOTENCY_STORAGE_ADAPTER_BOUNDARY_STATUS
  ) {
    diagnostics.push(
      createCoreDiagnostic(
        AUTH_IDEMPOTENCY_STORAGE_FILE,
        'adapter_contract.status',
        `Core platform auth idempotency storage adapter boundary must stay \`${AUTH_IDEMPOTENCY_STORAGE_ADAPTER_BOUNDARY_STATUS}\` until a migration-backed storage implementation exists.`
      )
    );
  }

  diagnostics.push(
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_IDEMPOTENCY_STORAGE_FILE,
      path: 'required_record_fields',
      field: 'required_record_fields',
      requiredEntries: REQUIRED_AUTH_IDEMPOTENCY_STORAGE_FIELDS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_IDEMPOTENCY_STORAGE_FILE,
      path: 'state_values',
      field: 'state_values',
      requiredEntries: REQUIRED_AUTH_IDEMPOTENCY_STORAGE_STATES
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_IDEMPOTENCY_STORAGE_FILE,
      path: 'required_controls',
      field: 'required_controls',
      requiredEntries: REQUIRED_AUTH_IDEMPOTENCY_STORAGE_CONTROLS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_IDEMPOTENCY_STORAGE_FILE,
      path: 'uniqueness',
      field: 'uniqueness',
      requiredEntries: REQUIRED_AUTH_IDEMPOTENCY_STORAGE_UNIQUENESS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_IDEMPOTENCY_STORAGE_FILE,
      path: 'adapter_contract.adapter_kinds',
      field: 'adapter_contract.adapter_kinds',
      requiredEntries: REQUIRED_AUTH_IDEMPOTENCY_STORAGE_ADAPTER_KINDS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_IDEMPOTENCY_STORAGE_FILE,
      path: 'adapter_contract.required_adapter_fields',
      field: 'adapter_contract.required_adapter_fields',
      requiredEntries: REQUIRED_AUTH_IDEMPOTENCY_STORAGE_ADAPTER_FIELDS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_IDEMPOTENCY_STORAGE_FILE,
      path: 'adapter_contract.required_adapter_controls',
      field: 'adapter_contract.required_adapter_controls',
      requiredEntries: REQUIRED_AUTH_IDEMPOTENCY_STORAGE_ADAPTER_CONTROLS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_IDEMPOTENCY_STORAGE_FILE,
      path: 'forbidden_storage_values',
      field: 'forbidden_storage_values',
      requiredEntries: REQUIRED_AUTH_IDEMPOTENCY_STORAGE_FORBIDDEN_VALUES
    })
  );

  return diagnostics;
}

function validateAuthSessionRuntimeOperations(
  operations: readonly unknown[]
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const operationById = new Map<string, Record<string, unknown>>();

  for (const operation of operations) {
    if (!isRecord(operation)) {
      continue;
    }

    const operationId = readStringField(operation, 'operation_id');

    if (operationId !== null) {
      operationById.set(operationId, operation);
    }
  }

  for (const requiredOperation of REQUIRED_AUTH_SESSION_RUNTIME_OPERATIONS) {
    const operation = operationById.get(requiredOperation.operationId);

    if (operation === undefined) {
      diagnostics.push(
        createCoreDiagnostic(
          AUTH_SESSION_RUNTIME_FILE,
          'required_operations',
          `Core platform auth/session runtime contract must include operation \`${requiredOperation.operationId}\`.`
        )
      );
      continue;
    }

    if (readStringField(operation, 'runtime_status') !== AUTH_SESSION_RUNTIME_STATUS) {
      diagnostics.push(
        createCoreDiagnostic(
          AUTH_SESSION_RUNTIME_FILE,
          `required_operations.${requiredOperation.operationId}.runtime_status`,
          `Core platform auth/session operation \`${requiredOperation.operationId}\` must stay \`${AUTH_SESSION_RUNTIME_STATUS}\`.`
        )
      );
    }

    if (readStringField(operation, 'session_effect') !== requiredOperation.sessionEffect) {
      diagnostics.push(
        createCoreDiagnostic(
          AUTH_SESSION_RUNTIME_FILE,
          `required_operations.${requiredOperation.operationId}.session_effect`,
          `Core platform auth/session operation \`${requiredOperation.operationId}\` must declare session_effect \`${requiredOperation.sessionEffect}\`.`
        )
      );
    }

    if (readStringField(operation, 'handoff_owner') !== 'identity') {
      diagnostics.push(
        createCoreDiagnostic(
          AUTH_SESSION_RUNTIME_FILE,
          `required_operations.${requiredOperation.operationId}.handoff_owner`,
          `Core platform auth/session operation \`${requiredOperation.operationId}\` must keep handoff_owner \`identity\`.`
        )
      );
    }
  }

  return diagnostics;
}

function validateAuthRuntimeAdmissionOperations(
  operations: unknown
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (!Array.isArray(operations)) {
    return [
      createCoreDiagnostic(
        AUTH_RUNTIME_ADMISSION_CONTEXT_FILE,
        'supported_operations',
        'Core platform auth runtime admission context contract must declare `supported_operations`.'
      )
    ];
  }

  const operationById = new Map<string, Record<string, unknown>>();

  for (const operation of operations) {
    if (!isRecord(operation)) {
      continue;
    }

    const operationId = readStringField(operation, 'operation_id');

    if (operationId !== null) {
      operationById.set(operationId, operation);
    }
  }

  for (const requiredOperation of REQUIRED_AUTH_SESSION_RUNTIME_OPERATIONS) {
    const operation = operationById.get(requiredOperation.operationId);

    if (operation === undefined) {
      diagnostics.push(
        createCoreDiagnostic(
          AUTH_RUNTIME_ADMISSION_CONTEXT_FILE,
          'supported_operations',
          `Core platform auth runtime admission context contract must include operation \`${requiredOperation.operationId}\`.`
        )
      );
      continue;
    }

    if (readStringField(operation, 'session_effect') !== requiredOperation.sessionEffect) {
      diagnostics.push(
        createCoreDiagnostic(
          AUTH_RUNTIME_ADMISSION_CONTEXT_FILE,
          `supported_operations.${requiredOperation.operationId}.session_effect`,
          `Core platform auth runtime admission operation \`${requiredOperation.operationId}\` must declare session_effect \`${requiredOperation.sessionEffect}\`.`
        )
      );
    }
  }

  return diagnostics;
}
