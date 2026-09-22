import { describe, expect, test } from 'bun:test';
import { ARCHITECTURE_INPUTS, diffArchitectureInputs } from '../src/architecture-input-diff.ts';
import { loadArchitectureCatalogs, type ArchitectureCatalogs } from '../src/catalog-loader.ts';
import { createArchitectureDiffReport, formatArchitectureDiffReportText } from '../src/architecture-diff-report.ts';
import { createMinimalArchitectureFiles, withArchitectureFiles } from './cli-test-helpers.ts';

describe('exhaustive architecture input changes', () => {
  test('tracks every loader output, including optional policies and roadmap text', async () => {
    await withArchitectureFiles(createMinimalArchitectureFiles({}), async ({ architectureRoot }) => {
      const base = await loadArchitectureCatalogs(architectureRoot);
      expect(Object.keys(base).sort()).toEqual(Object.keys(ARCHITECTURE_INPUTS).sort());
      for (const name of Object.keys(ARCHITECTURE_INPUTS) as (keyof ArchitectureCatalogs)[]) {
        const value = base[name];
        const head = { ...base, [name]: typeof value === 'string' ? `${value}\nchanged` : { ...value, reviewProbe: true } };
        expect(diffArchitectureInputs(base, head).map((change) => change.name)).toEqual([name]);
      }
    });
  });
  test('reports IDs and non-collection policy fields without dumping values', async () => {
    await withArchitectureFiles(createMinimalArchitectureFiles({}), async ({ architectureRoot }) => {
      const base = await loadArchitectureCatalogs(architectureRoot);
      const head = { ...base, externalProviders: { providers: [{ id: 'example-provider' }] }, tierRules: { rules: [], state_transition_evidence: { evidence_max_age_days: 7 } } };
      const changes = diffArchitectureInputs(base, head);
      expect(changes.find((change) => change.name === 'externalProviders')?.collections.providers?.added).toEqual(['example-provider']);
      expect(changes.find((change) => change.name === 'tierRules')?.fields).toContain('state_transition_evidence');
      const report = createArchitectureDiffReport({ baseCatalogs: base, headCatalogs: head, baseDiagnostics: [], headDiagnostics: [] });
      expect(formatArchitectureDiffReportText(report)).toContain('rules/tier.rules.yaml');
      expect(formatArchitectureDiffReportText(report)).toContain('example-provider');
    });
  });
  test('ignores ID collection ordering but detects changed records', async () => {
    await withArchitectureFiles(createMinimalArchitectureFiles({}), async ({ architectureRoot }) => {
      const catalogs = await loadArchitectureCatalogs(architectureRoot);
      const base = { ...catalogs, dataClasses: { data_classes: [{ id: 'a', days: 1 }, { id: 'b', days: 2 }] } };
      const head = { ...catalogs, dataClasses: { data_classes: [{ id: 'b', days: 2 }, { id: 'a', days: 1 }] } };
      expect(diffArchitectureInputs(base, head)).toEqual([]);
      const changed = { ...head, dataClasses: { data_classes: [{ id: 'b', days: 3 }, { id: 'a', days: 1 }] } };
      expect(diffArchitectureInputs(base, changed)[0]?.collections.data_classes?.changed).toEqual(['b']);
    });
  });
});
