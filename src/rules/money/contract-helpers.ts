import type { Diagnostic } from '../../diagnostics.ts';

export const MONEY_REPOSITORY_NAME = 'zdp-money-platform';
export const MONEY_PLATFORM_CONTRACT_RULE_ID = 'ZDP-MONEY-PLATFORM-001';
export const MONEY_PAYMENT_WEBHOOK_OUTBOX_RULE_ID = 'ZDP-MONEY-004';

export function validateRequiredStringArrayEntries(input: {
  readonly value: unknown;
  readonly file: string;
  readonly path: string;
  readonly field: string;
  readonly requiredEntries: readonly string[];
  readonly ruleId?: string;
  readonly readEntries?: (value: unknown, path: string) => readonly string[];
}): readonly Diagnostic[] {
  const entries = (input.readEntries ?? readStringArrayPath)(input.value, input.field);
  const diagnostics: Diagnostic[] = [];

  for (const requiredEntry of input.requiredEntries) {
    if (entries.includes(requiredEntry)) {
      continue;
    }

    diagnostics.push(
      createMoneyDiagnostic(
        input.file,
        input.path,
        `Money platform contract \`${input.file}\` must include \`${requiredEntry}\` in \`${input.field}\`.`,
        input.ruleId
      )
    );
  }

  return diagnostics;
}

export function validateExactValue(input: {
  readonly value: unknown;
  readonly file: string;
  readonly path: string;
  readonly expected: unknown;
  readonly message: string;
  readonly ruleId?: string;
}): readonly Diagnostic[] {
  const actual = readPath(input.value, input.path);

  if (actual === input.expected) {
    return [];
  }

  return [
    createMoneyDiagnostic(input.file, input.path, input.message, input.ruleId)
  ];
}

export function readRepositoryName(value: unknown): string | null {
  if (!isRecord(value) || !isRecord(value.service)) {
    return null;
  }

  return readStringField(value.service, 'repo');
}

export function readStringArrayPath(
  value: unknown,
  path: string
): readonly string[] {
  const candidate = readPath(value, path);

  if (!Array.isArray(candidate)) {
    return [];
  }

  return candidate.flatMap((entry) =>
    typeof entry === 'string' && entry.trim().length > 0 ? [entry.trim()] : []
  );
}

export function readEventRefArrayPath(
  value: unknown,
  path: string
): readonly string[] {
  const candidate = readPath(value, path);

  if (!Array.isArray(candidate)) {
    return [];
  }

  return candidate.flatMap((entry) => {
    if (typeof entry === 'string' && entry.trim().length > 0) {
      return [entry.trim()];
    }

    if (!isRecord(entry)) {
      return [];
    }

    const id = entry.id;

    return typeof id === 'string' && id.trim().length > 0 ? [id.trim()] : [];
  });
}

export function readPath(value: unknown, path: string): unknown {
  let current = value;

  for (const segment of path.split('.')) {
    if (!isRecord(current)) {
      return undefined;
    }

    current = current[segment];
  }

  return current;
}

export function readStringField(
  value: Record<string, unknown>,
  field: string
): string | null {
  const candidate = value[field];

  return typeof candidate === 'string' && candidate.trim().length > 0
    ? candidate.trim()
    : null;
}

export function createMoneyDiagnostic(
  file: string,
  path: string,
  message: string,
  ruleId = MONEY_PLATFORM_CONTRACT_RULE_ID
): Diagnostic {
  return {
    ruleId,
    severity: 'error',
    file,
    path,
    message
  };
}

export function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isMissingPathError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
