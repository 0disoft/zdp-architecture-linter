import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { validateRepositoryCatalogSchema } from '../src/repository-schema-validation.ts';

const schemaSource = JSON.stringify({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: false,
  required: ['repositories'],
  properties: {
    repositories: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'status', 'repo_stage', 'kind', 'area', 'purpose', 'owner', 'risk_level'],
        properties: {
          name: { type: 'string', pattern: '^zdp-[a-z0-9-]+$' },
          status: { type: 'string', enum: ['active', 'reserved', 'candidate', 'experiment'] },
          repo_stage: { type: 'string', enum: ['deploy_unit', 'logical_only'] },
          kind: { type: 'string', enum: ['deploy_unit', 'logical_boundary'] },
          area: { type: 'string' },
          purpose: { type: 'string', minLength: 1 },
          owner: { type: 'string', minLength: 1 },
          risk_level: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] }
        }
      }
    }
  }
});

describe('repository catalog schema validation', () => {
  test('passes when repositories.yaml satisfies repository.schema.json', async () => {
    await withRepositorySchemaRoot(async (architectureRoot) => {
      const diagnostics = await validateRepositoryCatalogSchema({
        architectureRoot,
        value: {
          repositories: [
            {
              name: 'zdp-architecture-linter',
              status: 'active',
              repo_stage: 'deploy_unit',
              kind: 'deploy_unit',
              area: 'architecture',
              purpose: 'Validate ZDP architecture contracts.',
              owner: '0disoft',
              risk_level: 'high'
            }
          ]
        }
      });

      expect(diagnostics).toEqual([]);
    });
  });

  test('fails with a stable path when a required field is missing', async () => {
    await withRepositorySchemaRoot(async (architectureRoot) => {
      const diagnostics = await validateRepositoryCatalogSchema({
        architectureRoot,
        value: {
          repositories: [
            {
              name: 'zdp-platform-runtime',
              status: 'reserved',
              repo_stage: 'deploy_unit',
              kind: 'deploy_unit',
              area: 'platform',
              purpose: 'Runtime baseline.',
              owner: '0disoft'
            }
          ]
        }
      });

      expect(diagnostics).toEqual([
        {
          ruleId: 'ZDP-REPO-001',
          severity: 'error',
          file: 'catalogs/repositories.yaml',
          path: 'repositories.0',
          message:
            "Repository catalog is invalid: repositories.0 must have required property 'risk_level'"
        }
      ]);
    });
  });

  test('fails when catalog enum values drift outside the repository schema', async () => {
    await withRepositorySchemaRoot(async (architectureRoot) => {
      const diagnostics = await validateRepositoryCatalogSchema({
        architectureRoot,
        value: {
          repositories: [
            {
              name: 'zdp-core-platform',
              status: 'active-ish',
              repo_stage: 'deploy_unit',
              kind: 'deploy_unit',
              area: 'core',
              purpose: 'Core platform.',
              owner: '0disoft',
              risk_level: 'critical'
            }
          ]
        }
      });

      expect(diagnostics).toEqual([
        {
          ruleId: 'ZDP-REPO-001',
          severity: 'error',
          file: 'catalogs/repositories.yaml',
          path: 'repositories.0.status',
          message:
            'Repository catalog is invalid: repositories.0.status must be equal to one of the allowed values'
        }
      ]);
    });
  });
});

async function withRepositorySchemaRoot(
  callback: (architectureRoot: string) => Promise<void>
): Promise<void> {
  const architectureRoot = await mkdtemp(join(tmpdir(), 'zdp-repository-schema-'));

  try {
    const schemaPath = join(architectureRoot, 'schemas/repository.schema.json');

    await mkdir(dirname(schemaPath), { recursive: true });
    await writeFile(schemaPath, schemaSource, 'utf8');
    await callback(architectureRoot);
  } finally {
    await rm(architectureRoot, { recursive: true, force: true });
  }
}
