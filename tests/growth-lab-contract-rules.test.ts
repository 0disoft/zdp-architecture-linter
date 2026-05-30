import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { validateRepositoryGrowthLabContract } from '../src/growth-lab-contract-rules.ts';

describe('growth lab contract rules', () => {
  test('passes when the growth lab repository declares growth contracts', async () => {
    await withRepositoryRoot(createValidGrowthLabFiles(), async (repositoryRoot) => {
      const diagnostics = await validateRepositoryGrowthLabContract({
        repositoryRoot,
        repositoryServiceContract: createGrowthLabServiceContract()
      });

      expect(diagnostics).toEqual([]);
    });
  });

  test('skips repositories that are not zdp-growth-lab', async () => {
    await withRepositoryRoot({}, async (repositoryRoot) => {
      const diagnostics = await validateRepositoryGrowthLabContract({
        repositoryRoot,
        repositoryServiceContract: {
          service: {
            repo: 'zdp-data-platform'
          }
        }
      });

      expect(diagnostics).toEqual([]);
    });
  });

  test('fails when required growth lab files are missing', async () => {
    await withRepositoryRoot({}, async (repositoryRoot) => {
      const diagnostics = await validateRepositoryGrowthLabContract({
        repositoryRoot,
        repositoryServiceContract: createGrowthLabServiceContract()
      });

      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-GROWTH-001',
        severity: 'error',
        file: 'contracts/funnel-metrics.yaml',
        path: 'repository.root',
        message:
          'Growth lab repository must include `contracts/funnel-metrics.yaml`.'
      });
      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-GROWTH-001',
        severity: 'error',
        file: 'contracts/growth-experiments.yaml',
        path: 'repository.root',
        message:
          'Growth lab repository must include `contracts/growth-experiments.yaml`.'
      });
      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-GROWTH-001',
        severity: 'error',
        file: 'EXPERIMENT.md',
        path: 'repository.root',
        message: 'Growth lab repository must include `EXPERIMENT.md`.'
      });
    });
  });

  test('fails when a growth lab contract file is not valid YAML', async () => {
    await withRepositoryRoot(
      {
        ...createValidGrowthLabFiles(),
        'contracts/funnel-metrics.yaml': 'contract: [broken'
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryGrowthLabContract({
          repositoryRoot,
          repositoryServiceContract: createGrowthLabServiceContract()
        });

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]).toMatchObject({
          ruleId: 'ZDP-GROWTH-001',
          severity: 'error',
          file: 'contracts/funnel-metrics.yaml',
          path: 'yaml'
        });
      }
    );
  });

  test('fails when funnel metric contracts drift', async () => {
    await withRepositoryRoot(
      {
        ...createValidGrowthLabFiles(),
        'contracts/funnel-metrics.yaml': `
contract:
  version: 1
  status: draft
source_events:
  - web.page-viewed
standard_funnels:
  - id: public-site-to-signup
    steps:
      - web.page-viewed
guardrails:
  - do_not_reduce_privacy_consent_clarity
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryGrowthLabContract({
          repositoryRoot,
          repositoryServiceContract: createGrowthLabServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-GROWTH-001',
          severity: 'error',
          file: 'contracts/funnel-metrics.yaml',
          path: 'source_events',
          message:
            'Growth lab contract `contracts/funnel-metrics.yaml` must include `billing.checkout-started` in `source_events`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-GROWTH-001',
          severity: 'error',
          file: 'contracts/funnel-metrics.yaml',
          path: 'standard_funnels',
          message:
            'Growth lab contract `contracts/funnel-metrics.yaml` must include id `checkout-intent` in `standard_funnels`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-GROWTH-001',
          severity: 'error',
          file: 'contracts/funnel-metrics.yaml',
          path: 'guardrails',
          message:
            'Growth lab contract `contracts/funnel-metrics.yaml` must include `do_not_hide_pricing_or_cancellation_terms` in `guardrails`.'
        });
      }
    );
  });

  test('fails when growth experiment contracts drift', async () => {
    await withRepositoryRoot(
      {
        ...createValidGrowthLabFiles(),
        'contracts/growth-experiments.yaml': `
contract:
  version: 1
  status: draft
purpose: growth experiment contract
allowed_inputs:
  - anonymous_aggregates
forbidden_inputs:
  - raw_clickstream_export
required_fields:
  - experiment_id
forbidden_uses:
  - final_authorization_decision
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryGrowthLabContract({
          repositoryRoot,
          repositoryServiceContract: createGrowthLabServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-GROWTH-001',
          severity: 'error',
          file: 'contracts/growth-experiments.yaml',
          path: 'allowed_inputs',
          message:
            'Growth lab contract `contracts/growth-experiments.yaml` must include `experiment_exposure_counts` in `allowed_inputs`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-GROWTH-001',
          severity: 'error',
          file: 'contracts/growth-experiments.yaml',
          path: 'forbidden_inputs',
          message:
            'Growth lab contract `contracts/growth-experiments.yaml` must include `payment_database_direct_read` in `forbidden_inputs`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-GROWTH-001',
          severity: 'error',
          file: 'contracts/growth-experiments.yaml',
          path: 'required_fields',
          message:
            'Growth lab contract `contracts/growth-experiments.yaml` must include `rollback_plan` in `required_fields`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-GROWTH-001',
          severity: 'error',
          file: 'contracts/growth-experiments.yaml',
          path: 'forbidden_uses',
          message:
            'Growth lab contract `contracts/growth-experiments.yaml` must include `deceptive_urgency` in `forbidden_uses`.'
        });
      }
    );
  });

  test('fails when growth service boundaries drift', async () => {
    await withRepositoryRoot(createValidGrowthLabFiles(), async (repositoryRoot) => {
      const diagnostics = await validateRepositoryGrowthLabContract({
        repositoryRoot,
        repositoryServiceContract: {
          service: {
            repo: 'zdp-growth-lab',
            status: 'active'
          },
          domain: {
            type: 'product'
          },
          data: {
            pii_level: 'direct',
            payment_data: true,
            money_movement: true,
            ai_user_data: true
          },
          dependencies: {
            services: ['data-platform'],
            datastores: ['event_clickhouse']
          },
          human_review_required: ['experiment launch'],
          exit: {
            kill_criteria: ['experiments require raw customer payloads']
          },
          policy_gates: {
            required_linter_rules: ['ZDP-REPO-BASELINE-001']
          }
        }
      });

      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-GROWTH-001',
        severity: 'error',
        file: 'service.yaml',
        path: 'service.status',
        message: 'Growth lab service must remain in `experiment` status.'
      });
      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-GROWTH-001',
        severity: 'error',
        file: 'service.yaml',
        path: 'dependencies.datastores',
        message:
          'Growth lab service must not depend directly on product, core, money, privacy, or analytics datastores.'
      });
      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-GROWTH-001',
        severity: 'error',
        file: 'service.yaml',
        path: 'policy_gates.required_linter_rules',
        message:
          'Growth lab service contract must require `ZDP-GROWTH-001`.'
      });
    });
  });

  test('fails when EXPERIMENT.md omits growth safety boundaries', async () => {
    await withRepositoryRoot(
      {
        ...createValidGrowthLabFiles(),
        'EXPERIMENT.md': `
# Growth Lab Experiment

Ship more experiments.
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryGrowthLabContract({
          repositoryRoot,
          repositoryServiceContract: createGrowthLabServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-GROWTH-001',
          severity: 'error',
          file: 'EXPERIMENT.md',
          path: 'source',
          message:
            'Growth lab contract source must include `제품 DB, money DB, core DB, privacy vault`.'
        });
      }
    );
  });

  test('fails when growth checker files and scripts drift', async () => {
    await withRepositoryRoot(
      {
        ...createValidGrowthLabFiles(),
        'package.json': `
{
  "scripts": {
    "check": "tsc --noEmit"
  }
}
`,
        'src/growth-contracts/validator.ts': `
export function checkGrowthContracts(): void {}
`,
        'tests/growth-contracts.test.ts': `
import { test } from 'bun:test';
test('growth placeholder', () => {});
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryGrowthLabContract({
          repositoryRoot,
          repositoryServiceContract: createGrowthLabServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-GROWTH-001',
          severity: 'error',
          file: 'package.json',
          path: 'scripts.test',
          message: 'Growth lab package must declare `test` script.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-GROWTH-001',
          severity: 'error',
          file: 'package.json',
          path: 'scripts.contracts:check',
          message: 'Growth lab package must declare `contracts:check` script.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-GROWTH-001',
          severity: 'error',
          file: 'src/growth-contracts/validator.ts',
          path: 'source',
          message:
            'Growth lab checker source must include `contracts/funnel-metrics.yaml`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-GROWTH-001',
          severity: 'error',
          file: 'tests/growth-contracts.test.ts',
          path: 'source',
          message:
            'Growth lab checker source must include `fails when service contract starts owning platform truth`.'
        });
      }
    );
  });
});

async function withRepositoryRoot(
  files: Record<string, string>,
  callback: (repositoryRoot: string) => Promise<void>
): Promise<void> {
  const repositoryRoot = await mkdtemp(join(tmpdir(), 'zdp-growth-lab-'));

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

function createGrowthLabServiceContract(): unknown {
  return {
    service: {
      repo: 'zdp-growth-lab',
      status: 'experiment'
    },
    domain: {
      type: 'lab'
    },
    data: {
      pii_level: 'none',
      payment_data: false,
      money_movement: false,
      ai_user_data: false
    },
    dependencies: {
      services: ['data-platform', 'platform-observability'],
      datastores: []
    },
    human_review_required: [
      'experiment launch',
      'metric definition changes',
      'checkout or pricing experiment',
      'privacy or consent copy experiment'
    ],
    exit: {
      kill_criteria: [
        'experiments require raw customer payloads',
        'experiment exposure is used as authorization, entitlement, billing, or ledger truth',
        'dark patterns or undisclosed tracking become part of the experiment plan'
      ]
    },
    policy_gates: {
      required_linter_rules: [
        'ZDP-REPO-BASELINE-001',
        'ZDP-REPO-MARKDOWN-001',
        'ZDP-GROWTH-001'
      ]
    }
  };
}

function createValidGrowthLabFiles(): Record<string, string> {
  return {
    'contracts/funnel-metrics.yaml': `
contract:
  version: 1
  status: draft
source_events:
  - web.page-viewed
  - product.signup-started
  - product.signup-completed
  - product.activation-completed
  - experiment.exposure-recorded
  - billing.checkout-started
standard_funnels:
  - id: public-site-to-signup
    steps:
      - web.page-viewed
      - product.signup-started
      - product.signup-completed
  - id: signup-to-activation
    steps:
      - product.signup-completed
      - product.activation-completed
  - id: checkout-intent
    steps:
      - billing.checkout-started
guardrails:
  - do_not_reduce_privacy_consent_clarity
  - do_not_increase_checkout_confusion
  - do_not_hide_pricing_or_cancellation_terms
`,
    'contracts/growth-experiments.yaml': `
contract:
  version: 1
  status: draft
purpose: growth experiment contract
allowed_inputs:
  - anonymous_aggregates
  - funnel_counts
  - activation_counts
  - experiment_exposure_counts
forbidden_inputs:
  - raw_clickstream_export
  - product_database_direct_read
  - payment_database_direct_read
  - identity_database_direct_read
  - privacy_vault_direct_read
required_fields:
  - experiment_id
  - hypothesis
  - target_surface
  - primary_metric
  - guardrail_metrics
  - start_condition
  - stop_condition
  - rollback_plan
forbidden_uses:
  - final_authorization_decision
  - entitlement_decision
  - ledger_or_credit_mutation
  - undisclosed_tracking
  - deceptive_urgency
`,
    'EXPERIMENT.md': `
# Growth Lab Experiment

ZDP 제품군은 GA4식 자유 이벤트보다 익명·집계 분석 결과를 기준으로 퍼널을 비교한다.

실험 노출은 분석용 기록일 뿐 권한, 결제, 원장 판단으로 쓰지 않는다.

성공 기준은 raw 개인정보 없이 익명·집계 데이터로 가능해야 한다.

dark pattern, 숨은 결제, 가짜 긴급성, 미고지 추적을 사용하지 않는다.

제품 DB, money DB, core DB, privacy vault를 직접 읽지 않는다.

raw event export를 이 저장소에 보관하지 않는다.
`,
    'package.json': `
{
  "scripts": {
    "check": "tsc --noEmit",
    "test": "bun test",
    "contracts:check": "bun scripts/check-growth-contracts.ts"
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
    'scripts/check-growth-contracts.ts': `
import { runGrowthContractCheckCli } from '../src/growth-contracts/cli';

await runGrowthContractCheckCli(process.cwd(), process.argv.slice(2));
`,
    'src/growth-contracts/cli.ts': `
import { checkGrowthContracts } from './validator';

export async function runGrowthContractCheckCli(): Promise<number> {
  await checkGrowthContracts(process.cwd());
  console.log('Usage: bun scripts/check-growth-contracts.ts');
  return 0;
}
`,
    'src/growth-contracts/parser.ts': `
import { parse } from 'yaml';

export function readYamlFile(source: string): unknown {
  return parse(source);
}

export function readTextFile(source: string): string {
  return source;
}
`,
    'src/growth-contracts/types.ts': `
export type ContractDiagnostic = {
  file: string;
};

export type ContractCheckResult = {
  ok: boolean;
};
`,
    'src/growth-contracts/validator.ts': `
const FUNNEL_METRICS_FILE = 'contracts/funnel-metrics.yaml';
const GROWTH_EXPERIMENTS_FILE = 'contracts/growth-experiments.yaml';
const SERVICE_FILE = 'service.yaml';
const SOURCE_EVENTS = ['web.page-viewed'];
const FORBIDDEN_INPUTS = ['raw_clickstream_export'];
const FORBIDDEN_USES = ['ledger_or_credit_mutation'];
const EXPERIMENT_SAFETY_FRAGMENTS = ['raw event export'];

export function checkGrowthContracts(): void {
  console.log(FUNNEL_METRICS_FILE, GROWTH_EXPERIMENTS_FILE, SERVICE_FILE);
  console.log(SOURCE_EVENTS, FORBIDDEN_INPUTS, FORBIDDEN_USES);
  console.log(EXPERIMENT_SAFETY_FRAGMENTS, 'ZDP-GROWTH-001');
}
`,
    'tests/growth-contracts.test.ts': `
import { test } from 'bun:test';

test('fails when funnel source events drift', () => {});
test('fails when growth experiment safety boundaries drift', () => {});
test('fails when service contract starts owning platform truth', () => {});
test('fails when EXPERIMENT.md omits safety text', () => {});
`
  };
}
