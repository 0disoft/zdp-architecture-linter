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
        expect(
          diagnostics.filter(
            (diagnostic) =>
              diagnostic.file === 'contracts/smoke-targets.yaml' &&
              diagnostic.path === 'contract_checks' &&
              diagnostic.message ===
                'Runtime smoke contract must declare a `contract_checks` array.'
          )
        ).toHaveLength(1);
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
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-RUNTIME-001',
          severity: 'error',
          file: 'contracts/smoke-targets.yaml',
          path: 'targets.core-api.blocked_production_when',
          message:
            'Runtime contract `contracts/smoke-targets.yaml` must include `healthz service id does not match core-api` in `blocked_production_when`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-RUNTIME-001',
          severity: 'error',
          file: 'contracts/smoke-targets.yaml',
          path: 'targets.core-api.blocked_production_when',
          message:
            'Runtime contract `contracts/smoke-targets.yaml` must include `readiness depends on a database before the core migration slice exists` in `blocked_production_when`.'
        });
      }
    );
  });

  test('fails when runtime smoke targets drop required-before gates', async () => {
    await withRepositoryRoot(
      {
        ...createValidRuntimeFiles(),
        'contracts/smoke-targets.yaml': createSmokeTargetsYaml({
          edgeWebhookIngress: `
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
      - condition: x-request-id is not propagated
        enforced_by: smoke_runner
      - condition: traceparent is not propagated when present
        enforced_by: smoke_runner
      - condition: edge worker becomes the source of final authorization, entitlement, ledger, or privacy decisions
        enforced_by: architecture_linter
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
          path: 'targets.edge-webhook-ingress.required_before',
          message:
            'Runtime contract `contracts/smoke-targets.yaml` must include `hello-edge` in `required_before`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-RUNTIME-001',
          severity: 'error',
          file: 'contracts/smoke-targets.yaml',
          path: 'targets.edge-webhook-ingress.required_before',
          message:
            'Runtime contract `contracts/smoke-targets.yaml` must include `production-runtime-template` in `required_before`.'
        });
      }
    );
  });

  test('fails when runtime required-before gates include non-string items', async () => {
    await withRepositoryRoot(
      {
        ...createValidRuntimeFiles(),
        'contracts/smoke-targets.yaml': createSmokeTargetsYaml({
          edgeWebhookIngress: `
  - id: edge-webhook-ingress
    repo: zdp-edge-workers
    service_id: edge-webhook-ingress
    process: edge-worker
    required_before:
      - hello-edge
      - production-runtime-template
      - condition: manual approval hidden in required_before
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
      - condition: x-request-id is not propagated
        enforced_by: smoke_runner
      - condition: traceparent is not propagated when present
        enforced_by: smoke_runner
      - condition: edge worker becomes the source of final authorization, entitlement, ledger, or privacy decisions
        enforced_by: architecture_linter
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
          path: 'targets.edge-webhook-ingress.required_before',
          message:
            'Runtime contract `contracts/smoke-targets.yaml` must declare `required_before` as a string list.'
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
      - condition: x-request-id is not propagated
        enforced_by: smoke_runner
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

  test('fails when blocked production conditions mix structured and malformed items', async () => {
    await withRepositoryRoot(
      {
        ...createValidRuntimeFiles(),
        'contracts/smoke-targets.yaml': createSmokeTargetsYaml({
          edgeWebhookIngress: `
  - id: edge-webhook-ingress
    repo: zdp-edge-workers
    service_id: edge-webhook-ingress
    process: edge-worker
    required_before:
      - hello-edge
      - production-runtime-template
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
      - condition: x-request-id is not propagated
        enforced_by: smoke_runner
      - traceparent is not propagated when present
      - condition: edge worker becomes the source of final authorization, entitlement, ledger, or privacy decisions
        enforced_by: architecture_linter
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
          path: 'targets.edge-webhook-ingress.blocked_production_when',
          message:
            'Runtime contract `contracts/smoke-targets.yaml` must declare every `blocked_production_when` item as a `{ condition, enforced_by }` object.'
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

  test('fails when blocked production conditions use legacy string lists', async () => {
    await withRepositoryRoot(
      {
        ...createValidRuntimeFiles(),
        'contracts/smoke-targets.yaml': createSmokeTargetsYaml({
          edgeWebhookIngress: `
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
          path: 'targets.edge-webhook-ingress.blocked_production_when',
          message:
            'Runtime contract `contracts/smoke-targets.yaml` must declare `blocked_production_when` as a non-empty list of `{ condition, enforced_by }` objects.'
        });
      }
    );
  });

  test('fails when blocked production enforcement owners are unknown', async () => {
    await withRepositoryRoot(
      {
        ...createValidRuntimeFiles(),
        'contracts/smoke-targets.yaml': createSmokeTargetsYaml({
          edgeWebhookIngress: `
  - id: edge-webhook-ingress
    repo: zdp-edge-workers
    service_id: edge-webhook-ingress
    process: edge-worker
    required_before:
      - hello-edge
      - production-runtime-template
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
      - condition: x-request-id is not propagated
        enforced_by: ci_pipeline
      - condition: traceparent is not propagated when present
        enforced_by: smoke_runner
      - condition: edge worker becomes the source of final authorization, entitlement, ledger, or privacy decisions
        enforced_by: architecture_linter
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
          path: 'targets.edge-webhook-ingress.blocked_production_when',
          message:
            'Runtime contract `contracts/smoke-targets.yaml` must use a known `enforced_by` value for `x-request-id is not propagated` in `blocked_production_when`.'
        });
      }
    );
  });

  test('fails when blocked production enforcement owners drift', async () => {
    await withRepositoryRoot(
      {
        ...createValidRuntimeFiles(),
        'contracts/smoke-targets.yaml': createSmokeTargetsYaml({
          edgeWebhookIngress: `
  - id: edge-webhook-ingress
    repo: zdp-edge-workers
    service_id: edge-webhook-ingress
    process: edge-worker
    required_before:
      - hello-edge
      - production-runtime-template
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
      - condition: x-request-id is not propagated
        enforced_by: smoke_runner
      - condition: traceparent is not propagated when present
        enforced_by: operator_review
      - condition: edge worker becomes the source of final authorization, entitlement, ledger, or privacy decisions
        enforced_by: architecture_linter
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
          path: 'targets.edge-webhook-ingress.blocked_production_when',
          message:
            'Runtime contract `contracts/smoke-targets.yaml` must assign `traceparent is not propagated when present` in `blocked_production_when` to enforcement owner `smoke_runner`.'
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
        mode: live
        blockers: []
    blocked_production_when:
      - condition: contract-only readiness omits live money handler blocker
        enforced_by: smoke_runner
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
      - condition: readyz checks omit contracts
        enforced_by: smoke_runner
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
      - condition: security baseline contracts are missing or unparseable
        enforced_by: owning_contract_checker
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

  test('fails when the platform infra contract check target drifts', async () => {
    await withRepositoryRoot(
      {
        ...createValidRuntimeFiles(),
        'contracts/smoke-targets.yaml': createSmokeTargetsYaml({
          contractChecks: `
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
      - condition: security baseline contracts are missing or unparseable
        enforced_by: owning_contract_checker
      - condition: contract checker requires scanner output, provider account, exploit payload, private incident detail, or secret value
        enforced_by: owning_contract_checker
      - condition: security promotion relies on dashboard-only scanner evidence
        enforced_by: operator_review
  - id: platform-infra-contracts
    repo: zdp-platform-infra
    service_id: platform-infra
    process: web
    command: bun test
    required_files:
      - contracts/resource-inventory.yaml
    expected_evidence:
      - infra contracts parse without diagnostics
    blocked_production_when:
      - condition: infra contracts are missing or unparseable
        enforced_by: owning_contract_checker
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
          path: 'contract_checks.platform-infra-contracts.process',
          message:
            'Runtime `platform-infra-contracts` check target must declare process `one-shot-checker`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-RUNTIME-001',
          severity: 'error',
          file: 'contracts/smoke-targets.yaml',
          path: 'contract_checks.platform-infra-contracts.command',
          message:
            'Runtime `platform-infra-contracts` check target must run `bun run contracts:check`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-RUNTIME-001',
          severity: 'error',
          file: 'contracts/smoke-targets.yaml',
          path: 'contract_checks.platform-infra-contracts.required_files',
          message:
            'Runtime contract `contracts/smoke-targets.yaml` must include `contracts/environment.schema.yaml` in `required_files`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-RUNTIME-001',
          severity: 'error',
          file: 'contracts/smoke-targets.yaml',
          path: 'contract_checks.platform-infra-contracts.expected_evidence',
          message:
            'Runtime contract `contracts/smoke-targets.yaml` must include `provider-neutral dry-run plan has no provider calls` in `expected_evidence`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-RUNTIME-001',
          severity: 'error',
          file: 'contracts/smoke-targets.yaml',
          path: 'contract_checks.platform-infra-contracts.blocked_production_when',
          message:
            'Runtime contract `contracts/smoke-targets.yaml` must include `contract checker requires provider account, server ip, dns challenge secret, provider token, or terraform state` in `blocked_production_when`.'
        });
      }
    );
  });

  test('fails when the platform observability contract check target drifts', async () => {
    await withRepositoryRoot(
      {
        ...createValidRuntimeFiles(),
        'contracts/smoke-targets.yaml': createSmokeTargetsYaml({
          contractChecks: `
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
      - condition: security baseline contracts are missing or unparseable
        enforced_by: owning_contract_checker
      - condition: contract checker requires scanner output, provider account, exploit payload, private incident detail, or secret value
        enforced_by: owning_contract_checker
      - condition: security promotion relies on dashboard-only scanner evidence
        enforced_by: operator_review
  - id: platform-infra-contracts
    repo: zdp-platform-infra
    service_id: platform-infra
    process: one-shot-checker
    command: bun run contracts:check
    required_files:
      - contracts/resource-inventory.yaml
      - contracts/environment.schema.yaml
      - contracts/backup-restore.yaml
      - scripts/check-infra-contracts.ts
      - scripts/infra-plan.ts
    expected_evidence:
      - infra contracts parse without diagnostics
      - provider-neutral dry-run plan has no provider calls
      - checker does not require account ids, server ips, dns challenge secrets, or provider tokens
    blocked_production_when:
      - condition: infra contracts are missing or unparseable
        enforced_by: owning_contract_checker
      - condition: contract checker requires provider account, server ip, dns challenge secret, provider token, or terraform state
        enforced_by: owning_contract_checker
      - condition: infra promotion relies on dashboard-only provider evidence
        enforced_by: operator_review
  - id: platform-observability-contracts
    repo: zdp-platform-observability
    service_id: platform-observability
    process: web
    command: bun test
    required_files:
      - contracts/telemetry-conventions.yaml
    expected_evidence:
      - observability contracts parse without diagnostics
    blocked_production_when:
      - condition: observability contracts are missing or unparseable
        enforced_by: owning_contract_checker
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
          path: 'contract_checks.platform-observability-contracts.process',
          message:
            'Runtime `platform-observability-contracts` check target must declare process `one-shot-checker`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-RUNTIME-001',
          severity: 'error',
          file: 'contracts/smoke-targets.yaml',
          path: 'contract_checks.platform-observability-contracts.command',
          message:
            'Runtime `platform-observability-contracts` check target must run `bun run contracts:check`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-RUNTIME-001',
          severity: 'error',
          file: 'contracts/smoke-targets.yaml',
          path: 'contract_checks.platform-observability-contracts.required_files',
          message:
            'Runtime contract `contracts/smoke-targets.yaml` must include `contracts/dashboard-inventory.yaml` in `required_files`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-RUNTIME-001',
          severity: 'error',
          file: 'contracts/smoke-targets.yaml',
          path: 'contract_checks.platform-observability-contracts.expected_evidence',
          message:
            'Runtime contract `contracts/smoke-targets.yaml` must include `checker does not connect to telemetry providers` in `expected_evidence`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-RUNTIME-001',
          severity: 'error',
          file: 'contracts/smoke-targets.yaml',
          path: 'contract_checks.platform-observability-contracts.blocked_production_when',
          message:
            'Runtime contract `contracts/smoke-targets.yaml` must include `contract checker requires provider account, provider token, dashboard url, raw log, raw trace, or customer payload` in `blocked_production_when`.'
        });
      }
    );
  });

  test('fails when the data platform contract check target drifts', async () => {
    await withRepositoryRoot(
      {
        ...createValidRuntimeFiles(),
        'contracts/smoke-targets.yaml': createSmokeTargetsYaml({
          contractChecks: `
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
      - condition: security baseline contracts are missing or unparseable
        enforced_by: owning_contract_checker
      - condition: contract checker requires scanner output, provider account, exploit payload, private incident detail, or secret value
        enforced_by: owning_contract_checker
      - condition: security promotion relies on dashboard-only scanner evidence
        enforced_by: operator_review
  - id: platform-infra-contracts
    repo: zdp-platform-infra
    service_id: platform-infra
    process: one-shot-checker
    command: bun run contracts:check
    required_files:
      - contracts/resource-inventory.yaml
      - contracts/environment.schema.yaml
      - contracts/backup-restore.yaml
      - scripts/check-infra-contracts.ts
      - scripts/infra-plan.ts
    expected_evidence:
      - infra contracts parse without diagnostics
      - provider-neutral dry-run plan has no provider calls
      - checker does not require account ids, server ips, dns challenge secrets, or provider tokens
    blocked_production_when:
      - condition: infra contracts are missing or unparseable
        enforced_by: owning_contract_checker
      - condition: contract checker requires provider account, server ip, dns challenge secret, provider token, or terraform state
        enforced_by: owning_contract_checker
      - condition: infra promotion relies on dashboard-only provider evidence
        enforced_by: operator_review
  - id: platform-observability-contracts
    repo: zdp-platform-observability
    service_id: platform-observability
    process: one-shot-checker
    command: bun run contracts:check
    required_files:
      - contracts/telemetry-conventions.yaml
      - contracts/dashboard-inventory.yaml
      - contracts/alert-rules.yaml
      - scripts/check-observability-contracts.ts
    expected_evidence:
      - observability contracts parse without diagnostics
      - checker does not connect to telemetry providers
      - checker does not require provider tokens, dashboard urls, raw logs, or trace samples
    blocked_production_when:
      - condition: observability contracts are missing or unparseable
        enforced_by: owning_contract_checker
      - condition: contract checker requires provider account, provider token, dashboard url, raw log, raw trace, or customer payload
        enforced_by: owning_contract_checker
      - condition: observability promotion relies on dashboard-only provider evidence
        enforced_by: operator_review
  - id: data-platform-contracts
    repo: zdp-data-platform
    service_id: data-platform
    process: web
    command: bun test
    required_files:
      - contracts/analytics-ingest.yaml
    expected_evidence:
      - data platform contracts parse without diagnostics
    blocked_production_when:
      - condition: data platform contracts are missing or unparseable
        enforced_by: owning_contract_checker
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
          path: 'contract_checks.data-platform-contracts.process',
          message:
            'Runtime `data-platform-contracts` check target must declare process `one-shot-checker`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-RUNTIME-001',
          severity: 'error',
          file: 'contracts/smoke-targets.yaml',
          path: 'contract_checks.data-platform-contracts.command',
          message:
            'Runtime `data-platform-contracts` check target must run `bun run contracts:check`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-RUNTIME-001',
          severity: 'error',
          file: 'contracts/smoke-targets.yaml',
          path: 'contract_checks.data-platform-contracts.required_files',
          message:
            'Runtime contract `contracts/smoke-targets.yaml` must include `contracts/operational-metrics.yaml` in `required_files`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-RUNTIME-001',
          severity: 'error',
          file: 'contracts/smoke-targets.yaml',
          path: 'contract_checks.data-platform-contracts.expected_evidence',
          message:
            'Runtime contract `contracts/smoke-targets.yaml` must include `operational metrics contract and runtime metric labels stay in sync` in `expected_evidence`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-RUNTIME-001',
          severity: 'error',
          file: 'contracts/smoke-targets.yaml',
          path: 'contract_checks.data-platform-contracts.blocked_production_when',
          message:
            'Runtime contract `contracts/smoke-targets.yaml` must include `data platform promotion relies on live ClickHouse, collector, queue consumer, provider token, raw payload, or customer data evidence` in `blocked_production_when`.'
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
  worker_process_optional: false
  state_in_process_memory_allowed: true
  graceful_shutdown_required: false
`,
        'contracts/rollback.yaml': `
rollback:
  required: false
  record_fields:
    - deploy_id
  blocked_when:
    - previous revision is missing
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
          file: 'contracts/deployment-template.yaml',
          path: 'process_model.worker_process_optional',
          message:
            'Runtime deployment template must keep worker processes optional.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-RUNTIME-001',
          severity: 'error',
          file: 'contracts/rollback.yaml',
          path: 'rollback.required',
          message: 'Runtime rollback contract must require rollback.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-RUNTIME-001',
          severity: 'error',
          file: 'contracts/rollback.yaml',
          path: 'rollback.blocked_when',
          message:
            'Runtime contract `contracts/rollback.yaml` must include `destructive migration has no rollback note` in `rollback.blocked_when`.'
        });
      }
    );
  });

  test('fails when an unknown smoke target violates the generic schema', async () => {
    await withRepositoryRoot(
      {
        ...createValidRuntimeFiles(),
        'contracts/smoke-targets.yaml': createSmokeTargetsYaml().replace(
          '\ncontract_checks:',
          `
  - id: future-runtime
    repo: zdp-future-runtime
    service_id: future-runtime
    process: web
    healthz:
      method: POST
      path: /healthz
      timeout_seconds: -1
    readyz:
      method: GET
      path: /readyz
      timeout_seconds: 3
    blocked_production_when:
      - future runtime contract fails

contract_checks:`
        )
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
          path: 'targets.future-runtime.healthz.method',
          message:
            'Runtime smoke target `targets.future-runtime.healthz` must use `GET`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-RUNTIME-001',
          severity: 'error',
          file: 'contracts/smoke-targets.yaml',
          path: 'targets.future-runtime.healthz.timeout_seconds',
          message:
            'Runtime contract `contracts/smoke-targets.yaml` must declare `timeout_seconds` as a positive integer.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-RUNTIME-001',
          severity: 'error',
          file: 'contracts/smoke-targets.yaml',
          path: 'targets.future-runtime.blocked_production_when',
          message:
            'Runtime contract `contracts/smoke-targets.yaml` must declare every `blocked_production_when` item as a `{ condition, enforced_by }` object.'
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
          file: 'package.json',
          path: 'scripts.check',
          message:
            'Runtime package `check` script must run `tsc --noEmit` and `bun test`.'
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
            'Runtime smoke runner source must include test case `fails closed when run mode has no base URL`.'
        });
      }
    );
  });

  test('fails when smoke plan or run scripts are no-ops', async () => {
    await withRepositoryRoot(
      {
        ...createValidRuntimeFiles(),
        'package.json': `
{
  "scripts": {
    "check": "tsc --noEmit && bun test",
    "test": "bun test",
    "smoke:plan": "echo plan",
    "smoke:run": "echo run"
  }
}
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
          path: 'scripts.smoke:plan',
          message:
            'Runtime package `smoke:plan` script must run `bun scripts/smoke-runner.ts plan`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-RUNTIME-001',
          severity: 'error',
          file: 'package.json',
          path: 'scripts.smoke:run',
          message:
            'Runtime package `smoke:run` script must run `bun scripts/smoke-runner.ts run`.'
        });
      }
    );
  });

  test('fails when smoke runner source proof is only string literal stubs', async () => {
    await withRepositoryRoot(
      {
        ...createValidRuntimeFiles(),
        'src/smoke-runner/contract.ts': `
const fakeProof = [
  'contracts/smoke-targets.yaml',
  'targets',
  'blocked_production_when',
  'enforced_by',
  'export function parseSmokeTargetsContract',
  'function parseTarget',
  'function parseContractCheck',
  'function requiredBlockedProductionConditionList',
  'function parseBlockedProductionCondition',
  'function isRuntimeContractEnforcement',
  'Bun.YAML.parse'
];
export { fakeProof };
`,
        'src/smoke-runner/runner.ts': `
const fakeProof = [
  'base_url_not_provided',
  'x-request-id_not_propagated',
  'traceparent_not_propagated',
  'blockedProductionWhen',
  'export function createSmokePlan',
  'export async function runSmokeTargets',
  'async function checkEndpoint',
  'export function parseBaseUrlPairs',
  'function validateJsonExpectation',
  'AbortSignal.timeout',
  'input.fetcher'
];
export { fakeProof };
`,
        'tests/smoke-runner.test.ts': `
const fakeProof = [
  'fails closed when run mode has no base URL',
  'base_url_not_provided',
  'platform-security-contracts',
  'platform-infra-contracts',
  'platform-observability-contracts',
  'data-platform-contracts',
  'is plan-only',
  'malformed_json_response',
  'money-api',
  'connectors-platform',
  'rejects blocked production conditions without enforcement owners',
  'test(',
  'expect(',
  'parseSmokeTargetsContract',
  'createSmokePlan',
  'runSmokeTargets'
];
export { fakeProof };
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
          file: 'src/smoke-runner/contract.ts',
          path: 'source',
          message:
            'Runtime smoke runner source must include code fragment `export function parseSmokeTargetsContract`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-RUNTIME-001',
          severity: 'error',
          file: 'src/smoke-runner/runner.ts',
          path: 'source',
          message:
            'Runtime smoke runner source must include code fragment `export function createSmokePlan`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-RUNTIME-001',
          severity: 'error',
          file: 'tests/smoke-runner.test.ts',
          path: 'source',
          message:
            'Runtime smoke runner source must include test case `fails closed when run mode has no base URL`.'
        });
      }
    );
  });

  test('fails when smoke runner test proof is only a string list plus placeholder test', async () => {
    await withRepositoryRoot(
      {
        ...createValidRuntimeFiles(),
        'tests/smoke-runner.test.ts': `
import { expect, test } from 'bun:test';
import { parseSmokeTargetsContract } from '../src/smoke-runner/contract';
import { createSmokePlan, runSmokeTargets } from '../src/smoke-runner/runner';
const fakeProof = [
  'fails closed when run mode has no base URL',
  'base_url_not_provided',
  'platform-security-contracts',
  'platform-infra-contracts',
  'platform-observability-contracts',
  'data-platform-contracts',
  'is plan-only',
  'malformed_json_response',
  'money-api',
  'connectors-platform',
  'rejects blocked production conditions without enforcement owners'
];
test('smoke runner placeholder', () => {
  expect(fakeProof).toContain('fails closed when run mode has no base URL');
  expect([parseSmokeTargetsContract, createSmokePlan, runSmokeTargets]).toHaveLength(3);
});
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
          file: 'tests/smoke-runner.test.ts',
          path: 'source',
          message:
            'Runtime smoke runner source must include test case `fails closed when run mode has no base URL`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-RUNTIME-001',
          severity: 'error',
          file: 'tests/smoke-runner.test.ts',
          path: 'source',
          message:
            'Runtime smoke runner source must include test case `rejects blocked production conditions without enforcement owners`.'
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
    purpose: process restart signal
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
    purpose: traffic admission signal
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
    required_before_production: true
    must_not_require_real_payment: true
    must_not_require_user_data: true
    must_not_require_real_customer_account: true
    must_not_perform_state_changes: true
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
  worker_process_optional: true
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
  blocked_when:
    - destructive migration has no rollback note
    - previous revision is missing
    - secret schema changed without compatibility note
`,
    'package.json': `
{
  "scripts": {
    "check": "tsc --noEmit && bun test",
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
const smokeTargetsFile = 'contracts/smoke-targets.yaml';
const healthcheckFile = 'contracts/healthcheck.yaml';
const deploymentTemplateFile = 'contracts/deployment-template.yaml';
const rollbackFile = 'contracts/rollback.yaml';
const smokeMetadata = 'smoke_targets';
const rollbackBlockers = 'blocked_when';
const workerPolicy = 'worker_process_optional';
export function parseRuntimeContracts(source: string): unknown {
  parseHealthcheckContract(healthcheckFile);
  parseDeploymentTemplateContract(deploymentTemplateFile);
  parseRollbackContract(rollbackFile);
  parseSmokeTargetsMetadata(source);
  return parseSmokeTargetsContract(source);
}
export function parseSmokeTargetsContract(source: string): unknown {
  Bun.YAML.parse(source);
  parseTarget({});
  parseContractCheck({});
  requiredBlockedProductionConditionList({}, 'blocked_production_when', smokeTargetsFile);
  if (!source.includes('targets') || !source.includes('blocked_production_when') || !source.includes('enforced_by') || !source.includes(smokeMetadata) || !source.includes(rollbackBlockers) || !source.includes(workerPolicy) || !source.includes(healthcheckFile) || !source.includes(deploymentTemplateFile) || !source.includes(rollbackFile)) {
    throw new Error('contracts/smoke-targets.yaml must declare targets');
  }
  return {};
}
export function parseHealthcheckContract(value: unknown): unknown {
  requiredBoolean({}, 'required_before_production', healthcheckFile);
  return value;
}
export function parseDeploymentTemplateContract(value: unknown): unknown {
  assertStringListContains(['worker_process_optional'], ['worker_process_optional'], deploymentTemplateFile);
  return value;
}
export function parseRollbackContract(value: unknown): unknown {
  assertStringListContains(['blocked_when'], ['blocked_when'], rollbackFile);
  return value;
}
function parseSmokeTargetsMetadata(value: unknown): unknown {
  return value;
}
function parseTarget(value: unknown): unknown {
  return value;
}
function parseContractCheck(value: unknown): unknown {
  return value;
}
function requiredBlockedProductionConditionList(value: unknown, key: string, context: string): unknown {
  return [value, key, context].filter(Boolean);
}
function parseBlockedProductionCondition(value: unknown): unknown {
  return isRuntimeContractEnforcement('smoke_runner') ? value : null;
}
function isRuntimeContractEnforcement(value: string): boolean {
  return value === 'smoke_runner';
}
function assertStringListContains(actual: readonly string[], expected: readonly string[], context: string): unknown {
  return [actual, expected, context];
}
function requiredBoolean(value: unknown, key: string, context: string): unknown {
  return [value, key, context];
}
`,
    'src/smoke-runner/runner.ts': `
export const failClosedReason = 'base_url_not_provided';
export const missingRequestHeader = 'x-request-id_not_propagated';
export const missingTraceHeader = 'traceparent_not_propagated';
export const planMetadata = 'blockedProductionWhen';
export function createSmokePlan(): unknown {
  return { blockedProductionWhen: planMetadata };
}
export async function runSmokeTargets(input: { readonly fetcher?: typeof fetch } = {}): Promise<unknown> {
  await checkEndpoint({ fetcher: input.fetcher ?? fetch });
  return createSmokePlan();
}
async function checkEndpoint(input: { readonly fetcher: typeof fetch }): Promise<unknown> {
  AbortSignal.timeout(1000);
  input.fetcher;
  return validateJsonExpectation({});
}
export function parseBaseUrlPairs(): ReadonlyMap<string, string> {
  return new Map();
}
function validateJsonExpectation(value: unknown): unknown {
  return value;
}
`,
    'tests/smoke-runner.test.ts': `
import { expect, test } from 'bun:test';
import { parseRuntimeContracts, parseSmokeTargetsContract } from '../src/smoke-runner/contract';
import { createSmokePlan, runSmokeTargets } from '../src/smoke-runner/runner';
test('parses the committed runtime contract set before plan or run mode', () => {
  const metadata = 'smoke_targets.production_promotion_requires';
  const worker = 'worker_process_optional';
  const rollback = 'blocked_when';
  expect([parseRuntimeContracts, metadata, worker, rollback]).toHaveLength(4);
});
test('rejects runtime contract sets with missing smoke metadata', () => {
  expect(parseRuntimeContracts).toBeDefined();
});
test('rejects deployment and rollback contract drift before smoke execution', () => {
  expect(parseRuntimeContracts).toBeDefined();
});
test('fails closed when run mode has no base URL', () => {
  const reason = 'base_url_not_provided';
  const securityTarget = 'platform-security-contracts';
  const infraTarget = 'platform-infra-contracts';
  const observabilityTarget = 'platform-observability-contracts';
  const dataPlatformTarget = 'data-platform-contracts';
  const planOnly = 'is plan-only';
  const malformed = 'malformed_json_response';
  const moneyTarget = 'money-api';
  const connectorsTarget = 'connectors-platform';
  const structuredBlockerTest = 'rejects blocked production conditions without enforcement owners';
  return [
    reason,
    securityTarget,
    infraTarget,
    observabilityTarget,
    dataPlatformTarget,
    planOnly,
    malformed,
    moneyTarget,
    connectorsTarget,
    structuredBlockerTest
  ]).toContain(reason);
  expect([parseSmokeTargetsContract, createSmokePlan, runSmokeTargets]).toHaveLength(3);
});
test('rejects blocked production conditions without enforcement owners', () => {
  expect(parseSmokeTargetsContract).toBeDefined();
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
    required_before:
      - hello-edge
      - production-runtime-template
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
      - condition: x-request-id is not propagated
        enforced_by: smoke_runner
      - condition: traceparent is not propagated when present
        enforced_by: smoke_runner
      - condition: edge worker becomes the source of final authorization, entitlement, ledger, or privacy decisions
        enforced_by: architecture_linter
`;
  const moneyApi =
    overrides.moneyApi ??
    `
  - id: money-api
    repo: zdp-money-platform
    service_id: money-api
    process: web
    required_before:
      - money-ledger-migration
      - production-runtime-template
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
        checks: []
        mode: contract_only
        blockers:
          - live_money_handlers_disabled
    blocked_production_when:
      - condition: healthz service id does not match money-api
        enforced_by: smoke_runner
      - condition: contract-only readiness omits live money handler blocker
        enforced_by: smoke_runner
      - condition: smoke check requires a real payment, refund, credit mutation, customer account, or provider credential
        enforced_by: operator_review
      - condition: money-api exposes payment, refund, credit, or ledger write routes before ledger storage migration exists
        enforced_by: architecture_linter
`;
  const connectorsPlatform =
    overrides.connectorsPlatform ??
    `
  - id: connectors-platform
    repo: zdp-connectors-platform
    service_id: connectors-platform
    process: web
    required_before:
      - provider-onboarding
      - production-runtime-template
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
      - condition: healthz service id does not match connectors-platform
        enforced_by: smoke_runner
      - condition: readyz checks omit contracts
        enforced_by: smoke_runner
      - condition: smoke check requires a real OAuth provider, source payload, plaintext credential, webhook delivery, or user data sync
        enforced_by: operator_review
      - condition: connectors-platform exposes provider OAuth, sync worker, webhook ingest, or raw source payload routes before provider boundary contracts are implemented
        enforced_by: architecture_linter
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
    required_before:
      - critical-platform-promotion
      - production-runtime-template
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
      - condition: security baseline contracts are missing or unparseable
        enforced_by: owning_contract_checker
      - condition: contract checker requires scanner output, provider account, exploit payload, private incident detail, or secret value
        enforced_by: owning_contract_checker
      - condition: security promotion relies on dashboard-only scanner evidence
        enforced_by: operator_review
  - id: platform-infra-contracts
    repo: zdp-platform-infra
    service_id: platform-infra
    process: one-shot-checker
    command: bun run contracts:check
    required_before:
      - provider-account-connection
      - production-runtime-template
    required_files:
      - contracts/resource-inventory.yaml
      - contracts/environment.schema.yaml
      - contracts/backup-restore.yaml
      - scripts/check-infra-contracts.ts
      - scripts/infra-plan.ts
    expected_evidence:
      - infra contracts parse without diagnostics
      - provider-neutral dry-run plan has no provider calls
      - checker does not require account ids, server ips, dns challenge secrets, or provider tokens
    blocked_production_when:
      - condition: infra contracts are missing or unparseable
        enforced_by: owning_contract_checker
      - condition: contract checker requires provider account, server ip, dns challenge secret, provider token, or terraform state
        enforced_by: owning_contract_checker
      - condition: infra promotion relies on dashboard-only provider evidence
        enforced_by: operator_review
  - id: platform-observability-contracts
    repo: zdp-platform-observability
    service_id: platform-observability
    process: one-shot-checker
    command: bun run contracts:check
    required_before:
      - observability-provider-connection
      - production-runtime-template
    required_files:
      - contracts/telemetry-conventions.yaml
      - contracts/dashboard-inventory.yaml
      - contracts/alert-rules.yaml
      - scripts/check-observability-contracts.ts
    expected_evidence:
      - observability contracts parse without diagnostics
      - checker does not connect to telemetry providers
      - checker does not require provider tokens, dashboard urls, raw logs, or trace samples
    blocked_production_when:
      - condition: observability contracts are missing or unparseable
        enforced_by: owning_contract_checker
      - condition: contract checker requires provider account, provider token, dashboard url, raw log, raw trace, or customer payload
        enforced_by: owning_contract_checker
      - condition: observability promotion relies on dashboard-only provider evidence
        enforced_by: operator_review
  - id: data-platform-contracts
    repo: zdp-data-platform
    service_id: data-platform
    process: one-shot-checker
    command: bun run contracts:check
    required_before:
      - analytics-ingest-promotion
      - production-runtime-template
    required_files:
      - contracts/analytics-ingest.yaml
      - contracts/clickhouse-storage.yaml
      - contracts/deletion-anonymization.yaml
      - contracts/operational-metrics.yaml
      - scripts/check-data-contracts.ts
    expected_evidence:
      - data platform contracts parse without diagnostics
      - architecture event catalog and schema compatibility checks pass
      - operational metrics contract and runtime metric labels stay in sync
      - checker does not require ClickHouse, queue consumers, collector, provider tokens, raw payloads, or customer data
    blocked_production_when:
      - condition: data platform contracts are missing or unparseable
        enforced_by: owning_contract_checker
      - condition: event catalog or schema compatibility fails
        enforced_by: owning_contract_checker
      - condition: operational metrics contract or runtime metric labels drift
        enforced_by: owning_contract_checker
      - condition: data platform promotion relies on live ClickHouse, collector, queue consumer, provider token, raw payload, or customer data evidence
        enforced_by: operator_review
`;

  return `
smoke_targets:
  version: 1
  stage: early-origin-runtime
  production_promotion_requires:
    - target health endpoint returns the declared service id
    - target readiness endpoint returns the declared readiness contract
    - platform contract checker targets pass before dependent runtime promotion
    - smoke check does not require real payment, customer data, or user mutation
    - runtime operator can reproduce the check from repository contracts

targets:
  - id: core-api
    repo: zdp-core-platform
    service_id: core-api
    process: web
    required_before:
      - hello-origin
      - production-runtime-template
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
      - condition: healthz service id does not match core-api
        enforced_by: smoke_runner
      - condition: readyz checks omit contracts
        enforced_by: smoke_runner
      - condition: readiness depends on a database before the core migration slice exists
        enforced_by: architecture_linter
  - id: app-console
    repo: zdp-web-apps
    service_id: app-console
    process: web
    required_before:
      - first-console-preview
      - production-runtime-template
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
      - condition: ZDP_CORE_API_BASE_URL is missing
        enforced_by: smoke_runner
      - condition: readyz does not report core-api as an upstream
        enforced_by: smoke_runner
      - condition: app shell attempts direct core, money, privacy, or credential datastore access
        enforced_by: architecture_linter
${edgeWebhookIngress}
${moneyApi}
${connectorsPlatform}
${contractChecks}`;
}
