import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Diagnostic } from '../../diagnostics.ts';
import {
  createMoneyDiagnostic,
  isMissingPathError,
  readPath
} from './contract-helpers.ts';
import {
  MONEY_DB_SCHEMA_FILE,
  PAYMENT_WEBHOOK_FILE
} from './payment-webhook-outbox.ts';

export const PACKAGE_FILE = 'package.json';

const MONEY_BOUNDARIES_FILE = 'contracts/money-boundaries.yaml';
const MONEY_COMMAND_ENVELOPE_FILE = 'contracts/money-command-envelope.yaml';
const LEDGER_ENTRY_FILE = 'contracts/ledger-entry.yaml';
const LEDGER_STORAGE_FILE = 'contracts/ledger-storage.yaml';
const ENTITLEMENT_CREDIT_FILE = 'contracts/entitlement-credit.yaml';
const BUN_LOCK_FILE = 'bun.lock';
const TSCONFIG_FILE = 'tsconfig.json';
const CHECKER_SCRIPT_FILE = 'scripts/check-money-contracts.ts';
const CHECKER_CLI_FILE = 'src/money-contracts/cli.ts';
const CHECKER_PARSER_FILE = 'src/money-contracts/parser.ts';
const CHECKER_TYPES_FILE = 'src/money-contracts/types.ts';
const CHECKER_VALIDATOR_FILE = 'src/money-contracts/validator.ts';
const CHECKER_TEST_FILE = 'tests/money-contracts.test.ts';

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

const REQUIRED_PACKAGE_SCRIPTS = [
  'check',
  'test',
  'contracts:check',
  'rust:fmt',
  'rust:check',
  'rust:test'
] as const;

export function validatePackageScripts(value: unknown): readonly Diagnostic[] {
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

export async function validateCheckerSurface(
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
            'MONEY_DB_SCHEMA_FILE',
            'ENTITLEMENT_CREDIT_FILE',
            'SERVICE_FILE',
            'SERVICE_REQUIRED_DATA_CLASSES',
            'SERVICE_REQUIRED_DATASTORES',
            'SERVICE_REQUIRED_DELETION_EVENTS',
            'SERVICE_REQUIRED_PRODUCED_EVENTS',
            'SERVICE_REQUIRED_CONSUMED_EVENTS',
            'MONEY_FORBIDDEN',
            'LEDGER_STORAGE_FORBIDDEN',
            'QUEUE_ENVELOPE_REQUIRED_FIELDS',
            'payments.payment_outbox_required_fields',
            'payments.payment_outbox_delivery_statuses',
            'payment_outbox_claim_lock_required',
            'payment_outbox_claim_requires_token_and_lease',
            'payment_outbox_claim_token_unique_required',
            'payment_outbox_compare_and_swap_required',
            MONEY_BOUNDARIES_FILE,
            MONEY_COMMAND_ENVELOPE_FILE,
            LEDGER_ENTRY_FILE,
            LEDGER_STORAGE_FILE,
            PAYMENT_WEBHOOK_FILE,
            MONEY_DB_SCHEMA_FILE,
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
            'fails when money DB schema allows unsafe money storage',
            'fails when entitlement and credit truth boundaries drift',
            'fails when service.yaml stops declaring the money risk boundary',
            'billing.checkout-started'
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
