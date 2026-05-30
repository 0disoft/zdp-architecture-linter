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
      }
    );
  });

  test('fails when alert rules drift', async () => {
    await withRepositoryRoot(
      {
        ...createValidObservabilityFiles(),
        'contracts/alert-rules.yaml': `
alerts:
  - id: service-healthcheck-failing
    status: draft
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
            'Observability contract `contracts/alert-rules.yaml` must declare `telemetry-sensitive-data-detected` in `alerts`.'
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
    'contracts/telemetry-conventions.yaml': `
required_attributes:
  all_services:
    - service_id
    - service_repo
    - environment
    - cost_center
    - request_id
    - trace_id
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
  - id: platform-cost-and-ingest
    status: planned
policy:
  source_of_truth: repository-contract-first
  dashboard_only_changes: forbidden
  export_required_before_provider_migration: true
`,
    'contracts/alert-rules.yaml': `
alerts:
  - id: service-healthcheck-failing
    status: draft
  - id: backup-restore-drill-failed
    status: draft
  - id: telemetry-sensitive-data-detected
    status: draft
  - id: provider-ingest-failing
    status: draft
`
  };
}
