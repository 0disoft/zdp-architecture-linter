import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import {
  validateSupportSourceAdapterCatalogSchema,
  validateSupportSourceRegistrationFixtures
} from '../src/support-source-registry-validation.ts';

const catalogSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object', additionalProperties: false,
  required: ['schema_version', 'adapters'],
  properties: { schema_version: { const: '1' }, adapters: { type: 'array' } }
};

const registrationSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object', additionalProperties: false,
  required: ['adapter_id', 'organization_ids', 'projection_schema_version', 'admin_api_version'],
  properties: {
    adapter_id: { type: 'string' },
    organization_ids: { type: 'array', minItems: 1, items: { type: 'string', not: { const: 'wildcard' } } },
    projection_schema_version: { type: 'integer' },
    admin_api_version: { type: 'integer' }
  }
};

const catalog = {
  schema_version: '1',
  adapters: [{ id: 'melamed-support-v1', projection_schema_versions: [1], admin_api_versions: [1] }]
};

describe('support source registry validation', () => {
  test('validates the logical adapter catalog against its schema', async () => {
    await withRoot({}, async (architectureRoot) => {
      expect(await validateSupportSourceAdapterCatalogSchema({ architectureRoot, value: { adapters: [] } }))
        .toEqual([expect.objectContaining({ ruleId: 'ZDP-SUPPORT-REGISTRY-001', file: 'catalogs/support-source-adapters.yaml' })]);
    });
  });

  test('accepts valid pass fixtures and proven schema or reference failures', async () => {
    await withRoot({
      'fixtures/support-source-registration/pass/melamed.yaml': registration({}),
      'fixtures/support-source-registration/fail/wildcard.yaml': registration({ organization_ids: ['wildcard'] }),
      'fixtures/support-source-registration/fail/unknown.yaml': registration({ adapter_id: 'missing-support-v1' }),
      'fixtures/support-source-registration/fail/version.yaml': registration({ projection_schema_version: 2 })
    }, async (architectureRoot) => {
      expect(await validateSupportSourceRegistrationFixtures({ architectureRoot, catalog })).toEqual([]);
    });
  });

  test('fails when a fail fixture no longer violates the contract', async () => {
    await withRoot({
      'fixtures/support-source-registration/fail/not-failing.yaml': registration({})
    }, async (architectureRoot) => {
      expect(await validateSupportSourceRegistrationFixtures({ architectureRoot, catalog }))
        .toEqual([expect.objectContaining({ ruleId: 'ZDP-SUPPORT-REGISTRY-005', path: 'fixture' })]);
    });
  });
});

function registration(overrides: Record<string, unknown>): string {
  return JSON.stringify({
    adapter_id: 'melamed-support-v1',
    organization_ids: ['org-melamed-fixture'],
    projection_schema_version: 1,
    admin_api_version: 1,
    ...overrides
  });
}

async function withRoot(files: Record<string, string>, callback: (architectureRoot: string) => Promise<void>): Promise<void> {
  const architectureRoot = await mkdtemp(join(tmpdir(), 'zdp-support-registry-'));
  const allFiles = {
    'schemas/support-source-adapter.schema.json': JSON.stringify(catalogSchema),
    'schemas/support-source-registration.schema.json': JSON.stringify(registrationSchema),
    ...files
  };
  try {
    for (const [relativePath, source] of Object.entries(allFiles)) {
      const path = join(architectureRoot, relativePath);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, source, 'utf8');
    }
    await callback(architectureRoot);
  } finally {
    await rm(architectureRoot, { recursive: true, force: true });
  }
}
