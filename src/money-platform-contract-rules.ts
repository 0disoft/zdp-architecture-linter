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
import {
  ENTITLEMENT_CREDIT_FILE,
  LEDGER_ENTRY_FILE,
  LEDGER_STORAGE_FILE,
  validateEntitlementCreditContract,
  validateLedgerEntryContract,
  validateLedgerStorageContract
} from './rules/money/ledger-contracts.ts';
import { validateRuntimeSurface } from './rules/money/runtime-surface.ts';

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
