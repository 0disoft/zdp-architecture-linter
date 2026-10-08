import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { compileJsonSchemaFile } from '../src/json-schema-validator-cache.ts';

describe('JSON Schema validator cache', () => {
  test('checks formats in unevaluated schemas without inspecting example payloads', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zdp-schema-unevaluated-'));
    const schemaPath = join(root, 'schema.json');
    try {
      for (const keyword of ['unevaluatedProperties', 'unevaluatedItems']) {
        const type = keyword === 'unevaluatedProperties' ? 'object' : 'array';
        const schema = { type, [keyword]: { type: 'string', format: 'unsupported-format' } };
        await writeFile(schemaPath, JSON.stringify(schema));
        await expect(compileJsonSchemaFile({ absolutePath: schemaPath })).rejects.toThrow('Unsupported JSON Schema format');
        const unchecked = await compileJsonSchemaFile({ absolutePath: schemaPath, validateFormats: false });
        expect(unchecked(type === 'object' ? { extra: 'anything' } : ['anything'])).toBe(true);
        await writeFile(schemaPath, JSON.stringify({
          type, [keyword]: { type: 'string', format: 'date-time' },
          examples: [{ format: 'example-data' }]
        }));
        const validate = await compileJsonSchemaFile({ absolutePath: schemaPath });
        expect(validate(type === 'object' ? { extra: 'bad-date' } : ['bad-date'])).toBe(false);
        expect(validate(type === 'object' ? { extra: '2026-10-08T00:00:00Z' } : ['2026-10-08T00:00:00Z'])).toBe(true);
      }
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  test('validates standard formats and rejects unsupported ones without changing formats-off', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zdp-schema-formats-'));
    const schemaPath = join(root, 'schema.json');
    try {
      await writeFile(schemaPath, JSON.stringify({ type: 'string', format: 'date-time' }));
      const validate = await compileJsonSchemaFile({ absolutePath: schemaPath });
      expect(validate('not-a-date')).toBe(false);
      expect(validate('2026-10-07T00:00:00Z')).toBe(true);
      const unchecked = await compileJsonSchemaFile({ absolutePath: schemaPath, validateFormats: false });
      expect(unchecked('not-a-date')).toBe(true);
      await writeFile(schemaPath, JSON.stringify({ type: 'string', format: 'unsupported-format' }));
      await expect(compileJsonSchemaFile({ absolutePath: schemaPath })).rejects.toThrow('Unsupported JSON Schema format');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  test('reuses an unchanged source and recompiles the same path after a change', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zdp-schema-cache-'));
    const schemaPath = join(root, 'schema.json');

    try {
      await writeFile(schemaPath, createSchema('value'), 'utf8');

      const first = await compileJsonSchemaFile({ absolutePath: schemaPath });
      const second = await compileJsonSchemaFile({ absolutePath: schemaPath });

      expect(second).toBe(first);
      expect(first({ value: 'ok' })).toBe(true);

      await writeFile(schemaPath, createSchema('replacement'), 'utf8');
      const changed = await compileJsonSchemaFile({ absolutePath: schemaPath });

      expect(changed).not.toBe(first);
      expect(changed({ value: 'stale' })).toBe(false);
      expect(changed({ replacement: 'fresh' })).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('deduplicates concurrent compilation for the same unchanged source', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zdp-schema-cache-concurrent-'));
    const schemaPath = join(root, 'schema.json');

    try {
      await writeFile(schemaPath, createSchema('value'), 'utf8');

      const [first, second, third] = await Promise.all([
        compileJsonSchemaFile({ absolutePath: schemaPath }),
        compileJsonSchemaFile({ absolutePath: schemaPath }),
        compileJsonSchemaFile({ absolutePath: schemaPath })
      ]);

      expect(second).toBe(first);
      expect(third).toBe(first);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

function createSchema(requiredField: string): string {
  return JSON.stringify({
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    additionalProperties: false,
    required: [requiredField],
    properties: {
      [requiredField]: { type: 'string' }
    }
  });
}
