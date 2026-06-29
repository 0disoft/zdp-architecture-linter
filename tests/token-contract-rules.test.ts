import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { validateRepositoryTokenProtocolContract } from '../src/token-contract-rules.ts';

describe('token protocol contract rules', () => {
  test('passes when token protocol declares authority and custody controls', async () => {
    await withRepositoryRoot(createValidTokenProtocolFiles(), async (repositoryRoot) => {
      const diagnostics = await validateRepositoryTokenProtocolContract({
        repositoryRoot,
        repositoryServiceContract: createTokenProtocolServiceContract()
      });

      expect(diagnostics).toEqual([]);
    });
  });

  test('skips repositories that are not zdp-token-protocol', async () => {
    await withRepositoryRoot({}, async (repositoryRoot) => {
      const diagnostics = await validateRepositoryTokenProtocolContract({
        repositoryRoot,
        repositoryServiceContract: {
          service: {
            repo: 'zdp-token-indexer'
          }
        }
      });

      expect(diagnostics).toEqual([]);
    });
  });

  test('fails when the token authority matrix contract is missing', async () => {
    await withRepositoryRoot({}, async (repositoryRoot) => {
      const diagnostics = await validateRepositoryTokenProtocolContract({
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
        const diagnostics = await validateRepositoryTokenProtocolContract({
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
});

function createTokenProtocolServiceContract(): Record<string, unknown> {
  return {
    service: {
      id: 'token-protocol',
      repo: 'zdp-token-protocol'
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
