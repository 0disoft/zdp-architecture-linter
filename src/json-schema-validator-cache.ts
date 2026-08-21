import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import type { AnySchema, ValidateFunction } from 'ajv';

const MAX_CACHE_ENTRIES = 64;

interface CachedValidator {
  readonly source: string;
  readonly validate: ValidateFunction;
}

interface PendingValidator {
  readonly source: string;
  readonly promise: Promise<ValidateFunction>;
}

const validators = new Map<string, CachedValidator>();
const pendingValidators = new Map<string, PendingValidator>();
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

  const pending = pendingValidators.get(cacheKey);
  if (pending?.source === source) {
    cacheHits += 1;
    return pending.promise;
  }

  cacheMisses += 1;
  const promise = Promise.resolve().then(() =>
    compileJsonSchemaSource(source, input.validateFormats)
  );
  pendingValidators.set(cacheKey, { source, promise });

  try {
    const validate = await promise;

    if (pendingValidators.get(cacheKey)?.promise === promise) {
      validators.delete(cacheKey);
      validators.set(cacheKey, { source, validate });
      evictOldestValidators();
    }

    return validate;
  } finally {
    if (pendingValidators.get(cacheKey)?.promise === promise) {
      pendingValidators.delete(cacheKey);
    }
  }
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

function compileJsonSchemaSource(
  source: string,
  validateFormats: boolean | undefined
): ValidateFunction {
  const schema = JSON.parse(source) as AnySchema;
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    ...(validateFormats === false ? { validateFormats: false } : {})
  });

  return ajv.compile(schema);
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
