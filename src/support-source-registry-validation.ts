import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import type { AnySchema, ErrorObject, ValidateFunction } from 'ajv';
import { parse } from 'yaml';
import type { SupportSourceAdaptersCatalog } from './catalog-loader.ts';
import type { Diagnostic } from './diagnostics.ts';

const CATALOG_FILE = 'catalogs/support-source-adapters.yaml';
const CATALOG_SCHEMA_FILE = 'schemas/support-source-adapter.schema.json';
const REGISTRATION_SCHEMA_FILE = 'schemas/support-source-registration.schema.json';
const FIXTURE_ROOT = 'fixtures/support-source-registration';
const SCHEMA_DISPLAY_LIMIT = 5;

export async function validateSupportSourceAdapterCatalogSchema(input: {
  readonly architectureRoot: string;
  readonly value: SupportSourceAdaptersCatalog | undefined;
}): Promise<readonly Diagnostic[]> {
  if (input.value === undefined) {
    return [];
  }

  const validate = await compileSchema(input.architectureRoot, CATALOG_SCHEMA_FILE);
  return validateSchemaValue({
    validate,
    value: input.value,
    ruleId: 'ZDP-SUPPORT-REGISTRY-001',
    file: CATALOG_FILE,
    schemaFile: CATALOG_SCHEMA_FILE,
    subject: 'Support source adapter catalog'
  });
}

export async function validateSupportSourceRegistrationFixtures(input: {
  readonly architectureRoot: string;
  readonly catalog: SupportSourceAdaptersCatalog | undefined;
}): Promise<readonly Diagnostic[]> {
  if (input.catalog === undefined) {
    return [];
  }

  const validate = await compileSchema(
    input.architectureRoot,
    REGISTRATION_SCHEMA_FILE
  );
  const diagnostics: Diagnostic[] = [];

  for (const expectation of ['pass', 'fail'] as const) {
    const directory = join(input.architectureRoot, FIXTURE_ROOT, expectation);
    const files = await listYamlFiles(directory);

    for (const filename of files) {
      const relativeFile = `${FIXTURE_ROOT}/${expectation}/${filename}`;
      const value = parse(await readFile(join(directory, filename), 'utf8')) as unknown;
      const actual = [
        ...validateSchemaValue({
          validate,
          value,
          ruleId: 'ZDP-SUPPORT-REGISTRY-002',
          file: relativeFile,
          schemaFile: REGISTRATION_SCHEMA_FILE,
          subject: 'Support source registration'
        }),
        ...validateRegistrationReferences(value, input.catalog, relativeFile)
      ];

      if (expectation === 'pass' && actual.length > 0) {
        diagnostics.push(...actual);
      } else if (expectation === 'fail' && actual.length === 0) {
        diagnostics.push({
          ruleId: 'ZDP-SUPPORT-REGISTRY-005',
          severity: 'error',
          file: relativeFile,
          path: 'fixture',
          message: `Fail fixture \`${basename(filename)}\` did not violate the support source registration contract.`
        });
      }
    }
  }

  return diagnostics;
}

function validateRegistrationReferences(
  value: unknown,
  catalog: SupportSourceAdaptersCatalog,
  file: string
): readonly Diagnostic[] {
  if (!isRecord(value) || typeof value.adapter_id !== 'string') {
    return [];
  }

  const adapters = Array.isArray(catalog.adapters) ? catalog.adapters : [];
  const adapter = adapters.find(
    (candidate) => isRecord(candidate) && candidate.id === value.adapter_id
  );

  if (!isRecord(adapter)) {
    return [{
      ruleId: 'ZDP-SUPPORT-REGISTRY-003',
      severity: 'error',
      file,
      path: 'adapter_id',
      message: `Support source registration references unknown adapter \`${value.adapter_id}\` from \`${CATALOG_FILE}\`.`
    }];
  }

  const diagnostics: Diagnostic[] = [];
  checkSupportedVersion(
    diagnostics,
    file,
    'projection_schema_version',
    value.projection_schema_version,
    adapter.projection_schema_versions
  );
  checkSupportedVersion(
    diagnostics,
    file,
    'admin_api_version',
    value.admin_api_version,
    adapter.admin_api_versions
  );
  return diagnostics;
}

function checkSupportedVersion(
  diagnostics: Diagnostic[],
  file: string,
  field: 'projection_schema_version' | 'admin_api_version',
  requested: unknown,
  supported: unknown
): void {
  if (
    typeof requested === 'number' &&
    Array.isArray(supported) &&
    !supported.includes(requested)
  ) {
    diagnostics.push({
      ruleId: 'ZDP-SUPPORT-REGISTRY-004',
      severity: 'error',
      file,
      path: field,
      message: `Support source registration ${field} \`${requested}\` is not declared by its adapter in \`${CATALOG_FILE}\`.`
    });
  }
}

async function compileSchema(
  architectureRoot: string,
  relativePath: string
): Promise<ValidateFunction> {
  const schema = JSON.parse(
    await readFile(join(architectureRoot, relativePath), 'utf8')
  ) as AnySchema;
  return new Ajv2020({ allErrors: true, strict: false }).compile(schema);
}

function validateSchemaValue(input: {
  readonly validate: ValidateFunction;
  readonly value: unknown;
  readonly ruleId: string;
  readonly file: string;
  readonly schemaFile: string;
  readonly subject: string;
}): readonly Diagnostic[] {
  const valid = input.validate(input.value);
  const errors = input.validate.errors ?? [];
  return valid ? [] : [{
    ruleId: input.ruleId,
    severity: 'error',
    file: input.file,
    path: diagnosticPath(errors[0]),
    message: `${input.subject} violates \`${input.schemaFile}\`: ${formatErrors(errors)}`
  }];
}

function formatErrors(errors: readonly ErrorObject[]): string {
  const summary = errors.slice(0, SCHEMA_DISPLAY_LIMIT)
    .map((error) => `${diagnosticPath(error)} ${error.message ?? 'is invalid'}`)
    .join('; ');
  const remaining = errors.length - SCHEMA_DISPLAY_LIMIT;
  return remaining > 0 ? `${summary}; and ${remaining} more schema errors` : summary;
}

function diagnosticPath(error: ErrorObject | undefined): string {
  if (error === undefined) return 'schema';
  const path = error.instancePath.split('/').filter(Boolean).join('.');
  return path.length > 0 ? path : 'schema';
}

async function listYamlFiles(directory: string): Promise<readonly string[]> {
  try {
    return (await readdir(directory))
      .filter((entry) => entry.endsWith('.yaml') || entry.endsWith('.yml'))
      .sort();
  } catch (error) {
    if (isRecord(error) && error.code === 'ENOENT') return [];
    throw error;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
