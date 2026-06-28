import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Diagnostic } from '../../diagnostics.ts';
import {
  createMoneyDiagnostic,
  isMissingPathError
} from './contract-helpers.ts';

const CARGO_TOML_FILE = 'Cargo.toml';
const CARGO_LOCK_FILE = 'Cargo.lock';
const RUNTIME_LIB_FILE = 'src/lib.rs';
const RUNTIME_MAIN_FILE = 'src/main.rs';
const RUNTIME_BOUNDARY_MOD_FILE = 'src/boundaries/mod.rs';
const RUNTIME_BILLING_BOUNDARY_FILE = 'src/boundaries/billing.rs';
const RUNTIME_PAYMENTS_BOUNDARY_FILE = 'src/boundaries/payments.rs';
const RUNTIME_LEDGER_BOUNDARY_FILE = 'src/boundaries/ledger.rs';
const RUNTIME_RISK_BOUNDARY_FILE = 'src/boundaries/risk.rs';
const RUNTIME_COMMANDS_FILE = 'src/commands/mod.rs';
const RUNTIME_COMMAND_LEDGER_FILE = 'src/commands/ledger.rs';
const RUNTIME_COMMAND_PAYMENT_WEBHOOK_FILE = 'src/commands/payment_webhook.rs';
const RUNTIME_COMMAND_PAYMENT_WEBHOOK_PROCESSING_FILE =
  'src/commands/payment_webhook_processing.rs';
const RUNTIME_COMMAND_PAYMENT_OUTBOX_DELIVERY_FILE =
  'src/commands/payment_outbox_delivery.rs';
const RUNTIME_LEDGER_CORE_FILE = 'src/ledger/mod.rs';
const RUNTIME_STORAGE_MOD_FILE = 'src/storage/mod.rs';
const RUNTIME_STORAGE_PAYMENT_WEBHOOK_PROCESSING_FILE =
  'src/storage/payment_webhook_processing.rs';
const RUNTIME_STORAGE_PAYMENT_OUTBOX_DELIVERY_FILE =
  'src/storage/payment_outbox_delivery.rs';

const REQUIRED_MONEY_RUNTIME_FILES = [
  CARGO_TOML_FILE,
  CARGO_LOCK_FILE,
  RUNTIME_LIB_FILE,
  RUNTIME_MAIN_FILE,
  RUNTIME_BOUNDARY_MOD_FILE,
  RUNTIME_BILLING_BOUNDARY_FILE,
  RUNTIME_PAYMENTS_BOUNDARY_FILE,
  RUNTIME_LEDGER_BOUNDARY_FILE,
  RUNTIME_RISK_BOUNDARY_FILE,
  RUNTIME_COMMANDS_FILE,
  RUNTIME_COMMAND_LEDGER_FILE,
  RUNTIME_COMMAND_PAYMENT_WEBHOOK_FILE,
  RUNTIME_COMMAND_PAYMENT_WEBHOOK_PROCESSING_FILE,
  RUNTIME_COMMAND_PAYMENT_OUTBOX_DELIVERY_FILE,
  RUNTIME_LEDGER_CORE_FILE,
  RUNTIME_STORAGE_MOD_FILE,
  RUNTIME_STORAGE_PAYMENT_WEBHOOK_PROCESSING_FILE,
  RUNTIME_STORAGE_PAYMENT_OUTBOX_DELIVERY_FILE
] as const;

export async function validateRuntimeSurface(
  repositoryRoot: string
): Promise<readonly Diagnostic[]> {
  const [
    cargoToml,
    cargoLock,
    libSource,
    mainSource,
    boundaryModSource,
    billingSource,
    paymentsSource,
    ledgerSource,
    riskSource,
    commandsSource,
    commandLedgerSource,
    commandPaymentWebhookSource,
    commandPaymentWebhookProcessingSource,
    commandPaymentOutboxDeliverySource,
    ledgerCoreSource,
    storageModSource,
    storagePaymentWebhookProcessingSource,
    storagePaymentOutboxDeliverySource
  ] = await Promise.all(
    REQUIRED_MONEY_RUNTIME_FILES.map((file) =>
      readOptionalTextFile(repositoryRoot, file)
    )
  );

  return [
    ...cargoToml.diagnostics,
    ...cargoLock.diagnostics,
    ...libSource.diagnostics,
    ...mainSource.diagnostics,
    ...boundaryModSource.diagnostics,
    ...billingSource.diagnostics,
    ...paymentsSource.diagnostics,
    ...ledgerSource.diagnostics,
    ...riskSource.diagnostics,
    ...commandsSource.diagnostics,
    ...commandLedgerSource.diagnostics,
    ...commandPaymentWebhookSource.diagnostics,
    ...commandPaymentWebhookProcessingSource.diagnostics,
    ...commandPaymentOutboxDeliverySource.diagnostics,
    ...ledgerCoreSource.diagnostics,
    ...storageModSource.diagnostics,
    ...storagePaymentWebhookProcessingSource.diagnostics,
    ...storagePaymentOutboxDeliverySource.diagnostics,
    ...(cargoToml.source === null
      ? []
      : validateRuntimeSourceIncludes({
          file: CARGO_TOML_FILE,
          source: cargoToml.source,
          requiredFragments: [
            'name = "zdp-money-platform"',
            'edition = "2024"',
            'axum = "0.8"',
            'tokio = { version = "1"'
          ]
        })),
    ...(libSource.source === null
      ? []
      : validateRuntimeSourceIncludes({
          file: RUNTIME_LIB_FILE,
          source: libSource.source,
          requiredFragments: [
            'pub const SERVICE_ID: &str = "money-api";',
            'pub const BIND_ADDR_ENV: &str = "ZDP_MONEY_BIND_ADDR";',
            'pub mod ledger;',
            'pub mod storage;',
            '.route("/healthz", get(healthz))',
            '.route("/readyz", get(readyz))',
            'service: SERVICE_ID',
            'checks: &["contracts"]',
            'money_boundaries_keep_ledger_as_credit_balance_truth_owner',
            'command_envelope_requires_idempotency_audit_and_trace_fields'
          ]
        })),
    ...(mainSource.source === null
      ? []
      : validateRuntimeSourceIncludes({
          file: RUNTIME_MAIN_FILE,
          source: mainSource.source,
          requiredFragments: ['bind_addr_from_env', 'serve(addr).await']
        })),
    ...(boundaryModSource.source === null
      ? []
      : validateRuntimeSourceIncludes({
          file: RUNTIME_BOUNDARY_MOD_FILE,
          source: boundaryModSource.source,
          requiredFragments: [
            'pub mod billing;',
            'pub mod payments;',
            'pub mod ledger;',
            'pub mod risk;',
            'owns_credit_balance_truth: bool',
            'pub const ALL: &[MoneyBoundaryMarker]',
            'pub fn credit_balance_truth_owner() -> MoneyBoundaryMarker',
            'ledger::MARKER'
          ]
        })),
    ...validateBoundaryMarkerSource(billingSource.source, RUNTIME_BILLING_BOUNDARY_FILE, {
      id: 'billing',
      schema: 'money_billing',
      truthOwner: 'owns_credit_balance_truth: false'
    }),
    ...validateBoundaryMarkerSource(
      paymentsSource.source,
      RUNTIME_PAYMENTS_BOUNDARY_FILE,
      {
        id: 'payments',
        schema: 'money_payments',
        truthOwner: 'owns_credit_balance_truth: false'
      }
    ),
    ...validateBoundaryMarkerSource(ledgerSource.source, RUNTIME_LEDGER_BOUNDARY_FILE, {
      id: 'ledger',
      schema: 'money_ledger',
      truthOwner: 'owns_credit_balance_truth: true'
    }),
    ...validateBoundaryMarkerSource(riskSource.source, RUNTIME_RISK_BOUNDARY_FILE, {
      id: 'risk',
      schema: 'money_risk',
      truthOwner: 'owns_credit_balance_truth: false'
    }),
    ...(commandsSource.source === null
      ? []
      : validateRuntimeSourceIncludes({
          file: RUNTIME_COMMANDS_FILE,
          source: commandsSource.source,
          requiredFragments: [
            'pub mod ledger;',
            'pub mod payment_webhook;',
            'pub mod payment_webhook_processing;',
            'pub mod payment_outbox_delivery;',
            'pub enum MoneyCommandType',
            'PaymentsRecordProviderWebhook',
            'LedgerAppendEntry',
            'LedgerCreateCreditHold',
            'LedgerCaptureCreditHold',
            'LedgerReleaseCreditHold',
            'pub struct PayloadRef',
            'pub struct MoneyCommandEnvelope',
            'pub command_id: String',
            'pub tenant_id: String',
            'pub request_id: String',
            'pub trace_id: String',
            'pub idempotency_key: String',
            'pub reason: String',
            'pub payload_ref: PayloadRef',
            '"raw_payment_payload"'
          ]
        })),
    ...(commandLedgerSource.source === null
      ? []
      : validateRuntimeSourceIncludes({
          file: RUNTIME_COMMAND_LEDGER_FILE,
          source: commandLedgerSource.source,
          requiredFragments: [
            'const FORBIDDEN_PAYLOAD_REF_FRAGMENTS',
            '"authorization"',
            '"raw_payment"',
            '"secret"',
            '"token"',
            'pub enum LedgerAppendAdmission',
            'Accepted {',
            'Duplicate {',
            'pub enum LedgerCommandAdmissionError',
            'DraftMismatch',
            'ForbiddenPayloadRefValue',
            'IdempotencyConflict',
            'UnsupportedCommandType(MoneyCommandType)',
            'UnsupportedSchemaVersion',
            'pub fn admit_ledger_append_command',
            'validate_ledger_append_envelope',
            'validate_payload_ref',
            'validate_draft_matches_envelope',
            'pub fn idempotency_scope_for',
            'IdempotencyDecision::AcceptNew',
            'IdempotencyDecision::ReturnPrevious',
            'IdempotencyDecision::Conflict',
            'append_ledger_transaction',
            'admits_matching_ledger_append_command_and_transaction_draft',
            'returns_previous_result_for_duplicate_same_payload_without_appending',
            'rejects_duplicate_idempotency_key_with_different_payload_hash',
            'rejects_unsupported_command_type_before_ledger_append',
            'rejects_draft_metadata_that_does_not_match_command_envelope',
            'rejects_forbidden_payload_reference_values_before_ledger_append'
          ]
        })),
    ...(commandPaymentWebhookSource.source === null
      ? []
      : validateRuntimeSourceIncludes({
          file: RUNTIME_COMMAND_PAYMENT_WEBHOOK_FILE,
          source: commandPaymentWebhookSource.source,
          requiredFragments: [
            'const WEBHOOK_QUEUE_JOB_TYPE',
            '"money.payment_webhook.process"',
            'const WEBHOOK_COMMAND_SOURCE',
            '"payment-webhook-queue"',
            'const FORBIDDEN_WEBHOOK_REF_FRAGMENTS',
            '"authorization"',
            '"raw_payment"',
            '"secret"',
            '"token"',
            'pub struct PaymentWebhookHandoffInput',
            'pub struct PaymentWebhookCommandContext',
            'pub struct WebhookQueueEnvelope',
            'pub struct PaymentWebhookCommandHandoff',
            'pub enum PaymentWebhookHandoffError',
            'ForbiddenPayloadRefValue',
            'IdempotencyKeyMustUseProviderEventId',
            'QueueFieldMismatch',
            'SignatureNotVerified',
            'UnsupportedQueueJobType',
            'UnsupportedSchemaVersion',
            'pub fn build_payment_webhook_command_handoff',
            'validate_webhook_input',
            'validate_command_context',
            'validate_queue_envelope',
            'MoneyCommandType::PaymentsRecordProviderWebhook',
            'MoneyCommandType::LedgerAppendEntry',
            'builds_payment_webhook_command_after_signature_and_queue_handoff',
            'rejects_unverified_webhook_before_money_command_creation',
            'requires_provider_event_id_as_webhook_idempotency_key',
            'rejects_queue_handoff_that_does_not_match_webhook_trace_context',
            'rejects_raw_payment_payload_references_before_command_handoff',
            'webhook_handoff_does_not_create_ledger_append_command'
          ]
        })),
    ...(commandPaymentWebhookProcessingSource.source === null
      ? []
      : validateRuntimeSourceIncludes({
          file: RUNTIME_COMMAND_PAYMENT_WEBHOOK_PROCESSING_FILE,
          source: commandPaymentWebhookProcessingSource.source,
          requiredFragments: [
            'PROCESSING_REQUESTED_OUTBOX_TYPE',
            '"money.payment_webhook.processing_requested"',
            'PROCESSING_SUCCEEDED_OUTBOX_TYPE',
            '"money.payment_webhook.processing_succeeded"',
            'PROCESSING_RETRY_SCHEDULED_OUTBOX_TYPE',
            '"money.payment_webhook.retry_scheduled"',
            'PROCESSING_DEAD_LETTERED_OUTBOX_TYPE',
            '"money.payment_webhook.dead_lettered"',
            'pub enum PaymentWebhookProcessingState',
            'Queued',
            'Processing',
            'RetryScheduled',
            'Succeeded',
            'DeadLettered',
            'pub struct PaymentWebhookProcessingRecord',
            'pub struct PaymentWebhookProcessingHistory',
            'pub enum PaymentWebhookProcessingEvent',
            'pub struct PaymentWebhookOutboxRecord',
            'pub enum PaymentWebhookProcessingAdmission',
            'pub enum PaymentWebhookProcessingError',
            'InvalidTransition',
            'IdempotencyConflict',
            'RetryBudgetExhausted',
            'TerminalState',
            'UnsupportedCommandType(MoneyCommandType)',
            'pub fn admit_payment_webhook_processing',
            'pub fn transition_payment_webhook_processing',
            'classify_duplicate',
            'build_history',
            'build_outbox',
            'PaymentWebhookProcessingAdmission::Duplicate',
            'PaymentWebhookProcessingEvent::WorkerStarted',
            'PaymentWebhookProcessingEvent::CommandSucceeded',
            'PaymentWebhookProcessingEvent::RetryScheduled',
            'PaymentWebhookProcessingEvent::DeadLettered',
            'PaymentWebhookProcessingState::Queued',
            'PaymentWebhookProcessingState::Processing',
            'PaymentWebhookProcessingState::RetryScheduled',
            'PaymentWebhookProcessingState::Succeeded',
            'PaymentWebhookProcessingState::DeadLettered',
            'accepts_verified_webhook_command_into_queued_processing_record_and_outbox',
            'duplicate_provider_event_with_same_payload_returns_existing_record',
            'duplicate_provider_event_with_different_payload_hash_conflicts',
            'processing_lifecycle_records_worker_attempt_success_history_and_outbox',
            'retry_schedule_requires_processing_state_and_retry_time',
            'retryable_failure_writes_retry_outbox_and_can_restart',
            'exhausted_or_terminal_work_cannot_continue_silently'
          ]
        })),
    ...(commandPaymentOutboxDeliverySource.source === null
      ? []
      : validateRuntimeSourceIncludes({
          file: RUNTIME_COMMAND_PAYMENT_OUTBOX_DELIVERY_FILE,
          source: commandPaymentOutboxDeliverySource.source,
          requiredFragments: [
            'pub enum PaymentOutboxDeliveryStatus',
            'Pending',
            'Claimed',
            'Delivered',
            'DeadLettered',
            'pub struct PaymentOutboxDeliveryRecord',
            'pub claimed_by: Option<String>',
            'pub claim_token: Option<String>',
            'pub claim_expires_at: Option<String>',
            'pub row_version: u64',
            'pub struct PaymentOutboxClaimContext',
            'pub struct PaymentOutboxDeliveryContext',
            'pub fn claim_payment_outbox_delivery',
            'pub fn mark_payment_outbox_delivered',
            'pub fn release_payment_outbox_for_retry',
            'pub fn mark_payment_outbox_dead_lettered',
            'MissingField("claim_expires_at")',
            'ClaimTokenMismatch',
            'RetryBudgetExhausted',
            'allows_expired_claim_to_be_reclaimed_by_next_worker',
            'rejects_wrong_claim_token_before_completion',
            'MissingField("row_version")'
          ]
        })),
    ...(storageModSource.source === null
      ? []
      : validateRuntimeSourceIncludes({
          file: RUNTIME_STORAGE_MOD_FILE,
          source: storageModSource.source,
          requiredFragments: [
            'pub mod payment_webhook_processing;',
            'pub mod payment_outbox_delivery;'
          ]
        })),
    ...(storagePaymentWebhookProcessingSource.source === null
      ? []
      : validateRuntimeSourceIncludes({
          file: RUNTIME_STORAGE_PAYMENT_WEBHOOK_PROCESSING_FILE,
          source: storagePaymentWebhookProcessingSource.source,
          requiredFragments: [
            'const FORBIDDEN_STORAGE_VALUE_FRAGMENTS',
            '"authorization"',
            '"raw_payment"',
            '"secret"',
            '"token"',
            'pub struct PaymentWebhookProcessingLookupKey',
            'pub enum PaymentWebhookProcessingPersistenceMode',
            'InsertNew',
            'CompareAndSwap { expected_version: u64 }',
            'pub struct PaymentWebhookProcessingPersistenceBatch',
            'pub enum PaymentWebhookProcessingStorageError',
            'ForbiddenStorageValue',
            'HistoryMismatch',
            'OutboxMismatch',
            'RecordMismatch',
            'StaleTransitionVersion',
            'pub fn plan_payment_webhook_processing_persistence',
            'validate_record_safe_for_storage',
            'validate_history_matches_record',
            'validate_outbox_matches_record',
            'require_initial_insert_shape',
            'validate_record_continuity',
            'require_record_match',
            'require_history_match',
            'require_outbox_match',
            'reject_forbidden_storage_value',
            'PaymentWebhookProcessingPersistenceMode::InsertNew',
            'PaymentWebhookProcessingPersistenceMode::CompareAndSwap',
            'plans_insert_for_new_queued_processing_record_with_provider_event_lookup',
            'plans_compare_and_swap_update_for_worker_transition_history_and_outbox',
            'rejects_stale_or_cross_record_processing_transition_before_storage',
            'rejects_history_or_outbox_that_does_not_match_processing_record',
            'rejects_forbidden_payment_values_before_storage_port'
          ]
        })),
    ...(storagePaymentOutboxDeliverySource.source === null
      ? []
      : validateRuntimeSourceIncludes({
          file: RUNTIME_STORAGE_PAYMENT_OUTBOX_DELIVERY_FILE,
          source: storagePaymentOutboxDeliverySource.source,
          requiredFragments: [
            'pub struct PaymentOutboxDeliveryPersistencePlan',
            'pub expected_row_version: u64',
            'pub fn plan_payment_outbox_delivery_persistence',
            'PaymentOutboxDeliveryStorageError',
            'RowVersionMismatch',
            'ImmutableFieldMismatch',
            'ForbiddenStorageValue',
            'reject_forbidden_optional("claimed_by"',
            'require_some("claim_token"',
            'require_some("claim_expires_at"',
            'require_none("claim_token"',
            'plans_compare_and_swap_for_claim_transition',
            'plans_compare_and_swap_for_delivery_terminal_transition',
            'rejects_stale_row_version_or_cross_record_transition',
            'rejects_invalid_status_shapes_before_storage',
            'rejects_forbidden_claim_values_before_storage'
          ]
        })),
    ...(ledgerCoreSource.source === null
      ? []
      : validateRuntimeSourceIncludes({
          file: RUNTIME_LEDGER_CORE_FILE,
          source: ledgerCoreSource.source,
          requiredFragments: [
            'const FORBIDDEN_LEDGER_VALUE_FRAGMENTS',
            '"authorization"',
            '"raw_payment"',
            '"secret"',
            '"token"',
            'pub struct MoneyAmount',
            'pub enum DebitCredit',
            'pub struct LedgerTransactionDraft',
            'pub struct LedgerEntry',
            'pub enum IdempotencyDecision',
            'pub enum ProjectionSource',
            'DerivedFromLedgerEntries',
            'pub fn append_ledger_transaction',
            'LedgerError::ImbalancedTransaction',
            'LedgerError::MixedCurrencyTransaction',
            'pub fn decide_idempotency',
            'IdempotencyDecision::ReturnPrevious',
            'IdempotencyDecision::Conflict',
            'pub fn reverse_transaction',
            'reversal_of_ledger_entry_id',
            'pub fn derive_account_projection',
            'reject_forbidden_value',
            'accepts_balanced_append_only_double_entry_transaction',
            'rejects_imbalanced_or_mixed_currency_transactions',
            'keeps_idempotency_scoped_to_tenant_command_and_key',
            'creates_refund_or_correction_as_reversal_entries_not_mutation',
            'derives_projection_from_entries_without_becoming_truth',
            'rejects_sensitive_values_before_they_enter_ledger_rows'
          ]
        }))
  ];
}

async function readOptionalTextFile(
  repositoryRoot: string,
  file: string
): Promise<{
  readonly source: string | null;
  readonly diagnostics: readonly Diagnostic[];
}> {
  try {
    return {
      source: await readFile(join(repositoryRoot, file), 'utf8'),
      diagnostics: []
    };
  } catch (error) {
    if (isMissingPathError(error)) {
      return {
        source: null,
        diagnostics: [
          createMoneyDiagnostic(
            file,
            'repository.root',
            `Money platform repository must include \`${file}\`.`
          )
        ]
      };
    }

    throw error;
  }
}

function validateBoundaryMarkerSource(
  source: string | null,
  file: string,
  contract: {
    readonly id: string;
    readonly schema: string;
    readonly truthOwner: string;
  }
): readonly Diagnostic[] {
  if (source === null) {
    return [];
  }

  return validateRuntimeSourceIncludes({
    file,
    source,
    requiredFragments: [
      'pub const MARKER: MoneyBoundaryMarker',
      `id: "${contract.id}"`,
      `db_schema: "${contract.schema}"`,
      'audit_required: true',
      contract.truthOwner
    ]
  });
}

function validateRuntimeSourceIncludes(input: {
  readonly file: string;
  readonly source: string;
  readonly requiredFragments: readonly string[];
}): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const fragment of input.requiredFragments) {
    if (input.source.includes(fragment)) {
      continue;
    }

    diagnostics.push(
      createMoneyDiagnostic(
        input.file,
        'source',
        `Money platform runtime source must include \`${fragment}\`.`
      )
    );
  }

  return diagnostics;
}
