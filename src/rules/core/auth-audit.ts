import type { Diagnostic } from '../../diagnostics.ts';
import {
  createCoreDiagnostic,
  readPath,
  validateRequiredStringArrayEntries
} from './contract-helpers.ts';

export const AUTH_AUDIT_EVENT_PERSISTENCE_FILE =
  'contracts/auth-audit-event-persistence.yaml';

export const AUTH_AUDIT_STORAGE_ADAPTER_FILE =
  'contracts/auth-audit-storage-adapter.yaml';

export const AUTH_AUDIT_EVENT_PERSISTENCE_STATUS =
  'append_receipt_gate_no_durable_store';

export const AUTH_AUDIT_STORAGE_ADAPTER_STATUS = 'contract_only_no_adapter';

export const AUTH_AUDIT_STORAGE_ADAPTER_BOUNDARY_STATUS =
  'typed_adapter_boundary_no_migration';

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

export function validateAuthAuditEventPersistenceContract(
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

export function validateAuthAuditStorageAdapterContract(
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
