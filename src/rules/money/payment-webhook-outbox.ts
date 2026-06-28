import type { Diagnostic } from '../../diagnostics.ts';
import {
  MONEY_PAYMENT_WEBHOOK_OUTBOX_RULE_ID,
  MONEY_REPOSITORY_NAME,
  validateExactValue,
  validateRequiredStringArrayEntries
} from './contract-helpers.ts';

export const PAYMENT_WEBHOOK_FILE = 'contracts/payment-webhook.yaml';
export const MONEY_DB_SCHEMA_FILE = 'contracts/money-db-schema.yaml';

const REQUIRED_WEBHOOK_FIELDS = [
  'provider',
  'provider_event_id',
  'event_type',
  'received_at',
  'signature_verified',
  'idempotency_key',
  'request_id',
  'trace_id',
  'payload_hash',
  'raw_payload_ref'
] as const;

const REQUIRED_WEBHOOK_FORBIDDEN_ITEMS = [
  'logging_raw_payment_payload',
  'logging_authorization_header',
  'logging_cookie',
  'product_repo_webhook_handler',
  'direct_balance_change_before_idempotency_check'
] as const;

const REQUIRED_MONEY_DB_PAYMENT_TABLES = [
  'money_payments.provider_webhook_events',
  'money_payments.payment_webhook_processing',
  'money_payments.payment_webhook_processing_history',
  'money_payments.payment_outbox'
] as const;

const REQUIRED_PAYMENT_OUTBOX_FIELDS = [
  'outbox_id',
  'cloud_event_id',
  'cloud_event_source',
  'cloud_event_type',
  'schema_version',
  'aggregate_id',
  'causation_command_id',
  'audit_event_ref',
  'idempotency_key',
  'request_id',
  'trace_id',
  'payload_ref_kind',
  'payload_ref',
  'payload_hash',
  'available_at',
  'delivery_status',
  'delivery_attempt_count',
  'max_delivery_attempts',
  'claimed_by',
  'claim_token',
  'claim_expires_at',
  'row_version'
] as const;

const REQUIRED_PAYMENT_OUTBOX_DELIVERY_STATUSES = [
  'pending',
  'claimed',
  'delivered',
  'dead_lettered'
] as const;

const REQUIRED_PAYMENT_OUTBOX_IDEMPOTENCY_SCOPE = [
  'aggregate_id',
  'cloud_event_type',
  'idempotency_key'
] as const;

export function validatePaymentWebhookContract(
  value: unknown
): readonly Diagnostic[] {
  return [
    ...validateExactValue({
      value,
      file: PAYMENT_WEBHOOK_FILE,
      path: 'ingress.received_by',
      expected: 'zdp-edge-workers',
      message: 'Payment webhooks must be received by `zdp-edge-workers`.'
    }),
    ...validateExactValue({
      value,
      file: PAYMENT_WEBHOOK_FILE,
      path: 'ingress.processed_by',
      expected: MONEY_REPOSITORY_NAME,
      message: 'Payment webhooks must be processed by `zdp-money-platform`.'
    }),
    ...validateExactValue({
      value,
      file: PAYMENT_WEBHOOK_FILE,
      path: 'ingress.received_and_processed_are_separate',
      expected: true,
      message: 'Payment webhook receipt and processing must stay separate.'
    }),
    ...validateExactValue({
      value,
      file: PAYMENT_WEBHOOK_FILE,
      path: 'ingress.product_repo_direct_processing_allowed',
      expected: false,
      message: 'Product repositories must not process payment webhooks directly.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: PAYMENT_WEBHOOK_FILE,
      path: 'required_fields',
      field: 'required_fields',
      requiredEntries: REQUIRED_WEBHOOK_FIELDS
    }),
    ...validateExactValue({
      value,
      file: PAYMENT_WEBHOOK_FILE,
      path: 'signature.verification_required_before_processing',
      expected: true,
      message: 'Payment webhook signature verification must happen before processing.'
    }),
    ...validateExactValue({
      value,
      file: PAYMENT_WEBHOOK_FILE,
      path: 'signature.secret_storage_owner',
      expected: 'zdp-privacy-credential-vault',
      message: 'Payment webhook secrets must be owned by credential vault.'
    }),
    ...validateExactValue({
      value,
      file: PAYMENT_WEBHOOK_FILE,
      path: 'idempotency.duplicate_event_must_not_mutate_ledger_twice',
      expected: true,
      message: 'Duplicate payment webhook events must not mutate ledger twice.'
    }),
    ...validateExactValue({
      value,
      file: PAYMENT_WEBHOOK_FILE,
      path: 'handoff.queue_required_before_processing',
      expected: true,
      message: 'Payment webhooks must use queue handoff before processing.'
    }),
    ...validateExactValue({
      value,
      file: PAYMENT_WEBHOOK_FILE,
      path: 'handoff.dead_letter_required',
      expected: true,
      message: 'Payment webhook handoff must require a dead-letter path.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: PAYMENT_WEBHOOK_FILE,
      path: 'forbidden',
      field: 'forbidden',
      requiredEntries: REQUIRED_WEBHOOK_FORBIDDEN_ITEMS
    })
  ];
}

export function validateMoneyDbSchemaContract(
  value: unknown
): readonly Diagnostic[] {
  return [
    ...validateRequiredStringArrayEntries({
      value,
      file: MONEY_DB_SCHEMA_FILE,
      path: 'tables.payments_required',
      field: 'tables.payments_required',
      requiredEntries: REQUIRED_MONEY_DB_PAYMENT_TABLES,
      ruleId: MONEY_PAYMENT_WEBHOOK_OUTBOX_RULE_ID
    }),
    ...validateExactValue({
      value,
      file: MONEY_DB_SCHEMA_FILE,
      path: 'payments.raw_provider_payload_storage_allowed',
      expected: false,
      message: 'Money DB schema must not allow raw provider payload storage.',
      ruleId: MONEY_PAYMENT_WEBHOOK_OUTBOX_RULE_ID
    }),
    ...validateExactValue({
      value,
      file: MONEY_DB_SCHEMA_FILE,
      path: 'payments.payload_hash_required',
      expected: true,
      message: 'Money DB schema must require payload hashes for payment records.',
      ruleId: MONEY_PAYMENT_WEBHOOK_OUTBOX_RULE_ID
    }),
    ...validateExactValue({
      value,
      file: MONEY_DB_SCHEMA_FILE,
      path: 'payments.payment_method_secret_storage_allowed',
      expected: false,
      message: 'Money DB schema must not allow payment method secret storage.',
      ruleId: MONEY_PAYMENT_WEBHOOK_OUTBOX_RULE_ID
    }),
    ...validateExactValue({
      value,
      file: MONEY_DB_SCHEMA_FILE,
      path: 'payments.provider_webhook_events_append_only',
      expected: true,
      message: 'Provider webhook events must remain append-only.',
      ruleId: MONEY_PAYMENT_WEBHOOK_OUTBOX_RULE_ID
    }),
    ...validateExactValue({
      value,
      file: MONEY_DB_SCHEMA_FILE,
      path: 'payments.webhook_processing_history_append_only',
      expected: true,
      message: 'Payment webhook processing history must remain append-only.',
      ruleId: MONEY_PAYMENT_WEBHOOK_OUTBOX_RULE_ID
    }),
    ...validateExactValue({
      value,
      file: MONEY_DB_SCHEMA_FILE,
      path: 'payments.payment_outbox_dispatch_contract_required',
      expected: true,
      message: 'Payment outbox dispatch contract must remain required.',
      ruleId: MONEY_PAYMENT_WEBHOOK_OUTBOX_RULE_ID
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: MONEY_DB_SCHEMA_FILE,
      path: 'payments.payment_outbox_required_fields',
      field: 'payments.payment_outbox_required_fields',
      requiredEntries: REQUIRED_PAYMENT_OUTBOX_FIELDS,
      ruleId: MONEY_PAYMENT_WEBHOOK_OUTBOX_RULE_ID
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: MONEY_DB_SCHEMA_FILE,
      path: 'payments.payment_outbox_delivery_statuses',
      field: 'payments.payment_outbox_delivery_statuses',
      requiredEntries: REQUIRED_PAYMENT_OUTBOX_DELIVERY_STATUSES,
      ruleId: MONEY_PAYMENT_WEBHOOK_OUTBOX_RULE_ID
    }),
    ...validateExactValue({
      value,
      file: MONEY_DB_SCHEMA_FILE,
      path: 'payments.payment_outbox_delivery_attempts_required',
      expected: true,
      message: 'Payment outbox delivery attempts must remain required.',
      ruleId: MONEY_PAYMENT_WEBHOOK_OUTBOX_RULE_ID
    }),
    ...validateExactValue({
      value,
      file: MONEY_DB_SCHEMA_FILE,
      path: 'payments.payment_outbox_claim_lock_required',
      expected: true,
      message: 'Payment outbox claim lock must remain required.',
      ruleId: MONEY_PAYMENT_WEBHOOK_OUTBOX_RULE_ID
    }),
    ...validateExactValue({
      value,
      file: MONEY_DB_SCHEMA_FILE,
      path: 'payments.payment_outbox_claim_requires_token_and_lease',
      expected: true,
      message: 'Payment outbox claim must require token and lease fields.',
      ruleId: MONEY_PAYMENT_WEBHOOK_OUTBOX_RULE_ID
    }),
    ...validateExactValue({
      value,
      file: MONEY_DB_SCHEMA_FILE,
      path: 'payments.payment_outbox_claim_token_unique_required',
      expected: true,
      message: 'Payment outbox claim token uniqueness must remain required.',
      ruleId: MONEY_PAYMENT_WEBHOOK_OUTBOX_RULE_ID
    }),
    ...validateExactValue({
      value,
      file: MONEY_DB_SCHEMA_FILE,
      path: 'payments.payment_outbox_compare_and_swap_required',
      expected: true,
      message: 'Payment outbox updates must keep row-version compare-and-swap required.',
      ruleId: MONEY_PAYMENT_WEBHOOK_OUTBOX_RULE_ID
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: MONEY_DB_SCHEMA_FILE,
      path: 'payments.payment_outbox_idempotency_scope',
      field: 'payments.payment_outbox_idempotency_scope',
      requiredEntries: REQUIRED_PAYMENT_OUTBOX_IDEMPOTENCY_SCOPE,
      ruleId: MONEY_PAYMENT_WEBHOOK_OUTBOX_RULE_ID
    })
  ];
}
