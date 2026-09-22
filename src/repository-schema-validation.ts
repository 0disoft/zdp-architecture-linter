import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type { ErrorObject } from 'ajv';
import type { RepositoriesCatalog } from './catalog-loader.ts';
import type { Diagnostic } from './diagnostics.ts';
import { compileJsonSchemaFile } from './json-schema-validator-cache.ts';

const REPOSITORY_SCHEMA_FILE = 'schemas/repository.schema.json';
const REPOSITORY_CATALOG_FILE = 'catalogs/repositories.yaml';

export async function validateRepositoryCatalogSchema(input: {
  readonly architectureRoot: string;
  readonly value: RepositoriesCatalog;
}): Promise<readonly Diagnostic[]> {
  const validate = await compileJsonSchemaFile({ absolutePath: join(input.architectureRoot, REPOSITORY_SCHEMA_FILE) });
  if (validate(input.value)) return [];
  const errors = validate.errors ?? [];
  return (errors.length > 0 ? errors : [undefined]).map((error) => createSchemaDiagnostic(error, input.value));
}

function createSchemaDiagnostic(error: ErrorObject | undefined, value: RepositoriesCatalog): Diagnostic {
  const instancePath = error?.instancePath ?? '';
  const segments = decodePointer(instancePath);
  const path = segments.length > 0 ? segments.join('.') : 'schema';
  const missingProperty = typeof error?.params.missingProperty === 'string' ? error.params.missingProperty : undefined;
  const additionalProperty = typeof error?.params.additionalProperty === 'string' ? error.params.additionalProperty : undefined;
  const schemaError: NonNullable<Diagnostic['schemaError']> = {
    keyword: error?.keyword ?? 'unknown', instancePath, schemaPath: error?.schemaPath ?? '',
    ...(missingProperty === undefined ? {} : { missingProperty }),
    ...(additionalProperty === undefined ? {} : { additionalProperty })
  };
  const identitySegments = [...segments];
  if (segments[0] === 'repositories' && /^\d+$/.test(segments[1] ?? '') && Array.isArray(value.repositories)) {
    const record: unknown = value.repositories[Number(segments[1])];
    if (isRecord(record) && typeof record.name === 'string' && record.name.trim().length > 0) {
      identitySegments[1] = `name=${record.name.trim()}`;
    }
  }
  const fingerprint = createHash('sha256').update(JSON.stringify([
    'zdp-architecture-linter/repository-schema/v1', REPOSITORY_CATALOG_FILE,
    identitySegments, schemaError.keyword, schemaError.schemaPath,
    missingProperty ?? null, additionalProperty ?? null
  ])).digest('hex');
  return {
    ruleId: 'ZDP-REPO-001', severity: 'error', file: REPOSITORY_CATALOG_FILE, path,
    message: `Repository catalog is invalid: ${path} ${error?.message ?? 'is invalid'}`,
    fingerprint, schemaError
  };
}

function decodePointer(pointer: string): string[] {
  return pointer === '' ? [] : pointer.split('/').slice(1).map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~'));
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
