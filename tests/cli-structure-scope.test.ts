import { expect, test } from 'bun:test';
import { writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { createMinimalArchitectureFiles, runCli, withArchitectureFiles } from './cli-test-helpers.ts';

const staleAssets = JSON.stringify({ policy: { review_interval_days: 30 }, assets: [{
  id: 'stale-test', kind: 'other', status: 'provisioned', lifecycle: { expires_at: null },
  security: { public_access: false }, evidence: { last_verified_at: '2000-01-01' }
}] });

test('CLI rejects removing v2 declarations even when the head validates as legacy v1', async () => {
  const files = createMinimalArchitectureFiles({});
  for (const name of ['cost-budgets', 'slo-tiers']) {
    const path = `catalogs/${name}.yaml`;
    files[path] = `schema_version: "2"\n${files[path]}`;
  }
  await withArchitectureFiles(files, async ({ architectureRoot }) => {
    const git = (...args: string[]) => execFileSync('git', ['-c', 'core.hooksPath=', '-c', 'commit.gpgsign=false',
      '-c', 'user.name=Version Test', '-c', 'user.email=version@example.invalid', '-C', architectureRoot, ...args], { stdio: 'pipe' });
    git('init'); git('add', '--all'); git('commit', '-m', 'v2 fixture');
    for (const name of ['cost-budgets', 'slo-tiers']) await writeFile(join(architectureRoot, `catalogs/${name}.yaml`), files[`catalogs/${name}.yaml`].replace('schema_version: "2"', 'schema_version: "1"'));
    expect((await runCli(['validate', '--architecture', architectureRoot, '--scope', 'structure', '--json'])).exitCode).toBe(0);
    const result = await runCli(['diff', '--architecture', architectureRoot, '--scope', 'structure', '--base', 'HEAD', '--fail-on-new-error', '--json']);
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout).diagnostics.added.filter((d: { ruleId: string }) => d.ruleId === 'ZDP-OPERATING-VERSION-001')).toHaveLength(2);
  });
}, 30_000);

test('capabilities explicitly advertises the structural and operating-policy contracts', async () => {
  const result = await runCli(['capabilities', '--json']);
  expect(result.exitCode).toBe(0);
  expect(JSON.parse(result.stdout).features).toEqual(['structural-validation-v1', 'operating-policy-contract-v1']);
});

test('structure scope and registry generation separate stale evidence from schema failures', async () => {
  await withArchitectureFiles(createMinimalArchitectureFiles({
    'catalogs/operational-assets.yaml': staleAssets, 'generated/README.md': '# Derived\n'
  }), async ({ architectureRoot }) => {
    const structure = await runCli(['validate', '--architecture', architectureRoot, '--scope', 'structure', '--json']);
    const operations = await runCli(['validate', '--architecture', architectureRoot, '--json']);
    expect(structure.exitCode).toBe(0);
    expect(operations.exitCode).toBe(1);
    expect(JSON.parse(operations.stdout).diagnostics.some((d: { ruleId: string }) => d.ruleId === 'ZDP-OPS-ASSET-002')).toBe(true);
    expect((await runCli(['normalize', '--architecture', architectureRoot, '--scope', 'structure', '--out', 'generated/registry.json', '--json'])).exitCode).toBe(0);
    await writeFile(join(architectureRoot, 'schemas/operational-asset.schema.json'), JSON.stringify({ type: 'object', required: ['missing_required_field'] }));
    expect((await runCli(['validate', '--architecture', architectureRoot, '--scope', 'structure', '--json'])).exitCode).toBe(1);
  });
});

test('structure diff still blocks unproven protected state entry with stale unrelated assets', async () => {
  await withArchitectureFiles(createMinimalArchitectureFiles({
    'catalogs/operational-assets.yaml': staleAssets,
    'catalogs/services.yaml': 'services: [{id: public-web, repo: zdp-web-public, status: experiment}]\n',
    'rules/tier.rules.yaml': JSON.stringify({ rules: [], state_transition_evidence: {
      schema_version: '1', evidence_max_age_days: 30,
      required_evidence_fields: ['evidence_refs', 'runbook_ref', 'rollback_ref', 'observability_ref', 'monthly_budget_limit_usd'],
      service_statuses_requiring_evidence: ['active', 'scaling'], operational_asset_statuses_requiring_evidence: ['active']
    } })
  }), async ({ architectureRoot }) => {
    const git = (...args: string[]) => execFileSync('git', ['-c', 'core.hooksPath=', '-c', 'commit.gpgsign=false',
      '-c', 'user.name=Scope Test', '-c', 'user.email=scope@example.invalid', '-C', architectureRoot, ...args], { stdio: 'pipe' });
    git('init'); git('add', '--all'); git('commit', '-m', 'scope fixture');
    await writeFile(join(architectureRoot, 'catalogs/services.yaml'), 'services: [{id: public-web, repo: zdp-web-public, status: active}]\n');
    const result = await runCli(['diff', '--architecture', architectureRoot, '--scope', 'structure', '--base', 'HEAD', '--head', 'worktree', '--fail-on-new-error', '--json']);
    expect(result.exitCode).toBe(1);
    const report = JSON.parse(result.stdout);
    expect(report.eventSchemaCompatibility.status).toBe('checked');
    expect(report.diagnostics.added.some((d: { ruleId: string }) => d.ruleId === 'ZDP-STATE-TRANSITION-001')).toBe(true);
  });
}, 30_000);
