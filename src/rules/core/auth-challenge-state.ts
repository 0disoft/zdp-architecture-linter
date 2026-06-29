import type { Diagnostic } from '../../diagnostics.ts';
import {
  createCoreDiagnostic,
  readPath,
  validateRequiredStringArrayEntries
} from './contract-helpers.ts';

export const AUTH_PASSKEY_CHALLENGE_STORE_FILE =
  'contracts/auth-passkey-challenge-store.yaml';

export const AUTH_OAUTH_CALLBACK_STATE_FILE =
  'contracts/auth-oauth-callback-state.yaml';

export const AUTH_PASSKEY_CHALLENGE_STORE_STATUS =
  'sqlx_adapter_present_no_live_handler';

export const AUTH_PASSKEY_CHALLENGE_STORE_ADAPTER_BOUNDARY_STATUS =
  'sqlx_passkey_challenge_store_adapter_no_auth_promotion';

export const AUTH_OAUTH_CALLBACK_STATE_STATUS =
  'sqlx_adapter_present_no_live_handler';

export const AUTH_OAUTH_CALLBACK_STATE_ADAPTER_BOUNDARY_STATUS =
  'sqlx_oauth_callback_state_store_adapter_no_auth_promotion';

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

export function validateAuthPasskeyChallengeStoreContract(
  value: unknown
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (readPath(value, 'contract.status') !== AUTH_PASSKEY_CHALLENGE_STORE_STATUS) {
    diagnostics.push(
      createCoreDiagnostic(
        AUTH_PASSKEY_CHALLENGE_STORE_FILE,
        'contract.status',
        `Core platform auth passkey challenge store contract must stay \`${AUTH_PASSKEY_CHALLENGE_STORE_STATUS}\` until live handlers are reviewed.`
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
        `Core platform auth passkey challenge store adapter boundary must stay \`${AUTH_PASSKEY_CHALLENGE_STORE_ADAPTER_BOUNDARY_STATUS}\` until live handlers are reviewed.`
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

export function validateAuthOauthCallbackStateContract(
  value: unknown
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (readPath(value, 'contract.status') !== AUTH_OAUTH_CALLBACK_STATE_STATUS) {
    diagnostics.push(
      createCoreDiagnostic(
        AUTH_OAUTH_CALLBACK_STATE_FILE,
        'contract.status',
        `Core platform auth OAuth callback state contract must stay \`${AUTH_OAUTH_CALLBACK_STATE_STATUS}\` until live handlers are reviewed.`
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
        `Core platform auth OAuth callback state adapter boundary must stay \`${AUTH_OAUTH_CALLBACK_STATE_ADAPTER_BOUNDARY_STATUS}\` until live handlers are reviewed.`
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
