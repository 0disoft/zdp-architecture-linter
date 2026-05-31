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
        file: 'Cargo.toml',
        path: 'repository.root',
        message: 'Money platform repository must include `Cargo.toml`.'
      });
      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-MONEY-PLATFORM-001',
        severity: 'error',
        file: 'src/lib.rs',
        path: 'repository.root',
        message: 'Money platform repository must include `src/lib.rs`.'
      });
      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-MONEY-PLATFORM-001',
        severity: 'error',
        file: 'src/ledger/mod.rs',
        path: 'repository.root',
        message: 'Money platform repository must include `src/ledger/mod.rs`.'
      });
      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-MONEY-PLATFORM-001',
        severity: 'error',
        file: 'src/commands/ledger.rs',
        path: 'repository.root',
        message: 'Money platform repository must include `src/commands/ledger.rs`.'
      });
      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-MONEY-PLATFORM-001',
        severity: 'error',
        file: 'src/commands/payment_webhook.rs',
        path: 'repository.root',
        message:
          'Money platform repository must include `src/commands/payment_webhook.rs`.'
      });
      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-MONEY-PLATFORM-001',
        severity: 'error',
        file: 'src/commands/payment_webhook_processing.rs',
        path: 'repository.root',
        message:
          'Money platform repository must include `src/commands/payment_webhook_processing.rs`.'
      });
      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-MONEY-PLATFORM-001',
        severity: 'error',
        file: 'src/storage/mod.rs',
        path: 'repository.root',
        message: 'Money platform repository must include `src/storage/mod.rs`.'
      });
      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-MONEY-PLATFORM-001',
        severity: 'error',
        file: 'src/storage/payment_webhook_processing.rs',
        path: 'repository.root',
        message:
          'Money platform repository must include `src/storage/payment_webhook_processing.rs`.'
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
          path: 'scripts.rust:fmt',
          message: 'Money platform package must declare `rust:fmt` script.'
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

  test('fails when money runtime skeleton files and source drift', async () => {
    await withRepositoryRoot(
      {
        ...createValidMoneyFiles(),
        'Cargo.toml': `
[package]
name = "wrong-money"
edition = "2024"
`,
        'src/lib.rs': `
pub const SERVICE_ID: &str = "money-api";
pub fn app() {}
`,
        'src/boundaries/mod.rs': `
pub mod billing;
pub mod ledger;
`,
        'src/boundaries/ledger.rs': `
use super::MoneyBoundaryMarker;
pub const MARKER: MoneyBoundaryMarker = MoneyBoundaryMarker {
    id: "ledger",
    db_schema: "money_ledger",
    audit_required: true,
    owns_credit_balance_truth: false,
};
`,
        'src/commands/mod.rs': `
pub struct MoneyCommandEnvelope {
    pub command_id: String,
}
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
          file: 'Cargo.toml',
          path: 'source',
          message:
            'Money platform runtime source must include `name = "zdp-money-platform"`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-MONEY-PLATFORM-001',
          severity: 'error',
          file: 'src/lib.rs',
          path: 'source',
          message:
            'Money platform runtime source must include `.route("/healthz", get(healthz))`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-MONEY-PLATFORM-001',
          severity: 'error',
          file: 'src/boundaries/mod.rs',
          path: 'source',
          message:
            'Money platform runtime source must include `pub mod payments;`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-MONEY-PLATFORM-001',
          severity: 'error',
          file: 'src/boundaries/ledger.rs',
          path: 'source',
          message:
            'Money platform runtime source must include `owns_credit_balance_truth: true`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-MONEY-PLATFORM-001',
          severity: 'error',
          file: 'src/commands/mod.rs',
          path: 'source',
          message:
            'Money platform runtime source must include `pub tenant_id: String`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-MONEY-PLATFORM-001',
          severity: 'error',
          file: 'src/commands/mod.rs',
          path: 'source',
          message:
            'Money platform runtime source must include `pub mod ledger;`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-MONEY-PLATFORM-001',
          severity: 'error',
          file: 'src/lib.rs',
          path: 'source',
          message:
            'Money platform runtime source must include `pub mod storage;`.'
        });
      }
    );
  });

  test('fails when money ledger core rules drift', async () => {
    await withRepositoryRoot(
      {
        ...createValidMoneyFiles(),
        'src/lib.rs': `
use axum::{Json, Router, routing::get};

pub mod boundaries;
pub mod commands;

pub const SERVICE_ID: &str = "money-api";
pub const BIND_ADDR_ENV: &str = "ZDP_MONEY_BIND_ADDR";

pub fn app() -> Router {
    Router::new()
        .route("/healthz", get(healthz))
        .route("/readyz", get(readyz))
}

async fn healthz() -> Json<&'static str> {
    Json(SERVICE_ID)
}

async fn readyz() -> Json<&'static [&'static str]> {
    Json(&["contracts"])
}

fn money_boundaries_keep_ledger_as_credit_balance_truth_owner() {}
fn command_envelope_requires_idempotency_audit_and_trace_fields() {}
`,
        'src/ledger/mod.rs': `
pub struct MoneyAmount;
pub struct LedgerEntry;

pub fn append_ledger_transaction() {}
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
          file: 'src/lib.rs',
          path: 'source',
          message:
            'Money platform runtime source must include `pub mod ledger;`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-MONEY-PLATFORM-001',
          severity: 'error',
          file: 'src/ledger/mod.rs',
          path: 'source',
          message:
            'Money platform runtime source must include `pub fn decide_idempotency`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-MONEY-PLATFORM-001',
          severity: 'error',
          file: 'src/ledger/mod.rs',
          path: 'source',
          message:
            'Money platform runtime source must include `LedgerError::ImbalancedTransaction`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-MONEY-PLATFORM-001',
          severity: 'error',
          file: 'src/ledger/mod.rs',
          path: 'source',
          message:
            'Money platform runtime source must include `DerivedFromLedgerEntries`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-MONEY-PLATFORM-001',
          severity: 'error',
          file: 'src/ledger/mod.rs',
          path: 'source',
          message:
            'Money platform runtime source must include `rejects_sensitive_values_before_they_enter_ledger_rows`.'
        });
      }
    );
  });

  test('fails when money command ledger admission rules drift', async () => {
    await withRepositoryRoot(
      {
        ...createValidMoneyFiles(),
        'src/commands/mod.rs': `
pub enum MoneyCommandType {
    LedgerAppendEntry,
}
`,
        'src/commands/ledger.rs': `
pub enum LedgerAppendAdmission {
    Accepted,
}

pub enum LedgerCommandAdmissionError {
    DraftMismatch,
}

pub fn admit_ledger_append_command() {}
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
          file: 'src/commands/mod.rs',
          path: 'source',
          message:
            'Money platform runtime source must include `pub mod ledger;`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-MONEY-PLATFORM-001',
          severity: 'error',
          file: 'src/commands/mod.rs',
          path: 'source',
          message:
            'Money platform runtime source must include `pub mod payment_webhook;`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-MONEY-PLATFORM-001',
          severity: 'error',
          file: 'src/commands/ledger.rs',
          path: 'source',
          message:
            'Money platform runtime source must include `IdempotencyDecision::Conflict`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-MONEY-PLATFORM-001',
          severity: 'error',
          file: 'src/commands/ledger.rs',
          path: 'source',
          message:
            'Money platform runtime source must include `validate_draft_matches_envelope`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-MONEY-PLATFORM-001',
          severity: 'error',
          file: 'src/commands/ledger.rs',
          path: 'source',
          message:
            'Money platform runtime source must include `const FORBIDDEN_PAYLOAD_REF_FRAGMENTS`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-MONEY-PLATFORM-001',
          severity: 'error',
          file: 'src/commands/ledger.rs',
          path: 'source',
          message:
            'Money platform runtime source must include `rejects_forbidden_payload_reference_values_before_ledger_append`.'
        });
      }
    );
  });

  test('fails when money payment webhook processing state rules drift', async () => {
    await withRepositoryRoot(
      {
        ...createValidMoneyFiles(),
        'src/commands/mod.rs': `
pub mod ledger;
pub mod payment_webhook;
pub mod payment_webhook_processing;

pub enum MoneyCommandType {
    PaymentsRecordProviderWebhook,
    LedgerAppendEntry,
    LedgerCreateCreditHold,
    LedgerCaptureCreditHold,
    LedgerReleaseCreditHold,
}

pub struct PayloadRef;

pub struct MoneyCommandEnvelope {
    pub command_id: String,
    pub command_type: MoneyCommandType,
    pub schema_version: u16,
    pub actor_id: String,
    pub tenant_id: String,
    pub request_id: String,
    pub trace_id: String,
    pub idempotency_key: String,
    pub reason: String,
    pub issued_at: String,
    pub source: String,
    pub payload_ref: PayloadRef,
}

const RAW_PAYMENT_PAYLOAD_SENTINEL: &str = "raw_payment_payload";
`,
        'src/commands/payment_webhook_processing.rs': `
pub enum PaymentWebhookProcessingState {
    Queued,
    Processing,
}

pub fn admit_payment_webhook_processing() {}
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
          file: 'src/commands/payment_webhook_processing.rs',
          path: 'source',
          message:
            'Money platform runtime source must include `PROCESSING_DEAD_LETTERED_OUTBOX_TYPE`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-MONEY-PLATFORM-001',
          severity: 'error',
          file: 'src/commands/payment_webhook_processing.rs',
          path: 'source',
          message:
            'Money platform runtime source must include `PaymentWebhookProcessingAdmission::Duplicate`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-MONEY-PLATFORM-001',
          severity: 'error',
          file: 'src/commands/payment_webhook_processing.rs',
          path: 'source',
          message:
            'Money platform runtime source must include `PaymentWebhookProcessingState::DeadLettered`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-MONEY-PLATFORM-001',
          severity: 'error',
          file: 'src/commands/payment_webhook_processing.rs',
          path: 'source',
          message:
            'Money platform runtime source must include `duplicate_provider_event_with_different_payload_hash_conflicts`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-MONEY-PLATFORM-001',
          severity: 'error',
          file: 'src/commands/payment_webhook_processing.rs',
          path: 'source',
          message:
            'Money platform runtime source must include `retryable_failure_writes_retry_outbox_and_can_restart`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-MONEY-PLATFORM-001',
          severity: 'error',
          file: 'src/commands/payment_webhook_processing.rs',
          path: 'source',
          message:
            'Money platform runtime source must include `exhausted_or_terminal_work_cannot_continue_silently`.'
        });
      }
    );
  });

  test('fails when money payment webhook processing storage port rules drift', async () => {
    await withRepositoryRoot(
      {
        ...createValidMoneyFiles(),
        'src/storage/payment_webhook_processing.rs': `
pub enum PaymentWebhookProcessingPersistenceMode {
    InsertNew,
}

pub fn plan_payment_webhook_processing_persistence() {}
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
          file: 'src/storage/payment_webhook_processing.rs',
          path: 'source',
          message:
            'Money platform runtime source must include `CompareAndSwap { expected_version: u64 }`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-MONEY-PLATFORM-001',
          severity: 'error',
          file: 'src/storage/payment_webhook_processing.rs',
          path: 'source',
          message:
            'Money platform runtime source must include `pub struct PaymentWebhookProcessingPersistenceBatch`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-MONEY-PLATFORM-001',
          severity: 'error',
          file: 'src/storage/payment_webhook_processing.rs',
          path: 'source',
          message:
            'Money platform runtime source must include `validate_history_matches_record`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-MONEY-PLATFORM-001',
          severity: 'error',
          file: 'src/storage/payment_webhook_processing.rs',
          path: 'source',
          message:
            'Money platform runtime source must include `PaymentWebhookProcessingPersistenceMode::CompareAndSwap`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-MONEY-PLATFORM-001',
          severity: 'error',
          file: 'src/storage/payment_webhook_processing.rs',
          path: 'source',
          message:
            'Money platform runtime source must include `rejects_stale_or_cross_record_processing_transition_before_storage`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-MONEY-PLATFORM-001',
          severity: 'error',
          file: 'src/storage/payment_webhook_processing.rs',
          path: 'source',
          message:
            'Money platform runtime source must include `rejects_forbidden_payment_values_before_storage_port`.'
        });
      }
    );
  });

  test('fails when money payment webhook handoff rules drift', async () => {
    await withRepositoryRoot(
      {
        ...createValidMoneyFiles(),
        'src/commands/mod.rs': `
pub mod ledger;

pub enum MoneyCommandType {
    PaymentsRecordProviderWebhook,
    LedgerAppendEntry,
    LedgerCreateCreditHold,
    LedgerCaptureCreditHold,
    LedgerReleaseCreditHold,
}

pub struct PayloadRef;

pub struct MoneyCommandEnvelope {
    pub command_id: String,
    pub command_type: MoneyCommandType,
    pub schema_version: u16,
    pub actor_id: String,
    pub tenant_id: String,
    pub request_id: String,
    pub trace_id: String,
    pub idempotency_key: String,
    pub reason: String,
    pub issued_at: String,
    pub source: String,
    pub payload_ref: PayloadRef,
}

const RAW_PAYMENT_PAYLOAD_SENTINEL: &str = "raw_payment_payload";
`,
        'src/commands/payment_webhook.rs': `
pub struct PaymentWebhookHandoffInput;

pub enum PaymentWebhookHandoffError {
    SignatureNotVerified,
}

pub fn build_payment_webhook_command_handoff() {}
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
          file: 'src/commands/mod.rs',
          path: 'source',
          message:
            'Money platform runtime source must include `pub mod payment_webhook;`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-MONEY-PLATFORM-001',
          severity: 'error',
          file: 'src/commands/payment_webhook.rs',
          path: 'source',
          message:
            'Money platform runtime source must include `MoneyCommandType::PaymentsRecordProviderWebhook`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-MONEY-PLATFORM-001',
          severity: 'error',
          file: 'src/commands/payment_webhook.rs',
          path: 'source',
          message:
            'Money platform runtime source must include `IdempotencyKeyMustUseProviderEventId`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-MONEY-PLATFORM-001',
          severity: 'error',
          file: 'src/commands/payment_webhook.rs',
          path: 'source',
          message:
            'Money platform runtime source must include `QueueFieldMismatch`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-MONEY-PLATFORM-001',
          severity: 'error',
          file: 'src/commands/payment_webhook.rs',
          path: 'source',
          message:
            'Money platform runtime source must include `rejects_raw_payment_payload_references_before_command_handoff`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-MONEY-PLATFORM-001',
          severity: 'error',
          file: 'src/commands/payment_webhook.rs',
          path: 'source',
          message:
            'Money platform runtime source must include `webhook_handoff_does_not_create_ledger_append_command`.'
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
    "check": "tsc --noEmit && bun test && bun run contracts:check && cargo fmt --check && cargo check && cargo test",
    "test": "bun test",
    "contracts:check": "bun scripts/check-money-contracts.ts",
    "rust:fmt": "cargo fmt --check",
    "rust:check": "cargo check",
    "rust:test": "cargo test"
  }
}
`,
    'Cargo.toml': `
[package]
name = "zdp-money-platform"
version = "0.2.0"
edition = "2024"
publish = false

[dependencies]
axum = "0.8"
tokio = { version = "1", features = ["macros", "net", "rt-multi-thread", "signal"] }
`,
    'Cargo.lock': `
# This file is automatically @generated by Cargo.
version = 4
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
`,
    'src/lib.rs': `
use axum::{Json, Router, routing::get};

pub mod boundaries;
pub mod commands;
pub mod ledger;
pub mod storage;

pub const SERVICE_ID: &str = "money-api";
pub const BIND_ADDR_ENV: &str = "ZDP_MONEY_BIND_ADDR";

pub fn app() -> Router {
    Router::new()
        .route("/healthz", get(healthz))
        .route("/readyz", get(readyz))
}

pub async fn serve(addr: std::net::SocketAddr) -> std::io::Result<()> {
    void_addr(addr).await
}

async fn void_addr(_addr: std::net::SocketAddr) -> std::io::Result<()> {
    Ok(())
}

async fn healthz() -> Json<&'static str> {
    let _ = SERVICE_ID;
    Json("ok")
}

async fn readyz() -> Json<&'static [&'static str]> {
    // checks: &["contracts"]
    let checks = &["contracts"];
    Json(checks)
}

fn money_boundaries_keep_ledger_as_credit_balance_truth_owner() {
    assert_eq!(boundaries::credit_balance_truth_owner(), boundaries::ledger::MARKER);
    let _ = service: SERVICE_ID;
}

fn command_envelope_requires_idempotency_audit_and_trace_fields() {}
`,
    'src/main.rs': `
use zdp_money_platform::{bind_addr_from_env, serve};

#[tokio::main]
async fn main() -> std::io::Result<()> {
    let addr = bind_addr_from_env().expect("bind addr");
    serve(addr).await
}
`,
    'src/boundaries/mod.rs': `
pub mod billing;
pub mod payments;
pub mod ledger;
pub mod risk;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MoneyBoundaryMarker {
    pub id: &'static str,
    pub owns_credit_balance_truth: bool,
}

pub const ALL: &[MoneyBoundaryMarker] = &[
    billing::MARKER,
    payments::MARKER,
    ledger::MARKER,
    risk::MARKER,
];

pub fn credit_balance_truth_owner() -> MoneyBoundaryMarker {
    ledger::MARKER
}
`,
    'src/boundaries/billing.rs': `
use super::MoneyBoundaryMarker;

pub const MARKER: MoneyBoundaryMarker = MoneyBoundaryMarker {
    id: "billing",
    db_schema: "money_billing",
    audit_required: true,
    owns_credit_balance_truth: false,
};
`,
    'src/boundaries/payments.rs': `
use super::MoneyBoundaryMarker;

pub const MARKER: MoneyBoundaryMarker = MoneyBoundaryMarker {
    id: "payments",
    db_schema: "money_payments",
    audit_required: true,
    owns_credit_balance_truth: false,
};
`,
    'src/boundaries/ledger.rs': `
use super::MoneyBoundaryMarker;

pub const MARKER: MoneyBoundaryMarker = MoneyBoundaryMarker {
    id: "ledger",
    db_schema: "money_ledger",
    audit_required: true,
    owns_credit_balance_truth: true,
};
`,
    'src/boundaries/risk.rs': `
use super::MoneyBoundaryMarker;

pub const MARKER: MoneyBoundaryMarker = MoneyBoundaryMarker {
    id: "risk",
    db_schema: "money_risk",
    audit_required: true,
    owns_credit_balance_truth: false,
};
`,
    'src/commands/mod.rs': `
pub mod ledger;
pub mod payment_webhook;
pub mod payment_webhook_processing;

pub enum MoneyCommandType {
    PaymentsRecordProviderWebhook,
    LedgerAppendEntry,
    LedgerCreateCreditHold,
    LedgerCaptureCreditHold,
    LedgerReleaseCreditHold,
}

pub struct PayloadRef;

pub struct MoneyCommandEnvelope {
    pub command_id: String,
    pub command_type: MoneyCommandType,
    pub schema_version: u16,
    pub actor_id: String,
    pub tenant_id: String,
    pub request_id: String,
    pub trace_id: String,
    pub idempotency_key: String,
    pub reason: String,
    pub issued_at: String,
    pub source: String,
    pub payload_ref: PayloadRef,
}

const RAW_PAYMENT_PAYLOAD_SENTINEL: &str = "raw_payment_payload";
`,
    'src/commands/ledger.rs': `
const FORBIDDEN_PAYLOAD_REF_FRAGMENTS: &[&str] = &[
    "authorization",
    "raw_payment",
    "secret",
    "token",
];

pub enum LedgerAppendAdmission {
    Accepted {},
    Duplicate { ledger_transaction_id: String },
}

pub enum LedgerCommandAdmissionError {
    DraftMismatch,
    ForbiddenPayloadRefValue,
    IdempotencyConflict,
    UnsupportedCommandType(MoneyCommandType),
    UnsupportedSchemaVersion(u16),
}

pub fn admit_ledger_append_command() {
    validate_ledger_append_envelope();
    validate_payload_ref();
    validate_draft_matches_envelope();
    append_ledger_transaction();
    let _ = IdempotencyDecision::AcceptNew;
    let _ = IdempotencyDecision::ReturnPrevious {};
    let _ = IdempotencyDecision::Conflict;
}

pub fn idempotency_scope_for() {}
fn validate_ledger_append_envelope() {}
fn validate_payload_ref() {}
fn validate_draft_matches_envelope() {}

enum MoneyCommandType {
    LedgerAppendEntry,
}

enum IdempotencyDecision {
    AcceptNew,
    ReturnPrevious {},
    Conflict,
}

fn append_ledger_transaction() {}
fn admits_matching_ledger_append_command_and_transaction_draft() {}
fn returns_previous_result_for_duplicate_same_payload_without_appending() {}
fn rejects_duplicate_idempotency_key_with_different_payload_hash() {}
fn rejects_unsupported_command_type_before_ledger_append() {}
fn rejects_draft_metadata_that_does_not_match_command_envelope() {}
fn rejects_forbidden_payload_reference_values_before_ledger_append() {}
`,
    'src/commands/payment_webhook.rs': `
const WEBHOOK_QUEUE_JOB_TYPE: &str = "money.payment_webhook.process";
const WEBHOOK_COMMAND_SOURCE: &str = "payment-webhook-queue";
const FORBIDDEN_WEBHOOK_REF_FRAGMENTS: &[&str] = &[
    "authorization",
    "raw_payment",
    "secret",
    "token",
];

pub struct PaymentWebhookHandoffInput;
pub struct PaymentWebhookCommandContext;
pub struct WebhookQueueEnvelope;
pub struct PaymentWebhookCommandHandoff;

pub enum PaymentWebhookHandoffError {
    ForbiddenPayloadRefValue,
    IdempotencyKeyMustUseProviderEventId,
    QueueFieldMismatch,
    SignatureNotVerified,
    UnsupportedQueueJobType,
    UnsupportedSchemaVersion,
}

pub fn build_payment_webhook_command_handoff() {
    validate_webhook_input();
    validate_command_context();
    validate_queue_envelope();
    let _ = MoneyCommandType::PaymentsRecordProviderWebhook;
    let _ = MoneyCommandType::LedgerAppendEntry;
}

enum MoneyCommandType {
    PaymentsRecordProviderWebhook,
    LedgerAppendEntry,
}

fn validate_webhook_input() {}
fn validate_command_context() {}
fn validate_queue_envelope() {}
fn builds_payment_webhook_command_after_signature_and_queue_handoff() {}
fn rejects_unverified_webhook_before_money_command_creation() {}
fn requires_provider_event_id_as_webhook_idempotency_key() {}
fn rejects_queue_handoff_that_does_not_match_webhook_trace_context() {}
fn rejects_raw_payment_payload_references_before_command_handoff() {}
fn webhook_handoff_does_not_create_ledger_append_command() {}
`,
    'src/commands/payment_webhook_processing.rs': `
pub const PROCESSING_REQUESTED_OUTBOX_TYPE: &str = "money.payment_webhook.processing_requested";
pub const PROCESSING_SUCCEEDED_OUTBOX_TYPE: &str = "money.payment_webhook.processing_succeeded";
pub const PROCESSING_RETRY_SCHEDULED_OUTBOX_TYPE: &str =
    "money.payment_webhook.retry_scheduled";
pub const PROCESSING_DEAD_LETTERED_OUTBOX_TYPE: &str = "money.payment_webhook.dead_lettered";

pub enum PaymentWebhookProcessingState {
    Queued,
    Processing,
    RetryScheduled,
    Succeeded,
    DeadLettered,
}

pub struct PaymentWebhookProcessingRecord;
pub struct PaymentWebhookProcessingHistory;

pub enum PaymentWebhookProcessingEvent {
    WorkerStarted,
    CommandSucceeded,
    RetryScheduled,
    DeadLettered,
}

pub struct PaymentWebhookOutboxRecord;

pub enum PaymentWebhookProcessingAdmission {
    Duplicate,
}

pub enum PaymentWebhookProcessingError {
    InvalidTransition,
    IdempotencyConflict,
    RetryBudgetExhausted,
    TerminalState,
    UnsupportedCommandType(MoneyCommandType),
}

pub fn admit_payment_webhook_processing() {
    let _ = PaymentWebhookProcessingAdmission::Duplicate;
    classify_duplicate();
    build_history();
    build_outbox();
}

pub fn transition_payment_webhook_processing() {
    let _ = PaymentWebhookProcessingEvent::WorkerStarted;
    let _ = PaymentWebhookProcessingEvent::CommandSucceeded;
    let _ = PaymentWebhookProcessingEvent::RetryScheduled;
    let _ = PaymentWebhookProcessingEvent::DeadLettered;
    let _ = PaymentWebhookProcessingState::Queued;
    let _ = PaymentWebhookProcessingState::Processing;
    let _ = PaymentWebhookProcessingState::RetryScheduled;
    let _ = PaymentWebhookProcessingState::Succeeded;
    let _ = PaymentWebhookProcessingState::DeadLettered;
}

enum MoneyCommandType {
    PaymentsRecordProviderWebhook,
}

fn classify_duplicate() {}
fn build_history() {}
fn build_outbox() {}
fn accepts_verified_webhook_command_into_queued_processing_record_and_outbox() {}
fn duplicate_provider_event_with_same_payload_returns_existing_record() {}
fn duplicate_provider_event_with_different_payload_hash_conflicts() {}
fn processing_lifecycle_records_worker_attempt_success_history_and_outbox() {}
fn retry_schedule_requires_processing_state_and_retry_time() {}
fn retryable_failure_writes_retry_outbox_and_can_restart() {}
fn exhausted_or_terminal_work_cannot_continue_silently() {}
`,
    'src/storage/mod.rs': `
pub mod payment_webhook_processing;
`,
    'src/storage/payment_webhook_processing.rs': `
const FORBIDDEN_STORAGE_VALUE_FRAGMENTS: &[&str] = &[
    "authorization",
    "raw_payment",
    "secret",
    "token",
];

pub struct PaymentWebhookProcessingLookupKey;

pub enum PaymentWebhookProcessingPersistenceMode {
    InsertNew,
    CompareAndSwap { expected_version: u64 },
}

pub struct PaymentWebhookProcessingPersistenceBatch;

pub enum PaymentWebhookProcessingStorageError {
    ForbiddenStorageValue,
    HistoryMismatch,
    OutboxMismatch,
    RecordMismatch,
    StaleTransitionVersion,
}

pub fn plan_payment_webhook_processing_persistence() {
    validate_record_safe_for_storage();
    validate_history_matches_record();
    validate_outbox_matches_record();
    require_initial_insert_shape();
    validate_record_continuity();
    require_record_match();
    require_history_match();
    require_outbox_match();
    reject_forbidden_storage_value();
    let _ = PaymentWebhookProcessingPersistenceMode::InsertNew;
    let _ = PaymentWebhookProcessingPersistenceMode::CompareAndSwap { expected_version: 1 };
}

fn validate_record_safe_for_storage() {}
fn validate_history_matches_record() {}
fn validate_outbox_matches_record() {}
fn require_initial_insert_shape() {}
fn validate_record_continuity() {}
fn require_record_match() {}
fn require_history_match() {}
fn require_outbox_match() {}
fn reject_forbidden_storage_value() {}

fn plans_insert_for_new_queued_processing_record_with_provider_event_lookup() {}
fn plans_compare_and_swap_update_for_worker_transition_history_and_outbox() {}
fn rejects_stale_or_cross_record_processing_transition_before_storage() {}
fn rejects_history_or_outbox_that_does_not_match_processing_record() {}
fn rejects_forbidden_payment_values_before_storage_port() {}
`,
    'src/ledger/mod.rs': `
const FORBIDDEN_LEDGER_VALUE_FRAGMENTS: &[&str] = &[
    "authorization",
    "raw_payment",
    "secret",
    "token",
];

pub struct MoneyAmount;
pub enum DebitCredit {
    Debit,
    Credit,
}
pub struct LedgerTransactionDraft;
pub struct LedgerEntry {
    pub reversal_of_ledger_entry_id: Option<String>,
}
pub enum IdempotencyDecision {
    ReturnPrevious,
    Conflict,
}
pub enum ProjectionSource {
    DerivedFromLedgerEntries,
}
pub enum LedgerError {
    ImbalancedTransaction,
    MixedCurrencyTransaction,
}

pub fn append_ledger_transaction() {}
pub fn reject_ledger_error() -> LedgerError {
    LedgerError::ImbalancedTransaction
}
pub fn reject_mixed_currency_error() -> LedgerError {
    LedgerError::MixedCurrencyTransaction
}
pub fn decide_idempotency() -> IdempotencyDecision {
    IdempotencyDecision::ReturnPrevious
}
pub fn reject_idempotency_conflict() -> IdempotencyDecision {
    IdempotencyDecision::Conflict
}
pub fn reverse_transaction() {}
pub fn derive_account_projection() {}
fn reject_forbidden_value() {}

fn accepts_balanced_append_only_double_entry_transaction() {}
fn rejects_imbalanced_or_mixed_currency_transactions() {}
fn keeps_idempotency_scoped_to_tenant_command_and_key() {}
fn creates_refund_or_correction_as_reversal_entries_not_mutation() {}
fn derives_projection_from_entries_without_becoming_truth() {}
fn rejects_sensitive_values_before_they_enter_ledger_rows() {}
`
  };
}
