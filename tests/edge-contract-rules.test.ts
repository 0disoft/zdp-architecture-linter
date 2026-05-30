import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { validateRepositoryEdgeContract } from '../src/edge-contract-rules.ts';

describe('edge worker contract rules', () => {
  test('passes when the edge repository declares edge boundary contracts', async () => {
    await withRepositoryRoot(createValidEdgeFiles(), async (repositoryRoot) => {
      const diagnostics = await validateRepositoryEdgeContract({
        repositoryRoot,
        repositoryServiceContract: createEdgeServiceContract()
      });

      expect(diagnostics).toEqual([]);
    });
  });

  test('skips repositories that are not zdp-edge-workers', async () => {
    await withRepositoryRoot({}, async (repositoryRoot) => {
      const diagnostics = await validateRepositoryEdgeContract({
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

  test('fails when required edge contract files are missing', async () => {
    await withRepositoryRoot({}, async (repositoryRoot) => {
      const diagnostics = await validateRepositoryEdgeContract({
        repositoryRoot,
        repositoryServiceContract: createEdgeServiceContract()
      });

      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-EDGE-001',
        severity: 'error',
        file: 'contracts/request-boundary.yaml',
        path: 'repository.root',
        message:
          'Edge worker repository must include `contracts/request-boundary.yaml`.'
      });
      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-EDGE-001',
        severity: 'error',
        file: 'contracts/analytics-ingress.yaml',
        path: 'repository.root',
        message:
          'Edge worker repository must include `contracts/analytics-ingress.yaml`.'
      });
      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-EDGE-001',
        severity: 'error',
        file: 'src/analytics/ingress.ts',
        path: 'repository.root',
        message:
          'Edge worker repository must include `src/analytics/ingress.ts`.'
      });
      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-EDGE-001',
        severity: 'error',
        file: 'tests/app.test.ts',
        path: 'repository.root',
        message: 'Edge worker repository must include `tests/app.test.ts`.'
      });
      expect(diagnostics).toHaveLength(6);
    });
  });

  test('fails when an edge contract file is not valid YAML', async () => {
    await withRepositoryRoot(
      {
        ...createValidEdgeFiles(),
        'contracts/webhook-ingress.yaml': 'webhook_ingress: [contract-only'
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryEdgeContract({
          repositoryRoot,
          repositoryServiceContract: createEdgeServiceContract()
        });

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]).toMatchObject({
          ruleId: 'ZDP-EDGE-001',
          severity: 'error',
          file: 'contracts/webhook-ingress.yaml',
          path: 'yaml'
        });
      }
    );
  });

  test('fails when request boundary fields drift', async () => {
    await withRepositoryRoot(
      {
        ...createValidEdgeFiles(),
        'contracts/request-boundary.yaml': `
edge_request_contract:
  required_headers: []
  propagated_headers:
    - x-request-id
  forbidden_in_logs:
    - authorization
decisions:
  edge_can_decide:
    - malformed request
  edge_must_delegate:
    - final authorization
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryEdgeContract({
          repositoryRoot,
          repositoryServiceContract: createEdgeServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-EDGE-001',
          severity: 'error',
          file: 'contracts/request-boundary.yaml',
          path: 'edge_request_contract.required_headers',
          message:
            'Edge worker contract `contracts/request-boundary.yaml` must include `x-request-id` in `edge_request_contract.required_headers`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-EDGE-001',
          severity: 'error',
          file: 'contracts/request-boundary.yaml',
          path: 'edge_request_contract.propagated_headers',
          message:
            'Edge worker contract `contracts/request-boundary.yaml` must include `traceparent` in `edge_request_contract.propagated_headers`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-EDGE-001',
          severity: 'error',
          file: 'contracts/request-boundary.yaml',
          path: 'decisions.edge_must_delegate',
          message:
            'Edge worker contract `contracts/request-boundary.yaml` must include `ledger or credit mutation` in `decisions.edge_must_delegate`.'
        });
      }
    );
  });

  test('fails when webhook and queue contracts drift', async () => {
    await withRepositoryRoot(
      {
        ...createValidEdgeFiles(),
        'contracts/webhook-ingress.yaml': `
webhook_ingress:
  status: live
  required_controls:
    - signature verification
  forbidden_controls:
    - payment finalization at edge
`,
        'contracts/queue-envelope.yaml': `
queue_envelope:
  schema_version: 2
  required_fields:
    - job_id
  forbidden_fields:
    - raw secrets
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryEdgeContract({
          repositoryRoot,
          repositoryServiceContract: createEdgeServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-EDGE-001',
          severity: 'error',
          file: 'contracts/webhook-ingress.yaml',
          path: 'webhook_ingress.status',
          message:
            'Edge webhook ingress must remain `contract-only` before Worker implementation.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-EDGE-001',
          severity: 'error',
          file: 'contracts/webhook-ingress.yaml',
          path: 'webhook_ingress.required_controls',
          message:
            'Edge worker contract `contracts/webhook-ingress.yaml` must include `dead-letter handoff` in `webhook_ingress.required_controls`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-EDGE-001',
          severity: 'error',
          file: 'contracts/queue-envelope.yaml',
          path: 'queue_envelope.schema_version',
          message: 'Edge queue envelope schema version must be 1.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-EDGE-001',
          severity: 'error',
          file: 'contracts/queue-envelope.yaml',
          path: 'queue_envelope.required_fields',
          message:
            'Edge worker contract `contracts/queue-envelope.yaml` must include `payload_ref` in `queue_envelope.required_fields`.'
        });
      }
    );
  });

  test('fails when analytics ingress contract drifts', async () => {
    await withRepositoryRoot(
      {
        ...createValidEdgeFiles(),
        'contracts/analytics-ingress.yaml': `
analytics_ingress:
  status: live
  accepted_events:
    - web.page-viewed
  edge_prechecks:
    - malformed request
  required_fields:
    - event_id
  handoff:
    target: zdp-edge-workers
    service_id: edge-webhook-ingress
    queue: analytics-events
    dead_letter_queue: analytics-events-error
    runtime_validator: edge-runtime.ts
  direct_clickhouse_write: allowed
  final_truth_owner: zdp-edge-workers
  forbidden_in_logs:
    - token
  forbidden_decisions:
    - final authorization
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryEdgeContract({
          repositoryRoot,
          repositoryServiceContract: createEdgeServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-EDGE-001',
          severity: 'error',
          file: 'contracts/analytics-ingress.yaml',
          path: 'analytics_ingress.status',
          message:
            'Edge analytics ingress must remain `contract-only` before collector route implementation.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-EDGE-001',
          severity: 'error',
          file: 'contracts/analytics-ingress.yaml',
          path: 'analytics_ingress.accepted_events',
          message:
            'Edge worker contract `contracts/analytics-ingress.yaml` must include `billing.checkout-started` in `analytics_ingress.accepted_events`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-EDGE-001',
          severity: 'error',
          file: 'contracts/analytics-ingress.yaml',
          path: 'analytics_ingress.edge_prechecks',
          message:
            'Edge worker contract `contracts/analytics-ingress.yaml` must include `idempotency key equals event_id` in `analytics_ingress.edge_prechecks`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-EDGE-001',
          severity: 'error',
          file: 'contracts/analytics-ingress.yaml',
          path: 'analytics_ingress.required_fields',
          message:
            'Edge worker contract `contracts/analytics-ingress.yaml` must include `trace_id` in `analytics_ingress.required_fields`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-EDGE-001',
          severity: 'error',
          file: 'contracts/analytics-ingress.yaml',
          path: 'analytics_ingress.handoff.target',
          message:
            'Edge analytics ingress must hand off analytics events to `zdp-data-platform`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-EDGE-001',
          severity: 'error',
          file: 'contracts/analytics-ingress.yaml',
          path: 'analytics_ingress.handoff.runtime_validator',
          message:
            'Edge analytics ingress must document the data-platform runtime validator handoff.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-EDGE-001',
          severity: 'error',
          file: 'contracts/analytics-ingress.yaml',
          path: 'analytics_ingress.direct_clickhouse_write',
          message:
            'Edge analytics ingress must forbid direct ClickHouse writes.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-EDGE-001',
          severity: 'error',
          file: 'contracts/analytics-ingress.yaml',
          path: 'analytics_ingress.forbidden_in_logs',
          message:
            'Edge worker contract `contracts/analytics-ingress.yaml` must include `payment payload` in `analytics_ingress.forbidden_in_logs`.'
        });
      }
    );
  });

  test('fails when analytics ingress source and tests drift from data runtime handoff', async () => {
    await withRepositoryRoot(
      {
        ...createValidEdgeFiles(),
        'src/analytics/ingress.ts': `
export function precheckAnalyticsIngress(): void {
  const job = 'analytics.event.ingest';
  void job;
}
`,
        'tests/app.test.ts': `
import { test } from 'bun:test';
test('placeholder', () => {});
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryEdgeContract({
          repositoryRoot,
          repositoryServiceContract: createEdgeServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-EDGE-001',
          severity: 'error',
          file: 'src/analytics/ingress.ts',
          path: 'source',
          message:
            'Edge worker source must include `input.payload.schema_version !== 1`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-EDGE-001',
          severity: 'error',
          file: 'src/analytics/ingress.ts',
          path: 'source',
          message: 'Edge worker source must include `idempotency_mismatch`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-EDGE-001',
          severity: 'error',
          file: 'tests/app.test.ts',
          path: 'source',
          message:
            'Edge worker source must include `rejects analytics events with schema_version that data runtime will reject`.'
        });
      }
    );
  });
});

async function withRepositoryRoot(
  files: Record<string, string>,
  callback: (repositoryRoot: string) => Promise<void>
): Promise<void> {
  const repositoryRoot = await mkdtemp(join(tmpdir(), 'zdp-edge-contract-'));

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

function createEdgeServiceContract(): unknown {
  return {
    service: {
      repo: 'zdp-edge-workers'
    }
  };
}

function createValidEdgeFiles(): Record<string, string> {
  return {
    'contracts/request-boundary.yaml': `
edge_request_contract:
  required_headers:
    - x-request-id
  propagated_headers:
    - traceparent
    - x-request-id
  forbidden_in_logs:
    - authorization
    - cookie
    - webhook payload body
    - signed url secret
decisions:
  edge_can_decide:
    - malformed request
    - route not found
    - rate limit precheck
    - webhook signature precheck
  edge_must_delegate:
    - final authorization
    - entitlement
    - ledger or credit mutation
    - privacy data access
`,
    'contracts/webhook-ingress.yaml': `
webhook_ingress:
  status: contract-only
  required_controls:
    - signature verification
    - provider event id extraction
    - idempotency key propagation
    - retry-safe response mapping
    - dead-letter handoff
  forbidden_controls:
    - payment finalization at edge
    - ledger posting at edge
    - credential vault direct read
`,
    'contracts/queue-envelope.yaml': `
queue_envelope:
  schema_version: 1
  required_fields:
    - job_id
    - job_type
    - schema_version
    - idempotency_key
    - created_at
    - trace_id
    - request_id
    - payload_ref
  forbidden_fields:
    - raw secrets
    - authorization headers
    - cookies
    - payment payload bodies
`,
    'contracts/analytics-ingress.yaml': `
analytics_ingress:
  status: contract-only
  endpoint_candidate: POST /v1/events
  accepted_events:
    - web.page-viewed
    - product.signup-started
    - product.signup-completed
    - product.activation-completed
    - experiment.exposure-recorded
    - billing.checkout-started
  edge_prechecks:
    - malformed request
    - event name allowlist
    - schema version present
    - schema version pinned to numeric 1
    - request id present
    - trace id propagation
    - idempotency key present
    - idempotency key equals event_id
  required_fields:
    - event_id
    - event_name
    - schema_version
    - source
    - product_id
    - occurred_at
    - request_id
    - trace_id
    - idempotency_key
  handoff:
    target: zdp-data-platform
    service_id: data-platform
    queue: analytics-events
    dead_letter_queue: analytics-events-dlq
    runtime_validator: zdp-data-platform/src/analytics-ingest/runtime.ts
  direct_clickhouse_write: forbidden
  final_truth_owner: zdp-data-platform
  forbidden_in_logs:
    - raw customer payload
    - form body
    - prompt body
    - authorization
    - cookie
    - secret
    - token
    - payment payload
  forbidden_decisions:
    - final authorization
    - entitlement
    - ledger or credit mutation
    - identity truth
    - consent truth
`,
    'src/analytics/ingress.ts': `
export function precheckAnalyticsIngress(input: { payload: { schema_version: unknown } }): unknown {
  if (input.payload.schema_version !== 1) {
    return { code: 'invalid_schema_version' };
  }
  const idempotencyKey = 'evt_123';
  const eventId = 'evt_123';
  if (idempotencyKey !== eventId) {
    return { code: 'idempotency_mismatch' };
  }
  const jobType = 'analytics.event.ingest';
  const payloadRef = 'analytics-event://evt_123';
  return {
    target: 'zdp-data-platform',
    queue: 'analytics-events',
    jobType,
    payloadRef
  };
}
`,
    'tests/app.test.ts': `
const tests = [
  'accepts an allowlisted analytics event and builds a queue handoff envelope',
  'rejects analytics events with schema_version that data runtime will reject',
  'rejects analytics events whose idempotency key would fail data runtime consistency',
  'invalid_schema_version',
  'idempotency_mismatch',
  'prechecks analytics events without owning final analytics storage'
];
export { tests };
`
  };
}
