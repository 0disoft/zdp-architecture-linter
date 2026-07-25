import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import type { AnySchema, ValidateFunction } from 'ajv';

const MAX_CACHE_ENTRIES = 64;

interface CachedValidator {
  readonly source: string;
  readonly validate: ValidateFunction;
}

const validators = new Map<string, CachedValidator>();
let cacheHits = 0;
let cacheMisses = 0;

export async function compileJsonSchemaFile(input: {
  readonly absolutePath: string;
  readonly validateFormats?: boolean;
}): Promise<ValidateFunction> {
  const absolutePath = resolve(input.absolutePath);
  const cacheKey = `${input.validateFormats === false ? 'formats-off' : 'formats-on'}\0${absolutePath}`;
  const source = await readFile(absolutePath, 'utf8');
  const cached = validators.get(cacheKey);

  if (cached?.source === source) {
    cacheHits += 1;
    validators.delete(cacheKey);
    validators.set(cacheKey, cached);
    return cached.validate;
  }

  cacheMisses += 1;
  const schema = JSON.parse(source) as AnySchema;
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    ...(input.validateFormats === false ? { validateFormats: false } : {})
  });
  const validate = ajv.compile(schema);

  validators.delete(cacheKey);
  validators.set(cacheKey, { source, validate });
  evictOldestValidators();

  return validate;
}

export function getJsonSchemaValidatorCacheStats(): {
  readonly entries: number;
  readonly hits: number;
  readonly misses: number;
} {
  return {
    entries: validators.size,
    hits: cacheHits,
    misses: cacheMisses
  };
}

function evictOldestValidators(): void {
  while (validators.size > MAX_CACHE_ENTRIES) {
    const oldestKey = validators.keys().next().value;
    if (oldestKey === undefined) {
      return;
    }
    validators.delete(oldestKey);
  }
}
