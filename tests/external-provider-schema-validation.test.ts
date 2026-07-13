import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { validateExternalProviderCatalogSchema } from '../src/external-provider-schema-validation.ts';

const schemaSource = JSON.stringify({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: false,
  required: ['providers'],
  properties: {
    providers: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'categories'],
        properties: {
          id: { type: 'string' },
          categories: { type: 'array', items: { type: 'string' } },
          webhook_intake: {
            type: 'object',
            additionalProperties: false,
            required: ['signature_verification_required'],
            properties: {
              signature_verification_required: { const: true }
            }
          }
        },
        allOf: [
          {
            if: {
              properties: {
                categories: { contains: { enum: ['psp', 'psp-router'] } }
              },
              required: ['categories']
            },
            then: { required: ['webhook_intake'] }
          }
        ]
      }
    }
  }
});

describe('external provider catalog schema validation', () => {
  test('passes when PSP providers declare webhook intake controls', async () => {
    await withExternalProviderSchemaRoot(async (architectureRoot) => {
      const diagnostics = await validateExternalProviderCatalogSchema({
        architectureRoot,
        value: {
          providers: [
            {
              id: 'example-psp',
              categories: ['payment-processor', 'psp'],
              webhook_intake: { signature_verification_required: true }
            }
          ]
        }
      });

      expect(diagnostics).toEqual([]);
    });
  });

  test('fails closed when a PSP provider omits webhook intake controls', async () => {
    await withExternalProviderSchemaRoot(async (architectureRoot) => {
      const diagnostics = await validateExternalProviderCatalogSchema({
        architectureRoot,
        value: {
          providers: [
            {
              id: 'example-psp',
              categories: ['psp']
            }
          ]
        }
      });

      expect(diagnostics).toEqual([
        {
          ruleId: 'ZDP-PROVIDER-004',
          severity: 'error',
          file: 'catalogs/external-providers.yaml',
          path: 'providers.0',
          message:
            "External provider catalog violates `schemas/external-provider.schema.json`: providers.0 must have required property 'webhook_intake'; providers.0 must match \"then\" schema"
        }
      ]);
    });
  });
});

async function withExternalProviderSchemaRoot(
  callback: (architectureRoot: string) => Promise<void>
): Promise<void> {
  const architectureRoot = await mkdtemp(join(tmpdir(), 'zdp-provider-schema-'));

  try {
    const schemaPath = join(
      architectureRoot,
      'schemas/external-provider.schema.json'
    );
    await mkdir(dirname(schemaPath), { recursive: true });
    await writeFile(schemaPath, schemaSource, 'utf8');
    await callback(architectureRoot);
  } finally {
    await rm(architectureRoot, { recursive: true, force: true });
  }
}
