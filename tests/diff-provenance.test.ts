import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { assertManifestUnchanged, hashArchitectureInputs, loadDiffValidationContext } from '../src/diff-provenance.ts';
import { createMinimalArchitectureFiles, runCli, withArchitectureFiles } from './cli-test-helpers.ts';

describe('diff provenance', () => {
  test('hashes exact input bytes, separates policy/schema hashes and detects worktree drift', async () => {
    await withArchitectureFiles(createMinimalArchitectureFiles({}), async ({ architectureRoot }) => {
      const before = await hashArchitectureInputs(architectureRoot);
      expect(before.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(await hashArchitectureInputs(architectureRoot)).toEqual(before);
      await writeFile(join(architectureRoot, 'schemas', 'probe.json'), '{"type":"object"}\r\n');
      const after = await hashArchitectureInputs(architectureRoot);
      expect(after.sha256).not.toBe(before.sha256);
      expect(after.schemaSha256).not.toBe(before.schemaSha256);
      expect(after.policySha256).toBe(before.policySha256);
      expect(() => assertManifestUnchanged(before, after)).toThrow('worktree changed');
    });
  });
  test('uses the supplied observation time in operational evidence preflight', async () => {
    await withArchitectureFiles(createMinimalArchitectureFiles({
      'catalogs/operational-assets.yaml': 'policy:\n  review_interval_days: 30\nassets:\n  - id: example\n    kind: object-storage\n    status: active\n    lifecycle: { expires_at: null }\n    security: { public_access: false }\n    evidence: { last_verified_at: "2026-08-01" }\n'
    }), async ({ architectureRoot }) => {
      const fresh = await loadDiffValidationContext(architectureRoot, new Date('2026-08-02T00:00:00Z'));
      const stale = await loadDiffValidationContext(architectureRoot, new Date('2026-10-02T00:00:00Z'));
      expect(fresh.catalogSchemaPreflight.validation.diagnostics).toEqual([]);
      expect(stale.catalogSchemaPreflight.validation.diagnostics.some((diagnostic) => diagnostic.ruleId === 'ZDP-OPS-ASSET-002')).toBe(true);
    });
  });
  test('CLI records actual commit, worktree digest, UTC time and tool version', async () => {
    await withArchitectureFiles(createMinimalArchitectureFiles({}), async ({ architectureRoot }) => {
      const git = (...args: string[]): string => execFileSync('git', ['-c', 'core.hooksPath=', '-c', 'commit.gpgsign=false', '-c', 'user.name=Provenance Test', '-c', 'user.email=provenance@example.invalid', '-C', architectureRoot, ...args], { encoding: 'utf8', stdio: 'pipe' }).trim();
      git('init'); git('add', '--all'); git('commit', '-m', 'fixture');
      const commit = git('rev-parse', 'HEAD');
      const result = await runCli(['diff', '--architecture', architectureRoot, '--base', 'HEAD', '--head', 'worktree', '--json']);
      expect(result.exitCode).toBe(0);
      const report = JSON.parse(result.stdout) as { provenance: { observedAt: string; tool: { version: string }; base: { commit: string }; head: { kind: string; input: { sha256: string } } } };
      expect(report.provenance.base.commit).toBe(commit);
      expect(report.provenance.head.kind).toBe('worktree');
      expect(report.provenance.head.input.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(report.provenance.tool.version.length).toBeGreaterThan(0);
      expect(new Date(report.provenance.observedAt).toISOString()).toBe(report.provenance.observedAt);
    });
  });
});
