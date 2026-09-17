import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { validateRepositoryCatalogSchema } from '../src/repository-schema-validation.ts';

const schemaSource = JSON.stringify({
  $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', additionalProperties: false, required: ['repositories'],
  properties: { repositories: { type: 'array', items: {
    type: 'object', additionalProperties: false,
    required: ['name', 'status', 'repo_stage', 'kind', 'area', 'purpose', 'owner', 'risk_level'],
    properties: {
      name: { type: 'string', pattern: '^zdp-[a-z0-9-]+$' },
      status: { type: 'string', enum: ['active', 'reserved', 'candidate', 'experiment'] },
      repo_stage: { type: 'string', enum: ['deploy_unit', 'logical_only'] },
      kind: { type: 'string', enum: ['deploy_unit', 'logical_boundary'] },
      area: { type: 'string' }, purpose: { type: 'string', minLength: 1 }, owner: { type: 'string', minLength: 1 },
      risk_level: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] }
    }
  } } }
});
const validRepository = {
  name: 'zdp-architecture-linter', status: 'active', repo_stage: 'deploy_unit', kind: 'deploy_unit',
  area: 'architecture', purpose: 'Validate ZDP architecture contracts.', owner: '0disoft', risk_level: 'high'
};

describe('repository catalog schema validation', () => {
  test('passes when repositories.yaml satisfies repository.schema.json', async () => {
    await withRepositorySchemaRoot(async (architectureRoot) => {
      expect(await validateRepositoryCatalogSchema({ architectureRoot, value: { repositories: [validRepository] } })).toEqual([]);
    });
  });
  test('preserves location and exposes the missing property separately', async () => {
    await withRepositorySchemaRoot(async (architectureRoot) => {
      const { risk_level: _risk, ...record } = validRepository;
      const diagnostics = await validateRepositoryCatalogSchema({ architectureRoot, value: { repositories: [record] } });
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]).toEqual(expect.objectContaining({
        ruleId: 'ZDP-REPO-001', severity: 'error', file: 'catalogs/repositories.yaml', path: 'repositories.0',
        message: "Repository catalog is invalid: repositories.0 must have required property 'risk_level'",
        schemaError: expect.objectContaining({ keyword: 'required', instancePath: '/repositories/0', missingProperty: 'risk_level' })
      }));
    });
  });
  test('preserves enum violations', async () => {
    await withRepositorySchemaRoot(async (architectureRoot) => {
      const diagnostics = await validateRepositoryCatalogSchema({ architectureRoot, value: { repositories: [{ ...validRepository, status: 'active-ish' }] } });
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]).toEqual(expect.objectContaining({
        ruleId: 'ZDP-REPO-001', severity: 'error', file: 'catalogs/repositories.yaml', path: 'repositories.0.status',
        message: 'Repository catalog is invalid: repositories.0.status must be equal to one of the allowed values',
        schemaError: expect.objectContaining({ keyword: 'enum' })
      }));
    });
  });
  test('does not truncate more than five errors or merge missing fields', async () => {
    await withRepositorySchemaRoot(async (architectureRoot) => {
      const diagnostics = await validateRepositoryCatalogSchema({ architectureRoot, value: { repositories: [{ name: 'zdp-example', status: 'active' }] } });
      expect(diagnostics.length).toBeGreaterThan(5);
      expect(new Set(diagnostics.map((diagnostic) => diagnostic.fingerprint)).size).toBe(diagnostics.length);
      expect(diagnostics.every((diagnostic) => diagnostic.schemaError?.keyword === 'required')).toBe(true);
    });
  });
  test('fingerprints follow repository identity after reordering', async () => {
    await withRepositorySchemaRoot(async (architectureRoot) => {
      const { risk_level: _risk, ...invalid } = validRepository;
      const other = { ...validRepository, name: 'zdp-other' };
      const before = await validateRepositoryCatalogSchema({ architectureRoot, value: { repositories: [invalid, other] } });
      const after = await validateRepositoryCatalogSchema({ architectureRoot, value: { repositories: [other, invalid] } });
      expect(before[0]?.fingerprint).toBe(after[0]?.fingerprint);
      expect(before[0]?.path).not.toBe(after[0]?.path);
    });
  });
});

async function withRepositorySchemaRoot(callback: (architectureRoot: string) => Promise<void>): Promise<void> {
  const architectureRoot = await mkdtemp(join(tmpdir(), 'zdp-repository-schema-'));
  try {
    const schemaPath = join(architectureRoot, 'schemas/repository.schema.json');
    await mkdir(dirname(schemaPath), { recursive: true });
    await writeFile(schemaPath, schemaSource, 'utf8');
    await callback(architectureRoot);
  } finally { await rm(architectureRoot, { recursive: true, force: true }); }
}
