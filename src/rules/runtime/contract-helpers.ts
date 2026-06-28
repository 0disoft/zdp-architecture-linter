import type { Diagnostic } from '../../diagnostics.ts';

export const RUNTIME_CONTRACT_RULE_ID = 'ZDP-RUNTIME-001';

const RUNTIME_CONTRACT_ENFORCEMENTS = [
  'smoke_runner',
  'architecture_linter',
  'owning_contract_checker',
  'operator_review'
] as const;

type RuntimeContractEnforcement = (typeof RUNTIME_CONTRACT_ENFORCEMENTS)[number];

export interface RequiredBlockedProductionCondition {
  readonly condition: string;
  readonly enforcedBy: RuntimeContractEnforcement;
}

interface BlockedProductionConditionEntry {
  readonly condition: string;
  readonly enforcedBy: string;
}

export function validateRequiredStringField(input: {
  readonly value: unknown;
  readonly file: string;
  readonly path: string;
  readonly field: string;
  readonly label: string;
}): readonly Diagnostic[] {
  if (isRecord(input.value) && readStringField(input.value, input.field) !== null) {
    return [];
  }

  return [
    createRuntimeDiagnostic(
      input.file,
      input.path,
      `Runtime contract \`${input.file}\` must declare ${input.label}.`
    )
  ];
}

export function validateRequiredStringArrayField(input: {
  readonly value: unknown;
  readonly file: string;
  readonly path: string;
  readonly field: string;
}): readonly Diagnostic[] {
  const candidate = readPath(input.value, input.field);

  if (!Array.isArray(candidate) || candidate.length === 0) {
    return [
      createRuntimeDiagnostic(
        input.file,
        input.path,
        `Runtime contract \`${input.file}\` must declare \`${input.field}\` as a non-empty string list.`
      )
    ];
  }

  return validateStringArrayItems(input);
}

export function validateOptionalStringArrayField(input: {
  readonly value: unknown;
  readonly file: string;
  readonly path: string;
  readonly field: string;
}): readonly Diagnostic[] {
  if (readPath(input.value, input.field) === undefined) {
    return [];
  }

  return validateStringArrayItems(input);
}

export function validatePositiveIntegerField(input: {
  readonly value: unknown;
  readonly file: string;
  readonly path: string;
  readonly field: string;
}): readonly Diagnostic[] {
  const candidate = readPath(input.value, input.field);

  if (
    typeof candidate === 'number' &&
    Number.isInteger(candidate) &&
    candidate > 0
  ) {
    return [];
  }

  return [
    createRuntimeDiagnostic(
      input.file,
      input.path,
      `Runtime contract \`${input.file}\` must declare \`${input.field}\` as a positive integer.`
    )
  ];
}

export function validateOptionalJsonExpectationField(input: {
  readonly value: unknown;
  readonly file: string;
  readonly path: string;
  readonly field: string;
}): readonly Diagnostic[] {
  const candidate = readPath(input.value, input.field);

  if (candidate === undefined) {
    return [];
  }

  if (!isRecord(candidate)) {
    return [
      createRuntimeDiagnostic(
        input.file,
        input.path,
        `Runtime contract \`${input.file}\` must declare \`${input.field}\` as an object.`
      )
    ];
  }

  for (const value of Object.values(candidate)) {
    if (
      typeof value === 'boolean' ||
      typeof value === 'string' ||
      (Array.isArray(value) &&
        value.every((entry) => typeof entry === 'string' && entry.trim().length > 0))
    ) {
      continue;
    }

    return [
      createRuntimeDiagnostic(
        input.file,
        input.path,
        `Runtime contract \`${input.file}\` must declare \`${input.field}\` values as booleans, strings, or string lists.`
      )
    ];
  }

  return [];
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
      createRuntimeDiagnostic(
        input.file,
        input.path,
        `Runtime contract \`${input.file}\` must include \`${requiredEntry}\` in \`${input.field}\`.`
      )
    );
  }

  return diagnostics;
}

export function validateRequiredBlockedProductionConditions(input: {
  readonly value: unknown;
  readonly file: string;
  readonly path: string;
  readonly field: string;
  readonly requiredEntries: readonly RequiredBlockedProductionCondition[];
}): readonly Diagnostic[] {
  const entries = readBlockedProductionConditionEntries(input.value, input.field);
  const diagnostics: Diagnostic[] = [];

  diagnostics.push(
    ...validateBlockedProductionConditionShape({
      value: input.value,
      file: input.file,
      path: input.path,
      field: input.field
    })
  );

  if (entries.length === 0) {
    diagnostics.push(
      createRuntimeDiagnostic(
        input.file,
        input.path,
        `Runtime contract \`${input.file}\` must declare \`${input.field}\` as a non-empty list of \`{ condition, enforced_by }\` objects.`
      )
    );
  }

  diagnostics.push(
    ...validateBlockedProductionEnforcementValues({
      entries,
      file: input.file,
      path: input.path,
      field: input.field
    })
  );

  for (const requiredEntry of input.requiredEntries) {
    const actualEntry = entries.find(
      (entry) => entry.condition === requiredEntry.condition
    );

    if (actualEntry === undefined) {
      diagnostics.push(
        createRuntimeDiagnostic(
          input.file,
          input.path,
          `Runtime contract \`${input.file}\` must include \`${requiredEntry.condition}\` in \`${input.field}\`.`
        )
      );
      continue;
    }

    if (actualEntry.enforcedBy !== requiredEntry.enforcedBy) {
      diagnostics.push(
        createRuntimeDiagnostic(
          input.file,
          input.path,
          `Runtime contract \`${input.file}\` must assign \`${requiredEntry.condition}\` in \`${input.field}\` to enforcement owner \`${requiredEntry.enforcedBy}\`.`
        )
      );
    }
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

  return [createRuntimeDiagnostic(input.file, input.path, input.message)];
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

export function createRuntimeDiagnostic(
  file: string,
  path: string,
  message: string
): Diagnostic {
  return {
    ruleId: RUNTIME_CONTRACT_RULE_ID,
    severity: 'error',
    file,
    path,
    message
  };
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

  if (candidate.every((item) => typeof item === 'string')) {
    return [];
  }

  return [
    createRuntimeDiagnostic(
      input.file,
      input.path,
      `Runtime contract \`${input.file}\` must declare \`${input.field}\` as a string list.`
    )
  ];
}

function validateBlockedProductionConditionShape(input: {
  readonly value: unknown;
  readonly file: string;
  readonly path: string;
  readonly field: string;
}): readonly Diagnostic[] {
  const candidate = readPath(input.value, input.field);

  if (!Array.isArray(candidate)) {
    return [];
  }

  for (const entry of candidate) {
    if (
      isRecord(entry) &&
      readStringField(entry, 'condition') !== null &&
      readStringField(entry, 'enforced_by') !== null
    ) {
      continue;
    }

    return [
      createRuntimeDiagnostic(
        input.file,
        input.path,
        `Runtime contract \`${input.file}\` must declare every \`${input.field}\` item as a \`{ condition, enforced_by }\` object.`
      )
    ];
  }

  return [];
}

function validateBlockedProductionEnforcementValues(input: {
  readonly entries: readonly BlockedProductionConditionEntry[];
  readonly file: string;
  readonly path: string;
  readonly field: string;
}): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const entry of input.entries) {
    if (isRuntimeContractEnforcement(entry.enforcedBy)) {
      continue;
    }

    diagnostics.push(
      createRuntimeDiagnostic(
        input.file,
        input.path,
        `Runtime contract \`${input.file}\` must use a known \`enforced_by\` value for \`${entry.condition}\` in \`${input.field}\`.`
      )
    );
  }

  return diagnostics;
}

function readBlockedProductionConditionEntries(
  value: unknown,
  path: string
): readonly BlockedProductionConditionEntry[] {
  const candidate = readPath(value, path);

  if (!Array.isArray(candidate)) {
    return [];
  }

  return candidate.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    const condition = readStringField(entry, 'condition');
    const enforcedBy = readStringField(entry, 'enforced_by');

    if (condition === null || enforcedBy === null) {
      return [];
    }

    return [
      {
        condition,
        enforcedBy
      }
    ];
  });
}

function readStringArrayPath(value: unknown, path: string): readonly string[] {
  const candidate = readPath(value, path);

  if (!Array.isArray(candidate)) {
    return [];
  }

  return candidate.flatMap((entry) =>
    typeof entry === 'string' && entry.trim().length > 0 ? [entry.trim()] : []
  );
}

function isRuntimeContractEnforcement(
  value: string
): value is RuntimeContractEnforcement {
  return RUNTIME_CONTRACT_ENFORCEMENTS.includes(
    value as RuntimeContractEnforcement
  );
}
