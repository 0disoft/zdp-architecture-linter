import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { validateRepositoryTimeContract } from '../src/xcut-time-rules.ts';

describe('cross-cutting time rules', () => {
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
