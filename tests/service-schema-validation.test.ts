import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { validateServiceSchemaFixtures } from '../src/service-schema-validation.ts';

const schemaSource = JSON.stringify({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: false,
  required: ['service'],
  properties: {
    service: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'repo'],
      properties: {
        id: {
          type: 'string',
          pattern: '^[a-z0-9][a-z0-9-]*$'
        },
        repo: {
          type: 'string',
          pattern: '^zdp-[a-z0-9-]+$'
        }
      }
    }
  }
});

describe('service schema fixtures', () => {
  test('passes when schema fixture outcomes match their directories', async () => {
    await withSchemaFixtureRoot(
      {
        'schemas/service.schema.json': schemaSource,
        'fixtures/service-schema/pass/valid.yaml': `
service:
  id: valid-service
  repo: zdp-valid-service
`,
        'fixtures/service-schema/fail/missing-repo.yaml': `
service:
  id: missing-repo
`
      },
      async (architectureRoot) => {
        const diagnostics = await validateServiceSchemaFixtures(architectureRoot);

        expect(diagnostics).toEqual([]);
      }
    );
  });

  test('fails when a pass fixture violates the service schema', async () => {
    await withSchemaFixtureRoot(
      {
        'schemas/service.schema.json': schemaSource,
        'fixtures/service-schema/pass/missing-repo.yaml': `
service:
  id: missing-repo
`
      },
      async (architectureRoot) => {
        const diagnostics = await validateServiceSchemaFixtures(architectureRoot);

        expect(diagnostics).toEqual([
          {
            ruleId: 'ZDP-SERVICE-SCHEMA-001',
            severity: 'error',
            file: 'fixtures/service-schema/pass/missing-repo.yaml',
            path: 'service',
            message:
              "Service schema pass fixture is invalid: service must have required property 'repo'"
          }
        ]);
      }
    );
  });

  test('fails when a fail fixture unexpectedly satisfies the service schema', async () => {
    await withSchemaFixtureRoot(
      {
        'schemas/service.schema.json': schemaSource,
        'fixtures/service-schema/fail/valid.yaml': `
service:
  id: valid-service
  repo: zdp-valid-service
`
      },
      async (architectureRoot) => {
        const diagnostics = await validateServiceSchemaFixtures(architectureRoot);

        expect(diagnostics).toEqual([
          {
            ruleId: 'ZDP-SERVICE-SCHEMA-002',
            severity: 'error',
            file: 'fixtures/service-schema/fail/valid.yaml',
            path: 'schema',
            message: 'Service schema fail fixture unexpectedly passed.'
          }
        ]);
      }
    );
  });
});

async function withSchemaFixtureRoot(
  files: Record<string, string>,
  callback: (architectureRoot: string) => Promise<void>
): Promise<void> {
  const architectureRoot = await mkdtemp(join(tmpdir(), 'zdp-service-schema-'));

  try {
    for (const [relativePath, source] of Object.entries(files)) {
      const absolutePath = join(architectureRoot, relativePath);

      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, source.trimStart(), 'utf8');
    }

    await callback(architectureRoot);
  } finally {
    await rm(architectureRoot, { recursive: true, force: true });
  }
}
