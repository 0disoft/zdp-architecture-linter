import { describe, expect, test } from 'bun:test';
import {
  createMinimalArchitectureFiles,
  runCli,
  withArchitectureFiles
} from './cli-test-helpers.ts';

describe('pack CLI', () => {
  test('returns a JSON task pack for a repository', async () => {
    await withArchitectureFiles(
      createMinimalArchitectureFiles({
        'catalogs/repositories.yaml': `
repositories:
  - name: zdp-products-lab
    status: reserved
    repo_stage: deploy_unit
    kind: deploy_unit
    area: labs
    purpose: Product experiment lab.
    owner: 0disoft
    risk_level: medium
    owns_data:
      - product-specs
`,
        'catalogs/services.yaml': `
services:
  - id: products-lab-api
    repo: zdp-products-lab
    tier: tier3
    runtime: bun
    direct_datastore_access:
      - products_postgres
`
      }),
      async ({ architectureRoot }) => {
        const result = await runCli([
          'pack',
          '--architecture',
          architectureRoot,
          '--repo',
          'zdp-products-lab',
          '--task',
          'Create product spec',
          '--json'
        ]);

        expect(result.exitCode).toBe(0);
        expect(result.stderr).toBe('');

        const report = JSON.parse(result.stdout) as PackCliReport;

        expect(report.repo.name).toBe('zdp-products-lab');
        expect(report.task).toBe('Create product spec');
        expect(report.services.map((service) => service.id)).toEqual([
          'products-lab-api'
        ]);
        expect(report.data.directDatastores).toEqual(['products_postgres']);
      }
    );
  });

  test('prints usage when repo or task is missing', async () => {
    const result = await runCli(['pack', '--architecture', '.']);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain(
      'zdp-arch pack --architecture <path> --repo <repo> --task <task> [--json]'
    );
  });
});

interface PackCliReport {
  readonly repo: {
    readonly name: string;
  };
  readonly task: string;
  readonly services: ReadonlyArray<{
    readonly id: string;
  }>;
  readonly data: {
    readonly directDatastores: readonly string[];
  };
}
