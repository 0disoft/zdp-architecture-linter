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
        file: 'contracts/dns-records.yaml',
        path: 'repository.root',
        message:
          'Infrastructure repository must include `contracts/dns-records.yaml`.'
      });
      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-INFRA-001',
        severity: 'error',
        file: 'contracts/firewall-rules.yaml',
        path: 'repository.root',
        message:
          'Infrastructure repository must include `contracts/firewall-rules.yaml`.'
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

  test('fails when an infrastructure contract file is not a YAML object', async () => {
    await withRepositoryRoot(
      {
        ...createValidInfraFiles(),
        'contracts/resource-inventory.yaml': '- not-an-object'
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
          path: 'yaml',
          message:
            'Infrastructure contract `contracts/resource-inventory.yaml` must be a YAML object.'
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
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-INFRA-001',
          severity: 'error',
          file: 'contracts/resource-inventory.yaml',
          path: 'inventory_policy.latest_pricing_review_required',
          message:
            'Infrastructure resource inventory must require latest pricing review before implementation.'
        });
      }
    );
  });

  test('fails when pricing review metadata is malformed', async () => {
    await withRepositoryRoot(
      {
        ...createValidInfraFiles(),
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
  latest_pricing_review_date: not-a-date
  pricing_review_max_age_days: 0
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
          path: 'inventory_policy.latest_pricing_review_date',
          message:
            'Infrastructure latest pricing review date must use YYYY-MM-DD format.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-INFRA-001',
          severity: 'error',
          file: 'contracts/resource-inventory.yaml',
          path: 'inventory_policy.pricing_review_max_age_days',
          message:
            'Infrastructure pricing review max age must be a positive integer.'
        });
      }
    );

    await withRepositoryRoot(
      {
        ...createValidInfraFiles(),
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
  latest_pricing_review_date: '2026-02-31'
  pricing_review_max_age_days: 90
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
          path: 'inventory_policy.latest_pricing_review_date',
          message:
            'Infrastructure latest pricing review date must be a real calendar date.'
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

  test('fails when contract string lists contain malformed entries', async () => {
    await withRepositoryRoot(
      {
        ...createValidInfraFiles(),
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
  - label: dns challenge secrets
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
          path: 'forbidden_values',
          message:
            'Infrastructure contract `contracts/environment.schema.yaml` must declare `forbidden_values` as a non-empty string list.'
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

  test('fails when restore drill lists contain malformed entries', async () => {
    await withRepositoryRoot(
      {
        ...createValidInfraFiles(),
        'contracts/backup-restore.yaml': `
backup_policy:
  required_before_stateful_launch: true
  restore_drill_required: true
  evidence_required: true
  secret_values_allowed: false
restore_drills:
  - not-an-object
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
          path: 'restore_drills',
          message:
            'Infrastructure backup contract must declare non-empty object list `restore_drills`.'
        });
      }
    );
  });

  test('passes restore drill evidence checks for any restore drill id', async () => {
    await withRepositoryRoot(
      {
        ...createValidInfraFiles(),
        'contracts/backup-restore.yaml': `
backup_policy:
  required_before_stateful_launch: true
  restore_drill_required: true
  evidence_required: true
  secret_values_allowed: false
restore_drills:
  - id: any-stateful-service-restore
    status: planned
    target: future stateful service
    expected_evidence:
      - backup snapshot identifier without secret values
      - restore start and end time
      - data integrity check result
      - rollback notes
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryInfraContract({
          repositoryRoot,
          repositoryServiceContract: createInfraServiceContract()
        });

        expect(diagnostics).toEqual([]);
      }
    );
  });

  test('fails when restore drill fields or evidence drift', async () => {
    await withRepositoryRoot(
      {
        ...createValidInfraFiles(),
        'contracts/backup-restore.yaml': `
backup_policy:
  required_before_stateful_launch: true
  restore_drill_required: true
  evidence_required: true
  secret_values_allowed: false
restore_drills:
  - id: any-stateful-service-restore
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
          path: 'restore_drills[0].status',
          message:
            'Infrastructure restore drill at index 0 must declare string field `status`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-INFRA-001',
          severity: 'error',
          file: 'contracts/backup-restore.yaml',
          path: 'restore_drills[0].target',
          message:
            'Infrastructure restore drill at index 0 must declare string field `target`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-INFRA-001',
          severity: 'error',
          file: 'contracts/backup-restore.yaml',
          path:
            'restore_drills.any-stateful-service-restore.expected_evidence',
          message:
            'Infrastructure contract `contracts/backup-restore.yaml` must include `rollback notes` in `expected_evidence`.'
        });
      }
    );
  });

  test('fails when DNS and firewall contracts allow provider-owned values or mutation', async () => {
    await withRepositoryRoot(
      {
        ...createValidInfraFiles(),
        'contracts/dns-records.yaml': `
dns_policy:
  source_of_truth: provider-dashboard
  provider_mutation_allowed: true
  secret_values_allowed: true
  actual_record_values_allowed: true
records:
  - name: future-public-name
    value: placeholder-target
`,
        'contracts/firewall-rules.yaml': `
firewall_policy:
  source_of_truth: provider-dashboard
  provider_mutation_allowed: true
  secret_values_allowed: true
  actual_server_ips_allowed: true
rules:
  - name: future-ssh-rule
    source: placeholder-source
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
          file: 'contracts/dns-records.yaml',
          path: 'dns_policy.provider_mutation_allowed',
          message: 'Infrastructure DNS records must not allow provider mutation.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-INFRA-001',
          severity: 'error',
          file: 'contracts/dns-records.yaml',
          path: 'dns_policy.actual_record_values_allowed',
          message:
            'Infrastructure DNS records must not contain live record target values before provider connection.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-INFRA-001',
          severity: 'error',
          file: 'contracts/dns-records.yaml',
          path: 'records',
          message:
            'Infrastructure DNS record entries must stay empty until provider connection and live record value policy are reviewed.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-INFRA-001',
          severity: 'error',
          file: 'contracts/firewall-rules.yaml',
          path: 'firewall_policy.provider_mutation_allowed',
          message: 'Infrastructure firewall rules must not allow provider mutation.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-INFRA-001',
          severity: 'error',
          file: 'contracts/firewall-rules.yaml',
          path: 'firewall_policy.actual_server_ips_allowed',
          message:
            'Infrastructure firewall rules must not contain live server IP values before provider connection.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-INFRA-001',
          severity: 'error',
          file: 'contracts/firewall-rules.yaml',
          path: 'rules',
          message:
            'Infrastructure firewall rule entries must stay empty until provider connection and live server IP policy are reviewed.'
        });
      }
    );
  });

  test('fails when contract source contains forbidden provider values', async () => {
    await withRepositoryRoot(
      {
        ...createValidInfraFiles(),
        'contracts/dns-records.yaml': `
dns_policy:
  source_of_truth: repository-contract-first
  provider_mutation_allowed: false
  secret_values_allowed: false
  actual_record_values_allowed: false
api_token: sk_live_1234567890abcdef
records: []
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
          file: 'contracts/dns-records.yaml',
          path: '$',
          message:
            'Infrastructure contract source must not contain api tokens.'
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

  test('fails when infra checker source proof is only string literal stubs', async () => {
    await withRepositoryRoot(
      {
        ...createValidInfraFiles(),
        'src/infra-contracts/validator.ts': `
export const checks = [
  'repository-contract-first',
  'backfill-contract-or-revert-dashboard',
  'least-privilege',
  'server ips',
  'rollback notes',
  'INFRA_PRICING_REVIEW_NOT_REQUIRED',
  'INFRA_PRICING_REVIEW_DATE_INVALID',
  'INFRA_PRICING_REVIEW_MAX_AGE_INVALID',
  'INFRA_FORBIDDEN_API_TOKEN',
  'INFRA_DNS_PROVIDER_MUTATION_ALLOWED',
  'INFRA_DNS_RECORDS_BEFORE_PROVIDER_CONNECTION',
  'INFRA_FIREWALL_ACTUAL_SERVER_IPS_ALLOWED',
  'INFRA_FIREWALL_RULES_BEFORE_PROVIDER_CONNECTION',
  'export function validateInfrastructureContracts',
  'function validatePricingReview',
  'function validateForbiddenSourceValues',
  'function validateDnsRecords',
  'function validateFirewallRules'
];
`,
        'tests/infra-contracts.test.ts': `
import { test } from 'bun:test';
const fakeProof = [
  'validates the committed infra contracts',
  'loads every required infra contract file',
  'reports all contract load failures together',
  'creates a provider-neutral dry-run plan without provider calls',
  'fails when repository contracts stop being the source of truth',
  'fails when local environment can access provider secrets',
  'fails when forbidden provider values are no longer forbidden',
  'fails when restore evidence is incomplete',
  'accepts restore drills without a service-specific id',
  'fails when pricing review is stale',
  'fails when latest pricing review is no longer required',
  'fails when contract source contains forbidden provider values',
  'fails when DNS or firewall contracts allow provider mutations',
  'fails when DNS or firewall entries appear before provider connection',
  'provider-neutral dry-run plan',
  'INFRA_SOURCE_OF_TRUTH_INVALID',
  'INFRA_ENVIRONMENT_SECRET_POLICY_INVALID',
  'INFRA_FORBIDDEN_VALUE_MISSING',
  'INFRA_RESTORE_EVIDENCE_FIELD_MISSING',
  'INFRA_PRICING_REVIEW_NOT_REQUIRED',
  'INFRA_PRICING_REVIEW_STALE',
  'INFRA_FORBIDDEN_API_TOKEN',
  'INFRA_DNS_PROVIDER_MUTATION_ALLOWED',
  'INFRA_DNS_RECORDS_BEFORE_PROVIDER_CONNECTION',
  'INFRA_FIREWALL_ACTUAL_SERVER_IPS_ALLOWED',
  'INFRA_FIREWALL_RULES_BEFORE_PROVIDER_CONNECTION',
  'expect(',
  'validateInfrastructureContracts',
  'loadInfrastructureContracts',
  'createInfrastructurePlan'
];
test('placeholder', () => fakeProof.join('\\n'));
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
          file: 'src/infra-contracts/validator.ts',
          path: 'source',
          message:
            'Infrastructure checker source must include code fragment `export function validateInfrastructureContracts`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-INFRA-001',
          severity: 'error',
          file: 'tests/infra-contracts.test.ts',
          path: 'source',
          message:
            'Infrastructure checker source must include test case `validates the committed infra contracts`.'
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
  latest_pricing_review_date: '2026-06-03'
  pricing_review_max_age_days: 90
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
    'contracts/dns-records.yaml': `
dns_policy:
  source_of_truth: repository-contract-first
  provider_mutation_allowed: false
  secret_values_allowed: false
  actual_record_values_allowed: false
records: []
`,
    'contracts/firewall-rules.yaml': `
firewall_policy:
  source_of_truth: repository-contract-first
  provider_mutation_allowed: false
  secret_values_allowed: false
  actual_server_ips_allowed: false
rules: []
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
export const files = ['resource-inventory.yaml', 'environment.schema.yaml', 'backup-restore.yaml', 'dns-records.yaml', 'firewall-rules.yaml'];
`,
    'src/infra-contracts/validator.ts': `
export function validateInfrastructureContracts(): readonly string[] {
  return [
    'repository-contract-first',
    'backfill-contract-or-revert-dashboard',
    'least-privilege',
    'server ips',
    'rollback notes',
    ...validatePricingReview(),
    ...validateForbiddenSourceValues(),
    ...validateDnsRecords(),
    ...validateFirewallRules()
  ];
}

function validatePricingReview(): readonly string[] {
  return [
    'INFRA_PRICING_REVIEW_NOT_REQUIRED',
    'INFRA_PRICING_REVIEW_DATE_INVALID',
    'INFRA_PRICING_REVIEW_MAX_AGE_INVALID'
  ];
}

function validateForbiddenSourceValues(): readonly string[] {
  return ['INFRA_FORBIDDEN_API_TOKEN'];
}

function validateDnsRecords(): readonly string[] {
  return [
    'INFRA_DNS_PROVIDER_MUTATION_ALLOWED',
    'INFRA_DNS_RECORDS_BEFORE_PROVIDER_CONNECTION'
  ];
}

function validateFirewallRules(): readonly string[] {
  return [
    'INFRA_FIREWALL_ACTUAL_SERVER_IPS_ALLOWED',
    'INFRA_FIREWALL_RULES_BEFORE_PROVIDER_CONNECTION'
  ];
}
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
import { expect, it } from 'bun:test';
import { loadInfrastructureContracts } from '../src/infra-contracts/parser';
import { createInfrastructurePlan } from '../src/infra-contracts/plan';
import { validateInfrastructureContracts } from '../src/infra-contracts/validator';

it('validates the committed infra contracts', () => {
  expect(validateInfrastructureContracts).toBeDefined();
});

it('loads every required infra contract file', () => {
  expect(loadInfrastructureContracts).toBeDefined();
});

it('reports all contract load failures together', () => {
  expect(loadInfrastructureContracts).toBeDefined();
});

it('creates a provider-neutral dry-run plan without provider calls', () => {
  expect(createInfrastructurePlan()).toEqual({
    providerCalls: [],
    blockedActions: ['terraform apply', 'opentofu apply', 'restore execution']
  });
});

it('fails when repository contracts stop being the source of truth', () => {
  expect('INFRA_SOURCE_OF_TRUTH_INVALID').toBeTruthy();
});

it('fails when local environment can access provider secrets', () => {
  expect('INFRA_ENVIRONMENT_SECRET_POLICY_INVALID').toBeTruthy();
});

it('fails when forbidden provider values are no longer forbidden', () => {
  expect('INFRA_FORBIDDEN_VALUE_MISSING').toBeTruthy();
});

it('fails when restore evidence is incomplete', () => {
  expect('INFRA_RESTORE_EVIDENCE_FIELD_MISSING').toBeTruthy();
});

it('accepts restore drills without a service-specific id', () => {
  expect('any-stateful-service-restore').toBeTruthy();
});

it('fails when pricing review is stale', () => {
  expect('INFRA_PRICING_REVIEW_STALE').toBeTruthy();
});

it('fails when latest pricing review is no longer required', () => {
  expect('INFRA_PRICING_REVIEW_NOT_REQUIRED').toBeTruthy();
});

it('fails when contract source contains forbidden provider values', () => {
  expect('INFRA_FORBIDDEN_API_TOKEN').toBeTruthy();
});

it('fails when DNS or firewall contracts allow provider mutations', () => {
  expect('INFRA_DNS_PROVIDER_MUTATION_ALLOWED').toBeTruthy();
  expect('INFRA_FIREWALL_ACTUAL_SERVER_IPS_ALLOWED').toBeTruthy();
});

it('fails when DNS or firewall entries appear before provider connection', () => {
  expect('INFRA_DNS_RECORDS_BEFORE_PROVIDER_CONNECTION').toBeTruthy();
  expect('INFRA_FIREWALL_RULES_BEFORE_PROVIDER_CONNECTION').toBeTruthy();
});
`
  };
}
