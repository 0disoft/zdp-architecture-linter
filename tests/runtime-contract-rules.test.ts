import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { validateRepositoryRuntimeContract } from '../src/runtime-contract-rules.ts';

describe('runtime smoke contract rules', () => {
  test('passes when the runtime repository declares smoke contracts', async () => {
    await withRepositoryRoot(createValidRuntimeFiles(), async (repositoryRoot) => {
      const diagnostics = await validateRepositoryRuntimeContract({
        repositoryRoot,
        repositoryServiceContract: createRuntimeServiceContract()
      });

      expect(diagnostics).toEqual([]);
    });
  });

  test('skips repositories that are not zdp-platform-runtime', async () => {
    await withRepositoryRoot({}, async (repositoryRoot) => {
      const diagnostics = await validateRepositoryRuntimeContract({
        repositoryRoot,
        repositoryServiceContract: {
          service: {
            repo: 'zdp-web-apps'
          }
        }
      });

      expect(diagnostics).toEqual([]);
    });
  });

  test('fails when required runtime contract files are missing', async () => {
    await withRepositoryRoot({}, async (repositoryRoot) => {
      const diagnostics = await validateRepositoryRuntimeContract({
        repositoryRoot,
        repositoryServiceContract: createRuntimeServiceContract()
      });

      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-RUNTIME-001',
        severity: 'error',
        file: 'contracts/healthcheck.yaml',
        path: 'repository.root',
        message: 'Runtime repository must include `contracts/healthcheck.yaml`.'
      });
      expect(diagnostics).toHaveLength(4);
    });
  });

  test('fails when a runtime contract file is not valid YAML', async () => {
    await withRepositoryRoot(
      {
        ...createValidRuntimeFiles(),
        'contracts/smoke-targets.yaml': 'targets: [core-api'
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryRuntimeContract({
          repositoryRoot,
          repositoryServiceContract: createRuntimeServiceContract()
        });

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]).toMatchObject({
          ruleId: 'ZDP-RUNTIME-001',
          severity: 'error',
          file: 'contracts/smoke-targets.yaml',
          path: 'yaml'
        });
      }
    );
  });

  test('fails when healthcheck fields drift', async () => {
    await withRepositoryRoot(
      {
        ...createValidRuntimeFiles(),
        'contracts/healthcheck.yaml': `
healthcheck:
  liveness:
    method: POST
    default_path: /healthz
    timeout_seconds: 5
    success_status: 204
    response:
      content_type: text/plain
      required_fields:
        ok: false
  readiness:
    method: GET
    default_path: /readyz
    timeout_seconds: 3
    success_status: 200
    response:
      content_type: application/json
      required_fields:
        ready: boolean
        checks: string_array
  smoke:
    targets_ref: other.yaml
headers:
  required: []
  propagated:
    - traceparent
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryRuntimeContract({
          repositoryRoot,
          repositoryServiceContract: createRuntimeServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-RUNTIME-001',
          severity: 'error',
          file: 'contracts/healthcheck.yaml',
          path: 'healthcheck.liveness.method',
          message: 'Runtime liveness check must use `GET`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-RUNTIME-001',
          severity: 'error',
          file: 'contracts/healthcheck.yaml',
          path: 'healthcheck.smoke.targets_ref',
          message: 'Runtime smoke contract must reference `smoke-targets.yaml`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-RUNTIME-001',
          severity: 'error',
          file: 'contracts/healthcheck.yaml',
          path: 'headers.required',
          message:
            'Runtime contract `contracts/healthcheck.yaml` must include `x-request-id` in `headers.required`.'
        });
      }
    );
  });

  test('fails when smoke targets drift', async () => {
    await withRepositoryRoot(
      {
        ...createValidRuntimeFiles(),
        'contracts/smoke-targets.yaml': `
targets:
  - id: core-api
    repo: zdp-core-platform
    service_id: core-api
    healthz:
      method: GET
      path: /healthz
      timeout_seconds: 2
      expect_json:
        ok: true
        service: core-api
    readyz:
      method: GET
      path: /readyz
      timeout_seconds: 3
      expect_json:
        ready: false
        checks: []
    blocked_production_when: []
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryRuntimeContract({
          repositoryRoot,
          repositoryServiceContract: createRuntimeServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-RUNTIME-001',
          severity: 'error',
          file: 'contracts/smoke-targets.yaml',
          path: 'targets.app-console',
          message: 'Runtime smoke contract must declare `app-console` target.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-RUNTIME-001',
          severity: 'error',
          file: 'contracts/smoke-targets.yaml',
          path: 'targets.core-api.readyz.expect_json.ready',
          message:
            'Runtime `core-api` readyz smoke target must expect `ready: true`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-RUNTIME-001',
          severity: 'error',
          file: 'contracts/smoke-targets.yaml',
          path: 'targets.core-api.readyz.expect_json.checks',
          message:
            'Runtime contract `contracts/smoke-targets.yaml` must include `contracts` in `readyz.expect_json.checks`.'
        });
      }
    );
  });

  test('fails when deployment and rollback contracts drift', async () => {
    await withRepositoryRoot(
      {
        ...createValidRuntimeFiles(),
        'contracts/deployment-template.yaml': `
deployment_template:
  required_fields:
    - service_id
  forbidden_fields:
    - secret_values
process_model:
  web_process_required: false
  state_in_process_memory_allowed: true
  graceful_shutdown_required: false
`,
        'contracts/rollback.yaml': `
rollback:
  required: false
  record_fields:
    - deploy_id
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryRuntimeContract({
          repositoryRoot,
          repositoryServiceContract: createRuntimeServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-RUNTIME-001',
          severity: 'error',
          file: 'contracts/deployment-template.yaml',
          path: 'deployment_template.required_fields',
          message:
            'Runtime contract `contracts/deployment-template.yaml` must include `service_repo` in `deployment_template.required_fields`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-RUNTIME-001',
          severity: 'error',
          file: 'contracts/deployment-template.yaml',
          path: 'process_model.state_in_process_memory_allowed',
          message: 'Runtime deployment template must forbid process-memory state.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-RUNTIME-001',
          severity: 'error',
          file: 'contracts/rollback.yaml',
          path: 'rollback.required',
          message: 'Runtime rollback contract must require rollback.'
        });
      }
    );
  });
});

async function withRepositoryRoot(
  files: Record<string, string>,
  callback: (repositoryRoot: string) => Promise<void>
): Promise<void> {
  const repositoryRoot = await mkdtemp(join(tmpdir(), 'zdp-runtime-contract-'));

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

function createRuntimeServiceContract(): unknown {
  return {
    service: {
      repo: 'zdp-platform-runtime'
    }
  };
}

function createValidRuntimeFiles(): Record<string, string> {
  return {
    'contracts/healthcheck.yaml': `
healthcheck:
  liveness:
    method: GET
    default_path: /healthz
    timeout_seconds: 2
    success_status: 200
    response:
      content_type: application/json
      required_fields:
        ok: true
        service: string
  readiness:
    method: GET
    default_path: /readyz
    timeout_seconds: 3
    success_status: 200
    response:
      content_type: application/json
      required_fields:
        ready: boolean
        checks: string_array
  smoke:
    targets_ref: smoke-targets.yaml
headers:
  required:
    - x-request-id
  propagated:
    - traceparent
    - x-request-id
`,
    'contracts/smoke-targets.yaml': `
targets:
  - id: core-api
    repo: zdp-core-platform
    service_id: core-api
    healthz:
      method: GET
      path: /healthz
      timeout_seconds: 2
      expect_json:
        ok: true
        service: core-api
    readyz:
      method: GET
      path: /readyz
      timeout_seconds: 3
      expect_json:
        ready: true
        checks:
          - contracts
    blocked_production_when:
      - readyz checks omit contracts
  - id: app-console
    repo: zdp-web-apps
    service_id: app-console
    healthz:
      method: GET
      path: /healthz
      timeout_seconds: 2
      expect_json:
        ok: true
        service: app-console
    readyz:
      method: GET
      path: /readyz
      timeout_seconds: 3
      required_env:
        - ZDP_CORE_API_BASE_URL
      expect_json_when_configured:
        ready: true
        service: app-console
        upstreams:
          - core-api
      expect_json_when_missing_env:
        ready: false
        missing:
          - ZDP_CORE_API_BASE_URL
    required_env:
      - ZDP_CORE_API_BASE_URL
    blocked_production_when:
      - ZDP_CORE_API_BASE_URL is missing
      - readyz does not report core-api as an upstream
      - app shell attempts direct core, money, privacy, or credential datastore access
`,
    'contracts/deployment-template.yaml': `
deployment_template:
  required_fields:
    - service_id
    - service_repo
    - environment
    - image_ref
    - deploy_id
    - healthcheck
    - rollback
    - env_schema_ref
  forbidden_fields:
    - secret_values
    - product_business_logic
    - database_migration_body
process_model:
  web_process_required: true
  state_in_process_memory_allowed: false
  graceful_shutdown_required: true
`,
    'contracts/rollback.yaml': `
rollback:
  required: true
  record_fields:
    - deploy_id
    - previous_image_ref
    - target_image_ref
    - actor
    - reason
    - trace_id
`
  };
}
