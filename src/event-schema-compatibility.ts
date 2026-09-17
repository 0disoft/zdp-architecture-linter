import { readdirSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import type { Diagnostic } from './diagnostics.ts';
import { findBreakingChanges } from './event-schema-comparison.ts';
import { readRootBoundTextSync, resolveRootBoundPathSync } from './root-bound-input.ts';

const EVENT_SCHEMA_DIRECTORY = 'schemas/events';
const EVENT_SCHEMA_FILE_PATTERN = /^(.+)\.v([1-9][0-9]*)\.json$/;
const SAME_VERSION_RULE_ID = 'ZDP-EVENT-004';
const BREAKING_VERSION_RULE_ID = 'ZDP-EVENT-005';
const BREAKING_CHANGE_DISPLAY_LIMIT = 5;
interface VersionedEventSchema { readonly path: string; readonly family: string; readonly version: number; readonly schema: unknown; }
interface CompatibilityMetadata { readonly classification?: unknown; readonly previous_schema_ref?: unknown; readonly consumer_migration_refs?: unknown; }

export function validateEventSchemaCompatibility(input: { readonly baseArchitectureRoot: string; readonly headArchitectureRoot: string; }): readonly Diagnostic[] {
  const baseSchemas = loadVersionedEventSchemas(input.baseArchitectureRoot);
  const headSchemas = loadVersionedEventSchemas(input.headArchitectureRoot);
  const diagnostics: Diagnostic[] = [];
  for (const [path, baseSchema] of baseSchemas.byPath) {
    const headSchema = headSchemas.byPath.get(path);
    if (headSchema === undefined) {
      diagnostics.push({ ruleId: SAME_VERSION_RULE_ID, severity: 'error', file: path, path: 'schema', message: `Published event schema \`${path}\` was removed. Keep released schema versions available and add a new version instead.` });
      continue;
    }
    const breakingChanges = findBreakingChanges({ baseSchema: baseSchema.schema, headSchema: headSchema.schema, ignoreVersionIdentity: false });
    if (breakingChanges.length > 0) diagnostics.push(createBreakingChangeDiagnostic({ ruleId: SAME_VERSION_RULE_ID, file: path,
      messagePrefix: `Published event schema \`${path}\` changed incompatibly without a version bump`, breakingChanges,
      remediation: 'Restore the existing version or create the next .vN.json schema and provide consumer migration evidence.' }));
  }
  for (const headSchema of headSchemas.byPath.values()) {
    if (baseSchemas.byPath.has(headSchema.path)) continue;
    const previousSchema = findPreviousVersion(headSchema, headSchemas.byFamily);
    if (previousSchema === null) continue;
    const breakingChanges = findBreakingChanges({ baseSchema: previousSchema.schema, headSchema: headSchema.schema, ignoreVersionIdentity: true });
    if (breakingChanges.length === 0) continue;
    const errors = validateBreakingVersionMetadata({ architectureRoot: input.headArchitectureRoot, schema: headSchema, previousSchema });
    if (errors.length > 0) diagnostics.push({ ruleId: BREAKING_VERSION_RULE_ID, severity: 'error', file: headSchema.path, path: 'schema.x-zdp-compatibility',
      message: `Breaking event schema version \`${headSchema.path}\` requires explicit consumer migration evidence: ${errors.join('; ')}. Breaking changes: ${formatBreakingChanges(breakingChanges)}.` });
  }
  return diagnostics.sort((left, right) => left.file.localeCompare(right.file) || left.ruleId.localeCompare(right.ruleId));
}
function validateBreakingVersionMetadata(input: { readonly architectureRoot: string; readonly schema: VersionedEventSchema; readonly previousSchema: VersionedEventSchema; }): readonly string[] {
  if (!isRecord(input.schema.schema)) return ['schema root must be an object'];
  const metadata = input.schema.schema['x-zdp-compatibility'];
  if (!isRecord(metadata)) return ['x-zdp-compatibility must be an object'];
  const typedMetadata = metadata as CompatibilityMetadata;
  const errors: string[] = [];
  if (typedMetadata.classification !== 'breaking') errors.push('classification must be `breaking`');
  if (typedMetadata.previous_schema_ref !== input.previousSchema.path) errors.push(`previous_schema_ref must be \`${input.previousSchema.path}\``);
  if (!Array.isArray(typedMetadata.consumer_migration_refs) || typedMetadata.consumer_migration_refs.length === 0 || typedMetadata.consumer_migration_refs.some((value) => typeof value !== 'string' || value.trim().length === 0)) {
    errors.push('consumer_migration_refs must contain at least one non-empty Markdown reference'); return errors;
  }
  const refs = typedMetadata.consumer_migration_refs.map((value) => (value as string).trim());
  if (new Set(refs).size !== refs.length) errors.push('consumer_migration_refs must not contain duplicates');
  for (const ref of refs) {
    const pathError = validateMigrationReferencePath(ref);
    if (pathError !== null) { errors.push(pathError); continue; }
    try { readRootBoundTextSync(input.architectureRoot, ref.split('#', 1)[0] ?? ''); }
    catch (error) {
      if (isMissingPathError(error)) { errors.push(`consumer migration reference \`${ref}\` does not exist`); continue; }
      throw error;
    }
  }
  return errors;
}
function validateMigrationReferencePath(value: string): string | null {
  const path = value.split('#', 1)[0] ?? '';
  if (path.length === 0 || isAbsolute(path) || path.includes('\\') || path.split('/').some((part) => part === '' || part === '.' || part === '..') || !(path.startsWith('docs/') || path.startsWith('adr/')) || !path.endsWith('.md')) {
    return `consumer migration reference \`${value}\` must point to a Markdown file under \`docs/\` or \`adr/\` without path traversal`;
  }
  return null;
}
function loadVersionedEventSchemas(root: string): { readonly byPath: ReadonlyMap<string, VersionedEventSchema>; readonly byFamily: ReadonlyMap<string, readonly VersionedEventSchema[]>; } {
  let entries;
  try { entries = readdirSync(resolveRootBoundPathSync(root, EVENT_SCHEMA_DIRECTORY), { withFileTypes: true, encoding: 'utf8' }); }
  catch (error) { if (isMissingPathError(error)) return { byPath: new Map(), byFamily: new Map() }; throw error; }
  const schemas = entries.filter((entry) => entry.isFile() || entry.isSymbolicLink()).flatMap((entry) => {
    const match = EVENT_SCHEMA_FILE_PATTERN.exec(entry.name);
    if (match === null) return [];
    const path = `${EVENT_SCHEMA_DIRECTORY}/${entry.name}`;
    return [{ path, family: match[1] ?? '', version: Number.parseInt(match[2] ?? '', 10), schema: JSON.parse(readRootBoundTextSync(root, path)) as unknown }];
  });
  const byPath = new Map(schemas.map((schema) => [schema.path, schema]));
  const byFamily = new Map<string, VersionedEventSchema[]>();
  for (const schema of schemas) { const family = byFamily.get(schema.family) ?? []; family.push(schema); byFamily.set(schema.family, family); }
  for (const family of byFamily.values()) family.sort((left, right) => left.version - right.version);
  return { byPath, byFamily };
}
function findPreviousVersion(schema: VersionedEventSchema, byFamily: ReadonlyMap<string, readonly VersionedEventSchema[]>): VersionedEventSchema | null {
  return (byFamily.get(schema.family) ?? []).filter((candidate) => candidate.version < schema.version).sort((left, right) => right.version - left.version)[0] ?? null;
}
function createBreakingChangeDiagnostic(input: { readonly ruleId: string; readonly file: string; readonly messagePrefix: string; readonly breakingChanges: readonly string[]; readonly remediation: string; }): Diagnostic {
  return { ruleId: input.ruleId, severity: 'error', file: input.file, path: 'schema', message: `${input.messagePrefix}: ${formatBreakingChanges(input.breakingChanges)}. ${input.remediation}` };
}
function formatBreakingChanges(changes: readonly string[]): string {
  const visible = changes.slice(0, BREAKING_CHANGE_DISPLAY_LIMIT);
  const remaining = changes.length - visible.length;
  return `${visible.join('; ')}${remaining > 0 ? `; and ${remaining} more` : ''}`;
}
function isMissingPathError(error: unknown): boolean { return error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT'; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
