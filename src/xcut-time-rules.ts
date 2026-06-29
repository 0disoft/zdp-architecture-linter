import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Diagnostic } from './diagnostics.ts';

const TIME_CONTRACT_RULE_ID = 'ZDP-XCUT-TIME-001';

const ROOT_TIME_CONTRACT_FILES = [
  'service.yaml',
  'service.yml',
  'product-spec.md',
  'BOUNDARY.md',
  'RUNBOOK.md'
] as const;

const TIME_CONTRACT_DIRECTORIES = ['contracts', 'schemas'] as const;
const REVIEWED_FILE_EXTENSIONS = [
  '.yaml',
  '.yml',
  '.json',
  '.md',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.rs',
  '.sql'
] as const;

const IGNORED_DIRECTORY_NAMES = new Set([
  '.git',
  '.astro',
  '.svelte-kit',
  'coverage',
  'dist',
  'node_modules',
  'storybook-static',
  'target'
]);

const TIMESTAMP_FIELD_PATTERN =
  /\b(?:timestamp|created_at|updated_at|logged_at|occurred_at|available_at|expires_at|scheduled_at|next_run_at(?:_utc)?|event_time|log_time)\b/i;
const FORBIDDEN_CONTEXT_PATTERN =
  /\b(?:forbidden|not allowed|must not|prohibit(?:ed)?|reject(?:ed)?|ban(?:ned)?|금지|허용하지|허용 안|차단)\b/i;
const TIMESTAMP_WITHOUT_TIME_ZONE_PATTERN =
  /\btimestamp\s+without\s+time\s+zone\b/i;
const SQL_DATETIME_TYPE_PATTERN =
  /\b(?:timestamp|created_at|updated_at|logged_at|occurred_at|available_at|expires_at|scheduled_at|next_run_at(?:_utc)?|event_time|log_time)\b[^;\n]*\bdatetime\b/i;
const LOCAL_TIMEZONE_PATTERN =
  /\b(?:KST|JST|PST|PDT|EST|EDT|CST|CDT|MST|MDT|HST|AKST|AKDT)\b/;
const LOCAL_TIME_MARKER_PATTERN =
  /\b(?:local time|server local|browser timezone|client timezone|timezone offset only|offset only)\b/i;
const LOCAL_FORMATTING_PATTERN =
  /\b(?:timestamp|createdAt|updatedAt|loggedAt|occurredAt|availableAt|expiresAt|scheduledAt|nextRunAt|eventTime|logTime)\b[^;\n]*(?:\.toLocaleString\(|\.toLocaleDateString\(|\.toLocaleTimeString\(|\.toString\(\))/;
const ISO_TIMESTAMP_VALUE_PATTERN =
  /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|\+00:00|[+-]\d{2}:\d{2})?/;
const UTC_ISO_TIMESTAMP_VALUE_PATTERN =
  /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|\+00:00)/;
const NON_UTC_ISO_TIMESTAMP_OFFSET_PATTERN =
  /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?!\+00:00)[+-]\d{2}:\d{2}/;
const RECURRING_SCHEDULE_PATTERN =
  /\b(?:recurring|recurrence|rrule|cron(?:_expression)?|wall_time|repeat(?:s|ed|ing)?|scheduled job|schedule rule)\b/i;
const TIMEZONE_FIELD_PATTERN = /\b(?:timezone|time_zone)\b/i;

export async function validateRepositoryTimeContract(input: {
  readonly repositoryRoot: string;
  readonly repositoryServiceContract: unknown;
}): Promise<readonly Diagnostic[]> {
  const files = await collectTimeContractFiles(input.repositoryRoot);
  const diagnostics: Diagnostic[] = [];

  for (const file of files) {
    const source = await readFile(join(input.repositoryRoot, file), 'utf8');
    diagnostics.push(...validateTimeContractSource(file, source));
  }

  return diagnostics;
}

function validateTimeContractSource(
  file: string,
  source: string
): readonly Diagnostic[] {
  return [
    ...validateTimestampLines(file, source),
    ...validateRecurringScheduleContract(file, source)
  ];
}

function validateTimestampLines(
  file: string,
  source: string
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lines = source.split(/\r?\n/);

  lines.forEach((line, index) => {
    if (line.trim().length === 0 || FORBIDDEN_CONTEXT_PATTERN.test(line)) {
      return;
    }

    if (TIMESTAMP_WITHOUT_TIME_ZONE_PATTERN.test(line)) {
      diagnostics.push(
        createTimeDiagnostic({
          file,
          path: `line.${index + 1}`,
          message:
            'Timestamp storage must not use `timestamp without time zone`; use UTC ISO 8601 payloads or PostgreSQL `timestamptz` storage.'
        })
      );
      return;
    }

    if (SQL_DATETIME_TYPE_PATTERN.test(line)) {
      diagnostics.push(
        createTimeDiagnostic({
          file,
          path: `line.${index + 1}`,
          message:
            'Stored timestamp fields must not use ambiguous `datetime` types; use UTC ISO 8601 payloads or timezone-aware storage.'
        })
      );
      return;
    }

    if (
      TIMESTAMP_FIELD_PATTERN.test(line) &&
      (LOCAL_TIMEZONE_PATTERN.test(line) || LOCAL_TIME_MARKER_PATTERN.test(line))
    ) {
      diagnostics.push(
        createTimeDiagnostic({
          file,
          path: `line.${index + 1}`,
          message:
            'Stored, event, queue, audit, and log timestamps must be UTC ISO 8601, not local timezone labels, browser timezone, or offset-only truth.'
        })
      );
      return;
    }

    if (LOCAL_FORMATTING_PATTERN.test(line)) {
      diagnostics.push(
        createTimeDiagnostic({
          file,
          path: `line.${index + 1}`,
          message:
            'Timestamp values that cross storage, event, log, or API boundaries must not be produced with locale formatting methods.'
        })
      );
      return;
    }

    if (
      TIMESTAMP_FIELD_PATTERN.test(line) &&
      NON_UTC_ISO_TIMESTAMP_OFFSET_PATTERN.test(line)
    ) {
      diagnostics.push(
        createTimeDiagnostic({
          file,
          path: `line.${index + 1}`,
          message:
            'Timestamp examples and persisted timestamp values must not store non-UTC offsets as truth; keep UTC timestamps and separate IANA timezone for local intent.'
        })
      );
      return;
    }

    if (
      TIMESTAMP_FIELD_PATTERN.test(line) &&
      ISO_TIMESTAMP_VALUE_PATTERN.test(line) &&
      !UTC_ISO_TIMESTAMP_VALUE_PATTERN.test(line)
    ) {
      diagnostics.push(
        createTimeDiagnostic({
          file,
          path: `line.${index + 1}`,
          message:
            'Timestamp examples and persisted timestamp values must include `Z` or `+00:00` UTC designators.'
        })
      );
    }
  });

  return diagnostics;
}

function validateRecurringScheduleContract(
  file: string,
  source: string
): readonly Diagnostic[] {
  if (!RECURRING_SCHEDULE_PATTERN.test(source) || TIMEZONE_FIELD_PATTERN.test(source)) {
    return [];
  }

  return [
    createTimeDiagnostic({
      file,
      path: 'recurring_schedule.timezone',
      message:
        'Recurring schedules must store a separate IANA `timezone`/`time_zone` field with wall time, rule, and next UTC run time.'
    })
  ];
}

async function collectTimeContractFiles(
  repositoryRoot: string
): Promise<readonly string[]> {
  const rootFiles = (
    await Promise.all(
      ROOT_TIME_CONTRACT_FILES.map(async (file) =>
        (await isFile(join(repositoryRoot, file))) ? [file] : []
      )
    )
  ).flat();
  const directoryFiles = (
    await Promise.all(
      TIME_CONTRACT_DIRECTORIES.map((directory) =>
        collectFilesFromDirectory(repositoryRoot, directory)
      )
    )
  ).flat();

  return [...rootFiles, ...directoryFiles].sort((left, right) =>
    left.localeCompare(right)
  );
}

async function collectFilesFromDirectory(
  repositoryRoot: string,
  relativeDirectory: string
): Promise<readonly string[]> {
  const absoluteDirectory = join(repositoryRoot, relativeDirectory);

  if (!(await isDirectory(absoluteDirectory))) {
    return [];
  }

  const entries = await readdir(absoluteDirectory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const relativePath = `${relativeDirectory}/${entry.name}`;

    if (entry.isDirectory()) {
      if (!IGNORED_DIRECTORY_NAMES.has(entry.name)) {
        files.push(...(await collectFilesFromDirectory(repositoryRoot, relativePath)));
      }

      continue;
    }

    if (entry.isFile() && hasReviewedExtension(entry.name)) {
      files.push(relativePath);
    }
  }

  return files;
}

function hasReviewedExtension(fileName: string): boolean {
  const normalized = fileName.toLowerCase();

  return REVIEWED_FILE_EXTENSIONS.some((extension) =>
    normalized.endsWith(extension)
  );
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch (error) {
    if (isMissingPathError(error)) {
      return false;
    }

    throw error;
  }
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch (error) {
    if (isMissingPathError(error)) {
      return false;
    }

    throw error;
  }
}

function createTimeDiagnostic(input: {
  readonly file: string;
  readonly path: string;
  readonly message: string;
}): Diagnostic {
  return {
    ruleId: TIME_CONTRACT_RULE_ID,
    severity: 'error',
    file: input.file,
    path: input.path,
    message: input.message
  };
}

function isMissingPathError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as { readonly code?: unknown }).code === 'ENOENT'
  );
}
