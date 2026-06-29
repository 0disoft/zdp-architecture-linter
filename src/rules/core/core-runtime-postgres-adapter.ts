import type { Diagnostic } from '../../diagnostics.ts';
import { readPath, validateExactValue } from './contract-helpers.ts';

export const CORE_RUNTIME_POSTGRES_ADAPTER_FILE =
  'contracts/core-runtime-postgres-adapter.yaml';

export const CORE_RUNTIME_POSTGRES_ADAPTER_STATUS =
  'sqlx_transaction_outbox_audit_session_passkey_and_oauth_adapter_present_no_live_auth_handler';

export const CORE_RUNTIME_POSTGRES_ADAPTER_BOUNDARY_STATUS =
  'typed_postgres_adapter_sqlx_pool_no_live_auth_handler';

export const CORE_RUNTIME_LIVE_AUTH_INTEGRATION_REVIEW_RECEIPT_BOUNDARY_STATUS =
  'typed_core_runtime_live_auth_integration_review_receipt_no_live_handler';

const REQUIRED_CORE_RUNTIME_POSTGRES_ADAPTER_VALUES = [
  {
    path: 'contract.status',
    expected: CORE_RUNTIME_POSTGRES_ADAPTER_STATUS,
    message: `Core platform runtime PostgreSQL adapter contract must stay \`${CORE_RUNTIME_POSTGRES_ADAPTER_STATUS}\` until live auth handlers are reviewed.`
  },
  {
    path: 'contract.typed_boundary_status',
    expected: CORE_RUNTIME_POSTGRES_ADAPTER_BOUNDARY_STATUS,
    message: `Core platform runtime PostgreSQL adapter boundary must stay \`${CORE_RUNTIME_POSTGRES_ADAPTER_BOUNDARY_STATUS}\`.`
  },
  {
    path: 'adapter_contract.live_migration_applied',
    expected: false,
    message:
      'Core platform runtime PostgreSQL adapter must keep live_migration_applied false.'
  },
  {
    path: 'adapter_contract.live_outbox_dispatcher_implemented',
    expected: false,
    message:
      'Core platform runtime PostgreSQL adapter must keep live_outbox_dispatcher_implemented false.'
  },
  {
    path: 'core_runtime_live_auth_integration_review_receipt.boundary_status',
    expected: CORE_RUNTIME_LIVE_AUTH_INTEGRATION_REVIEW_RECEIPT_BOUNDARY_STATUS,
    message: `Core platform runtime live auth integration review receipt must stay \`${CORE_RUNTIME_LIVE_AUTH_INTEGRATION_REVIEW_RECEIPT_BOUNDARY_STATUS}\` and must not claim live auth readiness.`
  },
  {
    path: 'core_runtime_live_auth_integration_review_receipt.runtime_foundation_contract_checked',
    expected: true,
    message:
      'Core platform runtime live auth integration review receipt must check the runtime foundation contract.'
  },
  {
    path: 'core_runtime_live_auth_integration_review_receipt.postgres_adapter_contract_checked',
    expected: true,
    message:
      'Core platform runtime live auth integration review receipt must check the PostgreSQL adapter contract.'
  },
  {
    path: 'core_runtime_live_auth_integration_review_receipt.migration_preflight_receipt_checked',
    expected: true,
    message:
      'Core platform runtime live auth integration review receipt must check migration preflight evidence.'
  },
  {
    path: 'core_runtime_live_auth_integration_review_receipt.idempotency_adapter_checked',
    expected: true,
    message:
      'Core platform runtime live auth integration review receipt must check the idempotency adapter.'
  },
  {
    path: 'core_runtime_live_auth_integration_review_receipt.transaction_outbox_adapter_checked',
    expected: true,
    message:
      'Core platform runtime live auth integration review receipt must check the transaction/outbox adapter.'
  },
  {
    path: 'core_runtime_live_auth_integration_review_receipt.audit_storage_adapter_checked',
    expected: true,
    message:
      'Core platform runtime live auth integration review receipt must check the audit storage adapter.'
  },
  {
    path: 'core_runtime_live_auth_integration_review_receipt.session_store_adapter_checked',
    expected: true,
    message:
      'Core platform runtime live auth integration review receipt must check the session store adapter.'
  },
  {
    path: 'core_runtime_live_auth_integration_review_receipt.passkey_challenge_store_adapter_checked',
    expected: true,
    message:
      'Core platform runtime live auth integration review receipt must check the passkey challenge store adapter.'
  },
  {
    path: 'core_runtime_live_auth_integration_review_receipt.oauth_callback_state_store_adapter_checked',
    expected: true,
    message:
      'Core platform runtime live auth integration review receipt must check the OAuth callback state store adapter.'
  },
  {
    path: 'core_runtime_live_auth_integration_review_receipt.dispatcher_replay_review_receipt_checked',
    expected: true,
    message:
      'Core platform runtime live auth integration review receipt must check dispatcher/replay review evidence.'
  },
  {
    path: 'core_runtime_live_auth_integration_review_receipt.credential_vault_live_client_review_receipt_checked',
    expected: true,
    message:
      'Core platform runtime live auth integration review receipt must check credential vault live-client review evidence.'
  },
  {
    path: 'core_runtime_live_auth_integration_review_receipt.auth_audit_integration_review_receipt_checked',
    expected: true,
    message:
      'Core platform runtime live auth integration review receipt must check auth audit integration review evidence.'
  },
  {
    path: 'core_runtime_live_auth_integration_review_receipt.live_auth_handler_enabled',
    expected: false,
    message:
      'Core platform runtime live auth integration review receipt must keep live_auth_handler_enabled false.'
  },
  {
    path: 'core_runtime_live_auth_integration_review_receipt.product_route_unblocked',
    expected: false,
    message:
      'Core platform runtime live auth integration review receipt must keep product_route_unblocked false.'
  },
  {
    path: 'core_runtime_live_auth_integration_review_receipt.migration_apply_enabled',
    expected: false,
    message:
      'Core platform runtime live auth integration review receipt must keep migration_apply_enabled false.'
  },
  {
    path: 'core_runtime_live_auth_integration_review_receipt.startup_migration_apply_enabled',
    expected: false,
    message:
      'Core platform runtime live auth integration review receipt must keep startup_migration_apply_enabled false.'
  },
  {
    path: 'core_runtime_live_auth_integration_review_receipt.dispatcher_worker_started',
    expected: false,
    message:
      'Core platform runtime live auth integration review receipt must keep dispatcher_worker_started false.'
  },
  {
    path: 'core_runtime_live_auth_integration_review_receipt.replay_worker_started',
    expected: false,
    message:
      'Core platform runtime live auth integration review receipt must keep replay_worker_started false.'
  },
  {
    path: 'core_runtime_live_auth_integration_review_receipt.provider_token_exchange_enabled',
    expected: false,
    message:
      'Core platform runtime live auth integration review receipt must keep provider_token_exchange_enabled false.'
  },
  {
    path: 'core_runtime_live_auth_integration_review_receipt.live_success_without_audit_append_receipt_rejected',
    expected: true,
    message:
      'Core platform runtime live auth integration review receipt must reject live success without audit append receipt evidence.'
  },
  {
    path: 'core_runtime_live_auth_integration_review_receipt.live_success_without_idempotency_completion_rejected',
    expected: true,
    message:
      'Core platform runtime live auth integration review receipt must reject live success without idempotency completion evidence.'
  },
  {
    path: 'core_runtime_live_auth_integration_review_receipt.live_success_without_session_store_receipt_rejected',
    expected: true,
    message:
      'Core platform runtime live auth integration review receipt must reject live success without session store receipt evidence.'
  },
  {
    path: 'core_runtime_live_auth_integration_review_receipt.raw_payload_serialized',
    expected: false,
    message:
      'Core platform runtime live auth integration review receipt must keep raw_payload_serialized false.'
  },
  {
    path: 'core_runtime_live_auth_integration_review_receipt.review_status',
    expected: 'typed_integration_review_passed',
    message:
      'Core platform runtime live auth integration review receipt must keep review_status `typed_integration_review_passed`.'
  }
] as const;

export function validateCoreRuntimePostgresAdapterContract(
  value: unknown
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const requiredValue of REQUIRED_CORE_RUNTIME_POSTGRES_ADAPTER_VALUES) {
    diagnostics.push(
      ...validateExactValue({
        value,
        file: CORE_RUNTIME_POSTGRES_ADAPTER_FILE,
        path: requiredValue.path,
        expected: requiredValue.expected,
        message: requiredValue.message
      })
    );
  }

  if (
    readPath(
      value,
      'core_runtime_live_auth_integration_review_receipt.promotion_blocker'
    ) !== undefined
  ) {
    diagnostics.push({
      ruleId: 'ZDP-CORE-001',
      severity: 'error',
      file: CORE_RUNTIME_POSTGRES_ADAPTER_FILE,
      path: 'core_runtime_live_auth_integration_review_receipt.promotion_blocker',
      message:
        'Core platform runtime live auth integration review receipt must omit promotion_blocker after typed integration review passes.'
    });
  }

  if (
    readPath(value, 'adapter_contract.live_auth_audit_storage_implemented') !==
    true
  ) {
    diagnostics.push(
      ...validateExactValue({
        value,
        file: CORE_RUNTIME_POSTGRES_ADAPTER_FILE,
        path: 'adapter_contract.live_auth_audit_storage_implemented',
        expected: true,
        message:
          'Core platform runtime PostgreSQL adapter must keep live_auth_audit_storage_implemented true after the SQLx audit adapter exists.'
      })
    );
  }

  return diagnostics;
}
