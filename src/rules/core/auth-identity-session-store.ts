import type { Diagnostic } from '../../diagnostics.ts';
import {
  createCoreDiagnostic,
  readPath,
  validateRequiredStringArrayEntries
} from './contract-helpers.ts';

export const IDENTITY_SESSION_STORE_FILE =
  'contracts/identity-session-store.yaml';

export const IDENTITY_SESSION_STORE_STATUS =
  'sqlx_adapter_present_no_live_handler';

export const IDENTITY_SESSION_STORE_ADAPTER_BOUNDARY_STATUS =
  'sqlx_identity_session_store_adapter_no_auth_promotion';

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

export function validateIdentitySessionStoreContract(
  value: unknown
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (readPath(value, 'contract.status') !== IDENTITY_SESSION_STORE_STATUS) {
    diagnostics.push(
      createCoreDiagnostic(
        IDENTITY_SESSION_STORE_FILE,
        'contract.status',
        `Core platform identity session store contract must stay \`${IDENTITY_SESSION_STORE_STATUS}\` while the SQLx adapter exists without live auth handler promotion.`
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
        `Core platform identity session store adapter boundary must stay \`${IDENTITY_SESSION_STORE_ADAPTER_BOUNDARY_STATUS}\` until auth runtime promotion is reviewed.`
      )
    );
  }

  if (
    readPath(value, 'adapter_contract.implementation_ref') !==
    'src/core_postgres_session_store_adapter.rs'
  ) {
    diagnostics.push(
      createCoreDiagnostic(
        IDENTITY_SESSION_STORE_FILE,
        'adapter_contract.implementation_ref',
        'Core platform identity session store SQLx adapter contract must point at `src/core_postgres_session_store_adapter.rs`.'
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
