import { join } from 'node:path';
import type { ErrorObject, ValidateFunction } from 'ajv';
import type { ExternalProvidersCatalog } from './catalog-loader.ts';
import type { Diagnostic } from './diagnostics.ts';
import { compileJsonSchemaFile } from './json-schema-validator-cache.ts';

const EXTERNAL_PROVIDER_SCHEMA_FILE = 'schemas/external-provider.schema.json';
const EXTERNAL_PROVIDER_CATALOG_FILE = 'catalogs/external-providers.yaml';
const EXTERNAL_PROVIDER_SCHEMA_RULE_ID = 'ZDP-PROVIDER-004';
const SCHEMA_ERROR_DISPLAY_LIMIT = 5;

export async function validateExternalProviderCatalogSchema(input: {
  readonly architectureRoot: string;
  readonly value: ExternalProvidersCatalog;
}): Promise<readonly Diagnostic[]> {
  const validate = await compileExternalProviderSchema(input.architectureRoot);
  const valid = validate(input.value);
  const errors = validate.errors ?? [];

  return valid
    ? []
    : [
        {
          ruleId: EXTERNAL_PROVIDER_SCHEMA_RULE_ID,
          severity: 'error',
          file: EXTERNAL_PROVIDER_CATALOG_FILE,
          path: toDiagnosticPath(errors[0]),
          message:
            `External provider catalog violates \`${EXTERNAL_PROVIDER_SCHEMA_FILE}\`: ${formatSchemaErrors(errors)}`
        }
      ];
}

async function compileExternalProviderSchema(
  architectureRoot: string
): Promise<ValidateFunction> {
  return compileJsonSchemaFile({
    absolutePath: join(architectureRoot, EXTERNAL_PROVIDER_SCHEMA_FILE)
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
