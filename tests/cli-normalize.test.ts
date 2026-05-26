import { describe, expect, test } from 'bun:test';
import {
  createMinimalArchitectureFiles,
  runCli,
  withArchitectureFiles
} from './cli-test-helpers.ts';

describe('normalize CLI', () => {
  test('prints a normalized JSON registry', async () => {
    await withArchitectureFiles(
      createMinimalArchitectureFiles({
        'ROADMAP.md': '# Roadmap\n\nzdp-core-platform\n',
        'catalogs/repositories.yaml': `
repositories:
  - name: zdp-core-platform
    status: reserved
    repo_stage: deploy_unit
    kind: deploy_unit
    area: core
    purpose: Core platform.
    owner: 0disoft
    risk_level: high
`,
        'catalogs/services.yaml': `
services:
  - id: core-api
    repo: zdp-core-platform
    tier: tier1
    runtime: axum
    direct_datastore_access:
      - core_postgres
`,
        'catalogs/datastores.yaml': `
datastores:
  - id: core_postgres
    kind: postgresql
    owner_repo: zdp-core-platform
    hosted_on: hetzner
    data_classes: []
`
      }),
      async ({ architectureRoot }) => {
        const result = await runCli([
          'normalize',
          '--architecture',
          architectureRoot,
          '--json'
        ]);

        expect(result.exitCode).toBe(0);
        expect(result.stderr).toBe('');

        const report = JSON.parse(result.stdout) as NormalizeCliReport;

        expect(report.schemaVersion).toBe(1);
        expect(report.summary.repositories).toBe(1);
        expect(report.repositories.map((repository) => repository.id)).toEqual([
          'zdp-core-platform'
        ]);
        expect(report.services.map((service) => service.id)).toEqual(['core-api']);
        expect(report.datastores.map((datastore) => datastore.id)).toEqual([
          'core_postgres'
        ]);
        expect(report.edges.map((edge) => edge.type)).toContain(
          'service-accesses-datastore'
        );
        expect(report.validation).toEqual({
          diagnostics: 0,
          errors: 0,
          warnings: 0
        });
      }
    );
  });

  test('prints usage when architecture is missing', async () => {
    const result = await runCli(['normalize']);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain(
      'zdp-arch normalize --architecture <path> [--repository <path>] [--json]'
    );
  });
});

interface NormalizeCliReport {
  readonly schemaVersion: number;
  readonly summary: {
    readonly repositories: number;
  };
  readonly repositories: ReadonlyArray<{
    readonly id: string;
  }>;
  readonly services: ReadonlyArray<{
    readonly id: string;
  }>;
  readonly datastores: ReadonlyArray<{
    readonly id: string;
  }>;
  readonly edges: ReadonlyArray<{
    readonly type: string;
  }>;
  readonly validation: {
    readonly diagnostics: number;
    readonly errors: number;
    readonly warnings: number;
  };
}
