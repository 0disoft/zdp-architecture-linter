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

export const CONNECTORS_REPOSITORY_NAME = 'zdp-connectors-platform';
export const CONNECTORS_RULE_ID = 'ZDP-CONNECTORS-001';

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
      createConnectorsDiagnostic(
        input.file,
        input.path,
        `Connectors contract \`${input.file}\` must include \`${requiredEntry}\` in \`${input.field}\`.`
      )
    );
  }

  return diagnostics;
}

export function validateExactValue(input: {
  readonly value: unknown;
  readonly file: string;
  readonly path: string;
  readonly diagnosticPath?: string;
  readonly expected: unknown;
  readonly message: string;
}): readonly Diagnostic[] {
  const actual = readPath(input.value, input.path);

  if (actual === input.expected) {
    return [];
  }

  return [
    createConnectorsDiagnostic(
      input.file,
      input.diagnosticPath ?? input.path,
      input.message
    )
  ];
}

export function readRecordArrayPath(
  value: unknown,
  path: string
): readonly Record<string, unknown>[] {
  const candidate = readPath(value, path);

  if (!Array.isArray(candidate)) {
    return [];
  }

  return candidate.filter(isRecord);
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

export function createConnectorsDiagnostic(
  file: string,
  path: string,
  message: string
): Diagnostic {
  return {
    ruleId: CONNECTORS_RULE_ID,
    severity: 'error',
    file,
    path,
    message
  };
}
