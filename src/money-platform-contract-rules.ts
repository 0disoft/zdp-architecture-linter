import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { Diagnostic } from './diagnostics.ts';

const MONEY_REPOSITORY_NAME = 'zdp-money-platform';
const MONEY_PLATFORM_CONTRACT_RULE_ID = 'ZDP-MONEY-PLATFORM-001';

const MONEY_BOUNDARIES_FILE = 'contracts/money-boundaries.yaml';
const MONEY_COMMAND_ENVELOPE_FILE = 'contracts/money-command-envelope.yaml';
const LEDGER_ENTRY_FILE = 'contracts/ledger-entry.yaml';
const PAYMENT_WEBHOOK_FILE = 'contracts/payment-webhook.yaml';
const ENTITLEMENT_CREDIT_FILE = 'contracts/entitlement-credit.yaml';

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
  'payments.record_provider_webhook',
  'payments.request_refund',
  'ledger.append_entry',
  'ledger.create_credit_hold',
  'ledger.capture_credit_hold',
  'ledger.release_credit_hold',
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
const REQUIRED_LEDGER_ENTRY_FIELDS = [
  'ledger_entry_id',
  'ledger_account_id',
  'tenant_id',
  'currency',
  'amount_minor',
  'debit_or_credit',
  'entry_type',
  'occurred_at',
  'command_id',
  'idempotency_key',
  'causation_ref',
  'reason'
] as const;
const REQUIRED_LEDGER_FORBIDDEN_ITEMS = [
  'balance_set_without_entries',
  'product_repo_balance_mutation',
  'ledger_entry_update_in_place',
  'ledger_entry_delete',
  'refund_without_reversal',
  'chargeback_without_adjustment_entry'
] as const;
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
const REQUIRED_ENTITLEMENT_FORBIDDEN_ITEMS = [
  'entitlement_without_money_or_manual_adjustment_ref',
  'credit_balance_direct_set',
  'product_repo_credit_decrement',
  'billing_owns_credit_balance_truth',
  'analytics_event_as_money_truth'
] as const;

export async function validateRepositoryMoneyPlatformContract(input: {
  readonly repositoryRoot: string | undefined;
  readonly repositoryServiceContract: unknown;
}): Promise<readonly Diagnostic[]> {
  if (
    input.repositoryRoot === undefined ||
    readRepositoryName(input.repositoryServiceContract) !== MONEY_REPOSITORY_NAME
  ) {
    return [];
  }

  const [
    moneyBoundaries,
    commandEnvelope,
    ledgerEntry,
    paymentWebhook,
    entitlementCredit
  ] = await Promise.all([
    readRequiredYamlContract(input.repositoryRoot, MONEY_BOUNDARIES_FILE),
    readRequiredYamlContract(input.repositoryRoot, MONEY_COMMAND_ENVELOPE_FILE),
    readRequiredYamlContract(input.repositoryRoot, LEDGER_ENTRY_FILE),
    readRequiredYamlContract(input.repositoryRoot, PAYMENT_WEBHOOK_FILE),
    readRequiredYamlContract(input.repositoryRoot, ENTITLEMENT_CREDIT_FILE)
  ]);

  return [
    ...moneyBoundaries.diagnostics,
    ...commandEnvelope.diagnostics,
    ...ledgerEntry.diagnostics,
    ...paymentWebhook.diagnostics,
    ...entitlementCredit.diagnostics,
    ...(moneyBoundaries.value === null
      ? []
      : validateMoneyBoundariesContract(moneyBoundaries.value)),
    ...(commandEnvelope.value === null
      ? []
      : validateCommandEnvelopeContract(commandEnvelope.value)),
    ...(ledgerEntry.value === null
      ? []
      : validateLedgerEntryContract(ledgerEntry.value)),
    ...(paymentWebhook.value === null
      ? []
      : validatePaymentWebhookContract(paymentWebhook.value)),
    ...(entitlementCredit.value === null
      ? []
      : validateEntitlementCreditContract(entitlementCredit.value)),
    ...validateServiceContract(input.repositoryServiceContract),
    ...validateRequiredLinterRule(input.repositoryServiceContract)
  ];
}

async function readRequiredYamlContract(
  repositoryRoot: string,
  file: string
): Promise<{
  readonly value: unknown | null;
  readonly diagnostics: readonly Diagnostic[];
}> {
  let source: string;

  try {
    source = await readFile(join(repositoryRoot, file), 'utf8');
  } catch (error) {
    if (isMissingPathError(error)) {
      return {
        value: null,
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

  try {
    return {
      value: parse(source) as unknown,
      diagnostics: []
    };
  } catch (error) {
    return {
      value: null,
      diagnostics: [
        createMoneyDiagnostic(
          file,
          'yaml',
          `Money platform contract \`${file}\` must be valid YAML: ${formatError(
            error
          )}`
        )
      ]
    };
  }
}

function validateMoneyBoundariesContract(value: unknown): readonly Diagnostic[] {
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

function validateCommandEnvelopeContract(value: unknown): readonly Diagnostic[] {
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
      message: 'Duplicate money commands with the same payload must return previous result.'
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

function validateLedgerEntryContract(value: unknown): readonly Diagnostic[] {
  return [
    ...validateExactValue({
      value,
      file: LEDGER_ENTRY_FILE,
      path: 'ledger_entry.append_only',
      expected: true,
      message: 'Ledger entries must remain append-only.'
    }),
    ...validateExactValue({
      value,
      file: LEDGER_ENTRY_FILE,
      path: 'ledger_entry.update_in_place_allowed',
      expected: false,
      message: 'Ledger entries must not allow update-in-place.'
    }),
    ...validateExactValue({
      value,
      file: LEDGER_ENTRY_FILE,
      path: 'ledger_entry.delete_allowed',
      expected: false,
      message: 'Ledger entries must not allow deletion.'
    }),
    ...validateExactValue({
      value,
      file: LEDGER_ENTRY_FILE,
      path: 'ledger_entry.correction_method',
      expected: 'reversal_entry',
      message: 'Ledger corrections must use reversal entries.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: LEDGER_ENTRY_FILE,
      path: 'ledger_entry.required_fields',
      field: 'ledger_entry.required_fields',
      requiredEntries: REQUIRED_LEDGER_ENTRY_FIELDS
    }),
    ...validateExactValue({
      value,
      file: LEDGER_ENTRY_FILE,
      path: 'ledger_entry.amount.integer_minor_units_required',
      expected: true,
      message: 'Ledger amounts must use integer minor units.'
    }),
    ...validateExactValue({
      value,
      file: LEDGER_ENTRY_FILE,
      path: 'ledger_entry.amount.floating_point_allowed',
      expected: false,
      message: 'Ledger amounts must not allow floating point values.'
    }),
    ...validateExactValue({
      value,
      file: LEDGER_ENTRY_FILE,
      path: 'double_entry.required',
      expected: true,
      message: 'Ledger contract must require double-entry posting.'
    }),
    ...validateExactValue({
      value,
      file: LEDGER_ENTRY_FILE,
      path: 'double_entry.debit_credit_sum_must_balance',
      expected: true,
      message: 'Ledger debit and credit sums must balance.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: LEDGER_ENTRY_FILE,
      path: 'forbidden',
      field: 'forbidden',
      requiredEntries: REQUIRED_LEDGER_FORBIDDEN_ITEMS
    }),
    ...validateExactValue({
      value,
      file: LEDGER_ENTRY_FILE,
      path: 'reconciliation.required',
      expected: true,
      message: 'Ledger reconciliation must be required.'
    })
  ];
}

function validatePaymentWebhookContract(value: unknown): readonly Diagnostic[] {
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

function validateEntitlementCreditContract(value: unknown): readonly Diagnostic[] {
  return [
    ...validateExactValue({
      value,
      file: ENTITLEMENT_CREDIT_FILE,
      path: 'ownership.entitlement_contract_owner',
      expected: 'billing',
      message: 'Entitlement contract owner must be `billing`.'
    }),
    ...validateExactValue({
      value,
      file: ENTITLEMENT_CREDIT_FILE,
      path: 'ownership.credit_balance_truth_owner',
      expected: 'ledger',
      message: 'Credit balance truth owner must be `ledger`.'
    }),
    ...validateExactValue({
      value,
      file: ENTITLEMENT_CREDIT_FILE,
      path: 'ownership.final_authorization_owner',
      expected: 'zdp-core-platform',
      message: 'Final authorization owner must remain `zdp-core-platform`.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: ENTITLEMENT_CREDIT_FILE,
      path: 'entitlement_grant.required_fields',
      field: 'entitlement_grant.required_fields',
      requiredEntries: [
        'entitlement_grant_id',
        'tenant_id',
        'subject_id',
        'product_scope',
        'source_ledger_entry_id',
        'starts_at',
        'expires_at',
        'revocation_policy',
        'audit_event_id'
      ]
    }),
    ...validateExactValue({
      value,
      file: ENTITLEMENT_CREDIT_FILE,
      path: 'credit_spend.product_repo_may_mutate_balance',
      expected: false,
      message: 'Product repositories must not mutate credit balances.'
    }),
    ...validateExactValue({
      value,
      file: ENTITLEMENT_CREDIT_FILE,
      path: 'credit_spend.hold_capture_release_required_for_uncertain_cost',
      expected: true,
      message: 'Uncertain-cost credit spend must require hold/capture/release.'
    }),
    ...validateExactValue({
      value,
      file: ENTITLEMENT_CREDIT_FILE,
      path: 'refund_coupling.refund_must_consider_used_credits',
      expected: true,
      message: 'Refund policy must consider used credits.'
    }),
    ...validateExactValue({
      value,
      file: ENTITLEMENT_CREDIT_FILE,
      path: 'refund_coupling.remaining_credit_restoration_requires_ledger_entry',
      expected: true,
      message: 'Remaining credit restoration must require a ledger entry.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: ENTITLEMENT_CREDIT_FILE,
      path: 'forbidden',
      field: 'forbidden',
      requiredEntries: REQUIRED_ENTITLEMENT_FORBIDDEN_ITEMS
    })
  ];
}

function validateServiceContract(value: unknown): readonly Diagnostic[] {
  return [
    ...validateExactValue({
      value,
      file: 'service.yaml',
      path: 'service.tier',
      expected: 'tier0',
      message: 'Money platform service must remain tier0.'
    }),
    ...validateExactValue({
      value,
      file: 'service.yaml',
      path: 'domain.money_movement',
      expected: true,
      message: 'Money platform service must declare money movement.'
    }),
    ...validateExactValue({
      value,
      file: 'service.yaml',
      path: 'data.append_only_required',
      expected: true,
      message: 'Money platform service must require append-only data.'
    }),
    ...validateExactValue({
      value,
      file: 'service.yaml',
      path: 'audit.immutable',
      expected: true,
      message: 'Money platform audit must remain immutable.'
    }),
    ...validateExactValue({
      value,
      file: 'service.yaml',
      path: 'idempotency.required',
      expected: true,
      message: 'Money platform idempotency must be required.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: 'service.yaml',
      path: 'exit.kill_criteria',
      field: 'exit.kill_criteria',
      requiredEntries: [
        'product repositories mutate ledger, credits, refunds, or chargebacks directly',
        'provider webhook duplicates can mutate balance or entitlement state twice',
        'billing, payments, risk, or analytics becomes the credit balance source of truth',
        'raw cardholder data, PSP secrets, wallet keys, or seed phrases are committed'
      ]
    })
  ];
}

function validateRequiredLinterRule(value: unknown): readonly Diagnostic[] {
  const requiredRules = readStringArrayPath(
    value,
    'policy_gates.required_linter_rules'
  );

  if (requiredRules.includes(MONEY_PLATFORM_CONTRACT_RULE_ID)) {
    return [];
  }

  return [
    createMoneyDiagnostic(
      'service.yaml',
      'policy_gates.required_linter_rules',
      `Money platform service contract must require \`${MONEY_PLATFORM_CONTRACT_RULE_ID}\`.`
    )
  ];
}

function validateRequiredStringArrayEntries(input: {
  readonly value: unknown;
  readonly file: string;
  readonly path: string;
  readonly field: string;
  readonly requiredEntries: readonly string[];
}): readonly Diagnostic[] {
  const entries = readStringArrayPath(input.value, input.field);
  const diagnostics: Diagnostic[] = [];

  for (const requiredEntry of input.requiredEntries) {
    if (entries.includes(requiredEntry)) {
      continue;
    }

    diagnostics.push(
      createMoneyDiagnostic(
        input.file,
        input.path,
        `Money platform contract \`${input.file}\` must include \`${requiredEntry}\` in \`${input.field}\`.`
      )
    );
  }

  return diagnostics;
}

function validateExactValue(input: {
  readonly value: unknown;
  readonly file: string;
  readonly path: string;
  readonly expected: unknown;
  readonly message: string;
}): readonly Diagnostic[] {
  const actual = readPath(input.value, input.path);

  if (actual === input.expected) {
    return [];
  }

  return [createMoneyDiagnostic(input.file, input.path, input.message)];
}

function readRepositoryName(value: unknown): string | null {
  if (!isRecord(value) || !isRecord(value.service)) {
    return null;
  }

  return readStringField(value.service, 'repo');
}

function readStringArrayPath(value: unknown, path: string): readonly string[] {
  const candidate = readPath(value, path);

  if (!Array.isArray(candidate)) {
    return [];
  }

  return candidate.flatMap((entry) =>
    typeof entry === 'string' && entry.trim().length > 0 ? [entry.trim()] : []
  );
}

function readPath(value: unknown, path: string): unknown {
  let current = value;

  for (const segment of path.split('.')) {
    if (!isRecord(current)) {
      return undefined;
    }

    current = current[segment];
  }

  return current;
}

function readStringField(
  value: Record<string, unknown>,
  field: string
): string | null {
  const candidate = value[field];

  return typeof candidate === 'string' && candidate.trim().length > 0
    ? candidate.trim()
    : null;
}

function createMoneyDiagnostic(
  file: string,
  path: string,
  message: string
): Diagnostic {
  return {
    ruleId: MONEY_PLATFORM_CONTRACT_RULE_ID,
    severity: 'error',
    file,
    path,
    message
  };
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isMissingPathError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
