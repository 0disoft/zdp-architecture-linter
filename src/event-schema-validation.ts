import { isAbsolute, join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import type { AnySchema, ErrorObject, ValidateFunction } from 'ajv';
import type { Diagnostic } from './diagnostics.ts';
import { compileJsonSchemaFile } from './json-schema-validator-cache.ts';
import { readRootBoundText } from './root-bound-input.ts';
const EVENT_SCHEMA_FILE = 'schemas/event.schema.json';
const EVENT_CATALOG_FILE = 'catalogs/events.yaml';
const EVENT_CATALOG_SCHEMA_RULE_ID = 'ZDP-EVENT-001';
const EVENT_SCHEMA_REF_RULE_ID = 'ZDP-EVENT-002';
const EVENT_SCHEMA_TARGET_RULE_ID = 'ZDP-EVENT-003';
const EVENT_SCHEMA_REF_PREFIX = 'schemas/events/';
const EVENT_SCHEMA_ID_PREFIX = 'https://zdp.zerodi.dev/';
const SCHEMA_ERROR_DISPLAY_LIMIT = 5;

export async function validateEventCatalogSchema(input: { readonly architectureRoot: string; readonly value: unknown; }): Promise<readonly Diagnostic[]> {
  const validate = await compileJsonSchemaFile({ absolutePath: join(input.architectureRoot, EVENT_SCHEMA_FILE), allowedRoot: input.architectureRoot });
  const valid = validate(input.value);
  const errors = validate.errors ?? [];
  return valid ? [] : [{ ruleId: EVENT_CATALOG_SCHEMA_RULE_ID, severity: 'error', file: EVENT_CATALOG_FILE, path: toDiagnosticPath(errors[0]), message: `Event catalog violates \`${EVENT_SCHEMA_FILE}\`: ${formatSchemaErrors(errors)}` }];
}
export async function validateEventSchemaReferences(input: { readonly architectureRoot: string; readonly value: unknown; }): Promise<readonly Diagnostic[]> {
  if (!isRecord(input.value) || !Array.isArray(input.value.events)) return [];
  const diagnostics: Diagnostic[] = [];
  for (const [index, event] of input.value.events.entries()) {
    if (!isRecord(event)) continue;
    const id = readStringField(event, 'id');
    const eventPath = id === null ? `events[${index}]` : `events[${index}:${id}]`;
    const schemaRef = readStringField(event, 'schema_ref');
    if (schemaRef === null) continue;
    const pathDiagnostic = validateSchemaRefPath(schemaRef, eventPath);
    if (pathDiagnostic !== null) { diagnostics.push(pathDiagnostic); continue; }
    const fileDiagnostic = await validateSchemaRefFile(input.architectureRoot, schemaRef, eventPath);
    if (fileDiagnostic !== null) diagnostics.push(fileDiagnostic);
  }
  return diagnostics;
}
function validateSchemaRefPath(schemaRef: string, eventPath: string): Diagnostic | null {
  if (isAbsolute(schemaRef) || schemaRef.includes('\\') || schemaRef.split('/').some((segment) => segment === '..') || !schemaRef.startsWith(EVENT_SCHEMA_REF_PREFIX) || !schemaRef.endsWith('.json')) {
    return createSchemaRefDiagnostic(EVENT_SCHEMA_REF_RULE_ID, `${eventPath}.schema_ref`, `Event schema_ref \`${schemaRef}\` must point to a JSON file under \`${EVENT_SCHEMA_REF_PREFIX}\`.`);
  }
  return null;
}
async function validateSchemaRefFile(root: string, schemaRef: string, eventPath: string): Promise<Diagnostic | null> {
  let source: string;
  try { source = await readRootBoundText(root, schemaRef); }
  catch (error) {
    if (isMissingPathError(error)) return createSchemaRefDiagnostic(EVENT_SCHEMA_REF_RULE_ID, `${eventPath}.schema_ref`, `Event schema_ref target \`${schemaRef}\` does not exist.`);
    throw error;
  }
  let schema: unknown;
  try { schema = JSON.parse(source); }
  catch { return createSchemaRefDiagnostic(EVENT_SCHEMA_REF_RULE_ID, `${eventPath}.schema_ref`, `Event schema_ref target \`${schemaRef}\` must be valid JSON.`); }
  const expectedSchemaId = `${EVENT_SCHEMA_ID_PREFIX}${schemaRef}`;
  if ((isRecord(schema) ? schema.$id : undefined) !== expectedSchemaId) return createSchemaRefDiagnostic(EVENT_SCHEMA_TARGET_RULE_ID, `${eventPath}.schema_ref`, `Event schema_ref target \`${schemaRef}\` must declare \`$id: ${expectedSchemaId}\`.`);
  try { await compileJsonSchema(root, schema); }
  catch (error) { return createSchemaRefDiagnostic(EVENT_SCHEMA_TARGET_RULE_ID, `${eventPath}.schema_ref`, `Event schema_ref target \`${schemaRef}\` must compile as JSON Schema: ${error instanceof Error ? error.message : 'unknown compile error'}`); }
  return null;
}
async function compileJsonSchema(architectureRoot: string, schema: unknown): Promise<ValidateFunction> {
  const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
  await addLocalEventSchemaReferences({ ajv, architectureRoot, schema, visitedSchemaIds: new Set<string>() });
  return ajv.compile(schema as AnySchema);
}
async function addLocalEventSchemaReferences(input: { readonly ajv: Ajv2020; readonly architectureRoot: string; readonly schema: unknown; readonly visitedSchemaIds: Set<string>; }): Promise<void> {
  const baseSchemaId = isRecord(input.schema) && typeof input.schema.$id === 'string' ? input.schema.$id : null;
  if (baseSchemaId === null) return;
  for (const schemaReference of collectSchemaReferences(input.schema)) {
    if (schemaReference.startsWith('#')) continue;
    const resolvedReference = new URL(schemaReference, baseSchemaId);
    if (resolvedReference.origin !== 'https://zdp.zerodi.dev' || !resolvedReference.pathname.startsWith('/schemas/events/') || !resolvedReference.pathname.endsWith('.json')) continue;
    resolvedReference.hash = '';
    const referencedSchemaId = resolvedReference.href;
    if (input.visitedSchemaIds.has(referencedSchemaId)) continue;
    input.visitedSchemaIds.add(referencedSchemaId);
    const path = decodeURIComponent(resolvedReference.pathname.slice(1));
    const referencedSchema = JSON.parse(await readRootBoundText(input.architectureRoot, path)) as unknown;
    if (!isRecord(referencedSchema) || referencedSchema.$id !== referencedSchemaId) throw new Error(`local event schema reference ${referencedSchemaId} must declare a matching $id`);
    await addLocalEventSchemaReferences({ ...input, schema: referencedSchema });
    input.ajv.addSchema(referencedSchema as AnySchema);
  }
}
function collectSchemaReferences(value: unknown): readonly string[] {
  if (Array.isArray(value)) return value.flatMap(collectSchemaReferences);
  if (!isRecord(value)) return [];
  return [...(typeof value.$ref === 'string' ? [value.$ref] : []), ...Object.values(value).flatMap(collectSchemaReferences)];
}
function createSchemaRefDiagnostic(ruleId: string, path: string, message: string): Diagnostic { return { ruleId, severity: 'error', file: EVENT_CATALOG_FILE, path, message }; }
function formatSchemaErrors(errors: readonly ErrorObject[]): string {
  const summary = errors.slice(0, SCHEMA_ERROR_DISPLAY_LIMIT).map((error) => `${toDiagnosticPath(error)} ${error.message ?? 'is invalid'}`).join('; ');
  const remaining = errors.length - SCHEMA_ERROR_DISPLAY_LIMIT;
  return remaining > 0 ? `${summary}; and ${remaining} more schema error${remaining === 1 ? '' : 's'}` : summary;
}
function toDiagnosticPath(error: ErrorObject | undefined): string {
  if (error === undefined) return 'schema';
  const base = error.instancePath.split('/').filter((segment) => segment.length > 0).reduce((path, segment) => appendPathSegment(path, segment), 'schema');
  const missing = error.params.missingProperty;
  return error.keyword === 'required' && typeof missing === 'string' && missing.length > 0 ? appendPathSegment(base, missing) : base;
}
function appendPathSegment(path: string, segment: string): string {
  const decoded = segment.replaceAll('~1', '/').replaceAll('~0', '~');
  if (/^\d+$/.test(decoded)) return path === 'schema' ? `[${decoded}]` : `${path}[${decoded}]`;
  return path === 'schema' ? decoded : `${path}.${decoded}`;
}
function readStringField(value: Record<string, unknown>, field: string): string | null { const candidate = value[field]; return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate.trim() : null; }
function isMissingPathError(error: unknown): boolean { return error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT'; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
