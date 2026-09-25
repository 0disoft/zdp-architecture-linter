import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { ErrorObject, ValidateFunction } from 'ajv';
import { parse } from 'yaml';
import type { Diagnostic } from './diagnostics.ts';
import { compileJsonSchemaFile } from './json-schema-validator-cache.ts';
import { readRootBoundText, resolveRootBoundPath } from './root-bound-input.ts';

const SERVICE_SCHEMA_FILE = 'schemas/service.schema.json';
const SERVICE_CONTRACT_FILE = 'service.yaml';
const SERVICE_SCHEMA_PASS_DIRECTORY = 'fixtures/service-schema/pass';
const SERVICE_SCHEMA_FAIL_DIRECTORY = 'fixtures/service-schema/fail';
const SERVICE_SCHEMA_PASS_RULE_ID = 'ZDP-SERVICE-SCHEMA-001';
const SERVICE_SCHEMA_FAIL_RULE_ID = 'ZDP-SERVICE-SCHEMA-002';
const SERVICE_CONTRACT_MISSING_RULE_ID = 'ZDP-SERVICE-SCHEMA-003';
const SERVICE_CONTRACT_INVALID_RULE_ID = 'ZDP-SERVICE-SCHEMA-004';
const SCHEMA_ERROR_DISPLAY_LIMIT = 5;
interface ServiceSchemaFixture { readonly file: string; readonly value: unknown; readonly expectation: 'pass' | 'fail'; }
export interface RepositoryServiceContract { readonly file: string; readonly value: unknown; }

export async function validateServiceSchemaFixtures(architectureRoot: string): Promise<readonly Diagnostic[]> {
  const validate = await compileServiceSchema(architectureRoot);
  const fixtures = [
    ...await loadServiceSchemaFixturesFromDirectory(architectureRoot, SERVICE_SCHEMA_PASS_DIRECTORY, 'pass'),
    ...await loadServiceSchemaFixturesFromDirectory(architectureRoot, SERVICE_SCHEMA_FAIL_DIRECTORY, 'fail')
  ];
  return fixtures.flatMap((fixture) => validateServiceSchemaFixture(fixture, validate));
}
export async function validateRepositoryServiceContract(input: {
  readonly architectureRoot: string; readonly repositoryRoot: string; readonly repositoryServiceContract?: RepositoryServiceContract | null;
}): Promise<readonly Diagnostic[]> {
  const validate = await compileServiceSchema(input.architectureRoot);
  const contract = input.repositoryServiceContract === undefined ? await loadRepositoryServiceContract(input.repositoryRoot) : input.repositoryServiceContract;
  if (contract === null) return [createServiceSchemaDiagnostic(SERVICE_CONTRACT_MISSING_RULE_ID, SERVICE_CONTRACT_FILE, 'schema', '`service.yaml` is required when validating a repository root.')];
  const valid = validate(contract.value);
  const errors = validate.errors ?? [];
  return valid ? [] : [createServiceSchemaDiagnostic(SERVICE_CONTRACT_INVALID_RULE_ID, SERVICE_CONTRACT_FILE, toDiagnosticPath(errors[0]), `Repository service contract is invalid: ${formatSchemaErrors(errors)}`)];
}
export async function loadRepositoryServiceContract(repositoryRoot: string): Promise<RepositoryServiceContract | null> {
  let source: string;
  try { source = await readRootBoundText(repositoryRoot, SERVICE_CONTRACT_FILE); }
  catch (error) { if (isMissingPathError(error)) return null; throw error; }
  return { file: SERVICE_CONTRACT_FILE, value: parse(source) as unknown };
}
async function compileServiceSchema(architectureRoot: string): Promise<ValidateFunction> {
  return compileJsonSchemaFile({ absolutePath: join(architectureRoot, SERVICE_SCHEMA_FILE), allowedRoot: architectureRoot });
}
async function loadServiceSchemaFixturesFromDirectory(architectureRoot: string, relativeDirectory: string, expectation: 'pass' | 'fail'): Promise<readonly ServiceSchemaFixture[]> {
  let entries: readonly string[];
  try { entries = await readdir(await resolveRootBoundPath(architectureRoot, relativeDirectory)); }
  catch (error) { if (isMissingPathError(error)) return []; throw error; }
  return Promise.all(entries.filter((entry) => entry.endsWith('.yaml') || entry.endsWith('.yml')).sort((left, right) => left.localeCompare(right)).map(async (fileName) => {
    const file = `${relativeDirectory}/${fileName}`;
    return { file, value: parse(await readRootBoundText(architectureRoot, file)) as unknown, expectation };
  }));
}
function validateServiceSchemaFixture(fixture: ServiceSchemaFixture, validate: ValidateFunction): readonly Diagnostic[] {
  const valid = validate(fixture.value);
  const errors = validate.errors ?? [];
  if (fixture.expectation === 'pass') return valid ? [] : [createServiceSchemaDiagnostic(SERVICE_SCHEMA_PASS_RULE_ID, fixture.file, toDiagnosticPath(errors[0]), `Service schema pass fixture is invalid: ${formatSchemaErrors(errors)}`)];
  return valid ? [createServiceSchemaDiagnostic(SERVICE_SCHEMA_FAIL_RULE_ID, fixture.file, 'schema', 'Service schema fail fixture unexpectedly passed.')] : [];
}
function createServiceSchemaDiagnostic(ruleId: string, file: string, path: string, message: string): Diagnostic { return { ruleId, severity: 'error', file, path, message }; }
function formatSchemaErrors(errors: readonly ErrorObject[]): string {
  const summary = errors.slice(0, SCHEMA_ERROR_DISPLAY_LIMIT).map((error) => `${toDiagnosticPath(error)} ${error.message ?? 'is invalid'}`).join('; ');
  const remaining = errors.length - SCHEMA_ERROR_DISPLAY_LIMIT;
  return remaining > 0 ? `${summary}; and ${remaining} more schema error${remaining === 1 ? '' : 's'}` : summary;
}
function toDiagnosticPath(error: ErrorObject | undefined): string {
  if (error === undefined) return 'schema';
  const path = error.instancePath.split('/').filter((segment) => segment.length > 0).join('.');
  return path.length > 0 ? path : 'schema';
}
function isMissingPathError(error: unknown): boolean { return error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT'; }
