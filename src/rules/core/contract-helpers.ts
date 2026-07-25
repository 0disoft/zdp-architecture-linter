import type { Diagnostic } from '../../diagnostics.ts';
import {
  formatError,
  isMissingPathError,
  isRecord,
  readPath,
  readRepositoryName,
  readStringField
} from '../../contract-value-helpers.ts';

export {
  formatError,
  isMissingPathError,
  isRecord,
  readPath,
  readRepositoryName,
  readStringField
} from '../../contract-value-helpers.ts';

const CORE_CONTRACT_RULE_ID = 'ZDP-CORE-001';

export function validateRequiredStringArrayEntries(input: {
  readonly value: unknown;
  readonly file: string;
  readonly path: string;
  readonly field: string;
  readonly requiredEntries: readonly string[];
}): readonly Diagnostic[] {
  const entries = readStringArrayPath(input.value, input.field);
  const diagnostics: Diagnostic[] = [];

  for (const requiredEntry of input.requiredEntries) {
    if (entries.includes(requiredEntry)) {
      continue;
    }

    diagnostics.push(
      createCoreDiagnostic(
        input.file,
        input.path,
        `Core platform contract \`${input.file}\` must include \`${requiredEntry}\` in \`${input.field}\`.`
      )
    );
  }

  return diagnostics;
}

export function validateExactValue(input: {
  readonly value: unknown;
  readonly file: string;
  readonly path: string;
  readonly field?: string;
  readonly expected: unknown;
  readonly message: string;
}): readonly Diagnostic[] {
  const actual = readPath(input.value, input.field ?? input.path);

  if (actual === input.expected) {
    return [];
  }

  return [createCoreDiagnostic(input.file, input.path, input.message)];
}

export function hasRequiredBoundaryField(
  boundary: Record<string, unknown>,
  field: string
): boolean {
  const value = boundary[field];

  if (Array.isArray(value)) {
    return value.some(
      (entry) => typeof entry === 'string' && entry.trim().length > 0
    );
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  return typeof value === 'boolean';
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

export function createCoreDiagnostic(
  file: string,
  path: string,
  message: string
): Diagnostic {
  return {
    ruleId: CORE_CONTRACT_RULE_ID,
    severity: 'error',
    file,
    path,
    message
  };
}
