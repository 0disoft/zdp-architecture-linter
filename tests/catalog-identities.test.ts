import { describe, expect, test } from 'bun:test';
import { validateCollectionIdentities } from '../src/catalog-identities.ts';
import { loadValidationContext } from '../src/validation-context.ts';
import { createMinimalArchitectureFiles, withArchitectureFiles } from './cli-test-helpers.ts';

describe('catalog identity admission', () => {
  test('rejects every later declaration after normalized identity matching', () => {
    const diagnostics = validateCollectionIdentities([{ id: 'one' }, { id: ' one ' }, { id: 'one' }], 'catalogs/services.yaml', 'services', 'id');
    expect(diagnostics.map((diagnostic) => diagnostic.path)).toEqual(['services[1].id', 'services[2].id']);
    expect(diagnostics.every((diagnostic) => diagnostic.message.includes('services[0].id'))).toBe(true);
  });
  test('preserves distinct and case-sensitive identities', () => {
    expect(validateCollectionIdentities([{ id: 'one' }, { id: 'One' }, { id: 'two' }], 'catalogs/services.yaml', 'services', 'id')).toEqual([]);
  });
  test('preflight blocks graph construction instead of choosing first or last', async () => {
    await withArchitectureFiles(createMinimalArchitectureFiles({
      'catalogs/services.yaml': 'services:\n  - id: duplicate\n    status: experiment\n  - id: duplicate\n    status: active\n'
    }), async ({ architectureRoot }) => {
      const context = await loadValidationContext({ architectureRoot });
      expect(context.catalogSchemaPreflight.validation.diagnostics.some((diagnostic) => diagnostic.ruleId === 'ZDP-CATALOG-ID-001')).toBe(true);
      await expect(context.getGraph()).rejects.toThrow('catalog preflight failed');
    });
  });
});
