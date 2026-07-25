import type { Diagnostic } from '../../diagnostics.ts';
import {
  formatError,
  isMissingPathError,
  isRecord,
  readPath,
  readRepositoryName,
  readStringField
} from '../../contract-value-helpers.ts';
import {
  extractTestCallNames,
  stripCommentsAndStringLiterals
} from '../../source-proof.ts';

export {
  formatError,
  isMissingPathError,
  isRecord,
  readPath,
  readRepositoryName,
  readStringField
} from '../../contract-value-helpers.ts';

export const CREDENTIAL_VAULT_REPOSITORY_NAME =
  'zdp-privacy-credential-vault';
export const CREDENTIAL_VAULT_RULE_ID = 'ZDP-CREDENTIAL-001';

export function validateExactStringSet(input: {
  readonly actual: readonly string[];
  readonly expected: readonly string[];
  readonly file: string;
  readonly path: string;
  readonly label: string;
}): readonly Diagnostic[] {
  const missingEntries = input.expected.filter(
    (entry) => !input.actual.includes(entry)
  );
  const extraEntries = input.actual.filter(
    (entry) => !input.expected.includes(entry)
  );
  const duplicateEntries = findDuplicateStrings(input.actual);
  const diagnostics: Diagnostic[] = [];

  for (const missingEntry of missingEntries) {
    diagnostics.push(
      createCredentialDiagnostic(
        input.file,
        input.path,
        `${input.label} must include \`${missingEntry}\` from the YAML contract.`
      )
    );
  }

  for (const extraEntry of extraEntries) {
    diagnostics.push(
      createCredentialDiagnostic(
        input.file,
        input.path,
        `${input.label} must not include unapproved \`${extraEntry}\` outside the YAML contract.`
      )
    );
  }

  for (const duplicateEntry of duplicateEntries) {
    diagnostics.push(
      createCredentialDiagnostic(
        input.file,
        input.path,
        `${input.label} must not duplicate \`${duplicateEntry}\`.`
      )
    );
  }

  return diagnostics;
}

export function validateSourceTestNames(input: {
  readonly file: string;
  readonly source: string;
  readonly requiredNames: readonly string[];
}): readonly Diagnostic[] {
  const testNames = extractTestCallNames(input.source);
  const diagnostics: Diagnostic[] = [];

  for (const name of input.requiredNames) {
    if (testNames.includes(name)) {
      continue;
    }

    diagnostics.push(
      createCredentialDiagnostic(
        input.file,
        'source',
        `Credential vault checker source must include test case \`${name}\`.`
      )
    );
  }

  return diagnostics;
}

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
      createCredentialDiagnostic(
        input.file,
        input.path,
        `Credential vault contract \`${input.file}\` must include \`${requiredEntry}\` in \`${input.field}\`.`
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
      createCredentialDiagnostic(
        input.file,
        input.path,
        `Credential vault contract \`${input.file}\` must include \`${missingEntry}\` in \`${input.field}\`.`
      )
    );
  }

  for (const extraEntry of extraEntries) {
    diagnostics.push(
      createCredentialDiagnostic(
        input.file,
        input.path,
        `Credential vault contract \`${input.file}\` must not include unapproved \`${extraEntry}\` in \`${input.field}\`.`
      )
    );
  }

  for (const duplicateEntry of duplicateEntries) {
    diagnostics.push(
      createCredentialDiagnostic(
        input.file,
        input.path,
        `Credential vault contract \`${input.file}\` must not duplicate \`${duplicateEntry}\` in \`${input.field}\`.`
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
    createCredentialDiagnostic(
      input.file,
      input.diagnosticPath ?? input.path,
      input.message
    )
  ];
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

  return [createCredentialDiagnostic(input.file, input.path, input.message)];
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

  return [createCredentialDiagnostic(input.file, input.path, input.message)];
}

export function readRustStringArrayConstant(
  source: string,
  constName: string
): readonly string[] | undefined {
  const pattern = new RegExp(
    `pub\\s+const\\s+${escapeRegExp(
      constName
    )}\\s*:\\s*&\\[&str\\]\\s*=\\s*&\\[([\\s\\S]*?)\\];`,
    'm'
  );
  const match = source.match(pattern);
  if (match === null) {
    return undefined;
  }

  const body = match[1] ?? '';
  const values: string[] = [];
  for (const value of body.matchAll(/"([^"]+)"/g)) {
    const item = value[1];
    if (item !== undefined) {
      values.push(item);
    }
  }

  return values;
}

export function readRustNumberConstant(
  source: string,
  constName: string
): number | undefined {
  const pattern = new RegExp(
    `pub\\s+const\\s+${escapeRegExp(constName)}\\s*:\\s*[^=]+?=\\s*(\\d+)\\s*;`,
    'm'
  );
  const match = source.match(pattern);
  if (match === null) {
    return undefined;
  }

  const value = Number(match[1]);
  return Number.isSafeInteger(value) ? value : undefined;
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

export function createCredentialDiagnostic(
  file: string,
  path: string,
  message: string
): Diagnostic {
  return {
    ruleId: CREDENTIAL_VAULT_RULE_ID,
    severity: 'error',
    file,
    path,
    message
  };
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
    createCredentialDiagnostic(
      input.file,
      input.path,
      `Credential vault contract \`${input.file}\` must declare \`${input.field}\` as a string list.`
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function readFunctionBody(
  source: string,
  functionName: string
): string | null {
  const codeOnlySource = stripCommentsAndStringLiterals(source);
  const pattern = new RegExp(
    `function\\s+${escapeRegExp(functionName)}\\s*\\(`,
    'm'
  );
  const match = pattern.exec(codeOnlySource);
  if (match === null) {
    return null;
  }

  const openBrace = codeOnlySource.indexOf('{', match.index);
  if (openBrace === -1) {
    return null;
  }

  let depth = 0;
  for (let index = openBrace; index < codeOnlySource.length; index += 1) {
    const char = codeOnlySource[index];
    if (char === '{') {
      depth += 1;
      continue;
    }

    if (char !== '}') {
      continue;
    }

    depth -= 1;
    if (depth === 0) {
      return source.slice(openBrace + 1, index);
    }
  }

  return null;
}
