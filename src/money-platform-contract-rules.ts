import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { Diagnostic } from './diagnostics.ts';

const MONEY_REPOSITORY_NAME = 'zdp-money-platform';
const MONEY_PLATFORM_CONTRACT_RULE_ID = 'ZDP-MONEY-PLATFORM-001';

const MONEY_BOUNDARIES_FILE = 'contracts/money-boundaries.yaml';
const MONEY_COMMAND_ENVELOPE_FILE = 'contracts/money-command-envelope.yaml';
const LEDGER_ENTRY_FILE = 'contracts/ledger-entry.yaml';
const LEDGER_STORAGE_FILE = 'contracts/ledger-storage.yaml';
const PAYMENT_WEBHOOK_FILE = 'contracts/payment-webhook.yaml';
const ENTITLEMENT_CREDIT_FILE = 'contracts/entitlement-credit.yaml';
const PACKAGE_FILE = 'package.json';
const CARGO_TOML_FILE = 'Cargo.toml';
const CARGO_LOCK_FILE = 'Cargo.lock';
const BUN_LOCK_FILE = 'bun.lock';
const TSCONFIG_FILE = 'tsconfig.json';
const CHECKER_SCRIPT_FILE = 'scripts/check-money-contracts.ts';
const CHECKER_CLI_FILE = 'src/money-contracts/cli.ts';
const CHECKER_PARSER_FILE = 'src/money-contracts/parser.ts';
const CHECKER_TYPES_FILE = 'src/money-contracts/types.ts';
const CHECKER_VALIDATOR_FILE = 'src/money-contracts/validator.ts';
const CHECKER_TEST_FILE = 'tests/money-contracts.test.ts';
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
const RUNTIME_LEDGER_CORE_FILE = 'src/ledger/mod.rs';
const RUNTIME_STORAGE_MOD_FILE = 'src/storage/mod.rs';
const RUNTIME_STORAGE_PAYMENT_WEBHOOK_PROCESSING_FILE =
  'src/storage/payment_webhook_processing.rs';

const REQUIRED_MONEY_CHECKER_FILES = [
  BUN_LOCK_FILE,
  TSCONFIG_FILE,
  CHECKER_SCRIPT_FILE,
  CHECKER_CLI_FILE,
  CHECKER_PARSER_FILE,
  CHECKER_TYPES_FILE,
  CHECKER_VALIDATOR_FILE,
  CHECKER_TEST_FILE
] as const;
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
  RUNTIME_LEDGER_CORE_FILE,
  RUNTIME_STORAGE_MOD_FILE,
  RUNTIME_STORAGE_PAYMENT_WEBHOOK_PROCESSING_FILE
] as const;

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
const REQUIRED_LEDGER_ENTRY_FIELDS = [
  'ledger_entry_id',
  'ledger_account_id',
  'tenant_id',
  'currency',
  'amount_credit_unit',
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
const REQUIRED_LEDGER_STORAGE_COLUMNS = [
  'ledger_entry_id',
  'ledger_transaction_id',
  'ledger_account_id',
  'tenant_id',
  'currency',
  'amount_credit_unit',
  'debit_or_credit',
  'entry_type',
  'occurred_at',
  'command_id',
  'command_type',
  'idempotency_key',
  'payload_hash',
  'causation_ref',
  'reason',
  'created_at'
] as const;
const REQUIRED_LEDGER_STORAGE_IDEMPOTENCY_SCOPE = [
  'tenant_id',
  'command_type',
  'idempotency_key'
] as const;
const REQUIRED_LEDGER_STORAGE_REVERSAL_FIELDS = [
  'reversal_of_ledger_entry_id',
  'reason',
  'command_id',
  'idempotency_key'
] as const;
const REQUIRED_LEDGER_STORAGE_FORBIDDEN_ITEMS = [
  'balance_projection_as_truth',
  'direct_balance_update',
  'ledger_entry_update',
  'ledger_entry_delete',
  'floating_point_amount',
  'idempotency_scope_missing',
  'product_repo_storage_access',
  'raw_provider_payload_in_ledger_row'
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
const REQUIRED_PACKAGE_SCRIPTS = [
  'check',
  'test',
  'contracts:check',
  'rust:fmt',
  'rust:check',
  'rust:test'
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
    ledgerStorage,
    paymentWebhook,
    entitlementCredit
  ] = await Promise.all([
    readRequiredYamlContract(input.repositoryRoot, MONEY_BOUNDARIES_FILE),
    readRequiredYamlContract(input.repositoryRoot, MONEY_COMMAND_ENVELOPE_FILE),
    readRequiredYamlContract(input.repositoryRoot, LEDGER_ENTRY_FILE),
    readRequiredYamlContract(input.repositoryRoot, LEDGER_STORAGE_FILE),
    readRequiredYamlContract(input.repositoryRoot, PAYMENT_WEBHOOK_FILE),
    readRequiredYamlContract(input.repositoryRoot, ENTITLEMENT_CREDIT_FILE)
  ]);
  const packageJson = await readRequiredJsonContract(input.repositoryRoot, PACKAGE_FILE);

  return [
    ...moneyBoundaries.diagnostics,
    ...commandEnvelope.diagnostics,
    ...ledgerEntry.diagnostics,
    ...ledgerStorage.diagnostics,
    ...paymentWebhook.diagnostics,
    ...entitlementCredit.diagnostics,
    ...packageJson.diagnostics,
    ...(moneyBoundaries.value === null
      ? []
      : validateMoneyBoundariesContract(moneyBoundaries.value)),
    ...(commandEnvelope.value === null
      ? []
      : validateCommandEnvelopeContract(commandEnvelope.value)),
    ...(ledgerEntry.value === null
      ? []
      : validateLedgerEntryContract(ledgerEntry.value)),
    ...(ledgerStorage.value === null
      ? []
      : validateLedgerStorageContract(ledgerStorage.value)),
    ...(paymentWebhook.value === null
      ? []
      : validatePaymentWebhookContract(paymentWebhook.value)),
    ...(entitlementCredit.value === null
      ? []
      : validateEntitlementCreditContract(entitlementCredit.value)),
    ...(packageJson.value === null ? [] : validatePackageScripts(packageJson.value)),
    ...validateServiceContract(input.repositoryServiceContract),
    ...validateRequiredLinterRule(input.repositoryServiceContract),
    ...(await validateCheckerSurface(input.repositoryRoot)),
    ...(await validateRuntimeSurface(input.repositoryRoot))
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

async function readRequiredJsonContract(
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
      value: JSON.parse(source) as unknown,
      diagnostics: []
    };
  } catch (error) {
    return {
      value: null,
      diagnostics: [
        createMoneyDiagnostic(
          file,
          'json',
          `Money platform contract \`${file}\` must be valid JSON: ${formatError(
            error
          )}`
        )
      ]
    };
  }
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
      path: 'ledger_entry.amount.integer_credit_units_required',
      expected: true,
      message: 'Ledger amounts must use integer credit units.'
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

function validateLedgerStorageContract(value: unknown): readonly Diagnostic[] {
  return [
    ...validateExactValue({
      value,
      file: LEDGER_STORAGE_FILE,
      path: 'storage.engine',
      expected: 'postgresql',
      message: 'Ledger storage must use PostgreSQL before ledger writes.'
    }),
    ...validateExactValue({
      value,
      file: LEDGER_STORAGE_FILE,
      path: 'storage.migration_required_before_writes',
      expected: true,
      message: 'Ledger storage migration must be required before writes.'
    }),
    ...validateExactValue({
      value,
      file: LEDGER_STORAGE_FILE,
      path: 'storage.schema_owner',
      expected: 'ledger',
      message: 'Ledger storage schema owner must remain `ledger`.'
    }),
    ...validateExactValue({
      value,
      file: LEDGER_STORAGE_FILE,
      path: 'storage.product_repo_direct_access_allowed',
      expected: false,
      message: 'Product repositories must not access ledger storage directly.'
    }),
    ...validateExactValue({
      value,
      file: LEDGER_STORAGE_FILE,
      path: 'tables.ledger_entries.append_only',
      expected: true,
      message: 'Ledger storage table must remain append-only.'
    }),
    ...validateExactValue({
      value,
      file: LEDGER_STORAGE_FILE,
      path: 'tables.ledger_entries.update_allowed',
      expected: false,
      message: 'Ledger storage table must not allow updates.'
    }),
    ...validateExactValue({
      value,
      file: LEDGER_STORAGE_FILE,
      path: 'tables.ledger_entries.delete_allowed',
      expected: false,
      message: 'Ledger storage table must not allow deletes.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: LEDGER_STORAGE_FILE,
      path: 'tables.ledger_entries.required_columns',
      field: 'tables.ledger_entries.required_columns',
      requiredEntries: REQUIRED_LEDGER_STORAGE_COLUMNS
    }),
    ...validateExactValue({
      value,
      file: LEDGER_STORAGE_FILE,
      path: 'tables.ledger_entries.amount.integer_credit_units_required',
      expected: true,
      message: 'Ledger storage amounts must use integer credit units.'
    }),
    ...validateExactValue({
      value,
      file: LEDGER_STORAGE_FILE,
      path: 'tables.ledger_entries.amount.floating_point_allowed',
      expected: false,
      message: 'Ledger storage must not allow floating point amounts.'
    }),
    ...validateExactValue({
      value,
      file: LEDGER_STORAGE_FILE,
      path: 'double_entry.required',
      expected: true,
      message: 'Ledger storage must require double-entry posting.'
    }),
    ...validateExactValue({
      value,
      file: LEDGER_STORAGE_FILE,
      path: 'double_entry.balance_group_key',
      expected: 'ledger_transaction_id',
      message: 'Ledger storage double-entry balance group must be `ledger_transaction_id`.'
    }),
    ...validateExactValue({
      value,
      file: LEDGER_STORAGE_FILE,
      path: 'double_entry.debit_credit_sum_must_balance',
      expected: true,
      message: 'Ledger storage debit and credit sums must balance.'
    }),
    ...validateExactValue({
      value,
      file: LEDGER_STORAGE_FILE,
      path: 'double_entry.imbalance_policy',
      expected: 'reject_transaction',
      message: 'Ledger storage imbalance policy must reject the transaction.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: LEDGER_STORAGE_FILE,
      path: 'idempotency.unique_scope',
      field: 'idempotency.unique_scope',
      requiredEntries: REQUIRED_LEDGER_STORAGE_IDEMPOTENCY_SCOPE
    }),
    ...validateExactValue({
      value,
      file: LEDGER_STORAGE_FILE,
      path: 'idempotency.payload_hash_required',
      expected: true,
      message: 'Ledger storage idempotency must require payload hashing.'
    }),
    ...validateExactValue({
      value,
      file: LEDGER_STORAGE_FILE,
      path: 'idempotency.duplicate_same_payload',
      expected: 'return_previous_result',
      message: 'Ledger storage duplicate same-payload writes must return the previous result.'
    }),
    ...validateExactValue({
      value,
      file: LEDGER_STORAGE_FILE,
      path: 'idempotency.duplicate_different_payload',
      expected: 'fail_conflict',
      message: 'Ledger storage duplicate different-payload writes must fail conflict.'
    }),
    ...validateExactValue({
      value,
      file: LEDGER_STORAGE_FILE,
      path: 'corrections.method',
      expected: 'reversal_entry',
      message: 'Ledger storage corrections must use reversal entries.'
    }),
    ...validateExactValue({
      value,
      file: LEDGER_STORAGE_FILE,
      path: 'corrections.update_delete_corrections_allowed',
      expected: false,
      message: 'Ledger storage corrections must not update or delete entries.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: LEDGER_STORAGE_FILE,
      path: 'corrections.reversal_required_fields',
      field: 'corrections.reversal_required_fields',
      requiredEntries: REQUIRED_LEDGER_STORAGE_REVERSAL_FIELDS
    }),
    ...validateExactValue({
      value,
      file: LEDGER_STORAGE_FILE,
      path: 'projections.source_of_truth',
      expected: false,
      message: 'Ledger projections must not be source of truth.'
    }),
    ...validateExactValue({
      value,
      file: LEDGER_STORAGE_FILE,
      path: 'projections.rebuildable_from_ledger_entries',
      expected: true,
      message: 'Ledger projections must be rebuildable from ledger entries.'
    }),
    ...validateExactValue({
      value,
      file: LEDGER_STORAGE_FILE,
      path: 'projections.direct_mutation_allowed',
      expected: false,
      message: 'Ledger projections must not allow direct mutation.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: LEDGER_STORAGE_FILE,
      path: 'forbidden',
      field: 'forbidden',
      requiredEntries: REQUIRED_LEDGER_STORAGE_FORBIDDEN_ITEMS
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

function validatePackageScripts(value: unknown): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const script of REQUIRED_PACKAGE_SCRIPTS) {
    const actual = readPath(value, `scripts.${script}`);

    if (typeof actual === 'string' && actual.trim().length > 0) {
      continue;
    }

    diagnostics.push(
      createMoneyDiagnostic(
        PACKAGE_FILE,
        `scripts.${script}`,
        `Money platform package must declare \`${script}\` script.`
      )
    );
  }

  diagnostics.push(
    ...validatePackageScriptIncludes({
      value,
      script: 'check',
      requiredFragments: ['cargo fmt --check', 'cargo check', 'cargo test']
    })
  );

  return diagnostics;
}

async function validateCheckerSurface(
  repositoryRoot: string
): Promise<readonly Diagnostic[]> {
  const [
    bunLock,
    tsconfig,
    script,
    cliSource,
    parserSource,
    typesSource,
    validatorSource,
    testSource
  ] = await Promise.all(
    REQUIRED_MONEY_CHECKER_FILES.map((file) =>
      readOptionalTextFile(repositoryRoot, file)
    )
  );

  return [
    ...bunLock.diagnostics,
    ...tsconfig.diagnostics,
    ...script.diagnostics,
    ...cliSource.diagnostics,
    ...parserSource.diagnostics,
    ...typesSource.diagnostics,
    ...validatorSource.diagnostics,
    ...testSource.diagnostics,
    ...(script.source === null
      ? []
      : validateSourceIncludes({
          file: CHECKER_SCRIPT_FILE,
          source: script.source,
          requiredFragments: ['runMoneyContractCheckCli']
        })),
    ...(parserSource.source === null
      ? []
      : validateSourceIncludes({
          file: CHECKER_PARSER_FILE,
          source: parserSource.source,
          requiredFragments: ['readYamlFile', 'Bun.YAML.parse']
        })),
    ...(validatorSource.source === null
      ? []
      : validateSourceIncludes({
          file: CHECKER_VALIDATOR_FILE,
          source: validatorSource.source,
          requiredFragments: [
            'checkMoneyContracts',
            'MONEY_BOUNDARIES_FILE',
            'MONEY_COMMAND_ENVELOPE_FILE',
            'LEDGER_ENTRY_FILE',
            'LEDGER_STORAGE_FILE',
            'PAYMENT_WEBHOOK_FILE',
            'ENTITLEMENT_CREDIT_FILE',
            'SERVICE_FILE',
            'MONEY_FORBIDDEN',
            'LEDGER_STORAGE_FORBIDDEN',
            'QUEUE_ENVELOPE_REQUIRED_FIELDS',
            MONEY_BOUNDARIES_FILE,
            MONEY_COMMAND_ENVELOPE_FILE,
            LEDGER_ENTRY_FILE,
            LEDGER_STORAGE_FILE,
            PAYMENT_WEBHOOK_FILE,
            ENTITLEMENT_CREDIT_FILE,
            'service.yaml',
            'ZDP-MONEY-PLATFORM-001'
          ]
        })),
    ...(testSource.source === null
      ? []
      : validateSourceIncludes({
          file: CHECKER_TEST_FILE,
          source: testSource.source,
          requiredFragments: [
            'fails when command idempotency or sensitive payload rules drift',
            'fails when ledger append-only rules drift',
            'fails when ledger storage treats projections as truth',
            'fails when webhook processing can bypass edge, signature, or queue rules',
            'fails when entitlement and credit truth boundaries drift',
            'fails when service.yaml stops declaring the money risk boundary'
          ]
        }))
  ];
}

async function validateRuntimeSurface(
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
    ledgerCoreSource,
    storageModSource,
    storagePaymentWebhookProcessingSource
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
    ...ledgerCoreSource.diagnostics,
    ...storageModSource.diagnostics,
    ...storagePaymentWebhookProcessingSource.diagnostics,
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
    ...(storageModSource.source === null
      ? []
      : validateRuntimeSourceIncludes({
          file: RUNTIME_STORAGE_MOD_FILE,
          source: storageModSource.source,
          requiredFragments: ['pub mod payment_webhook_processing;']
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

function validateSourceIncludes(input: {
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
        `Money platform checker source must include \`${fragment}\`.`
      )
    );
  }

  return diagnostics;
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

function validatePackageScriptIncludes(input: {
  readonly value: unknown;
  readonly script: string;
  readonly requiredFragments: readonly string[];
}): readonly Diagnostic[] {
  const scriptValue = readPath(input.value, `scripts.${input.script}`);

  if (typeof scriptValue !== 'string') {
    return [];
  }

  const diagnostics: Diagnostic[] = [];

  for (const fragment of input.requiredFragments) {
    if (scriptValue.includes(fragment)) {
      continue;
    }

    diagnostics.push(
      createMoneyDiagnostic(
        PACKAGE_FILE,
        `scripts.${input.script}`,
        `Money platform package script \`${input.script}\` must include \`${fragment}\`.`
      )
    );
  }

  return diagnostics;
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
