import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { validateDataClassCatalogSchema } from '../src/data-class-schema-validation.ts';

const schemaSource = JSON.stringify({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: false,
  required: ['schema_version', 'data_classes'],
  properties: {
    schema_version: { type: 'string' },
    data_classes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'allowed_datastores'],
        properties: {
          id: { type: 'string' },
          allowed_datastores: {
            type: 'array',
            items: { type: 'string' }
          }
        }
      }
    }
  }
});

describe('data class catalog schema validation', () => {
  test('passes when data-classes.yaml satisfies data-class.schema.json', async () => {
    await withDataClassSchemaRoot(async (architectureRoot) => {
      const diagnostics = await validateDataClassCatalogSchema({
        architectureRoot,
        value: {
          schema_version: '0.1',
          data_classes: [{ id: 'identity', allowed_datastores: [] }]
        }
      });

      expect(diagnostics).toEqual([]);
    });
  });

  test('fails closed when a required data class field is missing', async () => {
    await withDataClassSchemaRoot(async (architectureRoot) => {
      const diagnostics = await validateDataClassCatalogSchema({
        architectureRoot,
        value: {
          data_classes: [{ id: 'identity' }]
        }
      });

      expect(diagnostics).toEqual([
        {
          ruleId: 'ZDP-DATA-007',
          severity: 'error',
          file: 'catalogs/data-classes.yaml',
          path: 'schema',
          message:
            "Data class catalog violates `schemas/data-class.schema.json`: schema must have required property 'schema_version'; data_classes.0 must have required property 'allowed_datastores'"
        }
      ]);
    });
  });

  test('limits schema error details while preserving the omitted count', async () => {
    await withDataClassSchemaRoot(async (architectureRoot) => {
      const diagnostics = await validateDataClassCatalogSchema({
        architectureRoot,
        value: {
          data_classes: [{}, {}, {}, {}, {}, {}]
        }
      });

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.message).toContain('and 8 more schema errors');
    });
  });
});

async function withDataClassSchemaRoot(
  callback: (architectureRoot: string) => Promise<void>
): Promise<void> {
  const architectureRoot = await mkdtemp(join(tmpdir(), 'zdp-data-class-schema-'));

  try {
    const schemaPath = join(architectureRoot, 'schemas/data-class.schema.json');
    await mkdir(dirname(schemaPath), { recursive: true });
    await writeFile(schemaPath, schemaSource, 'utf8');
    await callback(architectureRoot);
  } finally {
    await rm(architectureRoot, { recursive: true, force: true });
  }
}
