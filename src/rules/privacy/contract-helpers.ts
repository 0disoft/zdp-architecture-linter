import type { Diagnostic } from '../../diagnostics.ts';

export const PRIVACY_REPOSITORY_NAME = 'zdp-privacy-access-broker';
export const PRIVACY_CONTRACT_RULE_ID = 'ZDP-PRIVACY-001';

export function validateRequiredStringArrayEntries(input: {
  readonly value: unknown;
  readonly file: string;
  readonly path: string;
  readonly field: string;
  readonly requiredEntries: readonly string[];
}): readonly Diagnostic[] {
  const entries = readStringArrayPath(input.value, input.field);
  const diagnostics: Diagnostic[] = [
    ...validateStringArrayItems({
      value: input.value,
      file: input.file,
      path: input.path,
      field: input.field
    })
  ];

  for (const requiredEntry of input.requiredEntries) {
    if (entries.includes(requiredEntry)) {
      continue;
    }

    diagnostics.push(
      createPrivacyDiagnostic(
        input.file,
        input.path,
        `Privacy broker contract \`${input.file}\` must include \`${requiredEntry}\` in \`${input.field}\`.`
      )
    );
  }

  return diagnostics;
}

export function validateExactStringArrayEntries(input: {
  readonly value: unknown;
  readonly file: string;
  readonly path: string;
  readonly field: string;
  readonly expectedEntries: readonly string[];
}): readonly Diagnostic[] {
  const entries = readStringArrayPath(input.value, input.field);
  const diagnostics: Diagnostic[] = [
    ...validateStringArrayItems({
      value: input.value,
      file: input.file,
      path: input.path,
      field: input.field
    })
  ];
  const missingEntries = input.expectedEntries.filter(
    (entry) => !entries.includes(entry)
  );
  const extraEntries = entries.filter(
    (entry) => !input.expectedEntries.includes(entry)
  );
  const duplicateEntries = findDuplicateStrings(entries);

  for (const missingEntry of missingEntries) {
    diagnostics.push(
      createPrivacyDiagnostic(
        input.file,
        input.path,
        `Privacy broker contract \`${input.file}\` must include \`${missingEntry}\` in \`${input.field}\`.`
      )
    );
  }

  for (const extraEntry of extraEntries) {
    diagnostics.push(
      createPrivacyDiagnostic(
        input.file,
        input.path,
        `Privacy broker contract \`${input.file}\` must not include unapproved \`${extraEntry}\` in \`${input.field}\`.`
      )
    );
  }

  for (const duplicateEntry of duplicateEntries) {
    diagnostics.push(
      createPrivacyDiagnostic(
        input.file,
        input.path,
        `Privacy broker contract \`${input.file}\` must not duplicate \`${duplicateEntry}\` in \`${input.field}\`.`
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
}): readonly Diagnostic[] {
  const actual = readPath(input.value, input.path);

  if (actual === input.expected) {
    return [];
  }

  return [createPrivacyDiagnostic(input.file, input.path, input.message)];
}

export function validateMaxNumber(input: {
  readonly value: unknown;
  readonly file: string;
  readonly path: string;
  readonly max: number;
  readonly message: string;
}): readonly Diagnostic[] {
  const actual = readPath(input.value, input.path);

  if (typeof actual === 'number' && actual <= input.max) {
    return [];
  }

  return [createPrivacyDiagnostic(input.file, input.path, input.message)];
}

export function validatePositiveSafeInteger(input: {
  readonly value: unknown;
  readonly file: string;
  readonly path: string;
  readonly message: string;
}): readonly Diagnostic[] {
  const actual = readPath(input.value, input.path);

  if (typeof actual === 'number' && Number.isSafeInteger(actual) && actual > 0) {
    return [];
  }

  return [createPrivacyDiagnostic(input.file, input.path, input.message)];
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

export function createPrivacyDiagnostic(
  file: string,
  path: string,
  message: string
): Diagnostic {
  return {
    ruleId: PRIVACY_CONTRACT_RULE_ID,
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

function validateStringArrayItems(input: {
  readonly value: unknown;
  readonly file: string;
  readonly path: string;
  readonly field: string;
}): readonly Diagnostic[] {
  const candidate = readPath(input.value, input.field);

  if (!Array.isArray(candidate)) {
    return [];
  }

  if (
    candidate.every(
      (item) => typeof item === 'string' && item.trim().length > 0
    )
  ) {
    return [];
  }

  return [
    createPrivacyDiagnostic(
      input.file,
      input.path,
      `Privacy broker contract \`${input.file}\` must declare \`${input.field}\` as a string list.`
    )
  ];
}

function findDuplicateStrings(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
      continue;
    }

    seen.add(value);
  }

  return [...duplicates].sort();
}
