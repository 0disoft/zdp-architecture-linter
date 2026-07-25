import { join } from 'node:path';
import type { ErrorObject, ValidateFunction } from 'ajv';
import type { RepositoriesCatalog } from './catalog-loader.ts';
import type { Diagnostic } from './diagnostics.ts';
import { compileJsonSchemaFile } from './json-schema-validator-cache.ts';

const REPOSITORY_SCHEMA_FILE = 'schemas/repository.schema.json';
const REPOSITORY_CATALOG_FILE = 'catalogs/repositories.yaml';
const REPOSITORY_SCHEMA_RULE_ID = 'ZDP-REPO-001';
const SCHEMA_ERROR_DISPLAY_LIMIT = 5;

export async function validateRepositoryCatalogSchema(input: {
  readonly architectureRoot: string;
  readonly value: RepositoriesCatalog;
}): Promise<readonly Diagnostic[]> {
  const validate = await compileRepositorySchema(input.architectureRoot);
  const valid = validate(input.value);
  const errors = validate.errors ?? [];

  return valid
    ? []
    : [
        {
          ruleId: REPOSITORY_SCHEMA_RULE_ID,
          severity: 'error',
          file: REPOSITORY_CATALOG_FILE,
          path: toDiagnosticPath(errors[0]),
          message: `Repository catalog is invalid: ${formatSchemaErrors(errors)}`
        }
      ];
}

async function compileRepositorySchema(
  architectureRoot: string
): Promise<ValidateFunction> {
  return compileJsonSchemaFile({
    absolutePath: join(architectureRoot, REPOSITORY_SCHEMA_FILE)
  });
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
