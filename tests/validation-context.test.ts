import { mkdir, mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import type { ArchitectureCatalogs } from '../src/catalog-loader.ts';
import { validateRepositoryServiceContract } from '../src/service-schema-validation.ts';
import { createValidationContext } from '../src/validation-context.ts';

const EMPTY_CATALOGS: ArchitectureCatalogs = {
  repositories: { repositories: [] },
  splitTriggers: { split_triggers: [] },
  services: { services: [] },
  datastores: { datastores: [] },
  dataClasses: { data_classes: [] },
  events: { events: [] },
  externalProviders: { providers: [] },
  repositoryRules: { repository_area_rules: [] },
  moneyRules: { rules: [] },
  providerRules: { rules: [] },
  aiDataAccessRules: { rules: [] },
  dataAccessRules: { rules: [] },
  tierRules: { rules: [] }
};

describe('validation context', () => {
  test('memoizes the repository service contract and graph for concurrent consumers', async () => {
    const repositoryRoot = await mkdtemp(
      join(tmpdir(), 'zdp-validation-context-')
    );

    try {
      await writeFile(
        join(repositoryRoot, 'service.yaml'),
        [
          'service:',
          '  id: example-service',
          '  repo: example-repo',
          ''
        ].join('\n'),
        'utf8'
      );

      const context = createValidationContext({
        architectureRoot: '/architecture',
        repositoryRoot,
        catalogSchemaPreflight: {
          catalogs: EMPTY_CATALOGS,
          validation: { diagnostics: [] }
        }
      });
      const [serviceContract, firstGraph] = await Promise.all([
        context.getRepositoryServiceContract(),
        context.getGraph()
      ]);

      await unlink(join(repositoryRoot, 'service.yaml'));

      const [cachedServiceContract, secondGraph] = await Promise.all([
        context.getRepositoryServiceContract(),
        context.getGraph()
      ]);

      expect(cachedServiceContract).toBe(serviceContract);
      expect(secondGraph).toBe(firstGraph);
      expect(firstGraph.catalogs).toBe(EMPTY_CATALOGS);
    } finally {
      await rm(repositoryRoot, { recursive: true, force: true });
    }
  });

  test('reuses the preloaded service contract during schema validation', async () => {
    const architectureRoot = await mkdtemp(
      join(tmpdir(), 'zdp-validation-context-schema-')
    );
    const repositoryRoot = join(architectureRoot, 'repo');

    try {
      await mkdir(join(architectureRoot, 'schemas'), { recursive: true });
      await mkdir(repositoryRoot, { recursive: true });
      await writeFile(
        join(architectureRoot, 'schemas/service.schema.json'),
        JSON.stringify({
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'object',
          required: ['service'],
          properties: {
            service: {
              type: 'object',
              required: ['id', 'repo'],
              properties: {
                id: { type: 'string' },
                repo: { type: 'string' }
              }
            }
          }
        }),
        'utf8'
      );
      await writeFile(
        join(repositoryRoot, 'service.yaml'),
        [
          'service:',
          '  id: example-service',
          '  repo: example-repo',
          ''
        ].join('\n'),
        'utf8'
      );

      const context = createValidationContext({
        architectureRoot,
        repositoryRoot,
        catalogSchemaPreflight: {
          catalogs: EMPTY_CATALOGS,
          validation: { diagnostics: [] }
        }
      });
      const repositoryServiceContract =
        await context.getRepositoryServiceContract();

      await unlink(join(repositoryRoot, 'service.yaml'));

      const diagnostics = await validateRepositoryServiceContract({
        architectureRoot,
        repositoryRoot,
        repositoryServiceContract
      });

      expect(diagnostics).toEqual([]);
    } finally {
      await rm(architectureRoot, { recursive: true, force: true });
    }
  });

  test('resolves a stable null service contract when no repository root is supplied', async () => {
    const context = createValidationContext({
      architectureRoot: '/architecture',
      catalogSchemaPreflight: {
        catalogs: EMPTY_CATALOGS,
        validation: { diagnostics: [] }
      }
    });

    const [first, second] = await Promise.all([
      context.getRepositoryServiceContract(),
      context.getRepositoryServiceContract()
    ]);

    expect(first).toBeNull();
    expect(second).toBeNull();
    expect(await context.getGraph()).toBe(await context.getGraph());
  });
});
