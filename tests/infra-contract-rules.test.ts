import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { validateRepositoryInfraContract } from '../src/infra-contract-rules.ts';

describe('infra contract rules', () => {
  test('passes when the infrastructure repository declares infra contracts', async () => {
    await withRepositoryRoot(createValidInfraFiles(), async (repositoryRoot) => {
      const diagnostics = await validateRepositoryInfraContract({
        repositoryRoot,
        repositoryServiceContract: createInfraServiceContract()
      });

      expect(diagnostics).toEqual([]);
    });
  });

  test('skips repositories that are not zdp-platform-infra', async () => {
    await withRepositoryRoot({}, async (repositoryRoot) => {
      const diagnostics = await validateRepositoryInfraContract({
        repositoryRoot,
        repositoryServiceContract: {
          service: {
            repo: 'zdp-platform-runtime'
          }
        }
      });

      expect(diagnostics).toEqual([]);
    });
  });

  test('fails when required infrastructure contract files are missing', async () => {
    await withRepositoryRoot({}, async (repositoryRoot) => {
      const diagnostics = await validateRepositoryInfraContract({
        repositoryRoot,
        repositoryServiceContract: createInfraServiceContract()
      });

      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-INFRA-001',
        severity: 'error',
        file: 'contracts/resource-inventory.yaml',
        path: 'repository.root',
        message:
          'Infrastructure repository must include `contracts/resource-inventory.yaml`.'
      });
      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-INFRA-001',
        severity: 'error',
        file: 'contracts/environment.schema.yaml',
        path: 'repository.root',
        message:
          'Infrastructure repository must include `contracts/environment.schema.yaml`.'
      });
      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-INFRA-001',
        severity: 'error',
        file: 'contracts/backup-restore.yaml',
        path: 'repository.root',
        message:
          'Infrastructure repository must include `contracts/backup-restore.yaml`.'
      });
      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-INFRA-001',
        severity: 'error',
        file: 'package.json',
        path: 'repository.root',
        message: 'Infrastructure repository must include `package.json`.'
      });
      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-INFRA-001',
        severity: 'error',
        file: 'scripts/infra-plan.ts',
        path: 'repository.root',
        message:
          'Infrastructure repository must include `scripts/infra-plan.ts`.'
      });
    });
  });

  test('fails when an infrastructure contract file is not valid YAML', async () => {
    await withRepositoryRoot(
      {
        ...createValidInfraFiles(),
        'contracts/resource-inventory.yaml': 'resources: [cloudflare'
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryInfraContract({
          repositoryRoot,
          repositoryServiceContract: createInfraServiceContract()
        });

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]).toMatchObject({
          ruleId: 'ZDP-INFRA-001',
          severity: 'error',
          file: 'contracts/resource-inventory.yaml',
          path: 'yaml'
        });
      }
    );
  });

  test('fails when resource inventory drifts', async () => {
    await withRepositoryRoot(
      {
        ...createValidInfraFiles(),
        'contracts/resource-inventory.yaml': `
resources:
  cloudflare:
    dns_zones: []
  hetzner:
    servers: []
inventory_policy:
  source_of_truth: dashboard
  dashboard_drift_action: accept-dashboard
  latest_pricing_review_required: false
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryInfraContract({
          repositoryRoot,
          repositoryServiceContract: createInfraServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-INFRA-001',
          severity: 'error',
          file: 'contracts/resource-inventory.yaml',
          path: 'resources.cloudflare.workers_routes',
          message:
            'Infrastructure contract `contracts/resource-inventory.yaml` must declare array `resources.cloudflare.workers_routes`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-INFRA-001',
          severity: 'error',
          file: 'contracts/resource-inventory.yaml',
          path: 'inventory_policy.source_of_truth',
          message:
            'Infrastructure resource inventory must keep repository contracts as source of truth.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-INFRA-001',
          severity: 'error',
          file: 'contracts/resource-inventory.yaml',
          path: 'inventory_policy.dashboard_drift_action',
          message:
            'Infrastructure resource inventory must require dashboard drift to be backfilled or reverted.'
        });
      }
    );
  });

  test('fails when environment schema drifts', async () => {
    await withRepositoryRoot(
      {
        ...createValidInfraFiles(),
        'contracts/environment.schema.yaml': `
environments:
  - name: local
    secrets_allowed: true
    provider_access: read-write
  - name: production
    secrets_allowed: true
    provider_access: owner
required_contracts:
  - resource-inventory
forbidden_values:
  - api tokens
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryInfraContract({
          repositoryRoot,
          repositoryServiceContract: createInfraServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-INFRA-001',
          severity: 'error',
          file: 'contracts/environment.schema.yaml',
          path: 'environments.local.secrets_allowed',
          message:
            'Infrastructure `local` environment must set `secrets_allowed: false`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-INFRA-001',
          severity: 'error',
          file: 'contracts/environment.schema.yaml',
          path: 'environments.manual',
          message:
            'Infrastructure environment schema must declare `manual` environment.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-INFRA-001',
          severity: 'error',
          file: 'contracts/environment.schema.yaml',
          path: 'required_contracts',
          message:
            'Infrastructure contract `contracts/environment.schema.yaml` must include `backup-restore` in `required_contracts`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-INFRA-001',
          severity: 'error',
          file: 'contracts/environment.schema.yaml',
          path: 'forbidden_values',
          message:
            'Infrastructure contract `contracts/environment.schema.yaml` must include `ssh private keys` in `forbidden_values`.'
        });
      }
    );
  });

  test('fails when backup and restore contract drifts', async () => {
    await withRepositoryRoot(
      {
        ...createValidInfraFiles(),
        'contracts/backup-restore.yaml': `
backup_policy:
  required_before_stateful_launch: false
  restore_drill_required: false
  evidence_required: false
  secret_values_allowed: true
restore_drills:
  - id: hello-origin-restore
    expected_evidence:
      - restore start and end time
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryInfraContract({
          repositoryRoot,
          repositoryServiceContract: createInfraServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-INFRA-001',
          severity: 'error',
          file: 'contracts/backup-restore.yaml',
          path: 'backup_policy.required_before_stateful_launch',
          message:
            'Infrastructure backup policy must require backups before stateful launch.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-INFRA-001',
          severity: 'error',
          file: 'contracts/backup-restore.yaml',
          path: 'backup_policy.secret_values_allowed',
          message:
            'Infrastructure backup policy must forbid secret values in evidence.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-INFRA-001',
          severity: 'error',
          file: 'contracts/backup-restore.yaml',
          path: 'restore_drills.hello-origin-restore.expected_evidence',
          message:
            'Infrastructure contract `contracts/backup-restore.yaml` must include `rollback notes` in `expected_evidence`.'
        });
      }
    );
  });

  test('fails when infra checker files and scripts drift', async () => {
    await withRepositoryRoot(
      {
        ...createValidInfraFiles(),
        'package.json': `
{
  "scripts": {
    "check": "bun test"
  }
}
`,
        'src/infra-contracts/plan.ts': `
export function createInfrastructurePlan(): unknown {
  return {};
}
`,
        'tests/infra-contracts.test.ts': `
import { test } from 'bun:test';
test('placeholder', () => {});
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryInfraContract({
          repositoryRoot,
          repositoryServiceContract: createInfraServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-INFRA-001',
          severity: 'error',
          file: 'package.json',
          path: 'scripts.contracts:check',
          message:
            'Infrastructure package must declare `contracts:check` script.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-INFRA-001',
          severity: 'error',
          file: 'package.json',
          path: 'scripts.infra:plan',
          message: 'Infrastructure package must declare `infra:plan` script.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-INFRA-001',
          severity: 'error',
          file: 'src/infra-contracts/plan.ts',
          path: 'source',
          message:
            'Infrastructure checker source must include `providerCalls: []`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-INFRA-001',
          severity: 'error',
          file: 'tests/infra-contracts.test.ts',
          path: 'source',
          message:
            'Infrastructure checker source must include `provider-neutral dry-run plan`.'
        });
      }
    );
  });
});

async function withRepositoryRoot(
  files: Record<string, string>,
  callback: (repositoryRoot: string) => Promise<void>
): Promise<void> {
  const repositoryRoot = await mkdtemp(join(tmpdir(), 'zdp-infra-contract-'));

  try {
    for (const [relativePath, source] of Object.entries(files)) {
      const absolutePath = join(repositoryRoot, relativePath);

      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, source.trimStart(), 'utf8');
    }

    await callback(repositoryRoot);
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true });
  }
}

function createInfraServiceContract(): unknown {
  return {
    service: {
      repo: 'zdp-platform-infra'
    }
  };
}

function createValidInfraFiles(): Record<string, string> {
  return {
    'contracts/resource-inventory.yaml': `
resources:
  cloudflare:
    dns_zones: []
    workers_routes: []
    r2_buckets: []
    queues: []
    waf_rules: []
  hetzner:
    servers: []
    firewalls: []
    volumes: []
    backups: []
inventory_policy:
  source_of_truth: repository-contract-first
  dashboard_drift_action: backfill-contract-or-revert-dashboard
  latest_pricing_review_required: true
`,
    'contracts/environment.schema.yaml': `
environments:
  - name: local
    purpose: contract review and dry-run only
    secrets_allowed: false
    provider_access: none
  - name: manual
    purpose: compare provider dashboards with repository contracts
    secrets_allowed: true
    provider_access: read-only-preferred
  - name: production
    purpose: approved real resources only
    secrets_allowed: true
    provider_access: least-privilege
required_contracts:
  - resource-inventory
  - backup-restore
  - dns-records
  - firewall-rules
forbidden_values:
  - api tokens
  - ssh private keys
  - account ids
  - server ips
  - dns challenge secrets
`,
    'contracts/backup-restore.yaml': `
backup_policy:
  required_before_stateful_launch: true
  restore_drill_required: true
  evidence_required: true
  secret_values_allowed: false
restore_drills:
  - id: hello-origin-restore
    status: planned
    target: future hello-origin stateful service
    expected_evidence:
      - backup snapshot identifier without secret values
      - restore start and end time
      - data integrity check result
      - rollback notes
`,
    'package.json': `
{
  "scripts": {
    "check": "tsc --noEmit && bun test && bun run contracts:check && bun run infra:plan",
    "test": "bun test",
    "contracts:check": "bun scripts/check-infra-contracts.ts",
    "infra:plan": "bun scripts/infra-plan.ts plan"
  }
}
`,
    'scripts/check-infra-contracts.ts': `
import { runInfraContractCheckCli } from '../src/infra-contracts/cli';
await runInfraContractCheckCli([]);
`,
    'scripts/infra-plan.ts': `
import { runInfraPlanCli } from '../src/infra-contracts/cli';
await runInfraPlanCli(['plan']);
`,
    'src/infra-contracts/parser.ts': `
export const files = ['resource-inventory.yaml', 'environment.schema.yaml', 'backup-restore.yaml'];
`,
    'src/infra-contracts/validator.ts': `
export const checks = ['repository-contract-first', 'backfill-contract-or-revert-dashboard', 'least-privilege', 'server ips', 'rollback notes'];
`,
    'src/infra-contracts/plan.ts': `
export function createInfrastructurePlan(): unknown {
  return {
    providerCalls: [],
    blockedActions: ['terraform apply', 'opentofu apply', 'restore execution']
  };
}
`,
    'tests/infra-contracts.test.ts': `
import { test } from 'bun:test';
test('provider-neutral dry-run plan', () => {
  const sourceOfTruth = 'INFRA_SOURCE_OF_TRUTH_INVALID';
  const environment = 'INFRA_ENVIRONMENT_SECRET_POLICY_INVALID';
  const forbidden = 'INFRA_FORBIDDEN_VALUE_MISSING';
  const restore = 'INFRA_RESTORE_EVIDENCE_FIELD_MISSING';
  return [sourceOfTruth, environment, forbidden, restore];
});
`
  };
}
