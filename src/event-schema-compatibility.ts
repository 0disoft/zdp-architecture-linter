import { readdirSync, readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import type { Diagnostic } from './diagnostics.ts';

const EVENT_SCHEMA_DIRECTORY = 'schemas/events';
const EVENT_SCHEMA_FILE_PATTERN = /^(.+)\.v([1-9][0-9]*)\.json$/;
const SAME_VERSION_RULE_ID = 'ZDP-EVENT-004';
const BREAKING_VERSION_RULE_ID = 'ZDP-EVENT-005';
const BREAKING_CHANGE_DISPLAY_LIMIT = 5;

const ANNOTATION_KEYS = new Set([
  '$schema',
  '$id',
  '$comment',
  'title',
  'description',
  'default',
  'examples',
  'deprecated',
  'readOnly',
  'writeOnly'
]);

const MINIMUM_CONSTRAINTS = [
  'minimum',
  'exclusiveMinimum',
  'minLength',
  'minItems',
  'minProperties'
] as const;
const MAXIMUM_CONSTRAINTS = [
  'maximum',
  'exclusiveMaximum',
  'maxLength',
  'maxItems',
  'maxProperties'
] as const;
const STRUCTURAL_KEYWORDS = [
  '$ref',
  'pattern',
  'format',
  'oneOf',
  'anyOf',
  'allOf',
  'not',
  'if',
  'then',
  'else',
  'contains',
  'propertyNames',
  'dependentRequired',
  'dependentSchemas'
] as const;

interface VersionedEventSchema {
  readonly path: string;
  readonly family: string;
  readonly version: number;
  readonly schema: unknown;
}

interface CompatibilityMetadata {
  readonly classification?: unknown;
  readonly previous_schema_ref?: unknown;
  readonly consumer_migration_refs?: unknown;
}

export function validateEventSchemaCompatibility(input: {
  readonly baseArchitectureRoot: string;
  readonly headArchitectureRoot: string;
}): readonly Diagnostic[] {
  const baseSchemas = loadVersionedEventSchemas(input.baseArchitectureRoot);
  const headSchemas = loadVersionedEventSchemas(input.headArchitectureRoot);
  const diagnostics: Diagnostic[] = [];

  for (const [path, baseSchema] of baseSchemas.byPath) {
    const headSchema = headSchemas.byPath.get(path);

    if (headSchema === undefined) {
      diagnostics.push({
        ruleId: SAME_VERSION_RULE_ID,
        severity: 'error',
        file: path,
        path: 'schema',
        message:
          `Published event schema \`${path}\` was removed. Keep released schema versions available and add a new version instead.`
      });
      continue;
    }

    const breakingChanges = findBreakingChanges({
      baseSchema: baseSchema.schema,
      headSchema: headSchema.schema,
      ignoreVersionIdentity: false
    });

    if (breakingChanges.length > 0) {
      diagnostics.push(createBreakingChangeDiagnostic({
        ruleId: SAME_VERSION_RULE_ID,
        file: path,
        messagePrefix:
          `Published event schema \`${path}\` changed incompatibly without a version bump`,
        breakingChanges,
        remediation:
          'Restore the existing version or create the next .vN.json schema and provide consumer migration evidence.'
      }));
    }
  }

  for (const headSchema of headSchemas.byPath.values()) {
    if (baseSchemas.byPath.has(headSchema.path)) {
      continue;
    }

    const previousSchema = findPreviousVersion(headSchema, headSchemas.byFamily);

    if (previousSchema === null) {
      continue;
    }

    const breakingChanges = findBreakingChanges({
      baseSchema: previousSchema.schema,
      headSchema: headSchema.schema,
      ignoreVersionIdentity: true
    });

    if (breakingChanges.length === 0) {
      continue;
    }

    const metadataErrors = validateBreakingVersionMetadata({
      architectureRoot: input.headArchitectureRoot,
      schema: headSchema,
      previousSchema
    });

    if (metadataErrors.length > 0) {
      diagnostics.push({
        ruleId: BREAKING_VERSION_RULE_ID,
        severity: 'error',
        file: headSchema.path,
        path: 'schema.x-zdp-compatibility',
        message:
          `Breaking event schema version \`${headSchema.path}\` requires explicit consumer migration evidence: ${metadataErrors.join('; ')}. Breaking changes: ${formatBreakingChanges(breakingChanges)}.`
      });
    }
  }

  return diagnostics.sort(compareDiagnostics);
}

function findBreakingChanges(input: {
  readonly baseSchema: unknown;
  readonly headSchema: unknown;
  readonly ignoreVersionIdentity: boolean;
}): readonly string[] {
  const changes = new Set<string>();

  compareSchemaNodes({
    base: input.baseSchema,
    head: input.headSchema,
    path: 'schema',
    ignoreVersionIdentity: input.ignoreVersionIdentity,
    changes
  });

  return [...changes].sort();
}

function compareSchemaNodes(input: {
  readonly base: unknown;
  readonly head: unknown;
  readonly path: string;
  readonly ignoreVersionIdentity: boolean;
  readonly changes: Set<string>;
}): void {
  const { base, head } = input;

  if (!isRecord(base) || !isRecord(head)) {
    if (!deepEqual(base, head)) {
      input.changes.add(`${input.path} changed shape`);
    }
    return;
  }

  const comparison: SchemaComparisonInput = {
    ...input,
    base,
    head
  };

  compareRequired(comparison);
  compareProperties(comparison);
  compareType(comparison);
  compareEnum(comparison);
  compareConst(comparison);
  compareConstraints(comparison);
  compareStructuralKeywords(comparison);
  compareItems(comparison);
  compareAdditionalProperties(comparison);
}

function compareRequired(input: SchemaComparisonInput): void {
  const baseRequired = readStringSet(input.base.required);
  const headRequired = readStringSet(input.head.required);

  if (baseRequired === null && headRequired === null) {
    return;
  }

  const baseValues = baseRequired ?? new Set<string>();
  const headValues = headRequired ?? new Set<string>();
  const added = difference(headValues, baseValues);
  const removed = difference(baseValues, headValues);

  if (added.length > 0) {
    input.changes.add(`${input.path}.required added ${formatInlineValues(added)}`);
  }
  if (removed.length > 0) {
    input.changes.add(`${input.path}.required removed ${formatInlineValues(removed)}`);
  }
}

function compareProperties(input: SchemaComparisonInput): void {
  const baseProperties = isRecord(input.base.properties)
    ? input.base.properties
    : {};
  const headProperties = isRecord(input.head.properties)
    ? input.head.properties
    : {};

  for (const [propertyName, baseProperty] of Object.entries(baseProperties)) {
    const propertyPath = `${input.path}.properties.${propertyName}`;

    if (!(propertyName in headProperties)) {
      input.changes.add(`${propertyPath} was removed`);
      continue;
    }

    compareSchemaNodes({
      base: baseProperty,
      head: headProperties[propertyName],
      path: propertyPath,
      ignoreVersionIdentity: input.ignoreVersionIdentity,
      changes: input.changes
    });
  }
}

function compareType(input: SchemaComparisonInput): void {
  const baseTypes = readTypeSet(input.base.type);
  const headTypes = readTypeSet(input.head.type);

  if (baseTypes === null && headTypes === null) {
    return;
  }

  if (!setsEqual(baseTypes ?? new Set<string>(), headTypes ?? new Set<string>())) {
    input.changes.add(
      `${input.path}.type changed from ${formatSchemaValue(input.base.type)} to ${formatSchemaValue(input.head.type)}`
    );
  }
}

function compareEnum(input: SchemaComparisonInput): void {
  const baseEnum = input.base.enum;
  const headEnum = input.head.enum;

  if (!Array.isArray(baseEnum)) {
    return;
  }

  if (!Array.isArray(headEnum)) {
    input.changes.add(`${input.path}.enum was removed`);
    return;
  }

  const removedValues = baseEnum.filter(
    (value) => !headEnum.some((candidate) => deepEqual(candidate, value))
  );

  if (removedValues.length > 0) {
    input.changes.add(
      `${input.path}.enum removed ${removedValues.map(formatSchemaValue).join(', ')}`
    );
  }
}

function compareConst(input: SchemaComparisonInput): void {
  if (!('const' in input.base)) {
    return;
  }

  if (
    input.ignoreVersionIdentity &&
    input.path === 'schema.properties.schema_version'
  ) {
    return;
  }

  if (!('const' in input.head) || !deepEqual(input.base.const, input.head.const)) {
    input.changes.add(
      `${input.path}.const changed from ${formatSchemaValue(input.base.const)} to ${formatSchemaValue(input.head.const)}`
    );
  }
}

function compareConstraints(input: SchemaComparisonInput): void {
  for (const keyword of MINIMUM_CONSTRAINTS) {
    const baseValue = readFiniteNumber(input.base[keyword]);
    const headValue = readFiniteNumber(input.head[keyword]);

    if (headValue !== null && (baseValue === null || headValue > baseValue)) {
      input.changes.add(
        `${input.path}.${keyword} tightened from ${formatSchemaValue(input.base[keyword])} to ${headValue}`
      );
    }
  }

  for (const keyword of MAXIMUM_CONSTRAINTS) {
    const baseValue = readFiniteNumber(input.base[keyword]);
    const headValue = readFiniteNumber(input.head[keyword]);

    if (headValue !== null && (baseValue === null || headValue < baseValue)) {
      input.changes.add(
        `${input.path}.${keyword} tightened from ${formatSchemaValue(input.base[keyword])} to ${headValue}`
      );
    }
  }

  if (input.base.uniqueItems !== true && input.head.uniqueItems === true) {
    input.changes.add(`${input.path}.uniqueItems tightened to true`);
  }
}

function compareStructuralKeywords(input: SchemaComparisonInput): void {
  for (const keyword of STRUCTURAL_KEYWORDS) {
    const baseValue = input.base[keyword];
    const headValue = input.head[keyword];

    if (deepEqual(baseValue, headValue)) {
      continue;
    }

    if (baseValue === undefined && headValue === undefined) {
      continue;
    }

    input.changes.add(`${input.path}.${keyword} changed`);
  }
}

function compareItems(input: SchemaComparisonInput): void {
  if (input.base.items === undefined) {
    return;
  }

  if (input.head.items === undefined) {
    input.changes.add(`${input.path}.items was removed`);
    return;
  }

  compareSchemaNodes({
    base: input.base.items,
    head: input.head.items,
    path: `${input.path}.items`,
    ignoreVersionIdentity: input.ignoreVersionIdentity,
    changes: input.changes
  });
}

function compareAdditionalProperties(input: SchemaComparisonInput): void {
  const baseValue = input.base.additionalProperties;
  const headValue = input.head.additionalProperties;

  if (headValue === false && baseValue !== false) {
    input.changes.add(`${input.path}.additionalProperties tightened to false`);
    return;
  }

  if (isRecord(baseValue) && isRecord(headValue)) {
    compareSchemaNodes({
      base: baseValue,
      head: headValue,
      path: `${input.path}.additionalProperties`,
      ignoreVersionIdentity: input.ignoreVersionIdentity,
      changes: input.changes
    });
  }
}

type SchemaComparisonInput = {
  readonly base: Record<string, unknown>;
  readonly head: Record<string, unknown>;
  readonly path: string;
  readonly ignoreVersionIdentity: boolean;
  readonly changes: Set<string>;
};

function validateBreakingVersionMetadata(input: {
  readonly architectureRoot: string;
  readonly schema: VersionedEventSchema;
  readonly previousSchema: VersionedEventSchema;
}): readonly string[] {
  if (!isRecord(input.schema.schema)) {
    return ['schema root must be an object'];
  }

  const metadata = input.schema.schema['x-zdp-compatibility'];

  if (!isRecord(metadata)) {
    return ['x-zdp-compatibility must be an object'];
  }

  const typedMetadata = metadata as CompatibilityMetadata;
  const errors: string[] = [];

  if (typedMetadata.classification !== 'breaking') {
    errors.push('classification must be `breaking`');
  }

  if (typedMetadata.previous_schema_ref !== input.previousSchema.path) {
    errors.push(`previous_schema_ref must be \`${input.previousSchema.path}\``);
  }

  if (
    !Array.isArray(typedMetadata.consumer_migration_refs) ||
    typedMetadata.consumer_migration_refs.length === 0 ||
    typedMetadata.consumer_migration_refs.some(
      (value) => typeof value !== 'string' || value.trim().length === 0
    )
  ) {
    errors.push('consumer_migration_refs must contain at least one non-empty Markdown reference');
    return errors;
  }

  const migrationRefs = typedMetadata.consumer_migration_refs.map((value) =>
    (value as string).trim()
  );

  if (new Set(migrationRefs).size !== migrationRefs.length) {
    errors.push('consumer_migration_refs must not contain duplicates');
  }

  for (const migrationRef of migrationRefs) {
    const pathError = validateMigrationReferencePath(migrationRef);

    if (pathError !== null) {
      errors.push(pathError);
      continue;
    }

    const filePath = migrationRef.split('#', 1)[0] ?? '';

    try {
      readFileSync(join(input.architectureRoot, filePath), 'utf8');
    } catch (error) {
      if (isMissingPathError(error)) {
        errors.push(`consumer migration reference \`${migrationRef}\` does not exist`);
        continue;
      }

      throw error;
    }
  }

  return errors;
}

function validateMigrationReferencePath(value: string): string | null {
  const filePath = value.split('#', 1)[0] ?? '';
  const segments = filePath.split('/');
  const allowedPrefix = filePath.startsWith('docs/') || filePath.startsWith('adr/');

  if (
    filePath.length === 0 ||
    isAbsolute(filePath) ||
    filePath.includes('\\') ||
    segments.some((segment) => segment === '' || segment === '.' || segment === '..') ||
    !allowedPrefix ||
    !filePath.endsWith('.md')
  ) {
    return (
      `consumer migration reference \`${value}\` must point to a Markdown file ` +
      'under `docs/` or `adr/` without path traversal'
    );
  }

  return null;
}

function loadVersionedEventSchemas(
  architectureRoot: string
): {
  readonly byPath: ReadonlyMap<string, VersionedEventSchema>;
  readonly byFamily: ReadonlyMap<string, readonly VersionedEventSchema[]>;
} {
  const directory = join(architectureRoot, EVENT_SCHEMA_DIRECTORY);
  const entries = readEventSchemaDirectory(directory);

  if (entries === null) {
    return { byPath: new Map(), byFamily: new Map() };
  }

  const schemas = entries
    .filter((entry) => entry.isFile())
    .flatMap((entry) => {
      const match = EVENT_SCHEMA_FILE_PATTERN.exec(entry.name);

      if (match === null) {
        return [];
      }

      const family = match[1];
      const version = Number.parseInt(match[2] ?? '', 10);
      const path = `${EVENT_SCHEMA_DIRECTORY}/${entry.name}`;

      return [loadVersionedEventSchema({
        architectureRoot,
        path,
        family: family ?? '',
        version
      })];
    });
  const byPath = new Map(schemas.map((schema) => [schema.path, schema]));
  const mutableByFamily = new Map<string, VersionedEventSchema[]>();

  for (const schema of schemas) {
    const familySchemas = mutableByFamily.get(schema.family) ?? [];
    familySchemas.push(schema);
    mutableByFamily.set(schema.family, familySchemas);
  }

  const byFamily = new Map(
    [...mutableByFamily].map(([family, familySchemas]) => [
      family,
      familySchemas.sort((left, right) => left.version - right.version)
    ])
  );

  return { byPath, byFamily };
}

function readEventSchemaDirectory(directory: string) {
  try {
    return readdirSync(directory, {
      withFileTypes: true,
      encoding: 'utf8'
    });
  } catch (error) {
    if (isMissingPathError(error)) {
      return null;
    }

    throw error;
  }
}

function loadVersionedEventSchema(input: {
  readonly architectureRoot: string;
  readonly path: string;
  readonly family: string;
  readonly version: number;
}): VersionedEventSchema {
  const source = readFileSync(join(input.architectureRoot, input.path), 'utf8');

  return {
    path: input.path,
    family: input.family,
    version: input.version,
    schema: JSON.parse(source) as unknown
  };
}

function findPreviousVersion(
  schema: VersionedEventSchema,
  byFamily: ReadonlyMap<string, readonly VersionedEventSchema[]>
): VersionedEventSchema | null {
  const candidates = byFamily.get(schema.family) ?? [];
  const previous = candidates
    .filter((candidate) => candidate.version < schema.version)
    .sort((left, right) => right.version - left.version)[0];

  return previous ?? null;
}

function createBreakingChangeDiagnostic(input: {
  readonly ruleId: string;
  readonly file: string;
  readonly messagePrefix: string;
  readonly breakingChanges: readonly string[];
  readonly remediation: string;
}): Diagnostic {
  return {
    ruleId: input.ruleId,
    severity: 'error',
    file: input.file,
    path: 'schema',
    message:
      `${input.messagePrefix}: ${formatBreakingChanges(input.breakingChanges)}. ${input.remediation}`
  };
}

function formatBreakingChanges(changes: readonly string[]): string {
  const visible = changes.slice(0, BREAKING_CHANGE_DISPLAY_LIMIT);
  const remaining = changes.length - visible.length;
  const suffix = remaining > 0 ? `; and ${remaining} more` : '';

  return `${visible.join('; ')}${suffix}`;
}

function readStringSet(value: unknown): Set<string> | null {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    return null;
  }

  return new Set(value as string[]);
}

function readTypeSet(value: unknown): Set<string> | null {
  if (typeof value === 'string') {
    return new Set([value]);
  }

  return readStringSet(value);
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function difference(left: ReadonlySet<string>, right: ReadonlySet<string>): readonly string[] {
  return [...left].filter((value) => !right.has(value)).sort();
}

function setsEqual(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

function formatInlineValues(values: readonly string[]): string {
  return values.map((value) => `\`${value}\``).join(', ');
}

function formatSchemaValue(value: unknown): string {
  return value === undefined ? 'undefined' : JSON.stringify(value);
}

function deepEqual(left: unknown, right: unknown): boolean {
  return stableStringify(left) === stableStringify(right);
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !ANNOTATION_KEYS.has(key) && !key.startsWith('x-'))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, sortValue(entry)])
  );
}

function compareDiagnostics(left: Diagnostic, right: Diagnostic): number {
  return left.file.localeCompare(right.file) || left.ruleId.localeCompare(right.ruleId);
}

function isMissingPathError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
