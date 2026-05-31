import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { validateRepositoryMoneyPlatformContract } from '../src/money-platform-contract-rules.ts';

describe('money platform contract rules', () => {
  test('passes when the money platform repository declares money contracts', async () => {
    await withRepositoryRoot(createValidMoneyFiles(), async (repositoryRoot) => {
      const diagnostics = await validateRepositoryMoneyPlatformContract({
        repositoryRoot,
        repositoryServiceContract: createMoneyServiceContract()
      });

      expect(diagnostics).toEqual([]);
    });
  });

  test('skips repositories that are not zdp-money-platform', async () => {
    await withRepositoryRoot({}, async (repositoryRoot) => {
      const diagnostics = await validateRepositoryMoneyPlatformContract({
        repositoryRoot,
        repositoryServiceContract: {
          service: {
            repo: 'zdp-growth-lab'
          }
        }
      });

      expect(diagnostics).toEqual([]);
    });
  });

  test('fails when required money platform contract files are missing', async () => {
    await withRepositoryRoot({}, async (repositoryRoot) => {
      const diagnostics = await validateRepositoryMoneyPlatformContract({
        repositoryRoot,
        repositoryServiceContract: createMoneyServiceContract()
      });

      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-MONEY-PLATFORM-001',
        severity: 'error',
        file: 'contracts/money-boundaries.yaml',
        path: 'repository.root',
        message:
          'Money platform repository must include `contracts/money-boundaries.yaml`.'
      });
      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-MONEY-PLATFORM-001',
        severity: 'error',
        file: 'contracts/money-command-envelope.yaml',
        path: 'repository.root',
        message:
          'Money platform repository must include `contracts/money-command-envelope.yaml`.'
      });
      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-MONEY-PLATFORM-001',
        severity: 'error',
        file: 'contracts/ledger-entry.yaml',
        path: 'repository.root',
        message:
          'Money platform repository must include `contracts/ledger-entry.yaml`.'
      });
      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-MONEY-PLATFORM-001',
        severity: 'error',
        file: 'contracts/ledger-storage.yaml',
        path: 'repository.root',
        message:
          'Money platform repository must include `contracts/ledger-storage.yaml`.'
      });
      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-MONEY-PLATFORM-001',
        severity: 'error',
        file: 'contracts/payment-webhook.yaml',
        path: 'repository.root',
        message:
          'Money platform repository must include `contracts/payment-webhook.yaml`.'
      });
      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-MONEY-PLATFORM-001',
        severity: 'error',
        file: 'contracts/entitlement-credit.yaml',
        path: 'repository.root',
        message:
          'Money platform repository must include `contracts/entitlement-credit.yaml`.'
      });
      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-MONEY-PLATFORM-001',
        severity: 'error',
        file: 'package.json',
        path: 'repository.root',
        message: 'Money platform repository must include `package.json`.'
      });
      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-MONEY-PLATFORM-001',
        severity: 'error',
        file: 'scripts/check-money-contracts.ts',
        path: 'repository.root',
        message:
          'Money platform repository must include `scripts/check-money-contracts.ts`.'
      });
    });
  });

  test('fails when a money contract file is not valid YAML', async () => {
    await withRepositoryRoot(
      {
        ...createValidMoneyFiles(),
        'contracts/money-boundaries.yaml': 'contract: [broken'
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryMoneyPlatformContract({
          repositoryRoot,
          repositoryServiceContract: createMoneyServiceContract()
        });

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]).toMatchObject({
          ruleId: 'ZDP-MONEY-PLATFORM-001',
          severity: 'error',
          file: 'contracts/money-boundaries.yaml',
          path: 'yaml'
        });
      }
    );
  });

  test('fails when money boundaries drift open', async () => {
    await withRepositoryRoot(
      {
        ...createValidMoneyFiles(),
        'contracts/money-boundaries.yaml': `
contract:
  version: 2
principles:
  ledger_is_append_only: false
  product_repositories_mutate_money_state: true
  provider_state_is_not_platform_truth: false
  entitlement_and_ledger_are_separate: true
  credit_balance_truth_owner: billing
boundaries:
  billing:
    owns: []
    must_not_own: []
    db_schema: money_billing
    db_role: money_billing_writer
    audit_required: false
    split_trigger: split
forbidden:
  - product_repo_credit_mutation
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryMoneyPlatformContract({
          repositoryRoot,
          repositoryServiceContract: createMoneyServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-MONEY-PLATFORM-001',
          severity: 'error',
          file: 'contracts/money-boundaries.yaml',
          path: 'principles.ledger_is_append_only',
          message: 'Money platform ledger principle must remain append-only.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-MONEY-PLATFORM-001',
          severity: 'error',
          file: 'contracts/money-boundaries.yaml',
          path: 'principles.credit_balance_truth_owner',
          message: 'Credit balance truth owner must be `ledger`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-MONEY-PLATFORM-001',
          severity: 'error',
          file: 'contracts/money-boundaries.yaml',
          path: 'boundaries.payments',
          message: 'Money platform must define `payments` boundary.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-MONEY-PLATFORM-001',
          severity: 'error',
          file: 'contracts/money-boundaries.yaml',
          path: 'boundaries.billing.audit_required',
          message: 'Money platform boundary `billing` must require audit.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-MONEY-PLATFORM-001',
          severity: 'error',
          file: 'contracts/money-boundaries.yaml',
          path: 'forbidden',
          message:
            'Money platform contract `contracts/money-boundaries.yaml` must include `ledger_entry_delete` in `forbidden`.'
        });
      }
    );
  });

  test('fails when money command envelope loses idempotency and redaction requirements', async () => {
    await withRepositoryRoot(
      {
        ...createValidMoneyFiles(),
        'contracts/money-command-envelope.yaml': `
contract:
  version: 1
required_fields:
  - command_id
allowed_command_types:
  - ledger.append_entry
idempotency:
  payload_hash_required: false
  duplicate_same_payload: rerun
  duplicate_different_payload: overwrite
  raw_payload_storage_allowed: true
payload_ref:
  forbidden_values:
    - raw_card_number
audit:
  required: false
  reason_required: false
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryMoneyPlatformContract({
          repositoryRoot,
          repositoryServiceContract: createMoneyServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-MONEY-PLATFORM-001',
          severity: 'error',
          file: 'contracts/money-command-envelope.yaml',
          path: 'required_fields',
          message:
            'Money platform contract `contracts/money-command-envelope.yaml` must include `idempotency_key` in `required_fields`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-MONEY-PLATFORM-001',
          severity: 'error',
          file: 'contracts/money-command-envelope.yaml',
          path: 'idempotency.raw_payload_storage_allowed',
          message: 'Money command idempotency must not store raw payloads.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-MONEY-PLATFORM-001',
          severity: 'error',
          file: 'contracts/money-command-envelope.yaml',
          path: 'payload_ref.forbidden_values',
          message:
            'Money platform contract `contracts/money-command-envelope.yaml` must include `raw_payment_payload` in `payload_ref.forbidden_values`.'
        });
      }
    );
  });

  test('fails when ledger entries stop being append-only double-entry records', async () => {
    await withRepositoryRoot(
      {
        ...createValidMoneyFiles(),
        'contracts/ledger-entry.yaml': `
contract:
  version: 1
ledger_entry:
  append_only: false
  update_in_place_allowed: true
  delete_allowed: true
  correction_method: edit_entry
  required_fields:
    - ledger_entry_id
  amount:
    integer_minor_units_required: false
    floating_point_allowed: true
double_entry:
  required: false
  debit_credit_sum_must_balance: false
forbidden:
  - product_repo_balance_mutation
reconciliation:
  required: false
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryMoneyPlatformContract({
          repositoryRoot,
          repositoryServiceContract: createMoneyServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-MONEY-PLATFORM-001',
          severity: 'error',
          file: 'contracts/ledger-entry.yaml',
          path: 'ledger_entry.update_in_place_allowed',
          message: 'Ledger entries must not allow update-in-place.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-MONEY-PLATFORM-001',
          severity: 'error',
          file: 'contracts/ledger-entry.yaml',
          path: 'ledger_entry.amount.floating_point_allowed',
          message: 'Ledger amounts must not allow floating point values.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-MONEY-PLATFORM-001',
          severity: 'error',
          file: 'contracts/ledger-entry.yaml',
          path: 'double_entry.required',
          message: 'Ledger contract must require double-entry posting.'
        });
      }
    );
  });

  test('fails when ledger storage can update rows or treat projections as truth', async () => {
    await withRepositoryRoot(
      {
        ...createValidMoneyFiles(),
        'contracts/ledger-storage.yaml': `
contract:
  version: 1
storage:
  engine: sqlite
  migration_required_before_writes: false
  schema_owner: billing
  product_repo_direct_access_allowed: true
tables:
  ledger_entries:
    append_only: false
    update_allowed: true
    delete_allowed: true
    required_columns:
      - ledger_entry_id
    amount:
      integer_minor_units_required: false
      floating_point_allowed: true
double_entry:
  required: false
  balance_group_key: tenant_id
  debit_credit_sum_must_balance: false
  imbalance_policy: accept_and_reconcile_later
idempotency:
  unique_scope:
    - idempotency_key
  payload_hash_required: false
  duplicate_same_payload: rerun
  duplicate_different_payload: overwrite
corrections:
  method: update_entry
  update_delete_corrections_allowed: true
  reversal_required_fields:
    - reason
projections:
  source_of_truth: true
  rebuildable_from_ledger_entries: false
  direct_mutation_allowed: true
forbidden:
  - ledger_entry_update
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryMoneyPlatformContract({
          repositoryRoot,
          repositoryServiceContract: createMoneyServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-MONEY-PLATFORM-001',
          severity: 'error',
          file: 'contracts/ledger-storage.yaml',
          path: 'tables.ledger_entries.update_allowed',
          message: 'Ledger storage table must not allow updates.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-MONEY-PLATFORM-001',
          severity: 'error',
          file: 'contracts/ledger-storage.yaml',
          path: 'idempotency.unique_scope',
          message:
            'Money platform contract `contracts/ledger-storage.yaml` must include `tenant_id` in `idempotency.unique_scope`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-MONEY-PLATFORM-001',
          severity: 'error',
          file: 'contracts/ledger-storage.yaml',
          path: 'projections.source_of_truth',
          message: 'Ledger projections must not be source of truth.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-MONEY-PLATFORM-001',
          severity: 'error',
          file: 'contracts/ledger-storage.yaml',
          path: 'forbidden',
          message:
            'Money platform contract `contracts/ledger-storage.yaml` must include `balance_projection_as_truth` in `forbidden`.'
        });
      }
    );
  });

  test('fails when payment webhook processing bypasses edge or queue boundaries', async () => {
    await withRepositoryRoot(
      {
        ...createValidMoneyFiles(),
        'contracts/payment-webhook.yaml': `
contract:
  version: 1
ingress:
  received_by: zdp-money-platform
  processed_by: product-repo
  received_and_processed_are_separate: false
  product_repo_direct_processing_allowed: true
required_fields:
  - provider_event_id
signature:
  verification_required_before_processing: false
  secret_storage_owner: zdp-money-platform
idempotency:
  duplicate_event_must_not_mutate_ledger_twice: false
handoff:
  queue_required_before_processing: false
  dead_letter_required: false
forbidden:
  - logging_cookie
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryMoneyPlatformContract({
          repositoryRoot,
          repositoryServiceContract: createMoneyServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-MONEY-PLATFORM-001',
          severity: 'error',
          file: 'contracts/payment-webhook.yaml',
          path: 'ingress.received_by',
          message: 'Payment webhooks must be received by `zdp-edge-workers`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-MONEY-PLATFORM-001',
          severity: 'error',
          file: 'contracts/payment-webhook.yaml',
          path: 'handoff.queue_required_before_processing',
          message: 'Payment webhooks must use queue handoff before processing.'
        });
      }
    );
  });

  test('fails when entitlement and credit truth collapse into product or billing code', async () => {
    await withRepositoryRoot(
      {
        ...createValidMoneyFiles(),
        'contracts/entitlement-credit.yaml': `
contract:
  version: 1
ownership:
  entitlement_contract_owner: product_repo
  credit_balance_truth_owner: billing
  final_authorization_owner: zdp-web-apps
entitlement_grant:
  required_fields:
    - entitlement_grant_id
credit_spend:
  product_repo_may_mutate_balance: true
  hold_capture_release_required_for_uncertain_cost: false
refund_coupling:
  refund_must_consider_used_credits: false
  remaining_credit_restoration_requires_ledger_entry: false
forbidden:
  - credit_balance_direct_set
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryMoneyPlatformContract({
          repositoryRoot,
          repositoryServiceContract: createMoneyServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-MONEY-PLATFORM-001',
          severity: 'error',
          file: 'contracts/entitlement-credit.yaml',
          path: 'ownership.credit_balance_truth_owner',
          message: 'Credit balance truth owner must be `ledger`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-MONEY-PLATFORM-001',
          severity: 'error',
          file: 'contracts/entitlement-credit.yaml',
          path: 'credit_spend.product_repo_may_mutate_balance',
          message: 'Product repositories must not mutate credit balances.'
        });
      }
    );
  });

  test('fails when service contract stops requiring the money platform gate', async () => {
    await withRepositoryRoot(createValidMoneyFiles(), async (repositoryRoot) => {
      const diagnostics = await validateRepositoryMoneyPlatformContract({
        repositoryRoot,
        repositoryServiceContract: {
          ...createMoneyServiceContract(),
          policy_gates: {
            required_linter_rules: ['ZDP-REPO-BASELINE-001']
          }
        }
      });

      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-MONEY-PLATFORM-001',
        severity: 'error',
        file: 'service.yaml',
        path: 'policy_gates.required_linter_rules',
        message:
          'Money platform service contract must require `ZDP-MONEY-PLATFORM-001`.'
      });
    });
  });

  test('fails when money checker files and scripts drift', async () => {
    await withRepositoryRoot(
      {
        ...createValidMoneyFiles(),
        'package.json': `
{
  "scripts": {
    "check": "bun test"
  }
}
`,
        'src/money-contracts/parser.ts': `
export async function readYamlFile(): Promise<unknown> {
  return {};
}
`,
        'src/money-contracts/validator.ts': `
export async function checkMoneyContracts(): Promise<void> {}
`,
        'tests/money-contracts.test.ts': `
import { test } from 'bun:test';
test('money placeholder', () => {});
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryMoneyPlatformContract({
          repositoryRoot,
          repositoryServiceContract: createMoneyServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-MONEY-PLATFORM-001',
          severity: 'error',
          file: 'package.json',
          path: 'scripts.test',
          message: 'Money platform package must declare `test` script.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-MONEY-PLATFORM-001',
          severity: 'error',
          file: 'package.json',
          path: 'scripts.contracts:check',
          message:
            'Money platform package must declare `contracts:check` script.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-MONEY-PLATFORM-001',
          severity: 'error',
          file: 'src/money-contracts/parser.ts',
          path: 'source',
          message:
            'Money platform checker source must include `Bun.YAML.parse`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-MONEY-PLATFORM-001',
          severity: 'error',
          file: 'src/money-contracts/validator.ts',
          path: 'source',
          message:
            'Money platform checker source must include `MONEY_BOUNDARIES_FILE`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-MONEY-PLATFORM-001',
          severity: 'error',
          file: 'tests/money-contracts.test.ts',
          path: 'source',
          message:
            'Money platform checker source must include `fails when ledger append-only rules drift`.'
        });
      }
    );
  });
});

async function withRepositoryRoot(
  files: Record<string, string>,
  callback: (repositoryRoot: string) => Promise<void>
): Promise<void> {
  const repositoryRoot = await mkdtemp(join(tmpdir(), 'zdp-money-rules-'));

  try {
    for (const [relativePath, content] of Object.entries(files)) {
      const filePath = join(repositoryRoot, relativePath);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, content.trimStart(), 'utf8');
    }

    await callback(repositoryRoot);
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true });
  }
}

function createMoneyServiceContract(): Record<string, unknown> {
  return {
    service: {
      repo: 'zdp-money-platform',
      tier: 'tier0'
    },
    domain: {
      money_movement: true
    },
    data: {
      append_only_required: true
    },
    audit: {
      immutable: true
    },
    idempotency: {
      required: true
    },
    policy_gates: {
      required_linter_rules: [
        'ZDP-REPO-BASELINE-001',
        'ZDP-MONEY-PLATFORM-001'
      ]
    },
    exit: {
      kill_criteria: [
        'product repositories mutate ledger, credits, refunds, or chargebacks directly',
        'provider webhook duplicates can mutate balance or entitlement state twice',
        'billing, payments, risk, or analytics becomes the credit balance source of truth',
        'raw cardholder data, PSP secrets, wallet keys, or seed phrases are committed'
      ]
    }
  };
}

function createValidMoneyFiles(): Record<string, string> {
  return {
    ...createValidMoneyCheckerFiles(),
    'contracts/money-boundaries.yaml': `
contract:
  version: 2
  status: draft
principles:
  ledger_is_append_only: true
  product_repositories_mutate_money_state: false
  provider_state_is_not_platform_truth: true
  entitlement_and_ledger_are_separate: true
  credit_balance_truth_owner: ledger
boundaries:
  billing:
    owns: [product_catalog]
    must_not_own: [credit_balance_truth]
    db_schema: money_billing
    db_role: money_billing_writer
    audit_required: true
    split_trigger: split billing
  payments:
    owns: [provider_payment_attempt]
    must_not_own: [append_only_ledger_entry]
    db_schema: money_payments
    db_role: money_payments_writer
    audit_required: true
    split_trigger: split payments
  ledger:
    owns: [append_only_entry, double_entry_posting, credit_lot]
    must_not_own: [provider_secret]
    db_schema: money_ledger
    db_role: money_ledger_writer
    audit_required: true
    split_trigger: split ledger
  risk:
    owns: [risk_score]
    must_not_own: [payment_capture]
    db_schema: money_risk
    db_role: money_risk_writer
    audit_required: true
    split_trigger: split risk
forbidden:
  - product_repo_credit_mutation
  - duplicate_webhook_balance_change
  - ledger_entry_update_in_place
  - ledger_entry_delete
  - billing_direct_balance_write
  - payments_direct_entitlement_grant
  - risk_direct_payment_capture
  - raw_cardholder_data_storage
  - private_key_or_seed_storage
`,
    'contracts/money-command-envelope.yaml': `
contract:
  version: 1
  status: draft
required_fields:
  - command_id
  - command_type
  - schema_version
  - actor_id
  - tenant_id
  - request_id
  - trace_id
  - idempotency_key
  - reason
  - issued_at
  - source
  - payload_ref
allowed_command_types:
  - billing.create_invoice_intent
  - payments.record_provider_attempt
  - payments.record_provider_webhook
  - payments.request_refund
  - ledger.append_entry
  - ledger.create_credit_hold
  - ledger.capture_credit_hold
  - ledger.release_credit_hold
  - risk.open_review
  - risk.close_review
idempotency:
  payload_hash_required: true
  duplicate_same_payload: return_previous_result
  duplicate_different_payload: fail_conflict
  raw_payload_storage_allowed: false
payload_ref:
  forbidden_values:
    - raw_card_number
    - cvv
    - provider_secret
    - authorization_header
    - cookie
    - private_key
    - seed_phrase
    - raw_payment_payload
audit:
  required: true
  reason_required: true
`,
    'contracts/ledger-entry.yaml': `
contract:
  version: 1
ledger_entry:
  append_only: true
  update_in_place_allowed: false
  delete_allowed: false
  correction_method: reversal_entry
  required_fields:
    - ledger_entry_id
    - ledger_account_id
    - tenant_id
    - currency
    - amount_minor
    - debit_or_credit
    - entry_type
    - occurred_at
    - command_id
    - idempotency_key
    - causation_ref
    - reason
  amount:
    integer_minor_units_required: true
    floating_point_allowed: false
double_entry:
  required: true
  debit_credit_sum_must_balance: true
forbidden:
  - balance_set_without_entries
  - product_repo_balance_mutation
  - ledger_entry_update_in_place
  - ledger_entry_delete
  - refund_without_reversal
  - chargeback_without_adjustment_entry
reconciliation:
  required: true
`,
    'contracts/ledger-storage.yaml': `
contract:
  version: 1
storage:
  engine: postgresql
  migration_required_before_writes: true
  schema_owner: ledger
  product_repo_direct_access_allowed: false
tables:
  ledger_entries:
    append_only: true
    update_allowed: false
    delete_allowed: false
    required_columns:
      - ledger_entry_id
      - ledger_transaction_id
      - ledger_account_id
      - tenant_id
      - currency
      - amount_minor
      - debit_or_credit
      - entry_type
      - occurred_at
      - command_id
      - command_type
      - idempotency_key
      - payload_hash
      - causation_ref
      - reason
      - created_at
    amount:
      integer_minor_units_required: true
      floating_point_allowed: false
double_entry:
  required: true
  balance_group_key: ledger_transaction_id
  debit_credit_sum_must_balance: true
  imbalance_policy: reject_transaction
idempotency:
  unique_scope:
    - tenant_id
    - command_type
    - idempotency_key
  payload_hash_required: true
  duplicate_same_payload: return_previous_result
  duplicate_different_payload: fail_conflict
corrections:
  method: reversal_entry
  update_delete_corrections_allowed: false
  reversal_required_fields:
    - reversal_of_ledger_entry_id
    - reason
    - command_id
    - idempotency_key
projections:
  source_of_truth: false
  rebuildable_from_ledger_entries: true
  direct_mutation_allowed: false
forbidden:
  - balance_projection_as_truth
  - direct_balance_update
  - ledger_entry_update
  - ledger_entry_delete
  - floating_point_amount
  - idempotency_scope_missing
  - product_repo_storage_access
  - raw_provider_payload_in_ledger_row
`,
    'contracts/payment-webhook.yaml': `
contract:
  version: 1
ingress:
  received_by: zdp-edge-workers
  processed_by: zdp-money-platform
  received_and_processed_are_separate: true
  product_repo_direct_processing_allowed: false
required_fields:
  - provider
  - provider_event_id
  - event_type
  - received_at
  - signature_verified
  - idempotency_key
  - request_id
  - trace_id
  - payload_hash
  - raw_payload_ref
signature:
  verification_required_before_processing: true
  secret_storage_owner: zdp-privacy-credential-vault
idempotency:
  duplicate_event_must_not_mutate_ledger_twice: true
handoff:
  queue_required_before_processing: true
  dead_letter_required: true
forbidden:
  - logging_raw_payment_payload
  - logging_authorization_header
  - logging_cookie
  - product_repo_webhook_handler
  - direct_balance_change_before_idempotency_check
`,
    'contracts/entitlement-credit.yaml': `
contract:
  version: 1
ownership:
  entitlement_contract_owner: billing
  credit_balance_truth_owner: ledger
  final_authorization_owner: zdp-core-platform
entitlement_grant:
  required_fields:
    - entitlement_grant_id
    - tenant_id
    - subject_id
    - product_scope
    - source_ledger_entry_id
    - starts_at
    - expires_at
    - revocation_policy
    - audit_event_id
credit_spend:
  product_repo_may_mutate_balance: false
  hold_capture_release_required_for_uncertain_cost: true
refund_coupling:
  refund_must_consider_used_credits: true
  remaining_credit_restoration_requires_ledger_entry: true
forbidden:
  - entitlement_without_money_or_manual_adjustment_ref
  - credit_balance_direct_set
  - product_repo_credit_decrement
  - billing_owns_credit_balance_truth
  - analytics_event_as_money_truth
`
  };
}

function createValidMoneyCheckerFiles(): Record<string, string> {
  return {
    'package.json': `
{
  "scripts": {
    "check": "tsc --noEmit && bun test && bun run contracts:check",
    "test": "bun test",
    "contracts:check": "bun scripts/check-money-contracts.ts"
  }
}
`,
    'bun.lock': `
{
  "lockfileVersion": 1
}
`,
    'tsconfig.json': `
{
  "compilerOptions": {
    "strict": true
  }
}
`,
    'scripts/check-money-contracts.ts': `
import { runMoneyContractCheckCli } from '../src/money-contracts/cli';
const exitCode = await runMoneyContractCheckCli(process.cwd(), process.argv.slice(2));
process.exitCode = exitCode;
`,
    'src/money-contracts/cli.ts': `
export async function runMoneyContractCheckCli(): Promise<number> {
  return 0;
}
`,
    'src/money-contracts/parser.ts': `
export async function readYamlFile(): Promise<unknown> {
  return Bun.YAML.parse('{}');
}
`,
    'src/money-contracts/types.ts': `
export interface ContractDiagnostic {
  readonly file: string;
  readonly path: string;
  readonly message: string;
}
`,
    'src/money-contracts/validator.ts': `
const MONEY_BOUNDARIES_FILE = 'contracts/money-boundaries.yaml';
const MONEY_COMMAND_ENVELOPE_FILE = 'contracts/money-command-envelope.yaml';
const LEDGER_ENTRY_FILE = 'contracts/ledger-entry.yaml';
const LEDGER_STORAGE_FILE = 'contracts/ledger-storage.yaml';
const PAYMENT_WEBHOOK_FILE = 'contracts/payment-webhook.yaml';
const ENTITLEMENT_CREDIT_FILE = 'contracts/entitlement-credit.yaml';
const SERVICE_FILE = 'service.yaml';
const MONEY_FORBIDDEN = [];
const LEDGER_STORAGE_FORBIDDEN = [];
const QUEUE_ENVELOPE_REQUIRED_FIELDS = [];
const REQUIRED_RULE = 'ZDP-MONEY-PLATFORM-001';
export async function checkMoneyContracts(): Promise<void> {
  void MONEY_BOUNDARIES_FILE;
  void MONEY_COMMAND_ENVELOPE_FILE;
  void LEDGER_ENTRY_FILE;
  void LEDGER_STORAGE_FILE;
  void PAYMENT_WEBHOOK_FILE;
  void ENTITLEMENT_CREDIT_FILE;
  void SERVICE_FILE;
  void MONEY_FORBIDDEN;
  void LEDGER_STORAGE_FORBIDDEN;
  void QUEUE_ENVELOPE_REQUIRED_FIELDS;
  void REQUIRED_RULE;
}
`,
    'tests/money-contracts.test.ts': `
const cases = [
  'fails when command idempotency or sensitive payload rules drift',
  'fails when ledger append-only rules drift',
  'fails when ledger storage treats projections as truth',
  'fails when webhook processing can bypass edge, signature, or queue rules',
  'fails when entitlement and credit truth boundaries drift',
  'fails when service.yaml stops declaring the money risk boundary'
];
export { cases };
`
  };
}
