import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { validateRepositoryTimeContract } from '../src/xcut-time-rules.ts';

describe('cross-cutting time rules', () => {
  test('checks calendar values across prose and source contract formats', async () => {
    for (const file of ['RUNBOOK.md', 'contracts/events.ts', 'contracts/events.sql']) {
      await withRepositoryRoot({ [file]: 'created_at: "2026-02-30T12:00:00Z"\n' }, async repositoryRoot => {
        expect(await validateRepositoryTimeContract({ repositoryRoot, repositoryServiceContract: {} }))
          .toContainEqual(expect.objectContaining({ file, path: 'line.1' }));
      });
      await withRepositoryRoot({ [file]: 'created_at: "2024-02-29T23:59:59.123456+00:00"\n' }, async repositoryRoot => {
        expect(await validateRepositoryTimeContract({ repositoryRoot, repositoryServiceContract: {} })).toEqual([]);
      });
    }
  });

  test('rejects numeric timestamps, impossible calendar dates and invalid clock values', async () => {
    for (const value of [1760000000000, true, 'yesterday', 'string', '', '2026-99-99T99:99:99Z',
      '2026-02-29T00:00:00Z', '2026-04-31T00:00:00Z', '2026-10-08T24:00:00Z']) {
      await withRepositoryRoot({ 'contracts/events.json': JSON.stringify({ created_at: value }) }, async repositoryRoot => {
        expect(await validateRepositoryTimeContract({ repositoryRoot, repositoryServiceContract: {} }))
          .toContainEqual(expect.objectContaining({ path: 'line.1' }));
      });
    }
  });

  test('preserves timestamp schema metadata and nullable values while checking concrete examples', async () => {
    await withRepositoryRoot({ 'schemas/events.json': JSON.stringify({ properties: {
      created_at: { type: 'string', format: 'date-time', examples: ['2024-02-29T23:59:59.123456Z'] },
      updated_at: { type: ['string', 'null'], default: null }, expires_at: 'string'
    } }) }, async repositoryRoot => {
      expect(await validateRepositoryTimeContract({ repositoryRoot, repositoryServiceContract: {} })).toEqual([]);
    });
    await withRepositoryRoot({ 'schemas/events.yaml': 'properties:\n  created_at:\n    type: string\n    example: 1760000000000\n' }, async repositoryRoot => {
      expect(await validateRepositoryTimeContract({ repositoryRoot, repositoryServiceContract: {} }))
        .toContainEqual(expect.objectContaining({ path: 'line.4' }));
    });
  });

  test('keeps timestamp fields separate from sibling policy prose and unrelated timestamps', async () => {
    await withRepositoryRoot({ 'contracts/events.json': '{"note":"forbidden","created_at":"2026-10-08T12:00:00+09:00"}' }, async repositoryRoot => {
      expect(await validateRepositoryTimeContract({ repositoryRoot, repositoryServiceContract: {} }))
        .toContainEqual(expect.objectContaining({ path: 'line.1' }));
    });
    await withRepositoryRoot({ 'contracts/events.json': '{"created_at":"2026-10-08T03:00:00Z","label":"KST 2026-10-08T12:00:00+09:00"}' }, async repositoryRoot => {
      expect(await validateRepositoryTimeContract({ repositoryRoot, repositoryServiceContract: {} })).toEqual([]);
    });
  });

  test('checks folded and aliased timestamp values with their field locations', async () => {
    await withRepositoryRoot({ 'contracts/events.yaml': 'value: &local "2026-10-08T12:00:00+09:00"\ncreated_at: *local\nexpires_at: >-\n  2026-10-08T12:00:00\n' }, async repositoryRoot => {
      const diagnostics = await validateRepositoryTimeContract({ repositoryRoot, repositoryServiceContract: {} });
      expect(diagnostics.map(diagnostic => diagnostic.path)).toEqual(['line.2', 'line.3']);
    });
  });

  test('checks every timestamp on a compact JSON line', async () => {
    await withRepositoryRoot({ 'contracts/events.json': '{"created_at":"2026-06-30T00:00:00Z","expires_at":"2026-07-01T00:00:00"}' }, async repositoryRoot => {
      expect(await validateRepositoryTimeContract({ repositoryRoot, repositoryServiceContract: {} })).toContainEqual(expect.objectContaining({ path: 'line.1' }));
    });
    await withRepositoryRoot({ 'contracts/events.json': '{"created_at":"2026-06-30T00:00:00Z","expires_at":"2026-07-01T00:00:00+00:00"}' }, async repositoryRoot => {
      expect(await validateRepositoryTimeContract({ repositoryRoot, repositoryServiceContract: {} })).toEqual([]);
    });
  });

  test('validates schedules in schema-referencing configurations while skipping actual schema definitions', async () => {
    await withRepositoryRoot({ 'contracts/jobs.json': '{"$schema":"https://example.invalid/jobs.schema.json","recurring_schedule":{"cron":"0 9 * * *"}}' }, async repositoryRoot => {
      expect(await validateRepositoryTimeContract({ repositoryRoot, repositoryServiceContract: {} })).toHaveLength(1);
    });
    await withRepositoryRoot({ 'schemas/jobs.json': '{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","properties":{"recurring_schedule":{"type":"object","properties":{"cron":{"type":"string"}}}}}' }, async repositoryRoot => {
      expect(await validateRepositoryTimeContract({ repositoryRoot, repositoryServiceContract: {} })).toEqual([]);
    });
  });
  test('rejects invalid, offset-only and blank overriding schedule timezones', async () => {
    for (const timezone of ['Not/AZone', '+09:00', '', ' Asia/Seoul']) {
      await withRepositoryRoot({ 'contracts/jobs.yaml': `timezone: Asia/Seoul\njobs:\n  - cron: "0 9 * * *"\n    timezone: ${JSON.stringify(timezone)}\n` }, async repositoryRoot => {
        expect(await validateRepositoryTimeContract({ repositoryRoot, repositoryServiceContract: {} })).toHaveLength(1);
      });
    }
    await withRepositoryRoot({ 'contracts/jobs.yaml': 'timezone: Asia/Seoul\njobs:\n  - cron: "0 9 * * *"\n' }, async repositoryRoot => {
      expect(await validateRepositoryTimeContract({ repositoryRoot, repositoryServiceContract: {} })).toEqual([]);
    });
  });

  test('reports cyclic YAML as a file diagnostic and continues checking other files', async () => {
    await withRepositoryRoot({ 'contracts/cyclic.yaml': 'self: &self\n  child: *self\n',
      'contracts/jobs.yaml': 'cron: "0 9 * * *"\n' }, async repositoryRoot => {
      const diagnostics = await validateRepositoryTimeContract({ repositoryRoot, repositoryServiceContract: {} });
      expect(diagnostics).toHaveLength(2);
      expect(diagnostics).toContainEqual(expect.objectContaining({ file: 'contracts/cyclic.yaml', path: 'document' }));
    });
  });
  test('does not treat calculator names and prose as schedules', async () => {
    await withRepositoryRoot({
      'contracts/conformance.yaml': 'cases:\n  - id: break-even-planning.repeating-quantity\n    description: recurring decimal\n',
      'RUNBOOK.md': 'Repeated requests must be idempotent.\n'
    }, async (repositoryRoot) => {
      expect(await validateRepositoryTimeContract({ repositoryRoot, repositoryServiceContract: {} })).toEqual([]);
    });
  });

  test('does not let an unrelated timezone hide an invalid schedule', async () => {
    await withRepositoryRoot({ 'contracts/jobs.yaml': 'display:\n  timezone: Asia/Seoul\njobs:\n  - cron: "0 9 * * *"\n' }, async (repositoryRoot) => {
      expect(await validateRepositoryTimeContract({ repositoryRoot, repositoryServiceContract: {} })).toHaveLength(1);
    });
  });
  test('skips repositories without time contract files', async () => {
    await withRepositoryRoot({}, async (repositoryRoot) => {
      const diagnostics = await validateRepositoryTimeContract({
        repositoryRoot,
        repositoryServiceContract: {
          service: {
            repo: 'zdp-core-platform'
          }
        }
      });

      expect(diagnostics).toEqual([]);
    });
  });

  test('passes UTC timestamp and recurring schedule contracts', async () => {
    await withRepositoryRoot(
      {
        'service.yaml': `
service:
  id: scheduler-api
  repo: zdp-platform-runtime
time:
  timestamp_format: UTC ISO 8601
  recurring_schedule:
    wall_time: "09:00"
    timezone: Asia/Seoul
    rule: "FREQ=DAILY"
    next_run_at_utc: "2026-06-30T00:00:00Z"
`,
        'contracts/events.yaml': `
events:
  - type: runtime.job_scheduled
    occurred_at_example: "2026-06-30T00:00:00+00:00"
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryTimeContract({
          repositoryRoot,
          repositoryServiceContract: {
            service: {
              repo: 'zdp-platform-runtime'
            }
          }
        });

        expect(diagnostics).toEqual([]);
      }
    );
  });

  test('fails when contract files use timezone-ambiguous timestamp storage', async () => {
    await withRepositoryRoot(
      {
        'contracts/db.sql': `
CREATE TABLE audit.events (
  event_id text PRIMARY KEY,
  occurred_at timestamp without time zone NOT NULL
);
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryTimeContract({
          repositoryRoot,
          repositoryServiceContract: {
            service: {
              repo: 'zdp-core-platform'
            }
          }
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-XCUT-TIME-001',
          severity: 'error',
          file: 'contracts/db.sql',
          path: 'line.3',
          message:
            'Timestamp storage must not use `timestamp without time zone`; use UTC ISO 8601 payloads or PostgreSQL `timestamptz` storage.'
        });
      }
    );
  });

  test('fails when timestamp examples store local labels or non-UTC offsets', async () => {
    await withRepositoryRoot(
      {
        'contracts/api.yaml': `
examples:
  created_at: "2026-06-30T09:00:00+09:00"
  logged_at: "KST"
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryTimeContract({
          repositoryRoot,
          repositoryServiceContract: {
            service: {
              repo: 'zdp-web-apps'
            }
          }
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-XCUT-TIME-001',
          severity: 'error',
          file: 'contracts/api.yaml',
          path: 'line.2',
          message:
            'Timestamp examples and persisted timestamp values must not store non-UTC offsets as truth; keep UTC timestamps and separate IANA timezone for local intent.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-XCUT-TIME-001',
          severity: 'error',
          file: 'contracts/api.yaml',
          path: 'line.3',
          message:
            'Stored, event, queue, audit, and log timestamps must be UTC ISO 8601, not local timezone labels, browser timezone, or offset-only truth.'
        });
      }
    );
  });

  test('allows datetime as an API wire-type descriptor outside storage schemas', async () => {
    await withRepositoryRoot(
      {
        'contracts/typescript-sdk-models.yaml': `
typescript_sdk_models:
  schema_field_types:
    ExampleResponse:
      created_at: datetime
      expires_at: datetime
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryTimeContract({
          repositoryRoot,
          repositoryServiceContract: {
            service: {
              repo: 'zdp-client-sdks'
            }
          }
        });

        expect(diagnostics).toEqual([]);
      }
    );
  });

  test('fails when recurring schedules omit timezone', async () => {
    await withRepositoryRoot(
      {
        'service.yaml': `
service:
  id: worker-api
  repo: zdp-platform-runtime
jobs:
  recurring:
    wall_time: "09:00"
    rule: "FREQ=DAILY"
    next_run_at_utc: "2026-06-30T00:00:00Z"
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryTimeContract({
          repositoryRoot,
          repositoryServiceContract: {
            service: {
              repo: 'zdp-platform-runtime'
            }
          }
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-XCUT-TIME-001',
          severity: 'error',
          file: 'service.yaml',
          path: 'recurring_schedule.timezone',
          message:
            'Recurring schedules must store a separate IANA `timezone`/`time_zone` field with wall time, rule, and next UTC run time.'
        });
      }
    );
  });

  test('fails when source assigns boundary timestamps with locale formatting', async () => {
    await withRepositoryRoot(
      {
        'contracts/time.ts': `
export function createLogEvent() {
  const timestamp = new Date().toLocaleString();
  return { timestamp };
}
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryTimeContract({
          repositoryRoot,
          repositoryServiceContract: {
            service: {
              repo: 'zdp-platform-runtime'
            }
          }
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-XCUT-TIME-001',
          severity: 'error',
          file: 'contracts/time.ts',
          path: 'line.2',
          message:
            'Timestamp values that cross storage, event, log, or API boundaries must not be produced with locale formatting methods.'
        });
      }
    );
  });
});

async function withRepositoryRoot(
  files: Record<string, string>,
  callback: (repositoryRoot: string) => Promise<void>
): Promise<void> {
  const repositoryRoot = await mkdtemp(
    join(tmpdir(), 'zdp-architecture-linter-xcut-time-')
  );

  try {
    for (const [file, source] of Object.entries(files)) {
      const fullPath = join(repositoryRoot, file);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, source.trimStart(), 'utf8');
    }

    await callback(repositoryRoot);
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true });
  }
}
