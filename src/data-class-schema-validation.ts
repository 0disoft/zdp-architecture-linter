import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import type { AnySchema, ErrorObject, ValidateFunction } from 'ajv';
import type { DataClassesCatalog } from './catalog-loader.ts';
import type { Diagnostic } from './diagnostics.ts';

const DATA_CLASS_SCHEMA_FILE = 'schemas/data-class.schema.json';
const DATA_CLASS_CATALOG_FILE = 'catalogs/data-classes.yaml';
const DATA_CLASS_SCHEMA_RULE_ID = 'ZDP-DATA-007';
const SCHEMA_ERROR_DISPLAY_LIMIT = 5;

export async function validateDataClassCatalogSchema(input: {
  readonly architectureRoot: string;
  readonly value: DataClassesCatalog;
}): Promise<readonly Diagnostic[]> {
  const validate = await compileDataClassSchema(input.architectureRoot);
  const valid = validate(input.value);
  const errors = validate.errors ?? [];

  return valid
    ? []
    : [
        {
          ruleId: DATA_CLASS_SCHEMA_RULE_ID,
          severity: 'error',
          file: DATA_CLASS_CATALOG_FILE,
          path: toDiagnosticPath(errors[0]),
          message:
            `Data class catalog violates \`${DATA_CLASS_SCHEMA_FILE}\`: ${formatSchemaErrors(errors)}`
        }
      ];
}

async function compileDataClassSchema(
  architectureRoot: string
): Promise<ValidateFunction> {
  const source = await readFile(join(architectureRoot, DATA_CLASS_SCHEMA_FILE), 'utf8');
  const schema = JSON.parse(source) as AnySchema;
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false
  });

  return ajv.compile(schema);
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

  const instancePath = error.instancePath
    .split('/')
    .filter((segment) => segment.length > 0)
    .join('.');

  return instancePath.length > 0 ? instancePath : 'schema';
}
