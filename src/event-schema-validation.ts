import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import type { AnySchema, ErrorObject, ValidateFunction } from 'ajv';
import type { Diagnostic } from './diagnostics.ts';

const EVENT_SCHEMA_FILE = 'schemas/event.schema.json';
const EVENT_CATALOG_FILE = 'catalogs/events.yaml';
const EVENT_CATALOG_SCHEMA_RULE_ID = 'ZDP-EVENT-001';

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
