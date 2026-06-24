import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { validateRepositoryObservabilityContract } from '../src/observability-contract-rules.ts';

describe('observability contract rules', () => {
  test('passes when the observability repository declares telemetry contracts', async () => {
    await withRepositoryRoot(createValidObservabilityFiles(), async (repositoryRoot) => {
      const diagnostics = await validateRepositoryObservabilityContract({
        repositoryRoot,
        repositoryServiceContract: createObservabilityServiceContract()
      });

      expect(diagnostics).toEqual([]);
    });
  });

  test('skips repositories that are not zdp-platform-observability', async () => {
    await withRepositoryRoot({}, async (repositoryRoot) => {
      const diagnostics = await validateRepositoryObservabilityContract({
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

  test('fails when required observability contract files are missing', async () => {
    await withRepositoryRoot({}, async (repositoryRoot) => {
      const diagnostics = await validateRepositoryObservabilityContract({
        repositoryRoot,
        repositoryServiceContract: createObservabilityServiceContract()
      });

      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-OBS-001',
        severity: 'error',
        file: 'contracts/telemetry-conventions.yaml',
        path: 'repository.root',
        message:
          'Observability repository must include `contracts/telemetry-conventions.yaml`.'
      });
      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-OBS-001',
        severity: 'error',
        file: 'contracts/dashboard-inventory.yaml',
        path: 'repository.root',
        message:
          'Observability repository must include `contracts/dashboard-inventory.yaml`.'
      });
      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-OBS-001',
        severity: 'error',
        file: 'contracts/alert-rules.yaml',
        path: 'repository.root',
        message:
          'Observability repository must include `contracts/alert-rules.yaml`.'
      });
    });
  });

  test('fails when an observability contract file is not valid YAML', async () => {
    await withRepositoryRoot(
      {
        ...createValidObservabilityFiles(),
        'contracts/dashboard-inventory.yaml': 'dashboards: [platform-health'
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryObservabilityContract({
          repositoryRoot,
          repositoryServiceContract: createObservabilityServiceContract()
        });

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]).toMatchObject({
          ruleId: 'ZDP-OBS-001',
          severity: 'error',
          file: 'contracts/dashboard-inventory.yaml',
          path: 'yaml'
        });
      }
    );
  });

  test('fails when telemetry conventions drift', async () => {
    await withRepositoryRoot(
      {
        ...createValidObservabilityFiles(),
        'contracts/telemetry-conventions.yaml': `
required_attributes:
  all_services:
    - service_id
    - request_id
  deploy_events:
    - image_ref
  jobs:
    - job_id
  webhooks:
    - provider
redacted_attributes:
  - authorization
propagation_headers:
  - traceparent
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryObservabilityContract({
          repositoryRoot,
          repositoryServiceContract: createObservabilityServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-OBS-001',
          severity: 'error',
          file: 'contracts/telemetry-conventions.yaml',
          path: 'required_attributes.all_services',
          message:
            'Observability contract `contracts/telemetry-conventions.yaml` must include `service_repo` in `required_attributes.all_services`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-OBS-001',
          severity: 'error',
          file: 'contracts/telemetry-conventions.yaml',
          path: 'required_attributes.deploy_events',
          message:
            'Observability contract `contracts/telemetry-conventions.yaml` must include `deploy_id` in `required_attributes.deploy_events`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-OBS-001',
          severity: 'error',
          file: 'contracts/telemetry-conventions.yaml',
          path: 'required_attributes.jobs',
          message:
            'Observability contract `contracts/telemetry-conventions.yaml` must include `attempt` in `required_attributes.jobs`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-OBS-001',
          severity: 'error',
          file: 'contracts/telemetry-conventions.yaml',
          path: 'required_attributes.webhooks',
          message:
            'Observability contract `contracts/telemetry-conventions.yaml` must include `webhook_event_id` in `required_attributes.webhooks`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-OBS-001',
          severity: 'error',
          file: 'contracts/telemetry-conventions.yaml',
          path: 'redacted_attributes',
          message:
            'Observability contract `contracts/telemetry-conventions.yaml` must include `ai_prompt` in `redacted_attributes`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-OBS-001',
          severity: 'error',
          file: 'contracts/telemetry-conventions.yaml',
          path: 'propagation_headers',
          message:
            'Observability contract `contracts/telemetry-conventions.yaml` must include `x-request-id` in `propagation_headers`.'
        });
      }
    );
  });

  test('fails when dashboard inventory drifts', async () => {
    await withRepositoryRoot(
      {
        ...createValidObservabilityFiles(),
        'contracts/dashboard-inventory.yaml': `
dashboards:
  - id: platform-health
    status: planned
    required_panels:
      - service availability
      - p95 latency
      - error rate
policy:
  source_of_truth: dashboard
  dashboard_only_changes: allowed
  export_required_before_provider_migration: false
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryObservabilityContract({
          repositoryRoot,
          repositoryServiceContract: createObservabilityServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-OBS-001',
          severity: 'error',
          file: 'contracts/dashboard-inventory.yaml',
          path: 'dashboards',
          message:
            'Observability contract `contracts/dashboard-inventory.yaml` must declare `platform-cost-and-ingest` in `dashboards`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-OBS-001',
          severity: 'error',
          file: 'contracts/dashboard-inventory.yaml',
          path: 'dashboards.platform-health.required_panels',
          message:
            'Observability contract `contracts/dashboard-inventory.yaml` must include `deployment markers` in `required_panels`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-OBS-001',
          severity: 'error',
          file: 'contracts/dashboard-inventory.yaml',
          path: 'policy.source_of_truth',
          message:
            'Observability dashboard inventory must keep repository contracts as source of truth.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-OBS-001',
          severity: 'error',
          file: 'contracts/dashboard-inventory.yaml',
          path: 'policy.dashboard_only_changes',
          message:
            'Observability dashboard inventory must forbid dashboard-only changes.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-OBS-001',
          severity: 'error',
          file: 'contracts/dashboard-inventory.yaml',
          path: 'policy.export_required_before_provider_migration',
          message:
            'Observability dashboard inventory must require export before provider migration.'
        });
      }
    );
  });

  test('fails when dashboard ids or required panels drift', async () => {
    await withRepositoryRoot(
      {
        ...createValidObservabilityFiles(),
        'contracts/dashboard-inventory.yaml': `
dashboards:
  - id: Platform Health
    status: planned
    required_panels:
      - service availability
      - p95 latency
      - error rate
      - deployment markers
  - id: platform-cost-and-ingest
    status: planned
    required_panels:
      - telemetry ingest volume
      - retained log gb
      - provider cost dimensions
policy:
  source_of_truth: repository-contract-first
  dashboard_only_changes: forbidden
  export_required_before_provider_migration: true
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryObservabilityContract({
          repositoryRoot,
          repositoryServiceContract: createObservabilityServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-OBS-001',
          severity: 'error',
          file: 'contracts/dashboard-inventory.yaml',
          path: 'dashboards[0].id',
          message: 'Observability dashboard id `Platform Health` must use kebab-case.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-OBS-001',
          severity: 'error',
          file: 'contracts/dashboard-inventory.yaml',
          path: 'dashboards.platform-cost-and-ingest.required_panels',
          message:
            'Observability contract `contracts/dashboard-inventory.yaml` must include `alert noise review` in `required_panels`.'
        });
      }
    );
  });

  test('fails when alert rules drift', async () => {
    await withRepositoryRoot(
      {
        ...createValidObservabilityFiles(),
        'contracts/alert-rules.yaml': `
alerts:
  - id: ServiceHealthcheckFailing
    status: draft
    severity: critical
    signal: ReadinessFailureRate
    action: rollback
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryObservabilityContract({
          repositoryRoot,
          repositoryServiceContract: createObservabilityServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-OBS-001',
          severity: 'error',
          file: 'contracts/alert-rules.yaml',
          path: 'alerts',
          message:
            'Observability contract `contracts/alert-rules.yaml` must declare `backup-restore-drill-failed` in `alerts`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-OBS-001',
          severity: 'error',
          file: 'contracts/alert-rules.yaml',
          path: 'alerts',
          message:
            'Observability contract `contracts/alert-rules.yaml` must declare `service-healthcheck-failing` in `alerts`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-OBS-001',
          severity: 'error',
          file: 'contracts/alert-rules.yaml',
          path: 'alerts',
          message:
            'Observability contract `contracts/alert-rules.yaml` must declare `telemetry-sensitive-data-detected` in `alerts`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-OBS-001',
          severity: 'error',
          file: 'contracts/alert-rules.yaml',
          path: 'alerts[0].id',
          message:
            'Observability alert id `ServiceHealthcheckFailing` must use kebab-case.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-OBS-001',
          severity: 'error',
          file: 'contracts/alert-rules.yaml',
          path: 'alerts[0].severity',
          message:
            'Observability alert severity `critical` must be one of info, warning, review, page.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-OBS-001',
          severity: 'error',
          file: 'contracts/alert-rules.yaml',
          path: 'alerts[0].signal',
          message:
            'Observability alert signal `ReadinessFailureRate` must use snake_case.'
        });
      }
    );
  });

  test('fails when alert fields are blank', async () => {
    await withRepositoryRoot(
      {
        ...createValidObservabilityFiles(),
        'contracts/alert-rules.yaml': `
alerts:
  - id: service-healthcheck-failing
    status: draft
    severity: page
    signal: readiness_failure_rate
    action: ""
  - id: backup-restore-drill-failed
    status: draft
    severity: page
    signal: restore_drill_failure
    action: freeze destructive infra changes
  - id: telemetry-sensitive-data-detected
    status: draft
    severity: page
    signal: sensitive_pattern_in_logs
    action: stop ingestion and start redaction review
  - id: provider-ingest-failing
    status: draft
    severity: review
    signal: telemetry_provider_ingest_error
    action: preserve local evidence and reduce nonessential telemetry
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryObservabilityContract({
          repositoryRoot,
          repositoryServiceContract: createObservabilityServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-OBS-001',
          severity: 'error',
          file: 'contracts/alert-rules.yaml',
          path: 'alerts[0].action',
          message: 'Observability alert at index 0 must declare string field `action`.'
        });
      }
    );
  });

  test('fails when observability contract string lists include non-string items', async () => {
    await withRepositoryRoot(
      {
        ...createValidObservabilityFiles(),
        'contracts/telemetry-conventions.yaml': `
required_attributes:
  all_services:
    - service_id
    - service_repo
    - environment
    - cost_center
    - request_id
    - trace_id
    - bad: object
  deploy_events:
    - deploy_id
    - image_ref
  jobs:
    - job_id
    - job_type
    - attempt
  webhooks:
    - provider
    - webhook_event_id
redacted_attributes:
  - authorization
  - cookie
  - secret
  - token
  - database_url
  - payment_payload
  - ai_prompt
propagation_headers:
  - traceparent
  - x-request-id
`,
        'contracts/dashboard-inventory.yaml': `
dashboards:
  - id: platform-health
    status: planned
    required_panels:
      - service availability
      - p95 latency
      - error rate
      - deployment markers
      - bad: object
  - id: platform-cost-and-ingest
    status: planned
    required_panels:
      - telemetry ingest volume
      - retained log gb
      - provider cost dimensions
      - alert noise review
policy:
  source_of_truth: repository-contract-first
  dashboard_only_changes: forbidden
  export_required_before_provider_migration: true
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryObservabilityContract({
          repositoryRoot,
          repositoryServiceContract: createObservabilityServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-OBS-001',
          severity: 'error',
          file: 'contracts/telemetry-conventions.yaml',
          path: 'required_attributes.all_services',
          message:
            'Observability contract `contracts/telemetry-conventions.yaml` must declare `required_attributes.all_services` as a string list.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-OBS-001',
          severity: 'error',
          file: 'contracts/dashboard-inventory.yaml',
          path: 'dashboards[0].required_panels',
          message:
            'Observability contract `contracts/dashboard-inventory.yaml` must declare `required_panels` as a string list.'
        });
      }
    );
  });

  test('fails when observability checker files and scripts drift', async () => {
    await withRepositoryRoot(
      {
        ...createValidObservabilityFiles(),
        'package.json': `
{
  "scripts": {
    "check": "bun test"
  }
}
`,
        'src/observability-contracts/validator.ts': `
export function validateObservabilityContracts(): void {}
`,
        'tests/observability-contracts.test.ts': `
import { test } from 'bun:test';
test('observability placeholder', () => {});
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryObservabilityContract({
          repositoryRoot,
          repositoryServiceContract: createObservabilityServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-OBS-001',
          severity: 'error',
          file: 'package.json',
          path: 'scripts.test',
          message: 'Observability package must declare `test` script.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-OBS-001',
          severity: 'error',
          file: 'package.json',
          path: 'scripts.contracts:check',
          message:
            'Observability package must declare `contracts:check` script.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-OBS-001',
          severity: 'error',
          file: 'package.json',
          path: 'scripts.check',
          message:
            'Observability package `check` script must include `tsc --noEmit`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-OBS-001',
          severity: 'error',
          file: 'package.json',
          path: 'scripts.check',
          message:
            'Observability package `check` script must include `bun run contracts:check`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-OBS-001',
          severity: 'error',
          file: 'src/observability-contracts/validator.ts',
          path: 'source',
          message:
            'Observability checker source must include `REQUIRED_SERVICE_ATTRIBUTES`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-OBS-001',
          severity: 'error',
          file: 'tests/observability-contracts.test.ts',
          path: 'source',
          message:
            'Observability checker source must include test case `fails when traceparent propagation is missing`.'
        });
      }
    );
  });

  test('fails when observability source proof is only string literal stubs', async () => {
    await withRepositoryRoot(
      {
        ...createValidObservabilityFiles(),
        'src/observability-contracts/validator.ts': `
const fakeProof = [
  'REQUIRED_SERVICE_ATTRIBUTES',
  'REQUIRED_DEPLOY_EVENT_ATTRIBUTES',
  'REQUIRED_JOB_ATTRIBUTES',
  'REQUIRED_WEBHOOK_ATTRIBUTES',
  'REQUIRED_PROPAGATION_HEADERS',
  'FORBIDDEN_SENSITIVE_FIELDS',
  'REQUIRED_DASHBOARD_PANELS',
  'REQUIRED_ALERT_IDS',
  'OBS_TELEMETRY_DEPLOY_EVENT_ATTRIBUTE_MISSING',
  'OBS_TELEMETRY_JOB_ATTRIBUTE_MISSING',
  'OBS_TELEMETRY_WEBHOOK_ATTRIBUTE_MISSING',
  'OBS_DASHBOARD_ONLY_CHANGES_ALLOWED',
  'OBS_DASHBOARD_REQUIRED_PANEL_MISSING',
  'OBS_ALERT_FIELD_MISSING',
  'OBS_ALERT_REQUIRED_ID_MISSING',
  'export function validateObservabilityContracts',
  'function validateRequiredListEntries'
];
export { fakeProof };
`,
        'tests/observability-contracts.test.ts': `
const fakeProof = [
  'fails when a required service attribute is missing',
  'fails when deploy, job, or webhook telemetry attributes are missing',
  'fails when traceparent propagation is missing',
  'fails when sensitive fields are not redacted',
  'fails when dashboard-only changes are allowed',
  'fails when required dashboard panels are missing',
  'fails when an alert rule misses a required field',
  'fails when a required alert rule disappears',
  'test(',
  'expect(',
  'validateObservabilityContracts'
];
export { fakeProof };
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryObservabilityContract({
          repositoryRoot,
          repositoryServiceContract: createObservabilityServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-OBS-001',
          severity: 'error',
          file: 'src/observability-contracts/validator.ts',
          path: 'source',
          message:
            'Observability checker source must include code fragment `export function validateObservabilityContracts`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-OBS-001',
          severity: 'error',
          file: 'tests/observability-contracts.test.ts',
          path: 'source',
          message:
            'Observability checker source must include test case `fails when a required service attribute is missing`.'
        });
      }
    );
  });

  test('fails when observability test proof is only a string list plus placeholder test', async () => {
    await withRepositoryRoot(
      {
        ...createValidObservabilityFiles(),
        'tests/observability-contracts.test.ts': `
import { expect, test } from 'bun:test';
import { validateObservabilityContracts } from '../src/observability-contracts/validator';
const fakeProof = [
  'fails when a required service attribute is missing',
  'fails when deploy, job, or webhook telemetry attributes are missing',
  'fails when traceparent propagation is missing',
  'fails when sensitive fields are not redacted',
  'fails when dashboard-only changes are allowed',
  'fails when required dashboard panels are missing',
  'fails when an alert rule misses a required field',
  'fails when a required alert rule disappears'
];
test('observability placeholder', () => {
  expect(fakeProof).toContain('fails when a required service attribute is missing');
  expect(validateObservabilityContracts).toBeDefined();
});
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryObservabilityContract({
          repositoryRoot,
          repositoryServiceContract: createObservabilityServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-OBS-001',
          severity: 'error',
          file: 'tests/observability-contracts.test.ts',
          path: 'source',
          message:
            'Observability checker source must include test case `fails when a required service attribute is missing`.'
        });
      }
    );
  });
});

async function withRepositoryRoot(
  files: Record<string, string>,
  callback: (repositoryRoot: string) => Promise<void>
): Promise<void> {
  const repositoryRoot = await mkdtemp(join(tmpdir(), 'zdp-observability-contract-'));

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

function createObservabilityServiceContract(): unknown {
  return {
    service: {
      repo: 'zdp-platform-observability'
    }
  };
}

function createValidObservabilityFiles(): Record<string, string> {
  return {
    ...createValidObservabilityCheckerFiles(),
    'contracts/telemetry-conventions.yaml': `
required_attributes:
  all_services:
    - service_id
    - service_repo
    - environment
    - cost_center
    - request_id
    - trace_id
  deploy_events:
    - deploy_id
    - image_ref
  jobs:
    - job_id
    - job_type
    - attempt
  webhooks:
    - provider
    - webhook_event_id
redacted_attributes:
  - authorization
  - cookie
  - secret
  - token
  - database_url
  - payment_payload
  - ai_prompt
propagation_headers:
  - traceparent
  - x-request-id
`,
    'contracts/dashboard-inventory.yaml': `
dashboards:
  - id: platform-health
    status: planned
    required_panels:
      - service availability
      - p95 latency
      - error rate
      - deployment markers
  - id: platform-cost-and-ingest
    status: planned
    required_panels:
      - telemetry ingest volume
      - retained log gb
      - provider cost dimensions
      - alert noise review
policy:
  source_of_truth: repository-contract-first
  dashboard_only_changes: forbidden
  export_required_before_provider_migration: true
`,
    'contracts/alert-rules.yaml': `
alerts:
  - id: service-healthcheck-failing
    status: draft
    severity: page
    signal: readiness_failure_rate
    action: route traffic away or rollback recent deployment
  - id: backup-restore-drill-failed
    status: draft
    severity: page
    signal: restore_drill_failure
    action: freeze destructive infra changes
  - id: telemetry-sensitive-data-detected
    status: draft
    severity: page
    signal: sensitive_pattern_in_logs
    action: stop ingestion and start redaction review
  - id: provider-ingest-failing
    status: draft
    severity: review
    signal: telemetry_provider_ingest_error
    action: preserve local evidence and reduce nonessential telemetry
`
  };
}

function createValidObservabilityCheckerFiles(): Record<string, string> {
  return {
    'package.json': `
{
  "scripts": {
    "check": "tsc --noEmit && bun test && bun run contracts:check",
    "test": "bun test",
    "contracts:check": "bun scripts/check-observability-contracts.ts"
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
    'scripts/check-observability-contracts.ts': `
import { runObservabilityContractCheckCli } from '../src/observability-contracts/cli';
const exitCode = await runObservabilityContractCheckCli(process.argv.slice(2));
process.exit(exitCode);
`,
    'src/observability-contracts/cli.ts': `
export async function runObservabilityContractCheckCli(): Promise<number> {
  return 0;
}
`,
    'src/observability-contracts/parser.ts': `
const files = [
  'contracts/telemetry-conventions.yaml',
  'contracts/dashboard-inventory.yaml',
  'contracts/alert-rules.yaml'
];
export { files };
`,
    'src/observability-contracts/types.ts': `
export interface ObservabilityDiagnostic {
  readonly code: string;
}
`,
    'src/observability-contracts/validator.ts': `
const REQUIRED_SERVICE_ATTRIBUTES = [
  'service_id',
  'service_repo',
  'environment',
  'cost_center',
  'request_id',
  'trace_id'
];
const REQUIRED_DEPLOY_EVENT_ATTRIBUTES = ['deploy_id', 'image_ref'];
const REQUIRED_JOB_ATTRIBUTES = ['job_id', 'job_type', 'attempt'];
const REQUIRED_WEBHOOK_ATTRIBUTES = ['provider', 'webhook_event_id'];
const REQUIRED_PROPAGATION_HEADERS = ['traceparent', 'x-request-id'];
const FORBIDDEN_SENSITIVE_FIELDS = [
  'authorization',
  'cookie',
  'secret',
  'token',
  'database_url',
  'payment_payload',
  'ai_prompt'
];
const REQUIRED_DASHBOARD_PANELS = {
  'platform-health': [
    'service availability',
    'p95 latency',
    'error rate',
    'deployment markers'
  ],
  'platform-cost-and-ingest': [
    'telemetry ingest volume',
    'retained log gb',
    'provider cost dimensions',
    'alert noise review'
  ]
};
const REQUIRED_ALERT_IDS = [
  'service-healthcheck-failing',
  'backup-restore-drill-failed',
  'telemetry-sensitive-data-detected',
  'provider-ingest-failing'
];
const OBS_TELEMETRY_DEPLOY_EVENT_ATTRIBUTE_MISSING = 'OBS_TELEMETRY_DEPLOY_EVENT_ATTRIBUTE_MISSING';
const OBS_TELEMETRY_JOB_ATTRIBUTE_MISSING = 'OBS_TELEMETRY_JOB_ATTRIBUTE_MISSING';
const OBS_TELEMETRY_WEBHOOK_ATTRIBUTE_MISSING = 'OBS_TELEMETRY_WEBHOOK_ATTRIBUTE_MISSING';
const OBS_DASHBOARD_ONLY_CHANGES_ALLOWED = 'OBS_DASHBOARD_ONLY_CHANGES_ALLOWED';
const OBS_DASHBOARD_REQUIRED_PANEL_MISSING = 'OBS_DASHBOARD_REQUIRED_PANEL_MISSING';
const OBS_ALERT_FIELD_MISSING = 'OBS_ALERT_FIELD_MISSING';
const OBS_ALERT_REQUIRED_ID_MISSING = 'OBS_ALERT_REQUIRED_ID_MISSING';

export function validateObservabilityContracts(): string[] {
  return [
    ...validateRequiredListEntries(REQUIRED_SERVICE_ATTRIBUTES),
    ...validateRequiredListEntries(REQUIRED_DEPLOY_EVENT_ATTRIBUTES),
    ...validateRequiredListEntries(REQUIRED_JOB_ATTRIBUTES),
    ...validateRequiredListEntries(REQUIRED_WEBHOOK_ATTRIBUTES),
    ...validateRequiredListEntries(REQUIRED_PROPAGATION_HEADERS),
    ...validateRequiredListEntries(FORBIDDEN_SENSITIVE_FIELDS),
    ...validateRequiredListEntries(Object.keys(REQUIRED_DASHBOARD_PANELS)),
    ...validateRequiredListEntries(REQUIRED_ALERT_IDS),
    OBS_TELEMETRY_DEPLOY_EVENT_ATTRIBUTE_MISSING,
    OBS_TELEMETRY_JOB_ATTRIBUTE_MISSING,
    OBS_TELEMETRY_WEBHOOK_ATTRIBUTE_MISSING,
    OBS_DASHBOARD_ONLY_CHANGES_ALLOWED,
    OBS_DASHBOARD_REQUIRED_PANEL_MISSING,
    OBS_ALERT_FIELD_MISSING,
    OBS_ALERT_REQUIRED_ID_MISSING
  ];
}

function validateRequiredListEntries(entries: readonly string[]): string[] {
  return [...entries];
}

export const observabilityCheckerMarkers = {
  REQUIRED_SERVICE_ATTRIBUTES,
  REQUIRED_DEPLOY_EVENT_ATTRIBUTES,
  REQUIRED_JOB_ATTRIBUTES,
  REQUIRED_WEBHOOK_ATTRIBUTES,
  REQUIRED_PROPAGATION_HEADERS,
  FORBIDDEN_SENSITIVE_FIELDS,
  REQUIRED_DASHBOARD_PANELS,
  REQUIRED_ALERT_IDS,
  OBS_TELEMETRY_DEPLOY_EVENT_ATTRIBUTE_MISSING,
  OBS_TELEMETRY_JOB_ATTRIBUTE_MISSING,
  OBS_TELEMETRY_WEBHOOK_ATTRIBUTE_MISSING,
  OBS_DASHBOARD_ONLY_CHANGES_ALLOWED,
  OBS_DASHBOARD_REQUIRED_PANEL_MISSING,
  OBS_ALERT_FIELD_MISSING,
  OBS_ALERT_REQUIRED_ID_MISSING
};
`,
    'tests/observability-contracts.test.ts': `
import { expect, test } from 'bun:test';
import { validateObservabilityContracts } from '../src/observability-contracts/validator';

test('fails when a required service attribute is missing', () => {
  expect(validateObservabilityContracts()).toContain('service_id');
});

test('fails when deploy, job, or webhook telemetry attributes are missing', () => {
  expect(validateObservabilityContracts()).toContain('deploy_id');
});

test('fails when traceparent propagation is missing', () => {
  expect(validateObservabilityContracts()).toContain('traceparent');
});

test('fails when sensitive fields are not redacted', () => {
  expect(validateObservabilityContracts()).toContain('database_url');
});

test('fails when dashboard-only changes are allowed', () => {
  expect(validateObservabilityContracts()).toContain('OBS_DASHBOARD_ONLY_CHANGES_ALLOWED');
});

test('fails when required dashboard panels are missing', () => {
  expect(validateObservabilityContracts()).toContain('platform-health');
});

test('fails when an alert rule misses a required field', () => {
  expect(validateObservabilityContracts()).toContain('OBS_ALERT_FIELD_MISSING');
});

test('fails when a required alert rule disappears', () => {
  expect(validateObservabilityContracts()).toContain('provider-ingest-failing');
});
`
  };
}
