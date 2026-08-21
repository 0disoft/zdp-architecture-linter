import { describe, expect, test } from 'bun:test';
import {
  createMinimalArchitectureFiles,
  runCli,
  withArchitectureFiles
} from './cli-test-helpers.ts';

describe('selective validate CLI', () => {
  test('runs only the selected rule and severity', async () => {
    await withArchitectureFiles(
      createArchitectureWithRepositoryWarningAndApiErrors(),
      async ({ architectureRoot }) => {
        const result = await runCli([
          'validate',
          '--architecture',
          architectureRoot,
          '--rule',
          'catalog.repositories',
          '--severity',
          'warning',
          '--json'
        ]);

        expect(result.exitCode).toBe(0);
        expect(result.stderr).toBe('');

        const report = JSON.parse(result.stdout) as ValidateCliReport;
        expect(report.diagnostics).toEqual([
          expect.objectContaining({
            ruleId: 'ZDP-REPO-WARN-001',
            severity: 'warning'
          })
        ]);
      }
    );
  });

  test('selects a complete rule group', async () => {
    await withArchitectureFiles(
      createArchitectureWithRepositoryWarningAndApiErrors(),
      async ({ architectureRoot }) => {
        const result = await runCli([
          'validate',
          '--architecture',
          architectureRoot,
          '--group',
          'service',
          '--severity',
          'error',
          '--json'
        ]);

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toBe('');

        const report = JSON.parse(result.stdout) as ValidateCliReport;
        expect(report.diagnostics).toHaveLength(4);
        expect(
          report.diagnostics.every(
            (diagnostic) => diagnostic.ruleId === 'ZDP-API-001'
          )
        ).toBe(true);
      }
    );
  });

  test('does not parse service.yaml for repository-root-only rules', async () => {
    await withArchitectureFiles(
      createMinimalArchitectureFiles({
        'repo/service.yaml': 'service: [invalid\n'
      }),
      async ({ architectureRoot, repositoryRoot }) => {
        const result = await runCli([
          'validate',
          '--architecture',
          architectureRoot,
          '--repository',
          repositoryRoot,
          '--rule',
          'repository.baseline',
          '--json'
        ]);

        expect(result.stderr).toBe('');
        expect(() => JSON.parse(result.stdout)).not.toThrow();
      }
    );
  });

  test('rejects unknown selectors before validation runs', async () => {
    const result = await runCli([
      'validate',
      '--architecture',
      '.',
      '--rule',
      'catalog.unknown'
    ]);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('[--rule <id>]...');
  });
});

function createArchitectureWithRepositoryWarningAndApiErrors(): Record<
  string,
  string
> {
  return createMinimalArchitectureFiles({
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
`
  });
}

interface ValidateCliDiagnostic {
  readonly ruleId: string;
  readonly severity: 'error' | 'warning';
}

interface ValidateCliReport {
  readonly diagnostics: readonly ValidateCliDiagnostic[];
}
