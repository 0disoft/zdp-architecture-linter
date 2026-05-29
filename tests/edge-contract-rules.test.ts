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
      expect(diagnostics).toHaveLength(3);
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
`
  };
}
