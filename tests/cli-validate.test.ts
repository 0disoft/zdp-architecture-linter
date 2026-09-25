import { describe, expect, test } from 'bun:test';
import {
  createMinimalArchitectureFiles,
  runCli,
  withArchitectureFiles
} from './cli-test-helpers.ts';

describe('validate CLI', () => {
  test('rejects unknown options before validation runs', async () => {
    const result = await runCli([
      'validate',
      '--architecture',
      '.',
      '--unknown-option'
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain(
      'zdp-arch validate --architecture <path> [--repository <path>] [--scope <global|repository>] [--rule <id>]... [--group <group>]... [--severity <error|warning>]... [--json]'
    );
  });

  test('requires a repository and a supported scope value for scoped validation', async () => {
    for (const args of [
      ['validate', '--architecture', '.', '--scope', 'repository'],
      ['validate', '--architecture', '.', '--scope', 'other', '--repository', '.'],
      ['compliance', '--architecture', '.', '--repository', '.', '--scope', 'repository']
    ]) {
      const result = await runCli(args);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('Usage:');
    }
  });

  test('keeps global asset drift blocking while scoped repository validation proceeds', async () => {
    await withArchitectureFiles(
      createMinimalArchitectureFiles({
        'catalogs/repositories.yaml': `
repositories:
  - name: zdp-test-platform
    status: active
    repo_stage: deploy_unit
    kind: deploy_unit
    area: platform
    purpose: Test platform repository.
    owner: 0disoft
    risk_level: low
    agent_review:
      status: included
      playbook_repo: zdp-agent-review-playbooks
      group_id: group-01
      cadence: nightly
      run_scope: six-lens-raw-and-reducer
      output_policy: local_ignored
`,
        'catalogs/services.yaml': 'services:\n  - id: test-platform\n    repo: zdp-test-platform\n',
        'catalogs/operational-assets.yaml': `
schema_version: 1
policy:
  review_interval_days: 30
assets:
  - id: domain-example-com
    kind: domain
    status: active
    lifecycle:
      expires_at: 2021-01-01T00:00:00Z
    security:
      public_access: true
    evidence:
      last_verified_at: 2020-01-01
`,
        'repo/.editorconfig': [
          'root = true',
          '[*]',
          'charset = utf-8',
          'end_of_line = lf',
          'insert_final_newline = true',
          'indent_style = space',
          'indent_size = 2',
          'trim_trailing_whitespace = true',
          ''
        ].join('\n'),
        'repo/.gitattributes': '* text=auto eol=lf\n',
        'repo/AGENTS.md': '# Agents\n',
        'repo/README.md': '# Repository\n',
        'repo/service.yaml': 'service:\n  id: test-platform\n  repo: zdp-test-platform\n'
      }),
      async ({ architectureRoot, repositoryRoot }) => {
        const baseArgs = [
          'validate', '--architecture', architectureRoot,
          '--repository', repositoryRoot, '--json'
        ];
        const globalResult = await runCli(baseArgs);
        expect(globalResult.exitCode).toBe(1);
        expect((JSON.parse(globalResult.stdout) as ValidateCliReport).diagnostics).toEqual([
          expect.objectContaining({ ruleId: 'ZDP-OPS-ASSET-002', path: 'assets.0.evidence.last_verified_at' }),
          expect.objectContaining({ ruleId: 'ZDP-OPS-ASSET-002', path: 'assets.0.lifecycle.expires_at' })
        ]);

        const scopedResult = await runCli([...baseArgs, '--scope', 'repository']);
        expect(scopedResult.exitCode).toBe(0);
        expect(scopedResult.stderr).toBe('');
        const scopedDiagnostics = (JSON.parse(scopedResult.stdout) as ValidateCliReport)
          .diagnostics as readonly { ruleId: string; severity: string }[];
        expect(scopedDiagnostics.filter(({ severity }) => severity === 'error')).toEqual([]);
        expect(scopedDiagnostics.some(({ ruleId }) => ruleId === 'ZDP-OPS-ASSET-002')).toBe(false);
      }
    );
  });

  test('returns success when validation only produces warnings', async () => {
    await withArchitectureFiles(
      createMinimalArchitectureFiles({
        'catalogs/repositories.yaml': `
repositories:
  - name: zdp-mobile-flutter
    status: reserved
    repo_stage: conditional_deploy_unit
    kind: deploy_unit
    area: mobile
    purpose: Mobile app shell.
    owner: 0disoft
    risk_level: medium
    agent_review:
      status: candidate
      cadence: none
      run_scope: none
      output_policy: none
      reason: Conditional repository is not reviewed until promotion.
`
      }),
      async ({ architectureRoot }) => {
        const result = await runCli([
          'validate',
          '--architecture',
          architectureRoot,
          '--json'
        ]);

        expect(result.exitCode).toBe(0);
        expect(result.stderr).toBe('');

        const report = JSON.parse(result.stdout) as ValidateCliReport;

        expect(report.diagnostics).toEqual([
          {
            ruleId: 'ZDP-REPO-WARN-001',
            severity: 'warning',
            file: 'catalogs/repositories.yaml',
            path: 'repositories[0:zdp-mobile-flutter].create_when',
            message:
              'Repository with repo_stage `conditional_deploy_unit` should declare `create_when` evidence.'
          }
        ]);
      }
    );
  });

  test('warns when a reserved deploy unit has no roadmap evidence', async () => {
    await withArchitectureFiles(
      createMinimalArchitectureFiles({
        'catalogs/repositories.yaml': `
repositories:
  - name: zdp-admin-console
    status: reserved
    repo_stage: deploy_unit
    kind: deploy_unit
    area: admin
    purpose: Admin console.
    owner: 0disoft
    risk_level: high
    agent_review:
      status: candidate
      cadence: none
      run_scope: none
      output_policy: none
      reason: Conditional repository is not reviewed until promotion.
`
      }),
      async ({ architectureRoot }) => {
        const result = await runCli([
          'validate',
          '--architecture',
          architectureRoot,
          '--json'
        ]);

        expect(result.exitCode).toBe(0);
        expect(result.stderr).toBe('');

        const report = JSON.parse(result.stdout) as ValidateCliReport;

        expect(report.diagnostics).toEqual([
          {
            ruleId: 'ZDP-REPO-WARN-002',
            severity: 'warning',
            file: 'catalogs/repositories.yaml',
            path: 'repositories[0:zdp-admin-console].name',
            message:
              'Reserved deploy unit `zdp-admin-console` should appear in ROADMAP.md or docs/26-eighteen-month-roadmap.md.'
          }
        ]);
      }
    );
  });

  test('loads public API policy from rules/api.rules.yaml', async () => {
    await withArchitectureFiles(
      createMinimalArchitectureFiles({
        'catalogs/repositories.yaml': `
repositories:
  - name: zdp-core-platform
    status: active
    repo_stage: deploy_unit
    kind: deploy_unit
    area: core
    purpose: Core platform.
    owner: 0disoft
    risk_level: high
    agent_review:
      status: included
      playbook_repo: zdp-agent-review-playbooks
      group_id: group-01
      cadence: nightly
      run_scope: six-lens-raw-and-reducer
      output_policy: local_ignored
`,
        'catalogs/services.yaml': `
services:
  - id: core-public-api
    repo: zdp-core-platform
    domain:
      public_api: true
    api:
      openapi_required: false
`,
        'rules/api.rules.yaml': `
rules:
  - id: ZDP-API-001
    condition:
      expression: domain.public_api == true or api.exposure in [partner, public]
    assertions:
      require_values:
        api.openapi_required: true
      require_fields:
        - api.versioning
        - api.rate_limit_policy
        - api.deprecation_policy
`,
        'rules/tier.rules.yaml': 'rules: []\n'
      }),
      async ({ architectureRoot }) => {
        const result = await runCli([
          'validate',
          '--architecture',
          architectureRoot,
          '--json'
        ]);

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toBe('');

        const report = JSON.parse(result.stdout) as ValidateCliReport;
        expect(report.diagnostics).toEqual([
          expect.objectContaining({
            ruleId: 'ZDP-API-001',
            path: 'services[0:core-public-api].api.versioning'
          }),
          expect.objectContaining({
            ruleId: 'ZDP-API-001',
            path: 'services[0:core-public-api].api.rate_limit_policy'
          }),
          expect.objectContaining({
            ruleId: 'ZDP-API-001',
            path: 'services[0:core-public-api].api.deprecation_policy'
          }),
          expect.objectContaining({
            ruleId: 'ZDP-API-001',
            path: 'services[0:core-public-api].api.openapi_required'
          })
        ]);
      }
    );
  });

  test('falls back to tier rules for public API policy when api rules file is absent', async () => {
    const files = createMinimalArchitectureFiles({
      'catalogs/repositories.yaml': `
repositories:
  - name: zdp-core-platform
    status: active
    repo_stage: deploy_unit
    kind: deploy_unit
    area: core
    purpose: Core platform.
    owner: 0disoft
    risk_level: high
    agent_review:
      status: included
      playbook_repo: zdp-agent-review-playbooks
      group_id: group-01
      cadence: nightly
      run_scope: six-lens-raw-and-reducer
      output_policy: local_ignored
`,
      'catalogs/services.yaml': `
services:
  - id: core-public-api
    repo: zdp-core-platform
    domain:
      public_api: true
    api:
      openapi_required: false
`,
      'rules/tier.rules.yaml': `
rules:
  - id: ZDP-API-001
    condition:
      expression: domain.public_api == true or api.exposure in [partner, public]
    assertions:
      require_values:
        api.openapi_required: true
      require_fields:
        - api.versioning
`
    });
    delete files['rules/api.rules.yaml'];

    await withArchitectureFiles(files, async ({ architectureRoot }) => {
      const result = await runCli([
        'validate',
        '--architecture',
        architectureRoot,
        '--json'
      ]);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe('');

      const report = JSON.parse(result.stdout) as ValidateCliReport;
      expect(report.diagnostics).toEqual([
        expect.objectContaining({
          ruleId: 'ZDP-API-001',
          path: 'services[0:core-public-api].api.versioning'
        }),
        expect.objectContaining({
          ruleId: 'ZDP-API-001',
          path: 'services[0:core-public-api].api.openapi_required'
        })
      ]);
    });
  });
});

interface ValidateCliReport {
  readonly diagnostics: readonly unknown[];
}
