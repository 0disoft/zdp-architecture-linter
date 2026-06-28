import type { Diagnostic } from '../../diagnostics.ts';
import {
  createCoreDiagnostic,
  readPath,
  validateRequiredStringArrayEntries
} from './contract-helpers.ts';

export const AUTH_IDEMPOTENCY_STORAGE_FILE =
  'contracts/auth-idempotency-storage.yaml';

export const AUTH_IDEMPOTENCY_STORAGE_STATUS = 'contract_only_no_storage';

export const AUTH_IDEMPOTENCY_STORAGE_ADAPTER_BOUNDARY_STATUS =
  'typed_adapter_boundary_no_migration';

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

export function validateAuthIdempotencyStorageContract(
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
