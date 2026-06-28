import type { Diagnostic } from '../../diagnostics.ts';
import {
  createMoneyDiagnostic,
  isRecord,
  readPath,
  validateExactValue,
  validateRequiredStringArrayEntries
} from './contract-helpers.ts';

export const MONEY_BOUNDARIES_FILE = 'contracts/money-boundaries.yaml';
export const MONEY_COMMAND_ENVELOPE_FILE =
  'contracts/money-command-envelope.yaml';

const REQUIRED_BOUNDARIES = ['billing', 'payments', 'ledger', 'risk'] as const;

const REQUIRED_BOUNDARY_FIELDS = [
  'owns',
  'must_not_own',
  'db_schema',
  'db_role',
  'audit_required',
  'split_trigger'
] as const;

const REQUIRED_FORBIDDEN_BOUNDARY_ITEMS = [
  'product_repo_credit_mutation',
  'duplicate_webhook_balance_change',
  'ledger_entry_update_in_place',
  'ledger_entry_delete',
  'billing_direct_balance_write',
  'payments_direct_entitlement_grant',
  'risk_direct_payment_capture',
  'raw_cardholder_data_storage',
  'private_key_or_seed_storage'
] as const;

const REQUIRED_COMMAND_FIELDS = [
  'command_id',
  'command_type',
  'schema_version',
  'actor_id',
  'tenant_id',
  'request_id',
  'trace_id',
  'idempotency_key',
  'reason',
  'issued_at',
  'source',
  'payload_ref'
] as const;

const REQUIRED_COMMAND_TYPES = [
  'billing.create_invoice_intent',
  'payments.record_provider_attempt',
  'payments.record_provider_refund_attempt',
  'payments.record_provider_webhook',
  'payments.request_refund',
  'ledger.append_entry',
  'ledger.create_credit_hold',
  'ledger.capture_credit_hold',
  'ledger.release_credit_hold',
  'ledger.record_daily_activity_reward_claim',
  'billing.record_ship_pass_grant',
  'billing.record_workspace_quota_grant',
  'billing.record_workspace_billing_fallback',
  'billing.record_captain_card_slot_event',
  'billing.record_captain_card_evaluation',
  'risk.record_operator_adjustment_request',
  'risk.open_review',
  'risk.close_review'
] as const;

const REQUIRED_PAYLOAD_FORBIDDEN_VALUES = [
  'raw_card_number',
  'cvv',
  'provider_secret',
  'authorization_header',
  'cookie',
  'private_key',
  'seed_phrase',
  'raw_payment_payload'
] as const;

export function validateMoneyBoundariesContract(
  value: unknown
): readonly Diagnostic[] {
  return [
    ...validateExactValue({
      value,
      file: MONEY_BOUNDARIES_FILE,
      path: 'principles.ledger_is_append_only',
      expected: true,
      message: 'Money platform ledger principle must remain append-only.'
    }),
    ...validateExactValue({
      value,
      file: MONEY_BOUNDARIES_FILE,
      path: 'principles.product_repositories_mutate_money_state',
      expected: false,
      message: 'Product repositories must not mutate money state.'
    }),
    ...validateExactValue({
      value,
      file: MONEY_BOUNDARIES_FILE,
      path: 'principles.provider_state_is_not_platform_truth',
      expected: true,
      message: 'Provider state must not be the platform money truth.'
    }),
    ...validateExactValue({
      value,
      file: MONEY_BOUNDARIES_FILE,
      path: 'principles.entitlement_and_ledger_are_separate',
      expected: true,
      message: 'Money platform must keep entitlement and ledger truth separate.'
    }),
    ...validateExactValue({
      value,
      file: MONEY_BOUNDARIES_FILE,
      path: 'principles.credit_balance_truth_owner',
      expected: 'ledger',
      message: 'Credit balance truth owner must be `ledger`.'
    }),
    ...validateBoundaryShape(value),
    ...validateRequiredStringArrayEntries({
      value,
      file: MONEY_BOUNDARIES_FILE,
      path: 'forbidden',
      field: 'forbidden',
      requiredEntries: REQUIRED_FORBIDDEN_BOUNDARY_ITEMS
    })
  ];
}

export function validateCommandEnvelopeContract(
  value: unknown
): readonly Diagnostic[] {
  return [
    ...validateRequiredStringArrayEntries({
      value,
      file: MONEY_COMMAND_ENVELOPE_FILE,
      path: 'required_fields',
      field: 'required_fields',
      requiredEntries: REQUIRED_COMMAND_FIELDS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: MONEY_COMMAND_ENVELOPE_FILE,
      path: 'allowed_command_types',
      field: 'allowed_command_types',
      requiredEntries: REQUIRED_COMMAND_TYPES
    }),
    ...validateExactValue({
      value,
      file: MONEY_COMMAND_ENVELOPE_FILE,
      path: 'idempotency.payload_hash_required',
      expected: true,
      message: 'Money command idempotency must require a payload hash.'
    }),
    ...validateExactValue({
      value,
      file: MONEY_COMMAND_ENVELOPE_FILE,
      path: 'idempotency.duplicate_same_payload',
      expected: 'return_previous_result',
      message:
        'Duplicate money commands with the same payload must return previous result.'
    }),
    ...validateExactValue({
      value,
      file: MONEY_COMMAND_ENVELOPE_FILE,
      path: 'idempotency.duplicate_different_payload',
      expected: 'fail_conflict',
      message: 'Duplicate money commands with different payloads must fail conflict.'
    }),
    ...validateExactValue({
      value,
      file: MONEY_COMMAND_ENVELOPE_FILE,
      path: 'idempotency.raw_payload_storage_allowed',
      expected: false,
      message: 'Money command idempotency must not store raw payloads.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: MONEY_COMMAND_ENVELOPE_FILE,
      path: 'payload_ref.forbidden_values',
      field: 'payload_ref.forbidden_values',
      requiredEntries: REQUIRED_PAYLOAD_FORBIDDEN_VALUES
    }),
    ...validateExactValue({
      value,
      file: MONEY_COMMAND_ENVELOPE_FILE,
      path: 'audit.required',
      expected: true,
      message: 'Money command audit must be required.'
    }),
    ...validateExactValue({
      value,
      file: MONEY_COMMAND_ENVELOPE_FILE,
      path: 'audit.reason_required',
      expected: true,
      message: 'Money command audit must require a reason.'
    })
  ];
}

function validateBoundaryShape(value: unknown): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const boundary of REQUIRED_BOUNDARIES) {
    const boundaryValue = readPath(value, `boundaries.${boundary}`);

    if (!isRecord(boundaryValue)) {
      diagnostics.push(
        createMoneyDiagnostic(
          MONEY_BOUNDARIES_FILE,
          `boundaries.${boundary}`,
          `Money platform must define \`${boundary}\` boundary.`
        )
      );
      continue;
    }

    for (const field of REQUIRED_BOUNDARY_FIELDS) {
      if (readPath(boundaryValue, field) === undefined) {
        diagnostics.push(
          createMoneyDiagnostic(
            MONEY_BOUNDARIES_FILE,
            `boundaries.${boundary}.${field}`,
            `Money platform boundary \`${boundary}\` must define \`${field}\`.`
          )
        );
      }
    }

    if (readPath(boundaryValue, 'audit_required') !== true) {
      diagnostics.push(
        createMoneyDiagnostic(
          MONEY_BOUNDARIES_FILE,
          `boundaries.${boundary}.audit_required`,
          `Money platform boundary \`${boundary}\` must require audit.`
        )
      );
    }
  }

  return diagnostics;
}
