import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { validateRepositoryTokenContracts } from '../src/token-contract-rules.ts';

describe('token contract rules', () => {
  test('passes when token protocol declares authority and custody controls', async () => {
    await withRepositoryRoot(createValidTokenProtocolFiles(), async (repositoryRoot) => {
      const diagnostics = await validateRepositoryTokenContracts({
        repositoryRoot,
        repositoryServiceContract: createTokenProtocolServiceContract()
      });

      expect(diagnostics).toEqual([]);
    });
  });

  test('skips repositories that are not zdp-token-protocol', async () => {
    await withRepositoryRoot({}, async (repositoryRoot) => {
      const diagnostics = await validateRepositoryTokenContracts({
        repositoryRoot,
        repositoryServiceContract: {
          service: {
            repo: 'zdp-token-lab'
          }
        }
      });

      expect(diagnostics).toEqual([]);
    });
  });

  test('fails when the token authority matrix contract is missing', async () => {
    await withRepositoryRoot(
      {
        ...createValidSuiApiSelectionFiles('zdp-token-protocol'),
        ...createValidPackageUpgradePolicyFiles(),
        ...createValidTokenIdentityFiles()
      },
      async (repositoryRoot) => {
      const diagnostics = await validateRepositoryTokenContracts({
        repositoryRoot,
        repositoryServiceContract: createTokenProtocolServiceContract()
      });

      expect(diagnostics).toEqual([
        {
          ruleId: 'ZDP-TOKEN-001',
          severity: 'error',
          file: 'contracts/token-authority-matrix.yaml',
          path: 'repository.root',
          message:
            'Token protocol repository must include `contracts/token-authority-matrix.yaml`.'
        }
      ]);
      }
    );
  });

  test('fails when token authority controls collapse into a hot wallet AdminCap', async () => {
    await withRepositoryRoot(
      {
        ...createValidSuiApiSelectionFiles('zdp-token-protocol'),
        ...createValidPackageUpgradePolicyFiles(),
        ...createValidTokenIdentityFiles(),
        'contracts/token-authority-matrix.yaml': `
contract:
  owner: zdp-token-protocol
  status: mainnet_ready
authority_matrix:
  required_capabilities:
    - TreasuryCap
    - UpgradeCap
  capability_required_fields:
    - owner_boundary
authority_separation:
  supply_upgrade_compliance_emergency_split: false
  single_admin_cap_allowed: true
  single_hot_wallet_allowed: true
  forbidden_holders:
    - zdp-money-platform
custody_boundary:
  default_model: managed_custody
  managed_custody_requires_gate: false
  forbidden_runtime_owners:
    - zdp-money-platform
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryTokenContracts({
          repositoryRoot,
          repositoryServiceContract: createTokenProtocolServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-TOKEN-001',
          severity: 'error',
          file: 'contracts/token-authority-matrix.yaml',
          path: 'contract.status',
          message:
            'Token authority matrix must stay lab-only and must not claim mainnet readiness.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-TOKEN-001',
          severity: 'error',
          file: 'contracts/token-authority-matrix.yaml',
          path: 'authority_matrix.required_capabilities',
          message:
            'Token authority matrix must include `DenyCapV2` in `authority_matrix.required_capabilities`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-TOKEN-001',
          severity: 'error',
          file: 'contracts/token-authority-matrix.yaml',
          path: 'authority_separation.supply_upgrade_compliance_emergency_split',
          message:
            'Token authority matrix must keep supply, upgrade, compliance, and emergency authorities split.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-TOKEN-001',
          severity: 'error',
          file: 'contracts/token-authority-matrix.yaml',
          path: 'authority_separation.single_admin_cap_allowed',
          message: 'Token authority matrix must forbid a single unlimited `AdminCap`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-TOKEN-001',
          severity: 'error',
          file: 'contracts/token-authority-matrix.yaml',
          path: 'authority_separation.single_hot_wallet_allowed',
          message:
            'Token authority matrix must forbid single hot wallet custody of privileged capabilities.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-TOKEN-001',
          severity: 'error',
          file: 'contracts/token-authority-matrix.yaml',
          path: 'custody_boundary.default_model',
          message:
            'Token custody boundary must keep self-custody as the default model.'
        });
      }
    );
  });

  test('passes when token indexer declares chain fact normalization controls', async () => {
    await withRepositoryRoot(createValidTokenIndexerFiles(), async (repositoryRoot) => {
      const diagnostics = await validateRepositoryTokenContracts({
        repositoryRoot,
        repositoryServiceContract: createTokenIndexerServiceContract()
      });

      expect(diagnostics).toEqual([]);
    });
  });

  test('fails when the token indexer chain fact contract is missing', async () => {
    await withRepositoryRoot(createValidSuiApiSelectionFiles('zdp-token-indexer'), async (repositoryRoot) => {
      const diagnostics = await validateRepositoryTokenContracts({
        repositoryRoot,
        repositoryServiceContract: createTokenIndexerServiceContract()
      });

      expect(diagnostics).toEqual([
        {
          ruleId: 'ZDP-TOKEN-002',
          severity: 'error',
          file: 'contracts/chain-fact-contract.yaml',
          path: 'repository.root',
          message:
            'Token indexer repository must include `contracts/chain-fact-contract.yaml`.'
        }
      ]);
    });
  });

  test('fails when token indexer can sign, own custody, or post ledger facts', async () => {
    await withRepositoryRoot(
      {
        ...createValidSuiApiSelectionFiles('zdp-token-indexer'),
        'contracts/chain-fact-contract.yaml': `
contract:
  owner: zdp-token-indexer
  status: product_rights_source
chain_fact:
  sources:
    - checkpoint
    - transaction_effects
  required_fields:
    - checkpoint_sequence
    - transaction_digest
    - source_kind
  observed_event: token.fact.observed
  quarantined_event: chain.fact.quarantined
  replay_required: false
  quarantine_required: false
indexer:
  allowed_responsibilities:
    - chain_fact_normalization
    - signing
    - custody
    - ledger_posting
money_consumption:
  required_gates:
    - idempotency_key
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryTokenContracts({
          repositoryRoot,
          repositoryServiceContract: createTokenIndexerServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-TOKEN-002',
          severity: 'error',
          file: 'contracts/chain-fact-contract.yaml',
          path: 'contract.status',
          message:
            'Token chain fact contract must stay lab-only until product rights or balance projections are approved.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-TOKEN-002',
          severity: 'error',
          file: 'contracts/chain-fact-contract.yaml',
          path: 'chain_fact.sources',
          message:
            'Token chain fact source contract must include `object_changes` in `chain_fact.sources`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-TOKEN-002',
          severity: 'error',
          file: 'contracts/chain-fact-contract.yaml',
          path: 'chain_fact.required_fields',
          message:
            'Token chain fact field contract must include `canonical_fact_id` in `chain_fact.required_fields`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-TOKEN-002',
          severity: 'error',
          file: 'contracts/chain-fact-contract.yaml',
          path: 'chain_fact.observed_event',
          message:
            'Token chain fact contract must keep `chain.fact.observed` as the canonical observed fact event.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-TOKEN-002',
          severity: 'error',
          file: 'contracts/chain-fact-contract.yaml',
          path: 'chain_fact.replay_required',
          message:
            'Token indexer chain facts must remain replayable from checkpoint/effects/object-change evidence.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-TOKEN-002',
          severity: 'error',
          file: 'contracts/chain-fact-contract.yaml',
          path: 'indexer.allowed_responsibilities',
          message:
            'Token indexer responsibility contract must not include `signing` in `indexer.allowed_responsibilities`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-TOKEN-002',
          severity: 'error',
          file: 'contracts/chain-fact-contract.yaml',
          path: 'money_consumption.required_gates',
          message:
            'Money chain fact consumption gate must include `approved_business_request` in `money_consumption.required_gates`.'
        });
      }
    );
  });

  test('fails when token protocol omits the Sui API selection contract', async () => {
    await withRepositoryRoot(
      {
        ...createValidTokenAuthorityMatrixFiles(),
        ...createValidPackageUpgradePolicyFiles(),
        ...createValidTokenIdentityFiles()
      },
      async (repositoryRoot) => {
      const diagnostics = await validateRepositoryTokenContracts({
        repositoryRoot,
        repositoryServiceContract: createTokenProtocolServiceContract()
      });

      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-TOKEN-003',
        severity: 'error',
        file: 'contracts/sui-api-selection.yaml',
        path: 'repository.root',
        message:
          'Token repository must include `contracts/sui-api-selection.yaml` before choosing a Sui API integration baseline.'
      });
      }
    );
  });

  test('fails when Sui API selection uses JSON-RPC as the new baseline', async () => {
    await withRepositoryRoot(
      {
        ...createValidTokenAuthorityMatrixFiles(),
        ...createValidPackageUpgradePolicyFiles(),
        ...createValidTokenIdentityFiles(),
        'contracts/sui-api-selection.yaml': `
contract:
  owner: zdp-token-protocol
sui_api:
  baseline: json_rpc
  json_rpc_role: default_transport
  latest_official_docs_review_required: false
  migration_guide_review_required: false
  archival_provider_policy_required: false
  endpoint_config_single_source: false
  evaluated_apis:
    - json_rpc_legacy
  required_selection_evidence:
    - baseline
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryTokenContracts({
          repositoryRoot,
          repositoryServiceContract: createTokenProtocolServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-TOKEN-003',
          severity: 'error',
          file: 'contracts/sui-api-selection.yaml',
          path: 'sui_api.baseline',
          message:
            'Sui API baseline must be one of: grpc, graphql, core_api, grpc_core_api.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-TOKEN-003',
          severity: 'error',
          file: 'contracts/sui-api-selection.yaml',
          path: 'sui_api.baseline',
          message:
            'Sui API selection must not use JSON-RPC as the baseline for new token integrations.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-TOKEN-003',
          severity: 'error',
          file: 'contracts/sui-api-selection.yaml',
          path: 'sui_api.latest_official_docs_review_required',
          message:
            'Sui API selection must require a latest official docs review before implementation.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-TOKEN-003',
          severity: 'error',
          file: 'contracts/sui-api-selection.yaml',
          path: 'sui_api.evaluated_apis',
          message:
            'Sui API evaluated API contract must include `grpc` in `sui_api.evaluated_apis`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-TOKEN-003',
          severity: 'error',
          file: 'contracts/sui-api-selection.yaml',
          path: 'sui_api.required_selection_evidence',
          message:
            'Sui API selection evidence contract must include `latest_official_docs_review_ref` in `sui_api.required_selection_evidence`.'
        });
      }
    );
  });

  test('fails when token protocol omits the package upgrade policy contract', async () => {
    await withRepositoryRoot(
      {
        ...createValidTokenAuthorityMatrixFiles(),
        ...createValidSuiApiSelectionFiles('zdp-token-protocol'),
        ...createValidTokenIdentityFiles()
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryTokenContracts({
          repositoryRoot,
          repositoryServiceContract: createTokenProtocolServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-TOKEN-005',
          severity: 'error',
          file: 'contracts/package-upgrade-policy.yaml',
          path: 'repository.root',
          message:
            'Token protocol repository must include `contracts/package-upgrade-policy.yaml` before upgradeable package work starts.'
        });
      }
    );
  });

  test('fails when token package upgrade policy collapses publish, migration, and activation', async () => {
    await withRepositoryRoot(
      {
        ...createValidTokenAuthorityMatrixFiles(),
        ...createValidSuiApiSelectionFiles('zdp-token-protocol'),
        ...createValidTokenIdentityFiles(),
        'contracts/package-upgrade-policy.yaml': `
contract:
  owner: zdp-token-protocol
  status: mainnet_ready
package_manifest:
  required_fields:
    - original_package_id
    - latest_package_id
version_guard:
  old_package_version_guard_required: false
migration_plan:
  required: false
  state_migration_required: false
event_separation:
  required_events:
    - PackageUpgraded
activation:
  operational_enable_separate_from_publish: false
approval_split:
  pause_unpause_approval_split: false
  package_upgrade_approval_split: false
rollback:
  rollback_forward_only: false
upgrade_policy:
  publish_implies_operational_enable: true
  chain_rollback_allowed: true
  single_admin_upgrade_allowed: true
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryTokenContracts({
          repositoryRoot,
          repositoryServiceContract: createTokenProtocolServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-TOKEN-005',
          severity: 'error',
          file: 'contracts/package-upgrade-policy.yaml',
          path: 'contract.status',
          message:
            'Token package upgrade policy must stay lab-only and must not claim mainnet readiness.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-TOKEN-005',
          severity: 'error',
          file: 'contracts/package-upgrade-policy.yaml',
          path: 'package_manifest.required_fields',
          message:
            'Token package upgrade manifest must include `build_output_digest` in `package_manifest.required_fields`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-TOKEN-005',
          severity: 'error',
          file: 'contracts/package-upgrade-policy.yaml',
          path: 'version_guard.old_package_version_guard_required',
          message:
            'Token package upgrade policy must require old package version guards before state-changing entry functions run.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-TOKEN-005',
          severity: 'error',
          file: 'contracts/package-upgrade-policy.yaml',
          path: 'event_separation.required_events',
          message:
            'Token package upgrade event separation must include `StateMigrated` in `event_separation.required_events`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-TOKEN-005',
          severity: 'error',
          file: 'contracts/package-upgrade-policy.yaml',
          path: 'upgrade_policy.publish_implies_operational_enable',
          message:
            'Token package publication must not automatically imply ZDP operational enablement.'
        });
      }
    );
  });

  test('fails when token protocol omits the Token Identity Contract', async () => {
    await withRepositoryRoot(
      {
        ...createValidTokenAuthorityMatrixFiles(),
        ...createValidSuiApiSelectionFiles('zdp-token-protocol'),
        ...createValidPackageUpgradePolicyFiles()
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryTokenContracts({
          repositoryRoot,
          repositoryServiceContract: createTokenProtocolServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-TOKEN-006',
          severity: 'error',
          file: 'contracts/token-identity.yaml',
          path: 'repository.root',
          message:
            'Token protocol repository must include `contracts/token-identity.yaml` before token implementation starts.'
        });
      }
    );
  });

  test('fails when Token Identity Contract merges credit, entitlement, settlement, or governance rights', async () => {
    await withRepositoryRoot(
      {
        ...createValidTokenAuthorityMatrixFiles(),
        ...createValidSuiApiSelectionFiles('zdp-token-protocol'),
        ...createValidPackageUpgradePolicyFiles(),
        'contracts/token-identity.yaml': `
contract:
  owner: zdp-token-protocol
  status: mainnet_ready
token_identity:
  default_candidate: ZDP_CREDIT
  required_policy_fields:
    - holder_claim
    - issuer_obligation
  merged_balances:
    - ZDP_ENTITLEMENT
    - ZDP_CREDIT
    - settlement_unit
    - governance_right
right_sources:
  ZDP_ENTITLEMENT: chain_state
  ZDP_CREDIT: chain_state
  ZDP_SETTLEMENT_UNIT: enabled
  ZDP_GOVERNANCE: enabled
rights_separation:
  entitlement_credit_same_balance_allowed: true
  money_ledger_replaced_by_chain_allowed: true
  membership_as_cash_allowed: true
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryTokenContracts({
          repositoryRoot,
          repositoryServiceContract: createTokenProtocolServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-TOKEN-006',
          severity: 'error',
          file: 'contracts/token-identity.yaml',
          path: 'contract.status',
          message:
            'Token Identity Contract must stay lab-only and must not claim mainnet readiness.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-TOKEN-006',
          severity: 'error',
          file: 'contracts/token-identity.yaml',
          path: 'token_identity.default_candidate',
          message:
            'Token Identity Contract must keep `ZDP_ENTITLEMENT` as the first candidate identity.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-TOKEN-006',
          severity: 'error',
          file: 'contracts/token-identity.yaml',
          path: 'token_identity.required_policy_fields',
          message:
            'Token Identity Contract must include `cash_redemption_policy` in `token_identity.required_policy_fields`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-TOKEN-006',
          severity: 'error',
          file: 'contracts/token-identity.yaml',
          path: 'right_sources.ZDP_CREDIT',
          message:
            'Token Identity Contract must keep credit truth in the zdp-money-platform ledger.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-TOKEN-006',
          severity: 'error',
          file: 'contracts/token-identity.yaml',
          path: 'rights_separation.entitlement_credit_same_balance_allowed',
          message:
            'Token Identity Contract must not allow ZDP_ENTITLEMENT and ZDP_CREDIT to share one balance.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-TOKEN-006',
          severity: 'error',
          file: 'contracts/token-identity.yaml',
          path: 'token_identity.merged_balances',
          message:
            'Token Identity merged balance contract must not include `ZDP_CREDIT` in `token_identity.merged_balances`.'
        });
      }
    );
  });
});

function createTokenProtocolServiceContract(): Record<string, unknown> {
  return {
    service: {
      id: 'token-protocol',
      repo: 'zdp-token-protocol'
    }
  };
}

function createTokenIndexerServiceContract(): Record<string, unknown> {
  return {
    service: {
      id: 'token-indexer',
      repo: 'zdp-token-indexer'
    }
  };
}

function createValidTokenProtocolFiles(): Record<string, string> {
  return {
    ...createValidTokenAuthorityMatrixFiles(),
    ...createValidSuiApiSelectionFiles('zdp-token-protocol'),
    ...createValidPackageUpgradePolicyFiles(),
    ...createValidTokenIdentityFiles()
  };
}

function createValidTokenAuthorityMatrixFiles(): Record<string, string> {
  return {
    'contracts/token-authority-matrix.yaml': `
contract:
  owner: zdp-token-protocol
  status: lab_only_no_mainnet
authority_matrix:
  required_capabilities:
    - TreasuryCap
    - UpgradeCap
    - DenyCapV2
    - MetadataCap
    - PauseCap
    - migration_config_cap
    - PAS_POLICY_CAP_OR_APPROVAL_WITNESS
  capability_required_fields:
    - owner_boundary
    - approver_boundary
    - signer_threshold
    - timelock_policy
    - rotation_policy
    - revocation_policy
    - monitoring_policy
    - emergency_replacement_policy
authority_separation:
  supply_upgrade_compliance_emergency_split: true
  single_admin_cap_allowed: false
  single_hot_wallet_allowed: false
  forbidden_holders:
    - zdp-money-platform
    - zdp-core-platform
    - zdp-token-indexer
    - hot_wallet_singleton
custody_boundary:
  default_model: self_custody
  managed_custody_requires_gate: true
  forbidden_runtime_owners:
    - zdp-money-platform
    - zdp-core-platform
    - zdp-token-indexer
    - ci
`
  };
}

function createValidTokenIndexerFiles(): Record<string, string> {
  return {
    ...createValidSuiApiSelectionFiles('zdp-token-indexer'),
    'contracts/chain-fact-contract.yaml': `
contract:
  owner: zdp-token-indexer
  status: lab_only_no_product_rights
chain_fact:
  sources:
    - checkpoint
    - transaction_effects
    - object_changes
    - move_event
    - bcs_payload
  required_fields:
    - checkpoint_sequence
    - transaction_digest
    - event_sequence
    - source_kind
    - object_id
    - package_id
    - original_package_id
    - emitting_package_id
    - type_origin_package_id
    - module
    - event_type
    - raw_bcs
    - parsed_payload
    - canonical_fact_id
    - canonical_status
    - quarantine_reason
    - processed_at
  observed_event: chain.fact.observed
  quarantined_event: chain.fact.quarantined
  replay_required: true
  quarantine_required: true
indexer:
  allowed_responsibilities:
    - raw_envelope_capture
    - chain_fact_normalization
    - replay
    - quarantine
    - watermark_tracking
money_consumption:
  required_gates:
    - approved_business_request
    - idempotency_key
    - amount_invariant
    - package_version_allowlist
    - replay_state
`
  };
}

function createValidSuiApiSelectionFiles(owner: string): Record<string, string> {
  return {
    'contracts/sui-api-selection.yaml': `
contract:
  owner: ${owner}
sui_api:
  baseline: grpc_core_api
  json_rpc_role: legacy_compatibility_only
  latest_official_docs_review_required: true
  migration_guide_review_required: true
  archival_provider_policy_required: true
  endpoint_config_single_source: true
  evaluated_apis:
    - grpc
    - graphql
    - core_api
    - archival_provider
    - json_rpc_legacy
  required_selection_evidence:
    - baseline
    - fallback
    - latest_official_docs_review_ref
    - migration_guide_review_ref
    - archival_provider_policy
    - endpoint_config_owner
`
  };
}

function createValidPackageUpgradePolicyFiles(): Record<string, string> {
  return {
    'contracts/package-upgrade-policy.yaml': `
contract:
  owner: zdp-token-protocol
  status: lab_only_no_mainnet
package_manifest:
  required_fields:
    - original_package_id
    - latest_package_id
    - dependency_ids
    - build_output_digest
    - deployment_transaction_digest
    - migration_transaction_digest
    - activation_transaction_digest
    - source_commit
    - move_lock_digest
version_guard:
  old_package_version_guard_required: true
migration_plan:
  required: true
  state_migration_required: true
event_separation:
  required_events:
    - PackageUpgraded
    - StateMigrated
    - OperationallyEnabled
activation:
  operational_enable_separate_from_publish: true
approval_split:
  pause_unpause_approval_split: true
  package_upgrade_approval_split: true
rollback:
  rollback_forward_only: true
upgrade_policy:
  publish_implies_operational_enable: false
  chain_rollback_allowed: false
  single_admin_upgrade_allowed: false
`
  };
}

function createValidTokenIdentityFiles(): Record<string, string> {
  return {
    'contracts/token-identity.yaml': `
contract:
  owner: zdp-token-protocol
  status: lab_only_no_mainnet
token_identity:
  default_candidate: ZDP_ENTITLEMENT
  required_policy_fields:
    - holder_claim
    - issuer_obligation
    - cash_redemption_policy
    - usage_scope
    - validity_period_policy
    - transferability_policy
    - refund_chargeback_suspension_policy
    - price_policy
    - accounting_liability_policy
    - authority_approval_conditions
  merged_balances: []
right_sources:
  ZDP_ENTITLEMENT: core_access_and_money_entitlement
  ZDP_CREDIT: zdp-money-platform_ledger
  ZDP_SETTLEMENT_UNIT: forbidden_until_legal_tax_risk_review
  ZDP_GOVERNANCE: forbidden_initial_launch
rights_separation:
  entitlement_credit_same_balance_allowed: false
  money_ledger_replaced_by_chain_allowed: false
  membership_as_cash_allowed: false
`
  };
}

async function withRepositoryRoot(
  files: Record<string, string>,
  callback: (repositoryRoot: string) => Promise<void>
): Promise<void> {
  const repositoryRoot = await mkdtemp(join(tmpdir(), 'zdp-token-contract-'));

  try {
    await Promise.all(
      Object.entries(files).map(async ([relativePath, source]) => {
        const filePath = join(repositoryRoot, relativePath);
        await mkdir(dirname(filePath), { recursive: true });
        await writeFile(filePath, source.trimStart(), 'utf8');
      })
    );

    await callback(repositoryRoot);
  } finally {
    await rm(repositoryRoot, { force: true, recursive: true });
  }
}
