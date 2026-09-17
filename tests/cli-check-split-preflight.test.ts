import { describe, expect, test } from 'bun:test';
import { createMinimalArchitectureFiles, runCli, withArchitectureFiles } from './cli-test-helpers.ts';

const malformedInput = {
  'schemas/repository.schema.json': JSON.stringify({
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object', required: ['repositories'],
    properties: { repositories: { type: 'array', items: { type: 'object' } } }
  }),
  'catalogs/repositories.yaml': 'repositories: not-an-array\n'
};

describe('check-split input failures', () => {
  test('returns input diagnostics and exit 1 before filtering split rules', async () => {
    await withArchitectureFiles(createMinimalArchitectureFiles(malformedInput), async ({ architectureRoot }) => {
      const result = await runCli(['check-split', '--architecture', architectureRoot, '--json']);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe('');
      const report = JSON.parse(result.stdout) as { diagnostics: { severity: string; file: string }[] };
      expect(report.diagnostics.some((diagnostic) => diagnostic.severity === 'error' && diagnostic.file === 'catalogs/repositories.yaml')).toBe(true);
    });
  });
  test('prints the offending input in text mode instead of validation passed', async () => {
    await withArchitectureFiles(createMinimalArchitectureFiles(malformedInput), async ({ architectureRoot }) => {
      const result = await runCli(['check-split', '--architecture', architectureRoot]);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain('catalogs/repositories.yaml');
      expect(result.stdout).not.toContain('validation passed');
    });
  });
});
