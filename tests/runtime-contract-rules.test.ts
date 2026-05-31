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
      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-RUNTIME-001',
        severity: 'error',
        file: 'package.json',
        path: 'repository.root',
        message: 'Runtime repository must include `package.json`.'
      });
      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-RUNTIME-001',
        severity: 'error',
        file: 'scripts/smoke-runner.ts',
        path: 'repository.root',
        message: 'Runtime repository must include `scripts/smoke-runner.ts`.'
      });
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
          path: 'targets.edge-webhook-ingress',
          message:
            'Runtime smoke contract must declare `edge-webhook-ingress` target.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-RUNTIME-001',
          severity: 'error',
          file: 'contracts/smoke-targets.yaml',
          path: 'targets.money-api',
          message: 'Runtime smoke contract must declare `money-api` target.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-RUNTIME-001',
          severity: 'error',
          file: 'contracts/smoke-targets.yaml',
          path: 'targets.connectors-platform',
          message:
            'Runtime smoke contract must declare `connectors-platform` target.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-RUNTIME-001',
          severity: 'error',
          file: 'contracts/smoke-targets.yaml',
          path: 'contract_checks',
          message:
            'Runtime smoke contract must declare a `contract_checks` array.'
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

  test('fails when the edge webhook ingress smoke target drifts', async () => {
    await withRepositoryRoot(
      {
        ...createValidRuntimeFiles(),
        'contracts/smoke-targets.yaml': createSmokeTargetsYaml({
          edgeWebhookIngress: `
  - id: edge-webhook-ingress
    repo: zdp-edge-workers
    service_id: edge-webhook-ingress
    process: web
    healthz:
      method: GET
      path: /healthz
      timeout_seconds: 2
      expect_json:
        ok: true
        service: wrong-edge-service
    readyz:
      method: GET
      path: /readyz
      timeout_seconds: 3
      expect_json:
        ready: false
        checks: []
    blocked_production_when:
      - x-request-id is not propagated
`
        })
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
          path: 'targets.edge-webhook-ingress.process',
          message:
            'Runtime `edge-webhook-ingress` smoke target must declare process `edge-worker`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-RUNTIME-001',
          severity: 'error',
          file: 'contracts/smoke-targets.yaml',
          path: 'targets.edge-webhook-ingress.healthz.expect_json.service',
          message:
            'Runtime `edge-webhook-ingress` healthz smoke target must expect service `edge-webhook-ingress`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-RUNTIME-001',
          severity: 'error',
          file: 'contracts/smoke-targets.yaml',
          path: 'targets.edge-webhook-ingress.readyz.expect_json.ready',
          message:
            'Runtime `edge-webhook-ingress` readyz smoke target must expect `ready: true`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-RUNTIME-001',
          severity: 'error',
          file: 'contracts/smoke-targets.yaml',
          path: 'targets.edge-webhook-ingress.blocked_production_when',
          message:
            'Runtime contract `contracts/smoke-targets.yaml` must include `traceparent is not propagated when present` in `blocked_production_when`.'
        });
      }
    );
  });

  test('fails when the money api smoke target drifts', async () => {
    await withRepositoryRoot(
      {
        ...createValidRuntimeFiles(),
        'contracts/smoke-targets.yaml': createSmokeTargetsYaml({
          moneyApi: `
  - id: money-api
    repo: zdp-money-platform
    service_id: money-api
    process: worker
    healthz:
      method: GET
      path: /healthz
      timeout_seconds: 2
      expect_json:
        ok: true
        service: wrong-money-service
    readyz:
      method: GET
      path: /readyz
      timeout_seconds: 3
      expect_json:
        ready: false
        checks: []
    blocked_production_when:
      - readyz checks omit contracts
`
        })
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
          path: 'targets.money-api.process',
          message: 'Runtime `money-api` smoke target must declare process `web`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-RUNTIME-001',
          severity: 'error',
          file: 'contracts/smoke-targets.yaml',
          path: 'targets.money-api.healthz.expect_json.service',
          message:
            'Runtime `money-api` healthz smoke target must expect service `money-api`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-RUNTIME-001',
          severity: 'error',
          file: 'contracts/smoke-targets.yaml',
          path: 'targets.money-api.readyz.expect_json.ready',
          message:
            'Runtime `money-api` readyz smoke target must expect `ready: true`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-RUNTIME-001',
          severity: 'error',
          file: 'contracts/smoke-targets.yaml',
          path: 'targets.money-api.blocked_production_when',
          message:
            'Runtime contract `contracts/smoke-targets.yaml` must include `smoke check requires a real payment, refund, credit mutation, customer account, or provider credential` in `blocked_production_when`.'
        });
      }
    );
  });

  test('fails when the connectors platform smoke target drifts', async () => {
    await withRepositoryRoot(
      {
        ...createValidRuntimeFiles(),
        'contracts/smoke-targets.yaml': createSmokeTargetsYaml({
          connectorsPlatform: `
  - id: connectors-platform
    repo: zdp-connectors-platform
    service_id: connectors-platform
    process: worker
    healthz:
      method: GET
      path: /healthz
      timeout_seconds: 2
      expect_json:
        ok: true
        service: wrong-connectors-service
    readyz:
      method: GET
      path: /readyz
      timeout_seconds: 3
      expect_json:
        ready: false
        checks: []
    blocked_production_when:
      - readyz checks omit contracts
`
        })
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
          path: 'targets.connectors-platform.process',
          message:
            'Runtime `connectors-platform` smoke target must declare process `web`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-RUNTIME-001',
          severity: 'error',
          file: 'contracts/smoke-targets.yaml',
          path: 'targets.connectors-platform.healthz.expect_json.service',
          message:
            'Runtime `connectors-platform` healthz smoke target must expect service `connectors-platform`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-RUNTIME-001',
          severity: 'error',
          file: 'contracts/smoke-targets.yaml',
          path: 'targets.connectors-platform.readyz.expect_json.ready',
          message:
            'Runtime `connectors-platform` readyz smoke target must expect `ready: true`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-RUNTIME-001',
          severity: 'error',
          file: 'contracts/smoke-targets.yaml',
          path: 'targets.connectors-platform.blocked_production_when',
          message:
            'Runtime contract `contracts/smoke-targets.yaml` must include `smoke check requires a real OAuth provider, source payload, plaintext credential, webhook delivery, or user data sync` in `blocked_production_when`.'
        });
      }
    );
  });

  test('fails when the platform security contract check target drifts', async () => {
    await withRepositoryRoot(
      {
        ...createValidRuntimeFiles(),
        'contracts/smoke-targets.yaml': createSmokeTargetsYaml({
          contractChecks: `
contract_checks:
  - id: platform-security-contracts
    repo: zdp-platform-security
    service_id: platform-security
    process: web
    command: bun test
    required_files:
      - contracts/security-baseline.yaml
    expected_evidence:
      - security contracts parse without diagnostics
    blocked_production_when:
      - security baseline contracts are missing or unparseable
`
        })
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
          path: 'contract_checks.platform-security-contracts.process',
          message:
            'Runtime `platform-security-contracts` check target must declare process `one-shot-checker`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-RUNTIME-001',
          severity: 'error',
          file: 'contracts/smoke-targets.yaml',
          path: 'contract_checks.platform-security-contracts.command',
          message:
            'Runtime `platform-security-contracts` check target must run `bun run contracts:check`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-RUNTIME-001',
          severity: 'error',
          file: 'contracts/smoke-targets.yaml',
          path: 'contract_checks.platform-security-contracts.required_files',
          message:
            'Runtime contract `contracts/smoke-targets.yaml` must include `contracts/threat-model-template.yaml` in `required_files`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-RUNTIME-001',
          severity: 'error',
          file: 'contracts/smoke-targets.yaml',
          path: 'contract_checks.platform-security-contracts.blocked_production_when',
          message:
            'Runtime contract `contracts/smoke-targets.yaml` must include `contract checker requires scanner output, provider account, exploit payload, private incident detail, or secret value` in `blocked_production_when`.'
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

  test('fails when smoke runner files and scripts drift', async () => {
    await withRepositoryRoot(
      {
        ...createValidRuntimeFiles(),
        'package.json': `
{
  "scripts": {
    "check": "bun test"
  }
}
`,
        'src/smoke-runner/runner.ts': `
export function runSmokeTargets(): void {}
`,
        'tests/smoke-runner.test.ts': `
import { test } from 'bun:test';
test('smoke runner placeholder', () => {});
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
          file: 'package.json',
          path: 'scripts.test',
          message: 'Runtime package must declare `test` script.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-RUNTIME-001',
          severity: 'error',
          file: 'package.json',
          path: 'scripts.smoke:plan',
          message: 'Runtime package must declare `smoke:plan` script.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-RUNTIME-001',
          severity: 'error',
          file: 'src/smoke-runner/runner.ts',
          path: 'source',
          message:
            'Runtime smoke runner source must include `base_url_not_provided`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-RUNTIME-001',
          severity: 'error',
          file: 'tests/smoke-runner.test.ts',
          path: 'source',
          message:
            'Runtime smoke runner source must include `fails closed when run mode has no base URL`.'
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
    'contracts/smoke-targets.yaml': createSmokeTargetsYaml(),
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
`,
    'package.json': `
{
  "scripts": {
    "check": "bun test",
    "test": "bun test",
    "smoke:plan": "bun scripts/smoke-runner.ts plan",
    "smoke:run": "bun scripts/smoke-runner.ts run"
  }
}
`,
    'scripts/smoke-runner.ts': `
import { runSmokeRunnerCli } from '../src/smoke-runner/cli';
await runSmokeRunnerCli([]);
`,
    'src/smoke-runner/contract.ts': `
export function parseSmokeTargetsContract(source: string): unknown {
  if (!source.includes('targets')) {
    throw new Error('contracts/smoke-targets.yaml must declare targets');
  }
  return {};
}
`,
    'src/smoke-runner/runner.ts': `
export const failClosedReason = 'base_url_not_provided';
export const missingRequestHeader = 'x-request-id_not_propagated';
export const missingTraceHeader = 'traceparent_not_propagated';
`,
    'tests/smoke-runner.test.ts': `
import { test } from 'bun:test';
test('fails closed when run mode has no base URL', () => {
  const reason = 'base_url_not_provided';
  const securityTarget = 'platform-security-contracts';
  const planOnly = 'is plan-only';
  const malformed = 'malformed_json_response';
  const moneyTarget = 'money-api';
  const connectorsTarget = 'connectors-platform';
  return [reason, securityTarget, planOnly, malformed, moneyTarget, connectorsTarget];
});
`
  };
}

function createSmokeTargetsYaml(
  overrides: {
    readonly edgeWebhookIngress?: string;
    readonly moneyApi?: string;
    readonly connectorsPlatform?: string;
    readonly contractChecks?: string;
  } = {}
): string {
  const edgeWebhookIngress =
    overrides.edgeWebhookIngress ??
    `
  - id: edge-webhook-ingress
    repo: zdp-edge-workers
    service_id: edge-webhook-ingress
    process: edge-worker
    healthz:
      method: GET
      path: /healthz
      timeout_seconds: 2
      expect_json:
        ok: true
        service: edge-webhook-ingress
    readyz:
      method: GET
      path: /readyz
      timeout_seconds: 3
      expect_json:
        ready: true
        checks:
          - contracts
    blocked_production_when:
      - x-request-id is not propagated
      - traceparent is not propagated when present
      - edge worker becomes the source of final authorization, entitlement, ledger, or privacy decisions
`;
  const moneyApi =
    overrides.moneyApi ??
    `
  - id: money-api
    repo: zdp-money-platform
    service_id: money-api
    process: web
    healthz:
      method: GET
      path: /healthz
      timeout_seconds: 2
      expect_json:
        ok: true
        service: money-api
    readyz:
      method: GET
      path: /readyz
      timeout_seconds: 3
      expect_json:
        ready: true
        checks:
          - contracts
    blocked_production_when:
      - healthz service id does not match money-api
      - readyz checks omit contracts
      - smoke check requires a real payment, refund, credit mutation, customer account, or provider credential
      - money-api exposes payment, refund, credit, or ledger write routes before ledger storage migration exists
`;
  const connectorsPlatform =
    overrides.connectorsPlatform ??
    `
  - id: connectors-platform
    repo: zdp-connectors-platform
    service_id: connectors-platform
    process: web
    healthz:
      method: GET
      path: /healthz
      timeout_seconds: 2
      expect_json:
        ok: true
        service: connectors-platform
    readyz:
      method: GET
      path: /readyz
      timeout_seconds: 3
      expect_json:
        ready: true
        checks:
          - contracts
    blocked_production_when:
      - healthz service id does not match connectors-platform
      - readyz checks omit contracts
      - smoke check requires a real OAuth provider, source payload, plaintext credential, webhook delivery, or user data sync
      - connectors-platform exposes provider OAuth, sync worker, webhook ingest, or raw source payload routes before provider boundary contracts are implemented
`;
  const contractChecks =
    overrides.contractChecks ??
    `
contract_checks:
  - id: platform-security-contracts
    repo: zdp-platform-security
    service_id: platform-security
    process: one-shot-checker
    command: bun run contracts:check
    required_files:
      - contracts/security-baseline.yaml
      - contracts/threat-model-template.yaml
      - contracts/secret-handling.yaml
      - contracts/dependency-review.yaml
      - scripts/check-security-contracts.ts
    expected_evidence:
      - security contracts parse without diagnostics
      - checker does not connect to scanners or providers
      - checker does not require exploit payloads, private incident details, or secret values
    blocked_production_when:
      - security baseline contracts are missing or unparseable
      - contract checker requires scanner output, provider account, exploit payload, private incident detail, or secret value
      - security promotion relies on dashboard-only scanner evidence
`;

  return `
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
${edgeWebhookIngress}
${moneyApi}
${connectorsPlatform}
${contractChecks}`;
}
