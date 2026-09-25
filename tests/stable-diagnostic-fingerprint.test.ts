import { describe, expect, test } from 'bun:test';
import { getDiagnosticFingerprint, getStableDiagnosticFingerprint, type Diagnostic } from '../src/diagnostics.ts';
import { createSarifReport } from '../src/sarif-report.ts';
import { createArchitectureDiffReport } from '../src/architecture-diff-report.ts';
import { loadArchitectureCatalogs } from '../src/catalog-loader.ts';
import { createMinimalArchitectureFiles, withArchitectureFiles } from './cli-test-helpers.ts';

const before: Diagnostic = { ruleId: 'ZDP-TEST', severity: 'error', file: 'catalogs/services.yaml', path: 'services[0:example].repo', message: 'Invalid owner.' };
const after: Diagnostic = { ...before, path: 'services[42:example].repo' };

describe('v2 stable diagnostic identity', () => {
  test('uses catalog IDs while retaining the legacy v1 API', () => {
    expect(getStableDiagnosticFingerprint(before)).toBe(getStableDiagnosticFingerprint(after));
    expect(getDiagnosticFingerprint(before)).not.toBe(getDiagnosticFingerprint(after));
    expect(getStableDiagnosticFingerprint({ ...before, path: 'services[id=example].repo' })).toBe(getStableDiagnosticFingerprint(before));
    expect(getStableDiagnosticFingerprint({ ...before, path: 'services[0:other].repo' })).not.toBe(getStableDiagnosticFingerprint(before));
    expect(getStableDiagnosticFingerprint({ ...before, fingerprint: ' explicit/v1 ' })).toBe('explicit/v1');
  });
  test('does not erase positional identity where no ID is available', () => {
    expect(getStableDiagnosticFingerprint({ ...before, path: 'services[0].id' })).not.toBe(getStableDiagnosticFingerprint({ ...before, path: 'services[1].id' }));
  });
  test('SARIF primary and v2 fingerprints survive reordering', () => {
    const left = createSarifReport({ diagnostics: [before] }).runs[0]?.results[0]?.partialFingerprints;
    const right = createSarifReport({ diagnostics: [after] }).runs[0]?.results[0]?.partialFingerprints;
    expect(left?.primaryLocationLineHash).toBe(right?.primaryLocationLineHash);
    expect(left?.['zdpDiagnostic/v2']).toBe(right?.['zdpDiagnostic/v2']);
  });
  test('diff does not resolve and re-add an existing error after reordering', async () => {
    await withArchitectureFiles(createMinimalArchitectureFiles({}), async ({ architectureRoot }) => {
      const catalogs = await loadArchitectureCatalogs(architectureRoot);
      const report = createArchitectureDiffReport({ baseCatalogs: catalogs, headCatalogs: catalogs, baseDiagnostics: [before], headDiagnostics: [after] });
      expect(report.diagnostics).toEqual({ added: [], resolved: [] });
    });
  });
});
