import { describe, expect, test } from 'bun:test';
import { loadArchitectureCatalogs } from '../src/catalog-loader.ts';
import { registerArchitectureCatalogSourceRoot } from '../src/architecture-source-root.ts';
import { createArchitectureDiffReport, formatArchitectureDiffReportText } from '../src/architecture-diff-report.ts';
import { createMinimalArchitectureFiles, withArchitectureFiles } from './cli-test-helpers.ts';

const schemaPath = 'schemas/events/example.v1.json';
describe('explicit diff source roots', () => {
  test('compares cloned catalogs using explicit source roots, without hidden registration', async () => {
    await withArchitectureFiles(createMinimalArchitectureFiles({ [schemaPath]: JSON.stringify({ type: 'string' }) }), async ({ architectureRoot: baseRoot }) => {
      await withArchitectureFiles(createMinimalArchitectureFiles({ [schemaPath]: JSON.stringify({ type: 'number' }) }), async ({ architectureRoot: headRoot }) => {
        const base = await loadArchitectureCatalogs(baseRoot);
        const head = await loadArchitectureCatalogs(headRoot);
        const report = createArchitectureDiffReport({
          baseCatalogs: { ...base }, headCatalogs: { ...head }, baseDiagnostics: [], headDiagnostics: [],
          sourceRoots: { baseArchitectureRoot: baseRoot, headArchitectureRoot: headRoot }
        });
        expect(report.eventSchemaCompatibility?.status).toBe('checked');
        expect(report.diagnostics.added.some((diagnostic) => diagnostic.ruleId === 'ZDP-EVENT-004')).toBe(true);
      });
    });
  });
  test('reports not_run without roots and does not consult legacy WeakMap registration', async () => {
    await withArchitectureFiles(createMinimalArchitectureFiles({}), async ({ architectureRoot }) => {
      const catalogs = await loadArchitectureCatalogs(architectureRoot);
      registerArchitectureCatalogSourceRoot(catalogs, '/not-the-selected-source');
      const input = { baseCatalogs: catalogs, headCatalogs: catalogs, baseDiagnostics: [], headDiagnostics: [] };
      const report = createArchitectureDiffReport(input);
      expect(report.eventSchemaCompatibility).toEqual({ status: 'not_run', reason: 'source_roots_not_provided' });
      expect(formatArchitectureDiffReportText(report)).toContain('not_run');
      expect(() => createArchitectureDiffReport({ ...input, sourceRoots: { baseArchitectureRoot: '', headArchitectureRoot: architectureRoot } })).toThrow('non-empty');
    });
  });
});
