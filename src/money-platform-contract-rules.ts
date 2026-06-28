import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { Diagnostic } from './diagnostics.ts';
import {
  createMoneyDiagnostic,
  formatError,
  isMissingPathError,
  MONEY_PAYMENT_WEBHOOK_OUTBOX_RULE_ID,
  MONEY_PLATFORM_CONTRACT_RULE_ID,
  MONEY_REPOSITORY_NAME,
  readEventRefArrayPath,
  readPath,
  readRepositoryName,
  readStringArrayPath,
  validateExactValue,
  validateRequiredStringArrayEntries
} from './rules/money/contract-helpers.ts';
import {
  MONEY_BOUNDARIES_FILE,
  MONEY_COMMAND_ENVELOPE_FILE,
  validateCommandEnvelopeContract,
  validateMoneyBoundariesContract
} from './rules/money/boundary-command.ts';
import {
  PACKAGE_FILE,
  validateCheckerSurface,
  validatePackageScripts
} from './rules/money/checker-surface.ts';
import {
  MONEY_DB_SCHEMA_FILE,
  PAYMENT_WEBHOOK_FILE,
  validateMoneyDbSchemaContract,
  validatePaymentWebhookContract
} from './rules/money/payment-webhook-outbox.ts';
import { validateRuntimeSurface } from './rules/money/runtime-surface.ts';

const LEDGER_ENTRY_FILE = 'contracts/ledger-entry.yaml';
const LEDGER_STORAGE_FILE = 'contracts/ledger-storage.yaml';
const ENTITLEMENT_CREDIT_FILE = 'contracts/entitlement-credit.yaml';

const REQUIRED_SERVICE_DATA_CLASSES = [
  'billing',
  'payments',
  'webhook-logs',
  'ledger',
  'credit-ledger',
  'risk',
  'kyc-status',
  'chargeback-cases'
] as const;
const REQUIRED_SERVICE_DATASTORES = [
  'billing_postgres',
  'payments_postgres',
  'ledger_postgres',
  'risk_postgres'
] as const;
const REQUIRED_SERVICE_DELETION_EVENTS = [
  'deletion.step.completed',
  'deletion.step.failed'
] as const;
const REQUIRED_SERVICE_PRODUCED_EVENTS = [
  'money.ledger.entry-posted',
  'deletion.step.completed',
  'deletion.step.failed'
] as const;
const REQUIRED_SERVICE_CONSUMED_EVENTS = [
  'billing.checkout-started',
  'ai.usage.recorded',
  'chain.fact.observed',
  'chain.fact.quarantined'
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
    ledgerStorage,
    paymentWebhook,
    moneyDbSchema,
    entitlementCredit
  ] = await Promise.all([
    readRequiredYamlContract(input.repositoryRoot, MONEY_BOUNDARIES_FILE),
    readRequiredYamlContract(input.repositoryRoot, MONEY_COMMAND_ENVELOPE_FILE),
    readRequiredYamlContract(input.repositoryRoot, LEDGER_ENTRY_FILE),
    readRequiredYamlContract(input.repositoryRoot, LEDGER_STORAGE_FILE),
    readRequiredYamlContract(input.repositoryRoot, PAYMENT_WEBHOOK_FILE),
    readRequiredYamlContract(
      input.repositoryRoot,
      MONEY_DB_SCHEMA_FILE,
      MONEY_PAYMENT_WEBHOOK_OUTBOX_RULE_ID
    ),
    readRequiredYamlContract(input.repositoryRoot, ENTITLEMENT_CREDIT_FILE)
  ]);
  const packageJson = await readRequiredJsonContract(input.repositoryRoot, PACKAGE_FILE);

  return [
    ...moneyBoundaries.diagnostics,
    ...commandEnvelope.diagnostics,
    ...ledgerEntry.diagnostics,
    ...ledgerStorage.diagnostics,
    ...paymentWebhook.diagnostics,
    ...moneyDbSchema.diagnostics,
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
    ...(moneyDbSchema.value === null
      ? []
      : validateMoneyDbSchemaContract(moneyDbSchema.value)),
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
  file: string,
  ruleId = MONEY_PLATFORM_CONTRACT_RULE_ID
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
            `Money platform repository must include \`${file}\`.`,
            ruleId
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
          )}`,
          ruleId
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
    ...validateRequiredStringArrayEntries({
      value,
      file: 'service.yaml',
      path: 'data.classes',
      field: 'data.classes',
      requiredEntries: REQUIRED_SERVICE_DATA_CLASSES
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: 'service.yaml',
      path: 'data.datastores',
      field: 'data.datastores',
      requiredEntries: REQUIRED_SERVICE_DATASTORES
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: 'service.yaml',
      path: 'data.deletion.targets',
      field: 'data.deletion.targets',
      requiredEntries: REQUIRED_SERVICE_DATA_CLASSES
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: 'service.yaml',
      path: 'data.deletion.propagation_events',
      field: 'data.deletion.propagation_events',
      requiredEntries: REQUIRED_SERVICE_DELETION_EVENTS
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
      path: 'dependencies.datastores',
      field: 'dependencies.datastores',
      requiredEntries: REQUIRED_SERVICE_DATASTORES
    }),
    ...validateExactValue({
      value,
      file: 'service.yaml',
      path: 'events.cloudevents_required',
      expected: true,
      message: 'Money platform service must require CloudEvents for catalog events.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: 'service.yaml',
      path: 'events.produced',
      field: 'events.produced',
      readEntries: readEventRefArrayPath,
      requiredEntries: REQUIRED_SERVICE_PRODUCED_EVENTS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: 'service.yaml',
      path: 'events.consumed',
      field: 'events.consumed',
      readEntries: readEventRefArrayPath,
      requiredEntries: REQUIRED_SERVICE_CONSUMED_EVENTS
    }),
    ...validateExactValue({
      value,
      file: 'service.yaml',
      path: 'events.replay_supported',
      expected: true,
      message: 'Money platform service must support replay for catalog event handoff.'
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
