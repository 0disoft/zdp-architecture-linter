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
        observedAt: new Date('2026-08-08T12:00:00Z'),
        value: {
          schema_version: 1,
          policy: { record_before_change: true, review_interval_days: 30 },
          assets: [
            {
              id: 'domain-example-com',
              kind: 'domain',
              status: 'active',
              owner: 'platform',
              provider_bindings: [],
              lifecycle: { expires_at: '2027-08-08T00:00:00Z' },
              security: { public_access: true },
              evidence: { last_verified_at: '2026-08-08' }
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

  test('fails when non-retired asset evidence exceeds the review interval', async () => {
    await withOperationalAssetSchemaRoot(async (architectureRoot) => {
      const diagnostics = await validateOperationalAssetCatalogSchema({
        architectureRoot,
        observedAt: new Date('2026-08-08T12:00:00Z'),
        value: operationalAssetCatalog([
          operationalAsset({
            id: 'compute-staging',
            evidence: { last_verified_at: '2026-07-08' }
          })
        ])
      });

      expect(diagnostics).toEqual([
        {
          ruleId: 'ZDP-OPS-ASSET-002',
          severity: 'error',
          file: 'catalogs/operational-assets.yaml',
          path: 'assets.0.evidence.last_verified_at',
          message:
            'Operational asset `compute-staging` evidence is 31 days old, exceeding policy.review_interval_days=30; reconcile provider state and refresh non-secret evidence.'
        }
      ]);
    });
  });

  test('fails when a non-retired domain has expired', async () => {
    await withOperationalAssetSchemaRoot(async (architectureRoot) => {
      const diagnostics = await validateOperationalAssetCatalogSchema({
        architectureRoot,
        observedAt: new Date('2026-08-08T12:00:00Z'),
        value: operationalAssetCatalog([
          operationalAsset({
            id: 'domain-example-com',
            kind: 'domain',
            lifecycle: { expires_at: '2026-08-08T11:59:59Z' }
          })
        ])
      });

      expect(diagnostics).toEqual([
        {
          ruleId: 'ZDP-OPS-ASSET-002',
          severity: 'error',
          file: 'catalogs/operational-assets.yaml',
          path: 'assets.0.lifecycle.expires_at',
          message:
            'Operational domain asset `domain-example-com` expired at `2026-08-08T11:59:59Z`; renew, retire, or replace it before operational completion.'
        }
      ]);
    });
  });

  test('fails when an active database backup reference is missing or not private storage', async () => {
    await withOperationalAssetSchemaRoot(async (architectureRoot) => {
      const diagnostics = await validateOperationalAssetCatalogSchema({
        architectureRoot,
        observedAt: new Date('2026-08-08T12:00:00Z'),
        value: operationalAssetCatalog([
          operationalAsset({
            id: 'database-core',
            kind: 'database',
            details: { backup_asset_id: 'backup-core' }
          }),
          operationalAsset({
            id: 'backup-core',
            kind: 'object-storage',
            security: { public_access: true }
          })
        ])
      });

      expect(diagnostics).toEqual([
        {
          ruleId: 'ZDP-OPS-ASSET-002',
          severity: 'error',
          file: 'catalogs/operational-assets.yaml',
          path: 'assets.0.details.backup_asset_id',
          message:
            'Operational asset `database-core` backup reference `backup-core` must resolve to an active, private object-storage asset.'
        }
      ]);
    });
  });
});

function operationalAssetCatalog(assets: readonly Record<string, unknown>[]) {
  return {
    schema_version: 1,
    policy: { record_before_change: true, review_interval_days: 30 },
    assets
  };
}

function operationalAsset(
  overrides: Readonly<Record<string, unknown>> = {}
): Record<string, unknown> {
  return {
    id: 'compute-example',
    kind: 'compute',
    status: 'active',
    owner: 'platform',
    provider_bindings: [],
    lifecycle: { expires_at: null },
    security: { public_access: false },
    evidence: { last_verified_at: '2026-08-08' },
    ...overrides
  };
}

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
