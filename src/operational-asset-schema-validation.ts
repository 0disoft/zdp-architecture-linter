import { join } from 'node:path';
import type { ErrorObject, ValidateFunction } from 'ajv';
import type { OperationalAssetsCatalog } from './catalog-loader.ts';
import type { Diagnostic } from './diagnostics.ts';
import { compileJsonSchemaFile } from './json-schema-validator-cache.ts';

const OPERATIONAL_ASSET_SCHEMA_FILE = 'schemas/operational-asset.schema.json';
const OPERATIONAL_ASSET_CATALOG_FILE = 'catalogs/operational-assets.yaml';
const OPERATIONAL_ASSET_SCHEMA_RULE_ID = 'ZDP-OPS-ASSET-001';
const SCHEMA_ERROR_DISPLAY_LIMIT = 5;

export async function validateOperationalAssetCatalogSchema(input: {
  readonly architectureRoot: string;
  readonly value: OperationalAssetsCatalog | undefined;
}): Promise<readonly Diagnostic[]> {
  const validate = await compileOperationalAssetSchema(input.architectureRoot);
  const valid = validate(input.value);
  const errors = validate.errors ?? [];

  return valid
    ? []
    : [
        {
          ruleId: OPERATIONAL_ASSET_SCHEMA_RULE_ID,
          severity: 'error',
          file: OPERATIONAL_ASSET_CATALOG_FILE,
          path: toDiagnosticPath(errors[0]),
          message:
            `Operational asset catalog violates \`${OPERATIONAL_ASSET_SCHEMA_FILE}\`: ${formatSchemaErrors(errors)}`
        }
      ];
}

async function compileOperationalAssetSchema(
  architectureRoot: string
): Promise<ValidateFunction> {
  return compileJsonSchemaFile({
    absolutePath: join(architectureRoot, OPERATIONAL_ASSET_SCHEMA_FILE)
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
