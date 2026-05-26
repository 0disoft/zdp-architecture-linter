import { readFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import type { AnySchema, ErrorObject, ValidateFunction } from 'ajv';
import type { Diagnostic } from './diagnostics.ts';

const EVENT_SCHEMA_FILE = 'schemas/event.schema.json';
const EVENT_CATALOG_FILE = 'catalogs/events.yaml';
const EVENT_CATALOG_SCHEMA_RULE_ID = 'ZDP-EVENT-001';
const EVENT_SCHEMA_REF_RULE_ID = 'ZDP-EVENT-002';
const EVENT_SCHEMA_REF_PREFIX = 'schemas/events/';

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
  const source = await readFile(join(architectureRoot, EVENT_SCHEMA_FILE), 'utf8');
  const schema = JSON.parse(source) as AnySchema;
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false
  });

  return ajv.compile(schema);
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
        `${eventPath}.schema_ref`,
        `Event schema_ref target \`${schemaRef}\` does not exist.`
      );
    }

    throw error;
  }

  try {
    JSON.parse(source);
  } catch {
    return createSchemaRefDiagnostic(
      `${eventPath}.schema_ref`,
      `Event schema_ref target \`${schemaRef}\` must be valid JSON.`
    );
  }

  return null;
}

function createSchemaRefDiagnostic(path: string, message: string): Diagnostic {
  return {
    ruleId: EVENT_SCHEMA_REF_RULE_ID,
    severity: 'error',
    file: EVENT_CATALOG_FILE,
    path,
    message
  };
}

function formatSchemaErrors(errors: readonly ErrorObject[]): string {
  return errors
    .slice(0, 5)
    .map((error) => `${toDiagnosticPath(error)} ${error.message ?? 'is invalid'}`)
    .join('; ');
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
