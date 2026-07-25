import { readFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import type { AnySchema, ErrorObject, ValidateFunction } from 'ajv';
import type { Diagnostic } from './diagnostics.ts';
import { compileJsonSchemaFile } from './json-schema-validator-cache.ts';

const EVENT_SCHEMA_FILE = 'schemas/event.schema.json';
const EVENT_CATALOG_FILE = 'catalogs/events.yaml';
const EVENT_CATALOG_SCHEMA_RULE_ID = 'ZDP-EVENT-001';
const EVENT_SCHEMA_REF_RULE_ID = 'ZDP-EVENT-002';
const EVENT_SCHEMA_TARGET_RULE_ID = 'ZDP-EVENT-003';
const EVENT_SCHEMA_REF_PREFIX = 'schemas/events/';
const EVENT_SCHEMA_ID_PREFIX = 'https://zdp.zerodi.dev/';
const SCHEMA_ERROR_DISPLAY_LIMIT = 5;

export async function validateEventCatalogSchema(input: {
  readonly architectureRoot: string;
  readonly value: unknown;
}): Promise<readonly Diagnostic[]> {
  const validate = await compileEventSchema(input.architectureRoot);
  const valid = validate(input.value);
  const errors = validate.errors ?? [];

  return valid
    ? []
    : [
        {
          ruleId: EVENT_CATALOG_SCHEMA_RULE_ID,
          severity: 'error',
          file: EVENT_CATALOG_FILE,
          path: toDiagnosticPath(errors[0]),
          message:
            `Event catalog violates \`${EVENT_SCHEMA_FILE}\`: ${formatSchemaErrors(errors)}`
        }
      ];
}

export async function validateEventSchemaReferences(input: {
  readonly architectureRoot: string;
  readonly value: unknown;
}): Promise<readonly Diagnostic[]> {
  if (!isRecord(input.value) || !Array.isArray(input.value.events)) {
    return [];
  }

  const diagnostics: Diagnostic[] = [];

  for (const [index, event] of input.value.events.entries()) {
    if (!isRecord(event)) {
      continue;
    }

    const eventPath = getEventDiagnosticPath(event, index);
    const schemaRef = readStringField(event, 'schema_ref');

    if (schemaRef === null) {
      continue;
    }

    const pathDiagnostic = validateSchemaRefPath(schemaRef, eventPath);

    if (pathDiagnostic !== null) {
      diagnostics.push(pathDiagnostic);
      continue;
    }

    const fileDiagnostic = await validateSchemaRefFile(
      input.architectureRoot,
      schemaRef,
      eventPath
    );

    if (fileDiagnostic !== null) {
      diagnostics.push(fileDiagnostic);
    }
  }

  return diagnostics;
}

async function compileEventSchema(
  architectureRoot: string
): Promise<ValidateFunction> {
  return compileJsonSchemaFile({
    absolutePath: join(architectureRoot, EVENT_SCHEMA_FILE)
  });
}

function validateSchemaRefPath(
  schemaRef: string,
  eventPath: string
): Diagnostic | null {
  const segments = schemaRef.split('/');
  const hasTraversal = segments.some((segment) => segment === '..');

  if (
    isAbsolute(schemaRef) ||
    schemaRef.includes('\\') ||
    hasTraversal ||
    !schemaRef.startsWith(EVENT_SCHEMA_REF_PREFIX) ||
    !schemaRef.endsWith('.json')
  ) {
    return createSchemaRefDiagnostic(
      EVENT_SCHEMA_REF_RULE_ID,
      `${eventPath}.schema_ref`,
      `Event schema_ref \`${schemaRef}\` must point to a JSON file under \`${EVENT_SCHEMA_REF_PREFIX}\`.`
    );
  }

  return null;
}

async function validateSchemaRefFile(
  architectureRoot: string,
  schemaRef: string,
  eventPath: string
): Promise<Diagnostic | null> {
  let source: string;

  try {
    source = await readFile(join(architectureRoot, schemaRef), 'utf8');
  } catch (error) {
    if (isMissingPathError(error)) {
      return createSchemaRefDiagnostic(
        EVENT_SCHEMA_REF_RULE_ID,
        `${eventPath}.schema_ref`,
        `Event schema_ref target \`${schemaRef}\` does not exist.`
      );
    }

    throw error;
  }

  let schema: unknown;

  try {
    schema = JSON.parse(source);
  } catch {
    return createSchemaRefDiagnostic(
      EVENT_SCHEMA_REF_RULE_ID,
      `${eventPath}.schema_ref`,
      `Event schema_ref target \`${schemaRef}\` must be valid JSON.`
    );
  }

  const expectedSchemaId = `${EVENT_SCHEMA_ID_PREFIX}${schemaRef}`;
  const declaredSchemaId = isRecord(schema) ? schema.$id : undefined;

  if (declaredSchemaId !== expectedSchemaId) {
    return createSchemaRefDiagnostic(
      EVENT_SCHEMA_TARGET_RULE_ID,
      `${eventPath}.schema_ref`,
      `Event schema_ref target \`${schemaRef}\` must declare \`$id: ${expectedSchemaId}\`.`
    );
  }

  try {
    compileJsonSchema(schema);
  } catch (error) {
    return createSchemaRefDiagnostic(
      EVENT_SCHEMA_TARGET_RULE_ID,
      `${eventPath}.schema_ref`,
      `Event schema_ref target \`${schemaRef}\` must compile as JSON Schema: ${formatCompileError(error)}`
    );
  }

  return null;
}

function compileJsonSchema(schema: unknown): ValidateFunction {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    validateFormats: false
  });

  return ajv.compile(schema as AnySchema);
}

function createSchemaRefDiagnostic(
  ruleId: string,
  path: string,
  message: string
): Diagnostic {
  return {
    ruleId,
    severity: 'error',
    file: EVENT_CATALOG_FILE,
    path,
    message
  };
}

function formatCompileError(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown compile error';
}

function formatSchemaErrors(errors: readonly ErrorObject[]): string {
  const summary = errors
    .slice(0, SCHEMA_ERROR_DISPLAY_LIMIT)
    .map((error) => `${toDiagnosticPath(error)} ${error.message ?? 'is invalid'}`)
    .join('; ');
  const remaining = errors.length - SCHEMA_ERROR_DISPLAY_LIMIT;

  return remaining > 0
    ? `${summary}; and ${remaining} more schema error${remaining === 1 ? '' : 's'}`
    : summary;
}

function toDiagnosticPath(error: ErrorObject | undefined): string {
  if (error === undefined) {
    return 'schema';
  }

  const basePath = formatInstancePath(error.instancePath);

  if (error.keyword === 'required') {
    const missingProperty = readMissingProperty(error);

    if (missingProperty !== null) {
      return appendPathSegment(basePath, missingProperty);
    }
  }

  return basePath;
}

function readMissingProperty(error: ErrorObject): string | null {
  const missingProperty = (error.params as { missingProperty?: unknown })
    .missingProperty;

  return typeof missingProperty === 'string' && missingProperty.length > 0
    ? missingProperty
    : null;
}

function formatInstancePath(instancePath: string): string {
  const segments = instancePath.split('/').filter((segment) => segment.length > 0);

  return segments.reduce(
    (path, segment) => appendPathSegment(path, segment),
    'schema'
  );
}

function appendPathSegment(path: string, segment: string): string {
  const decodedSegment = decodeJsonPointerSegment(segment);

  if (/^\d+$/.test(decodedSegment)) {
    return path === 'schema'
      ? `[${decodedSegment}]`
      : `${path}[${decodedSegment}]`;
  }

  return path === 'schema' ? decodedSegment : `${path}.${decodedSegment}`;
}

function decodeJsonPointerSegment(segment: string): string {
  return segment.replaceAll('~1', '/').replaceAll('~0', '~');
}

function getEventDiagnosticPath(value: Record<string, unknown>, index: number): string {
  const id = readStringField(value, 'id');

  return id === null ? `events[${index}]` : `events[${index}:${id}]`;
}

function readStringField(value: Record<string, unknown>, field: string): string | null {
  const candidate = value[field];

  return typeof candidate === 'string' && candidate.trim().length > 0
    ? candidate.trim()
    : null;
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
