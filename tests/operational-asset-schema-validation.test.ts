import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { validateOperationalAssetCatalogSchema } from '../src/operational-asset-schema-validation.ts';

const schemaSource = JSON.stringify({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: false,
  required: ['schema_version', 'policy', 'assets'],
  properties: {
    schema_version: { const: 1 },
    policy: {
      type: 'object',
      required: ['record_before_change'],
      properties: { record_before_change: { const: true } }
    },
    assets: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'owner', 'provider_bindings', 'lifecycle', 'security', 'evidence']
      }
    }
  }
});

describe('operational asset catalog schema validation', () => {
  test('passes when an operational asset has ownership, lifecycle, security, and evidence', async () => {
    await withOperationalAssetSchemaRoot(async (architectureRoot) => {
      const diagnostics = await validateOperationalAssetCatalogSchema({
        architectureRoot,
        value: {
          schema_version: 1,
          policy: { record_before_change: true },
          assets: [
            {
              id: 'domain-example-com',
              owner: 'platform',
              provider_bindings: [],
              lifecycle: {},
              security: {},
              evidence: {}
            }
          ]
        }
      });

      expect(diagnostics).toEqual([]);
    });
  });

  test('fails closed when an active asset omits lifecycle and evidence', async () => {
    await withOperationalAssetSchemaRoot(async (architectureRoot) => {
      const diagnostics = await validateOperationalAssetCatalogSchema({
        architectureRoot,
        value: {
          schema_version: 1,
          policy: { record_before_change: true },
          assets: [{ id: 'database-core-postgres', owner: 'core' }]
        }
      });

      expect(diagnostics).toEqual([
        {
          ruleId: 'ZDP-OPS-ASSET-001',
          severity: 'error',
          file: 'catalogs/operational-assets.yaml',
          path: 'assets.0',
          message:
            "Operational asset catalog violates `schemas/operational-asset.schema.json`: assets.0 must have required property 'provider_bindings'; assets.0 must have required property 'lifecycle'; assets.0 must have required property 'security'; assets.0 must have required property 'evidence'"
        }
      ]);
    });
  });
});

async function withOperationalAssetSchemaRoot(
  callback: (architectureRoot: string) => Promise<void>
): Promise<void> {
  const architectureRoot = await mkdtemp(join(tmpdir(), 'zdp-operational-asset-schema-'));

  try {
    const schemaPath = join(
      architectureRoot,
      'schemas/operational-asset.schema.json'
    );
    await mkdir(dirname(schemaPath), { recursive: true });
    await writeFile(schemaPath, schemaSource, 'utf8');
    await callback(architectureRoot);
  } finally {
    await rm(architectureRoot, { recursive: true, force: true });
  }
}
