import { readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import type { AnySchema, ValidateFunction } from 'ajv';
import { readRootBoundText } from './root-bound-input.ts';

const MAX_CACHE_ENTRIES = 64;
interface CachedValidator { readonly source: string; readonly validate: ValidateFunction; }
interface PendingValidator { readonly source: string; readonly promise: Promise<ValidateFunction>; }
const validators = new Map<string, CachedValidator>();
const pendingValidators = new Map<string, PendingValidator>();
let cacheHits = 0;
let cacheMisses = 0;

export async function compileJsonSchemaFile(input: {
  readonly absolutePath: string;
  readonly allowedRoot?: string;
  readonly validateFormats?: boolean;
}): Promise<ValidateFunction> {
  const absolutePath = resolve(input.absolutePath);
  const cacheKey = `${input.validateFormats === false ? 'formats-off' : 'formats-on'}\0${absolutePath}`;
  // Containment is checked before every cache hit, not only before compilation.
  const source = input.allowedRoot === undefined
    ? await readFile(absolutePath, 'utf8')
    : await readRootBoundText(input.allowedRoot, relative(resolve(input.allowedRoot), absolutePath).replaceAll('\\', '/'));
  const cached = validators.get(cacheKey);
  if (cached?.source === source) {
    cacheHits += 1; validators.delete(cacheKey); validators.set(cacheKey, cached);
    return cached.validate;
  }
  const pending = pendingValidators.get(cacheKey);
  if (pending?.source === source) { cacheHits += 1; return pending.promise; }
  cacheMisses += 1;
  const promise = Promise.resolve().then(() => compileJsonSchemaSource(source, input.validateFormats));
  pendingValidators.set(cacheKey, { source, promise });
  try {
    const validate = await promise;
    if (pendingValidators.get(cacheKey)?.promise === promise) {
      validators.delete(cacheKey); validators.set(cacheKey, { source, validate }); evictOldestValidators();
    }
    return validate;
  } finally { if (pendingValidators.get(cacheKey)?.promise === promise) pendingValidators.delete(cacheKey); }
}
export function getJsonSchemaValidatorCacheStats(): { readonly entries: number; readonly hits: number; readonly misses: number; } {
  return { entries: validators.size, hits: cacheHits, misses: cacheMisses };
}
function compileJsonSchemaSource(source: string, validateFormats: boolean | undefined): ValidateFunction {
  const schema = JSON.parse(source) as AnySchema;
  const ajv = new Ajv2020({ allErrors: true, strict: false, ...(validateFormats === false ? { validateFormats: false } : {}) });
  if (validateFormats !== false) {
    addFormats(ajv);
    assertKnownFormats(schema, ajv);
  }
  return ajv.compile(schema);
}
function assertKnownFormats(value: unknown, ajv: Ajv2020): void {
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) { value.forEach((item) => assertKnownFormats(item, ajv)); return; }
  const record = value as Record<string, unknown>;
  if (typeof record.format === 'string' && !Object.hasOwn(ajv.formats, record.format)) {
    throw new Error(`Unsupported JSON Schema format: ${record.format}`);
  }
  // Only schema-bearing keywords; example payloads may have their own format field.
  for (const key of ['properties', '$defs', 'definitions', 'patternProperties', 'dependentSchemas']) {
    const children = record[key];
    if (children && typeof children === 'object') Object.values(children).forEach((item) => assertKnownFormats(item, ajv));
  }
  for (const key of ['items', 'additionalProperties', 'contains', 'not', 'if', 'then', 'else', 'propertyNames', 'allOf', 'anyOf', 'oneOf', 'prefixItems']) {
    assertKnownFormats(record[key], ajv);
  }
}
function evictOldestValidators(): void {
  while (validators.size > MAX_CACHE_ENTRIES) {
    const oldestKey = validators.keys().next().value;
    if (oldestKey === undefined) return;
    validators.delete(oldestKey);
  }
}
