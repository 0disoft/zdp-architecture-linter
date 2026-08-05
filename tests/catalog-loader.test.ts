import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { loadArchitectureCatalogs } from '../src/catalog-loader.ts';

const REQUIRED_FILES = [
  'catalogs/repositories.yaml',
  'ROADMAP.md',
  'docs/26-eighteen-month-roadmap.md',
  'catalogs/services.yaml',
  'catalogs/datastores.yaml',
  'catalogs/data-classes.yaml',
  'catalogs/cost-budgets.yaml',
  'catalogs/slo-tiers.yaml',
  'catalogs/events.yaml',
  'catalogs/external-providers.yaml',
  'catalogs/operational-assets.yaml',
  'rules/repository.rules.yaml',
  'rules/money.rules.yaml',
  'rules/provider.rules.yaml',
  'rules/ai-data-access.rules.yaml',
  'rules/data-access.rules.yaml',
  'rules/tier.rules.yaml'
] as const;

describe('architecture catalog loader', () => {
  test('loads required inputs while preserving optional fallbacks', async () => {
    await withArchitectureRoot(REQUIRED_FILES, async (architectureRoot) => {
      const catalogs = await loadArchitectureCatalogs(architectureRoot);

      expect(catalogs.repositories).toEqual({});
      expect(catalogs.splitTriggers).toEqual({ split_triggers: [] });
      expect(catalogs.operationalAssets).toEqual({});
      expect(catalogs.supportSourceAdapters).toBeUndefined();
      expect(catalogs.apiRules).toBeUndefined();
      expect(catalogs.tokenRules).toBeUndefined();
      expect(catalogs.repositoryRoadmapText).toBe('{}\n{}');
    });
  });

  test('reports the earliest canonical required input when concurrent reads fail', async () => {
    const files = REQUIRED_FILES.filter(
      (file) =>
        file !== 'catalogs/repositories.yaml' &&
        file !== 'catalogs/services.yaml'
    );

    await withArchitectureRoot(files, async (architectureRoot) => {
      await expect(loadArchitectureCatalogs(architectureRoot)).rejects.toMatchObject({
        code: 'ENOENT',
        path: join(architectureRoot, 'catalogs/repositories.yaml')
      });
    });
  });
});

async function withArchitectureRoot(
  files: readonly string[],
  callback: (architectureRoot: string) => Promise<void>
): Promise<void> {
  const architectureRoot = await mkdtemp(join(tmpdir(), 'zdp-catalog-loader-'));

  try {
    for (const relativePath of files) {
      const absolutePath = join(architectureRoot, relativePath);
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, '{}', 'utf8');
    }

    await callback(architectureRoot);
  } finally {
    await rm(architectureRoot, { recursive: true, force: true });
  }
}
