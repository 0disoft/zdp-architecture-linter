import { describe, expect, test } from 'bun:test';
import {
  createMinimalArchitectureFiles,
  runCli,
  withArchitectureFiles
} from './cli-test-helpers.ts';

describe('list CLI', () => {
  test('prints filtered repository JSON', async () => {
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
  - name: zdp-ai-memory
    status: reserved
    repo_stage: logical_only
    kind: logical_boundary
    area: ai
    purpose: AI memory boundary.
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
          'list',
          'repos',
          '--architecture',
          architectureRoot,
          '--stage',
          'deploy_unit',
          '--json'
        ]);

        expect(result.exitCode).toBe(0);
        expect(result.stderr).toBe('');

        const report = JSON.parse(result.stdout) as ListRepositoriesCliReport;

        expect(report.kind).toBe('repos');
        expect(report.count).toBe(1);
        expect(report.items).toEqual([
          {
            name: 'zdp-core-platform',
            area: 'core',
            kind: 'deploy_unit',
            repoStage: 'deploy_unit',
            owner: '0disoft',
            riskLevel: 'high'
          }
        ]);
      }
    );
  });

  test('prints filtered services text', async () => {
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
  - id: public-site
    repo: zdp-web-public
    tier: tier3
    runtime: astro
    direct_datastore_access: []
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
          'list',
          'services',
          '--architecture',
          architectureRoot,
          '--repo',
          'zdp-core-platform'
        ]);

        expect(result.exitCode).toBe(0);
        expect(result.stderr).toBe('');
        expect(result.stdout).toBe(
          [
            'zdp-arch: services',
            'filters: repo=zdp-core-platform',
            'count: 1',
            '- core-api repo=zdp-core-platform tier=tier1 runtime=axum directDatastoreAccess=core_postgres'
          ].join('\n') + '\n'
        );
      }
    );
  });

  test('prints usage when list kind is missing', async () => {
    const result = await runCli(['list']);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain(
      'zdp-arch list repos --architecture <path> [--stage <repo_stage>] [--area <area>] [--json]'
    );
  });
});

interface ListRepositoriesCliReport {
  readonly kind: 'repos';
  readonly count: number;
  readonly items: ReadonlyArray<{
    readonly name: string;
    readonly area: string;
    readonly kind: string;
    readonly repoStage: string;
    readonly owner: string;
    readonly riskLevel: string;
  }>;
}
