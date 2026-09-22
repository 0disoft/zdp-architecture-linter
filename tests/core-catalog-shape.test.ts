import { describe, expect, test } from 'bun:test';
import { validateCatalogArrayShape } from '../src/core-catalog-shape.ts';
import { createMinimalArchitectureFiles, runCli, withArchitectureFiles } from './cli-test-helpers.ts';

describe('core catalog reader preflight', () => {
  test('rejects malformed collections and identities instead of making an empty index', () => {
    for (const value of [null, [], {}, { services: {} }, { services: [null] }, { services: [{}] }, { services: [{ id: ' ' }] }]) {
      expect(validateCatalogArrayShape(value, 'catalogs/services.yaml', 'services', 'id').length).toBeGreaterThan(0);
    }
    expect(validateCatalogArrayShape({ services: [] }, 'catalogs/services.yaml', 'services', 'id')).toEqual([]);
    expect(validateCatalogArrayShape({ services: [{ id: 'example', extra: true }] }, 'catalogs/services.yaml', 'services', 'id')).toEqual([]);
  });
  test('graph does not report success for a malformed services or datastore catalog', async () => {
    for (const collection of ['services', 'datastores']) {
      await withArchitectureFiles(createMinimalArchitectureFiles({
        [`catalogs/${collection}.yaml`]: `${collection}: invalid\n`
      }), async ({ architectureRoot }) => {
        const result = await runCli(['graph', '--architecture', architectureRoot, '--json']);
        expect(result.exitCode).toBe(1);
        const report = JSON.parse(result.stdout) as { diagnostics: { ruleId: string; file: string }[] };
        expect(report.diagnostics.some((diagnostic) => diagnostic.ruleId === 'ZDP-CATALOG-SHAPE-001' && diagnostic.file === `catalogs/${collection}.yaml`)).toBe(true);
      });
    }
  });
});
