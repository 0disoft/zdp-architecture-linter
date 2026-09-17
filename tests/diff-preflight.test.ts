import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { assertComparablePreflight } from '../src/diff-preflight.ts';
import { createCliErrorReport } from '../src/cli-error-report.ts';
import type { Diagnostic } from '../src/diagnostics.ts';
import { createMinimalArchitectureFiles, runCli, withArchitectureFiles } from './cli-test-helpers.ts';

const diagnostic: Diagnostic = {
  ruleId: 'ZDP-TEST-SCHEMA', severity: 'error', file: 'catalogs/repositories.yaml', path: 'repositories', message: 'Expected array.'
};

describe('diff input admission', () => {
  test('blocks base, head and identical failures on both sides', () => {
    for (const [base, head] of [[[diagnostic], []], [[], [diagnostic]], [[diagnostic], [diagnostic]]] as const) {
      try {
        assertComparablePreflight({ base: { diagnostics: base }, head: { diagnostics: head } });
        throw new Error('Expected preflight failure');
      } catch (error) {
        const report = createCliErrorReport(error);
        expect(report.error.code).toBe('validation_failed');
        expect(report.error.details.comparisonStatus).toBe('comparison_blocked');
      }
    }
    expect(() => assertComparablePreflight({ base: { diagnostics: [] }, head: { diagnostics: [] } })).not.toThrow();
  });
  test('CLI fails for identical malformed revisions regardless of new-error mode', async () => {
    await withArchitectureFiles(createMinimalArchitectureFiles({
      'schemas/repository.schema.json': JSON.stringify({
        $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object',
        properties: { repositories: { type: 'array' } }, required: ['repositories']
      }),
      'catalogs/repositories.yaml': 'repositories: malformed\n'
    }), async ({ architectureRoot }) => {
      const git = (...args: string[]): void => {
        execFileSync('git', ['-c', 'core.hooksPath=', '-c', 'commit.gpgsign=false', '-c', 'user.name=Diff Test', '-c', 'user.email=diff@example.invalid', '-C', architectureRoot, ...args], { stdio: 'pipe' });
      };
      git('init'); git('add', '--all'); git('commit', '-m', 'malformed fixture');
      for (const options of [[], ['--fail-on-new-error']]) {
        const result = await runCli(['diff', '--architecture', architectureRoot, '--base', 'HEAD', '--head', 'HEAD', '--json', ...options]);
        expect(result.exitCode).toBe(1);
        const report = JSON.parse(result.stdout) as { status: string; error: { details: { comparisonStatus: string; failedSides: string[] } } };
        expect(report.status).toBe('failed');
        expect(report.error.details.comparisonStatus).toBe('comparison_blocked');
        expect(report.error.details.failedSides).toEqual(['base', 'head']);
      }
    });
  });
});
