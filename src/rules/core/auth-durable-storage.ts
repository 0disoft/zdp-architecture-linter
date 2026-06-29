import type { Diagnostic } from '../../diagnostics.ts';
import {
  createCoreDiagnostic,
  readPath,
  validateExactValue,
  validateRequiredStringArrayEntries
} from './contract-helpers.ts';

export const AUTH_DURABLE_STORAGE_ADMISSION_FILE =
  'contracts/auth-durable-storage-admission.yaml';
export const AUTH_DURABLE_STORAGE_MIGRATION_READINESS_FILE =
  'contracts/auth-durable-storage-migration-readiness.yaml';
export const AUTH_DURABLE_STORAGE_TRANSACTION_OUTBOX_FILE =
  'contracts/auth-durable-storage-transaction-outbox.yaml';

export const AUTH_DURABLE_STORAGE_ADMISSION_STATUS =
  'contract_only_no_migration';
export const AUTH_DURABLE_STORAGE_ADMISSION_BOUNDARY_STATUS =
  'typed_durable_storage_admission_no_migration';
export const AUTH_DURABLE_STORAGE_MIGRATION_READINESS_STATUS =
  'repo_local_migration_preflight_present_no_apply';
export const AUTH_DURABLE_STORAGE_MIGRATION_READINESS_BOUNDARY_STATUS =
  'typed_migration_preflight_plan_check_no_apply';
export const AUTH_DURABLE_STORAGE_MIGRATION_PREFLIGHT_REVIEW_RECEIPT_BOUNDARY_STATUS =
  'typed_migration_preflight_review_receipt_no_apply';
export const AUTH_DURABLE_STORAGE_TRANSACTION_OUTBOX_STATUS =
  'sqlx_idempotency_transaction_outbox_adapter_present_no_dispatcher';
export const AUTH_DURABLE_STORAGE_TRANSACTION_OUTBOX_BOUNDARY_STATUS =
  'sqlx_transaction_outbox_adapter_no_dispatcher';

export interface AuthDurableStorageContractRefs {
  readonly authSessionRuntimeStatus: string;
  readonly authRuntimeReadinessFile: string;
  readonly authRuntimeAdmissionContextFile: string;
  readonly authRuntimeCommandPropagationFile: string;
}

const REQUIRED_AUTH_DURABLE_STORAGE_ADMISSION_FIELDS = [
  'target',
  'owner_boundary',
  'storage_ref',
  'schema_ref',
  'migration_plan_ref',
  'adapter_review_ref',
  'transaction_boundary_ref',
  'rollback_plan_ref',
  'operation_id',
  'actor_id',
  'tenant_id',
  'request_id',
  'trace_id',
  'idempotency_key',
  'command_id',
  'audit_event_ref',
  'resource_ref'
] as const;

const REQUIRED_AUTH_DURABLE_STORAGE_ADMISSION_TARGETS = [
  'identity_session_store',
  'passkey_challenge_store',
  'oauth_callback_state_store',
  'auth_audit_event_store',
  'auth_audit_storage_adapter',
  'idempotency_store',
  'refresh_token_rotation_storage'
] as const;

const REQUIRED_AUTH_DURABLE_STORAGE_ADMISSION_CONTROLS = [
  'migration_plan_ref_required',
  'migration_plan_review_required',
  'adapter_review_ref_required',
  'transaction_boundary_ref_required',
  'rollback_plan_ref_required',
  'schema_ref_required',
  'request_trace_idempotency_audit_metadata_required',
  'tenant_actor_scope_required',
  'raw_secret_storage_rejected',
  'raw_provider_payload_rejected',
  'no_db_migration',
  'no_live_handler'
] as const;

const REQUIRED_AUTH_DURABLE_STORAGE_ADMISSION_FORBIDDEN_VALUES = [
  'raw_request_body',
  'raw_secret',
  'refresh_token_plaintext',
  'session_secret_plaintext',
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

const REQUIRED_AUTH_DURABLE_STORAGE_ADMISSION_FORBIDDEN_CLAIMS = [
  'production_ready',
  'durable_storage_ready',
  'db_migration_ready',
  'live_auth_handler_ready',
  'oauth_provider_exchange_ready',
  'product_route_unblocked'
] as const;

const REQUIRED_AUTH_DURABLE_STORAGE_MIGRATION_READINESS_FIELDS = [
  'target',
  'owner_boundary',
  'storage_ref',
  'schema_ref',
  'migration_id',
  'migration_plan_ref',
  'schema_owner_ref',
  'rollback_plan_ref',
  'transaction_boundary_ref',
  'repo_local_migration_cli_ref',
  'migration_manifest_ref',
  'schema_history_ref',
  'migration_preflight_receipt_ref',
  'operator_approval_ref',
  'review_ref',
  'admission_plan_ref',
  'operation_id',
  'actor_id',
  'tenant_id',
  'request_id',
  'trace_id',
  'idempotency_key',
  'command_id',
  'audit_event_ref',
  'resource_ref'
] as const;

const REQUIRED_AUTH_DURABLE_STORAGE_MIGRATION_READINESS_CONTROLS = [
  'durable_storage_admission_source',
  'migration_id_required',
  'schema_owner_ref_required',
  'migration_plan_ref_required',
  'review_ref_required',
  'transaction_boundary_ref_required',
  'rollback_plan_ref_required',
  'seed_or_backfill_declared',
  'destructive_migration_rejected',
  'rollback_forward_or_revert_path_required',
  'repo_local_migration_cli_required',
  'migration_cli_plan_check_implemented',
  'migration_manifest_required',
  'schema_history_check_required',
  'migration_preflight_receipt_required',
  'migration_apply_disabled',
  'startup_migration_apply_disabled',
  'operator_migration_apply_approval_required',
  'live_database_connection_disabled_for_plan_check',
  'applied_migration_claim_rejected',
  'durable_adapter_promotion_blocked',
  'integration_review_required',
  'request_trace_idempotency_audit_metadata_required',
  'tenant_actor_scope_required',
  'raw_secret_storage_rejected',
  'raw_provider_payload_rejected',
  'no_live_handler'
] as const;

const REQUIRED_AUTH_DURABLE_STORAGE_MIGRATION_READINESS_FORBIDDEN_VALUES = [
  'raw_request_body',
  'raw_secret',
  'refresh_token_plaintext',
  'session_secret_plaintext',
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
  'attestation_object',
  'destructive_migration',
  'drop_table',
  'truncate_table',
  'migration_applied',
  'production_schema_applied'
] as const;

const REQUIRED_AUTH_DURABLE_STORAGE_MIGRATION_READINESS_FORBIDDEN_CLAIMS = [
  'production_ready',
  'durable_storage_ready',
  'db_migration_ready',
  'db_migration_applied',
  'durable_adapter_ready',
  'live_auth_handler_ready',
  'oauth_provider_exchange_ready',
  'product_route_unblocked'
] as const;

const REQUIRED_AUTH_DURABLE_STORAGE_MIGRATION_PREFLIGHT_REVIEW_RECEIPT_VALUES =
  [
    {
      path: 'migration_preflight_review_receipt.boundary_status',
      expected:
        AUTH_DURABLE_STORAGE_MIGRATION_PREFLIGHT_REVIEW_RECEIPT_BOUNDARY_STATUS,
      message: `Core platform auth durable storage migration preflight review receipt must stay \`${AUTH_DURABLE_STORAGE_MIGRATION_PREFLIGHT_REVIEW_RECEIPT_BOUNDARY_STATUS}\` and must not claim migration apply.`
    },
    {
      path: 'migration_preflight_review_receipt.checked_migration_files_required',
      expected: true,
      message:
        'Core platform auth durable storage migration preflight review receipt must require checked migration files.'
    },
    {
      path: 'migration_preflight_review_receipt.pending_migration_ids_required',
      expected: true,
      message:
        'Core platform auth durable storage migration preflight review receipt must require pending migration id evidence.'
    },
    {
      path: 'migration_preflight_review_receipt.migration_manifest_checked',
      expected: true,
      message:
        'Core platform auth durable storage migration preflight review receipt must check the migration manifest.'
    },
    {
      path: 'migration_preflight_review_receipt.repo_local_plan_check_checked',
      expected: true,
      message:
        'Core platform auth durable storage migration preflight review receipt must check the repo-local migration plan/check path.'
    },
    {
      path: 'migration_preflight_review_receipt.schema_history_checked',
      expected: true,
      message:
        'Core platform auth durable storage migration preflight review receipt must require schema history checking.'
    },
    {
      path: 'migration_preflight_review_receipt.rollback_plan_ref_required',
      expected: true,
      message:
        'Core platform auth durable storage migration preflight review receipt must require a rollback plan reference.'
    },
    {
      path: 'migration_preflight_review_receipt.rollback_forward_or_revert_path_checked',
      expected: true,
      message:
        'Core platform auth durable storage migration preflight review receipt must check rollback-forward or revert path evidence.'
    },
    {
      path: 'migration_preflight_review_receipt.destructive_migration_rejected',
      expected: true,
      message:
        'Core platform auth durable storage migration preflight review receipt must reject destructive migration claims.'
    },
    {
      path: 'migration_preflight_review_receipt.operator_approval_required',
      expected: true,
      message:
        'Core platform auth durable storage migration preflight review receipt must keep operator approval required.'
    },
    {
      path: 'migration_preflight_review_receipt.durable_adapter_promotion_blocked',
      expected: true,
      message:
        'Core platform auth durable storage migration preflight review receipt must keep durable adapter promotion blocked.'
    },
    {
      path: 'migration_preflight_review_receipt.migration_apply_enabled',
      expected: false,
      message:
        'Core platform auth durable storage migration preflight review receipt must keep migration_apply_enabled false.'
    },
    {
      path: 'migration_preflight_review_receipt.startup_migration_apply_enabled',
      expected: false,
      message:
        'Core platform auth durable storage migration preflight review receipt must keep startup_migration_apply_enabled false.'
    },
    {
      path: 'migration_preflight_review_receipt.live_database_connection_enabled',
      expected: false,
      message:
        'Core platform auth durable storage migration preflight review receipt must keep live_database_connection_enabled false for plan/check proof.'
    },
    {
      path: 'migration_preflight_review_receipt.live_migration_applied',
      expected: false,
      message:
        'Core platform auth durable storage migration preflight review receipt must keep live_migration_applied false.'
    },
    {
      path: 'migration_preflight_review_receipt.live_auth_handler_enabled',
      expected: false,
      message:
        'Core platform auth durable storage migration preflight review receipt must keep live_auth_handler_enabled false.'
    },
    {
      path: 'migration_preflight_review_receipt.product_route_unblocked',
      expected: false,
      message:
        'Core platform auth durable storage migration preflight review receipt must keep product_route_unblocked false.'
    },
    {
      path: 'migration_preflight_review_receipt.review_status',
      expected: 'integration_review_pending',
      message:
        'Core platform auth durable storage migration preflight review receipt must keep review_status `integration_review_pending`.'
    },
    {
      path: 'migration_preflight_review_receipt.promotion_blocker',
      expected: 'auth_durable_storage_migration_preflight_review_pending',
      message:
        'Core platform auth durable storage migration preflight review receipt must keep promotion blocker `auth_durable_storage_migration_preflight_review_pending`.'
    }
  ] as const;

const REQUIRED_AUTH_DURABLE_STORAGE_TRANSACTION_OUTBOX_FIELDS = [
  'target',
  'owner_boundary',
  'transaction_boundary_ref',
  'outbox_record_ref',
  'commit_receipt_ref',
  'rollback_receipt_ref',
  'replay_ref',
  'review_ref',
  'migration_readiness_plan_ref',
  'storage_ref',
  'schema_ref',
  'migration_id',
  'operation_id',
  'actor_id',
  'tenant_id',
  'request_id',
  'trace_id',
  'idempotency_key',
  'command_id',
  'audit_event_ref',
  'resource_ref'
] as const;

const REQUIRED_AUTH_DURABLE_STORAGE_TRANSACTION_OUTBOX_CONTROLS = [
  'migration_readiness_source',
  'transaction_boundary_ref_required',
  'outbox_record_ref_required',
  'atomic_state_and_outbox_required',
  'commit_receipt_ref_required',
  'rollback_receipt_ref_required',
  'replay_ref_required',
  'audit_event_ref_required',
  'idempotency_metadata_required',
  'request_trace_metadata_required',
  'tenant_actor_scope_required',
  'external_effect_after_commit_only',
  'raw_secret_storage_rejected',
  'raw_provider_payload_rejected',
  'sqlx_transaction_manager_implemented',
  'idempotency_state_and_outbox_adapter_implemented',
  'state_and_outbox_committed_atomically',
  'outbox_dispatcher_not_started',
  'consumer_inbox_not_started',
  'replay_worker_not_started',
  'dispatcher_replay_review_required',
  'no_outbox_dispatcher',
  'no_live_handler'
] as const;

const REQUIRED_AUTH_DURABLE_STORAGE_TRANSACTION_OUTBOX_FORBIDDEN_VALUES = [
  'raw_request_body',
  'raw_secret',
  'refresh_token_plaintext',
  'session_secret_plaintext',
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
  'attestation_object',
  'provider_call_inside_transaction',
  'external_effect_inside_transaction',
  'outbox_dispatched'
] as const;

const REQUIRED_AUTH_DURABLE_STORAGE_TRANSACTION_OUTBOX_FORBIDDEN_CLAIMS = [
  'production_ready',
  'durable_storage_ready',
  'db_migration_ready',
  'db_migration_applied',
  'transaction_manager_ready',
  'outbox_dispatcher_ready',
  'consumer_inbox_ready',
  'event_replay_ready',
  'money_realtime_sync_ready',
  'durable_adapter_ready',
  'live_auth_handler_ready',
  'oauth_provider_exchange_ready',
  'product_route_unblocked'
] as const;

export function validateAuthDurableStorageAdmissionContract(input: {
  readonly value: unknown;
  readonly refs: AuthDurableStorageContractRefs;
}): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (
    readPath(input.value, 'contract.status') !==
    AUTH_DURABLE_STORAGE_ADMISSION_STATUS
  ) {
    diagnostics.push(
      createCoreDiagnostic(
        AUTH_DURABLE_STORAGE_ADMISSION_FILE,
        'contract.status',
        `Core platform auth durable storage admission contract must stay \`${AUTH_DURABLE_STORAGE_ADMISSION_STATUS}\` until migrations exist.`
      )
    );
  }

  if (readPath(input.value, 'contract.owner_boundary') !== 'identity') {
    diagnostics.push(
      createCoreDiagnostic(
        AUTH_DURABLE_STORAGE_ADMISSION_FILE,
        'contract.owner_boundary',
        'Core platform auth durable storage admission contract must keep owner_boundary `identity`.'
      )
    );
  }

  if (
    readPath(input.value, 'contract.runtime_status') !==
    input.refs.authSessionRuntimeStatus
  ) {
    diagnostics.push(
      createCoreDiagnostic(
        AUTH_DURABLE_STORAGE_ADMISSION_FILE,
        'contract.runtime_status',
        `Core platform auth durable storage admission contract must keep runtime_status \`${input.refs.authSessionRuntimeStatus}\`.`
      )
    );
  }

  diagnostics.push(
    ...validateRequiredStringArrayEntries({
      value: input.value,
      file: AUTH_DURABLE_STORAGE_ADMISSION_FILE,
      path: 'contract.source_contracts',
      field: 'contract.source_contracts',
      requiredEntries: [
        input.refs.authRuntimeAdmissionContextFile,
        input.refs.authRuntimeCommandPropagationFile
      ]
    })
  );

  if (
    readPath(input.value, 'contract.typed_boundary_status') !==
    AUTH_DURABLE_STORAGE_ADMISSION_BOUNDARY_STATUS
  ) {
    diagnostics.push(
      createCoreDiagnostic(
        AUTH_DURABLE_STORAGE_ADMISSION_FILE,
        'contract.typed_boundary_status',
        `Core platform auth durable storage admission boundary must stay \`${AUTH_DURABLE_STORAGE_ADMISSION_BOUNDARY_STATUS}\` until migration-backed adapters exist.`
      )
    );
  }

  diagnostics.push(
    ...validateRequiredStringArrayEntries({
      value: input.value,
      file: AUTH_DURABLE_STORAGE_ADMISSION_FILE,
      path: 'required_admission_fields',
      field: 'required_admission_fields',
      requiredEntries: REQUIRED_AUTH_DURABLE_STORAGE_ADMISSION_FIELDS
    }),
    ...validateRequiredStringArrayEntries({
      value: input.value,
      file: AUTH_DURABLE_STORAGE_ADMISSION_FILE,
      path: 'supported_targets',
      field: 'supported_targets',
      requiredEntries: REQUIRED_AUTH_DURABLE_STORAGE_ADMISSION_TARGETS
    }),
    ...validateRequiredStringArrayEntries({
      value: input.value,
      file: AUTH_DURABLE_STORAGE_ADMISSION_FILE,
      path: 'required_controls',
      field: 'required_controls',
      requiredEntries: REQUIRED_AUTH_DURABLE_STORAGE_ADMISSION_CONTROLS
    }),
    ...validateRequiredStringArrayEntries({
      value: input.value,
      file: AUTH_DURABLE_STORAGE_ADMISSION_FILE,
      path: 'forbidden_admission_values',
      field: 'forbidden_admission_values',
      requiredEntries: REQUIRED_AUTH_DURABLE_STORAGE_ADMISSION_FORBIDDEN_VALUES
    }),
    ...validateRequiredStringArrayEntries({
      value: input.value,
      file: AUTH_DURABLE_STORAGE_ADMISSION_FILE,
      path: 'forbidden_readiness_claims',
      field: 'forbidden_readiness_claims',
      requiredEntries: REQUIRED_AUTH_DURABLE_STORAGE_ADMISSION_FORBIDDEN_CLAIMS
    })
  );

  return diagnostics;
}

export function validateAuthDurableStorageMigrationReadinessContract(input: {
  readonly value: unknown;
  readonly refs: AuthDurableStorageContractRefs;
}): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (
    readPath(input.value, 'contract.status') !==
    AUTH_DURABLE_STORAGE_MIGRATION_READINESS_STATUS
  ) {
    diagnostics.push(
      createCoreDiagnostic(
        AUTH_DURABLE_STORAGE_MIGRATION_READINESS_FILE,
        'contract.status',
        `Core platform auth durable storage migration readiness contract must stay \`${AUTH_DURABLE_STORAGE_MIGRATION_READINESS_STATUS}\` while only repo-local migration plan/check preflight exists and migration apply remains disabled.`
      )
    );
  }

  if (readPath(input.value, 'contract.owner_boundary') !== 'identity') {
    diagnostics.push(
      createCoreDiagnostic(
        AUTH_DURABLE_STORAGE_MIGRATION_READINESS_FILE,
        'contract.owner_boundary',
        'Core platform auth durable storage migration readiness contract must keep owner_boundary `identity`.'
      )
    );
  }

  if (
    readPath(input.value, 'contract.runtime_status') !==
    input.refs.authSessionRuntimeStatus
  ) {
    diagnostics.push(
      createCoreDiagnostic(
        AUTH_DURABLE_STORAGE_MIGRATION_READINESS_FILE,
        'contract.runtime_status',
        `Core platform auth durable storage migration readiness contract must keep runtime_status \`${input.refs.authSessionRuntimeStatus}\`.`
      )
    );
  }

  diagnostics.push(
    ...validateRequiredStringArrayEntries({
      value: input.value,
      file: AUTH_DURABLE_STORAGE_MIGRATION_READINESS_FILE,
      path: 'contract.source_contracts',
      field: 'contract.source_contracts',
      requiredEntries: [
        AUTH_DURABLE_STORAGE_ADMISSION_FILE,
        input.refs.authRuntimeReadinessFile
      ]
    })
  );

  if (
    readPath(input.value, 'contract.typed_boundary_status') !==
    AUTH_DURABLE_STORAGE_MIGRATION_READINESS_BOUNDARY_STATUS
  ) {
    diagnostics.push(
      createCoreDiagnostic(
        AUTH_DURABLE_STORAGE_MIGRATION_READINESS_FILE,
        'contract.typed_boundary_status',
        `Core platform auth durable storage migration readiness boundary must stay \`${AUTH_DURABLE_STORAGE_MIGRATION_READINESS_BOUNDARY_STATUS}\` until migration apply, durable adapter promotion, and live auth handlers are reviewed.`
      )
    );
  }

  diagnostics.push(
    ...validateRequiredStringArrayEntries({
      value: input.value,
      file: AUTH_DURABLE_STORAGE_MIGRATION_READINESS_FILE,
      path: 'required_readiness_fields',
      field: 'required_readiness_fields',
      requiredEntries: REQUIRED_AUTH_DURABLE_STORAGE_MIGRATION_READINESS_FIELDS
    }),
    ...validateRequiredStringArrayEntries({
      value: input.value,
      file: AUTH_DURABLE_STORAGE_MIGRATION_READINESS_FILE,
      path: 'supported_targets',
      field: 'supported_targets',
      requiredEntries: REQUIRED_AUTH_DURABLE_STORAGE_ADMISSION_TARGETS
    }),
    ...validateRequiredStringArrayEntries({
      value: input.value,
      file: AUTH_DURABLE_STORAGE_MIGRATION_READINESS_FILE,
      path: 'required_controls',
      field: 'required_controls',
      requiredEntries: REQUIRED_AUTH_DURABLE_STORAGE_MIGRATION_READINESS_CONTROLS
    }),
    ...validateRequiredStringArrayEntries({
      value: input.value,
      file: AUTH_DURABLE_STORAGE_MIGRATION_READINESS_FILE,
      path: 'forbidden_migration_values',
      field: 'forbidden_migration_values',
      requiredEntries:
        REQUIRED_AUTH_DURABLE_STORAGE_MIGRATION_READINESS_FORBIDDEN_VALUES
    }),
    ...validateRequiredStringArrayEntries({
      value: input.value,
      file: AUTH_DURABLE_STORAGE_MIGRATION_READINESS_FILE,
      path: 'forbidden_readiness_claims',
      field: 'forbidden_readiness_claims',
      requiredEntries:
        REQUIRED_AUTH_DURABLE_STORAGE_MIGRATION_READINESS_FORBIDDEN_CLAIMS
    })
  );

  for (const receiptValue of REQUIRED_AUTH_DURABLE_STORAGE_MIGRATION_PREFLIGHT_REVIEW_RECEIPT_VALUES) {
    diagnostics.push(
      ...validateExactValue({
        value: input.value,
        file: AUTH_DURABLE_STORAGE_MIGRATION_READINESS_FILE,
        path: receiptValue.path,
        expected: receiptValue.expected,
        message: receiptValue.message
      })
    );
  }

  return diagnostics;
}

export function validateAuthDurableStorageTransactionOutboxContract(input: {
  readonly value: unknown;
  readonly refs: AuthDurableStorageContractRefs;
}): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (
    readPath(input.value, 'contract.status') !==
    AUTH_DURABLE_STORAGE_TRANSACTION_OUTBOX_STATUS
  ) {
    diagnostics.push(
      createCoreDiagnostic(
        AUTH_DURABLE_STORAGE_TRANSACTION_OUTBOX_FILE,
        'contract.status',
        `Core platform auth durable storage transaction/outbox contract must stay \`${AUTH_DURABLE_STORAGE_TRANSACTION_OUTBOX_STATUS}\` after the SQLx idempotency transaction outbox adapter exists but before dispatchers or live auth handlers are promoted.`
      )
    );
  }

  if (readPath(input.value, 'contract.owner_boundary') !== 'identity') {
    diagnostics.push(
      createCoreDiagnostic(
        AUTH_DURABLE_STORAGE_TRANSACTION_OUTBOX_FILE,
        'contract.owner_boundary',
        'Core platform auth durable storage transaction/outbox contract must keep owner_boundary `identity`.'
      )
    );
  }

  if (
    readPath(input.value, 'contract.runtime_status') !==
    input.refs.authSessionRuntimeStatus
  ) {
    diagnostics.push(
      createCoreDiagnostic(
        AUTH_DURABLE_STORAGE_TRANSACTION_OUTBOX_FILE,
        'contract.runtime_status',
        `Core platform auth durable storage transaction/outbox contract must keep runtime_status \`${input.refs.authSessionRuntimeStatus}\`.`
      )
    );
  }

  diagnostics.push(
    ...validateRequiredStringArrayEntries({
      value: input.value,
      file: AUTH_DURABLE_STORAGE_TRANSACTION_OUTBOX_FILE,
      path: 'contract.source_contracts',
      field: 'contract.source_contracts',
      requiredEntries: [
        AUTH_DURABLE_STORAGE_MIGRATION_READINESS_FILE,
        input.refs.authRuntimeReadinessFile
      ]
    })
  );

  if (
    readPath(input.value, 'contract.typed_boundary_status') !==
    AUTH_DURABLE_STORAGE_TRANSACTION_OUTBOX_BOUNDARY_STATUS
  ) {
    diagnostics.push(
      createCoreDiagnostic(
        AUTH_DURABLE_STORAGE_TRANSACTION_OUTBOX_FILE,
        'contract.typed_boundary_status',
        `Core platform auth durable storage transaction/outbox boundary must stay \`${AUTH_DURABLE_STORAGE_TRANSACTION_OUTBOX_BOUNDARY_STATUS}\` after the SQLx transaction outbox adapter exists but before dispatchers or live auth handlers are promoted.`
      )
    );
  }

  diagnostics.push(
    ...validateRequiredStringArrayEntries({
      value: input.value,
      file: AUTH_DURABLE_STORAGE_TRANSACTION_OUTBOX_FILE,
      path: 'required_boundary_fields',
      field: 'required_boundary_fields',
      requiredEntries: REQUIRED_AUTH_DURABLE_STORAGE_TRANSACTION_OUTBOX_FIELDS
    }),
    ...validateRequiredStringArrayEntries({
      value: input.value,
      file: AUTH_DURABLE_STORAGE_TRANSACTION_OUTBOX_FILE,
      path: 'supported_targets',
      field: 'supported_targets',
      requiredEntries: REQUIRED_AUTH_DURABLE_STORAGE_ADMISSION_TARGETS
    }),
    ...validateRequiredStringArrayEntries({
      value: input.value,
      file: AUTH_DURABLE_STORAGE_TRANSACTION_OUTBOX_FILE,
      path: 'required_controls',
      field: 'required_controls',
      requiredEntries: REQUIRED_AUTH_DURABLE_STORAGE_TRANSACTION_OUTBOX_CONTROLS
    }),
    ...validateRequiredStringArrayEntries({
      value: input.value,
      file: AUTH_DURABLE_STORAGE_TRANSACTION_OUTBOX_FILE,
      path: 'forbidden_boundary_values',
      field: 'forbidden_boundary_values',
      requiredEntries:
        REQUIRED_AUTH_DURABLE_STORAGE_TRANSACTION_OUTBOX_FORBIDDEN_VALUES
    }),
    ...validateRequiredStringArrayEntries({
      value: input.value,
      file: AUTH_DURABLE_STORAGE_TRANSACTION_OUTBOX_FILE,
      path: 'forbidden_readiness_claims',
      field: 'forbidden_readiness_claims',
      requiredEntries:
        REQUIRED_AUTH_DURABLE_STORAGE_TRANSACTION_OUTBOX_FORBIDDEN_CLAIMS
    })
  );

  return diagnostics;
}
