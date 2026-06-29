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
    await withRepositoryRoot({}, async (repositoryRoot) => {
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
    });
  });

  test('fails when token authority controls collapse into a hot wallet AdminCap', async () => {
    await withRepositoryRoot(
      {
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
    await withRepositoryRoot({}, async (repositoryRoot) => {
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
