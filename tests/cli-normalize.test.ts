import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import {
  createMinimalArchitectureFiles,
  runCli,
  withArchitectureFiles
} from './cli-test-helpers.ts';

describe('normalize CLI', () => {
  test('prints a normalized JSON registry', async () => {
    await withArchitectureFiles(
      createMinimalArchitectureFiles(createNormalizeCatalogFiles()),
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

  test('writes a normalized registry under generated when --out is provided', async () => {
    await withArchitectureFiles(
      createMinimalArchitectureFiles({
        ...createNormalizeCatalogFiles(),
        'generated/README.md': '# Generated Outputs\n'
      }),
      async ({ architectureRoot }) => {
        const result = await runCli([
          'normalize',
          '--architecture',
          architectureRoot,
          '--out',
          'generated/registry.json',
          '--json'
        ]);

        expect(result.exitCode).toBe(0);
        expect(result.stderr).toBe('');

        const writeReport = JSON.parse(result.stdout) as NormalizeWriteCliReport;
        const registry = JSON.parse(
          await readFile(join(architectureRoot, 'generated/registry.json'), 'utf8')
        ) as NormalizeCliReport;

        expect(writeReport.status).toBe('written');
        expect(writeReport.path).toBe(join(architectureRoot, 'generated/registry.json'));
        expect(writeReport.bytes).toBeGreaterThan(0);
        expect(registry.schemaVersion).toBe(1);
        expect(registry.summary.repositories).toBe(1);
        expect(registry.validation.errors).toBe(0);
      }
    );
  });

  test('checks that generated registry is up to date', async () => {
    await withArchitectureFiles(
      createMinimalArchitectureFiles({
        ...createNormalizeCatalogFiles(),
        'generated/README.md': '# Generated Outputs\n'
      }),
      async ({ architectureRoot }) => {
        const writeResult = await runCli([
          'normalize',
          '--architecture',
          architectureRoot,
          '--out',
          'generated/registry.json',
          '--json'
        ]);
        const checkResult = await runCli([
          'normalize',
          '--architecture',
          architectureRoot,
          '--out',
          'generated/registry.json',
          '--check',
          '--json'
        ]);

        expect(writeResult.exitCode).toBe(0);
        expect(checkResult.exitCode).toBe(0);
        expect(checkResult.stderr).toBe('');

        const report = JSON.parse(checkResult.stdout) as NormalizeCheckCliReport;

        expect(report.status).toBe('up-to-date');
        expect(report.path).toBe(join(architectureRoot, 'generated/registry.json'));
        expect(report.bytes).toBeGreaterThan(0);
      }
    );
  });

  test('fails check when generated registry is stale', async () => {
    await withArchitectureFiles(
      createMinimalArchitectureFiles({
        ...createNormalizeCatalogFiles(),
        'generated/README.md': '# Generated Outputs\n',
        'generated/registry.json': '{}\n'
      }),
      async ({ architectureRoot }) => {
        const result = await runCli([
          'normalize',
          '--architecture',
          architectureRoot,
          '--out',
          'generated/registry.json',
          '--check'
        ]);

        expect(result.exitCode).toBe(1);
        expect(result.stdout).toBe('');
        expect(result.stderr).toContain('Generated registry is stale:');
        expect(result.stderr).toContain(
          'Run `zdp-arch normalize --architecture <path> --out generated/registry.json` to regenerate it.'
        );
      }
    );
  });

  test('fails check when generated registry is missing', async () => {
    await withArchitectureFiles(
      createMinimalArchitectureFiles({
        ...createNormalizeCatalogFiles(),
        'generated/README.md': '# Generated Outputs\n'
      }),
      async ({ architectureRoot }) => {
        const result = await runCli([
          'normalize',
          '--architecture',
          architectureRoot,
          '--out',
          'generated/registry.json',
          '--check'
        ]);

        expect(result.exitCode).toBe(1);
        expect(result.stdout).toBe('');
        expect(result.stderr).toContain('Generated output file does not exist:');
      }
    );
  });

  test('refuses to write outside the generated directory', async () => {
    await withArchitectureFiles(
      createMinimalArchitectureFiles({
        ...createNormalizeCatalogFiles(),
        'generated/README.md': '# Generated Outputs\n'
      }),
      async ({ architectureRoot }) => {
        const result = await runCli([
          'normalize',
          '--architecture',
          architectureRoot,
          '--out',
          'registry.json'
        ]);

        expect(result.exitCode).toBe(1);
        expect(result.stdout).toBe('');
        expect(result.stderr).toContain(
          'Generated output path must stay under `generated/`.'
        );
      }
    );
  });

  test('requires the generated boundary file before writing', async () => {
    await withArchitectureFiles(
      createMinimalArchitectureFiles(createNormalizeCatalogFiles()),
      async ({ architectureRoot }) => {
        const result = await runCli([
          'normalize',
          '--architecture',
          architectureRoot,
          '--out',
          'generated/registry.json'
        ]);

        expect(result.exitCode).toBe(1);
        expect(result.stdout).toBe('');
        expect(result.stderr).toContain(
          'Generated output requires `generated/README.md` boundary file.'
        );
      }
    );
  });

  test('prints usage when architecture is missing', async () => {
    const result = await runCli(['normalize']);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain(
      'zdp-arch normalize --architecture <path> [--repository <path>] [--out generated/registry.json [--check]] [--json]'
    );
  });

  test('prints usage when check is provided without out', async () => {
    await withArchitectureFiles(
      createMinimalArchitectureFiles(createNormalizeCatalogFiles()),
      async ({ architectureRoot }) => {
        const result = await runCli([
          'normalize',
          '--architecture',
          architectureRoot,
          '--check'
        ]);

        expect(result.exitCode).toBe(2);
        expect(result.stdout).toBe('');
        expect(result.stderr).toContain(
          'zdp-arch normalize --architecture <path> [--repository <path>] [--out generated/registry.json [--check]] [--json]'
        );
      }
    );
  });
});

function createNormalizeCatalogFiles(): Record<string, string> {
  return {
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
  };
}

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

interface NormalizeWriteCliReport {
  readonly status: 'written';
  readonly path: string;
  readonly bytes: number;
}

interface NormalizeCheckCliReport {
  readonly status: 'up-to-date';
  readonly path: string;
  readonly bytes: number;
}
