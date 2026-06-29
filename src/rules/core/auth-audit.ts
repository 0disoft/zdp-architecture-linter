import type { Diagnostic } from '../../diagnostics.ts';
import {
  createCoreDiagnostic,
  readPath,
  validateExactValue,
  validateRequiredStringArrayEntries
} from './contract-helpers.ts';

export const AUTH_AUDIT_EVENT_PERSISTENCE_FILE =
  'contracts/auth-audit-event-persistence.yaml';

export const AUTH_AUDIT_STORAGE_ADAPTER_FILE =
  'contracts/auth-audit-storage-adapter.yaml';

export const AUTH_AUDIT_EVENT_PERSISTENCE_STATUS =
  'sqlx_audit_persistence_adapter_present_no_live_handler';

export const AUTH_AUDIT_STORAGE_ADAPTER_STATUS =
  'sqlx_adapter_present_no_live_handler';

export const AUTH_AUDIT_STORAGE_ADAPTER_BOUNDARY_STATUS =
  'sqlx_auth_audit_storage_adapter_no_auth_promotion';

export const AUTH_AUDIT_INTEGRATION_REVIEW_RECEIPT_BOUNDARY_STATUS =
  'typed_auth_audit_integration_review_receipt_no_live_handler';

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

const REQUIRED_AUTH_AUDIT_INTEGRATION_REVIEW_RECEIPT_VALUES = [
  {
    path: 'auth_audit_integration_review_receipt.boundary_status',
    expected: AUTH_AUDIT_INTEGRATION_REVIEW_RECEIPT_BOUNDARY_STATUS,
    message: `Core platform auth audit integration review receipt must stay \`${AUTH_AUDIT_INTEGRATION_REVIEW_RECEIPT_BOUNDARY_STATUS}\` and must not claim live auth handler readiness.`
  },
  {
    path: 'auth_audit_integration_review_receipt.audit_event_persistence_contract_checked',
    expected: true,
    message:
      'Core platform auth audit integration review receipt must check the audit event persistence contract.'
  },
  {
    path: 'auth_audit_integration_review_receipt.audit_storage_adapter_contract_checked',
    expected: true,
    message:
      'Core platform auth audit integration review receipt must check the audit storage adapter contract.'
  },
  {
    path: 'auth_audit_integration_review_receipt.sqlx_adapter_receipt_checked',
    expected: true,
    message:
      'Core platform auth audit integration review receipt must check the SQLx adapter receipt.'
  },
  {
    path: 'auth_audit_integration_review_receipt.append_only_storage_checked',
    expected: true,
    message:
      'Core platform auth audit integration review receipt must check append-only audit storage enforcement.'
  },
  {
    path: 'auth_audit_integration_review_receipt.unique_event_id_checked',
    expected: true,
    message:
      'Core platform auth audit integration review receipt must check unique audit event id enforcement.'
  },
  {
    path: 'auth_audit_integration_review_receipt.transaction_or_outbox_ref_required',
    expected: true,
    message:
      'Core platform auth audit integration review receipt must require a transaction or outbox reference.'
  },
  {
    path: 'auth_audit_integration_review_receipt.transaction_or_outbox_atomicity_checked',
    expected: true,
    message:
      'Core platform auth audit integration review receipt must check transaction/outbox atomicity before auth success can be reviewed.'
  },
  {
    path: 'auth_audit_integration_review_receipt.append_receipt_required_before_auth_success',
    expected: true,
    message:
      'Core platform auth audit integration review receipt must keep append receipt evidence required before auth success.'
  },
  {
    path: 'auth_audit_integration_review_receipt.audit_write_failure_blocks_auth_success',
    expected: true,
    message:
      'Core platform auth audit integration review receipt must keep audit write failure blocking auth success.'
  },
  {
    path: 'auth_audit_integration_review_receipt.audit_success_gate_checked',
    expected: true,
    message:
      'Core platform auth audit integration review receipt must check the audit success gate before auth success.'
  },
  {
    path: 'auth_audit_integration_review_receipt.failure_event_evidence_required',
    expected: true,
    message:
      'Core platform auth audit integration review receipt must require failure event evidence.'
  },
  {
    path: 'auth_audit_integration_review_receipt.failed_outcome_evidence_checked',
    expected: true,
    message:
      'Core platform auth audit integration review receipt must check failed outcome evidence handling.'
  },
  {
    path: 'auth_audit_integration_review_receipt.redacted_summary_only',
    expected: true,
    message:
      'Core platform auth audit integration review receipt must keep redacted summary only evidence.'
  },
  {
    path: 'auth_audit_integration_review_receipt.live_success_without_append_receipt_rejected',
    expected: true,
    message:
      'Core platform auth audit integration review receipt must reject live auth success without an append receipt.'
  },
  {
    path: 'auth_audit_integration_review_receipt.raw_payload_serialized',
    expected: false,
    message:
      'Core platform auth audit integration review receipt must keep raw_payload_serialized false.'
  },
  {
    path: 'auth_audit_integration_review_receipt.live_auth_handler_enabled',
    expected: false,
    message:
      'Core platform auth audit integration review receipt must keep live_auth_handler_enabled false.'
  },
  {
    path: 'auth_audit_integration_review_receipt.product_route_unblocked',
    expected: false,
    message:
      'Core platform auth audit integration review receipt must keep product_route_unblocked false.'
  },
  {
    path: 'auth_audit_integration_review_receipt.dispatcher_or_replay_dependency_unblocked',
    expected: false,
    message:
      'Core platform auth audit integration review receipt must keep dispatcher_or_replay_dependency_unblocked false.'
  },
  {
    path: 'auth_audit_integration_review_receipt.review_status',
    expected: 'typed_integration_review_passed',
    message:
      'Core platform auth audit integration review receipt must keep review_status `typed_integration_review_passed` after audit append gating, SQLx storage, failure evidence, and transaction/outbox references are checked.'
  }
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
        `Core platform auth audit event persistence contract must stay \`${AUTH_AUDIT_EVENT_PERSISTENCE_STATUS}\` after the SQLx audit adapter exists but before live auth handlers are promoted.`
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
        `Core platform auth audit storage adapter contract must stay \`${AUTH_AUDIT_STORAGE_ADAPTER_STATUS}\` after the SQLx adapter exists but before live auth handlers are promoted.`
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

  for (const receiptValue of REQUIRED_AUTH_AUDIT_INTEGRATION_REVIEW_RECEIPT_VALUES) {
    diagnostics.push(
      ...validateExactValue({
        value,
        file: AUTH_AUDIT_STORAGE_ADAPTER_FILE,
        path: receiptValue.path,
        expected: receiptValue.expected,
        message: receiptValue.message
      })
    );
  }

  if (
    readPath(
      value,
      'auth_audit_integration_review_receipt.promotion_blocker'
    ) !== undefined
  ) {
    diagnostics.push(
      createCoreDiagnostic(
        AUTH_AUDIT_STORAGE_ADAPTER_FILE,
        'auth_audit_integration_review_receipt.promotion_blocker',
        'Core platform auth audit integration review receipt must omit `promotion_blocker` after typed audit integration review passes.'
      )
    );
  }

  return diagnostics;
}
