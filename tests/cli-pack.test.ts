import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
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

  test('writes a task pack under generated when --out is provided', async () => {
    await withArchitectureFiles(
      createMinimalArchitectureFiles({
        ...createPackCatalogFiles(),
        'generated/README.md': '# Generated Outputs\n'
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
          '--out',
          'generated/llm/task-pack.md',
          '--json'
        ]);

        expect(result.exitCode).toBe(0);
        expect(result.stderr).toBe('');

        const writeReport = JSON.parse(result.stdout) as PackWriteCliReport;
        const taskPack = await readFile(
          join(architectureRoot, 'generated/llm/task-pack.md'),
          'utf8'
        );

        expect(writeReport.status).toBe('written');
        expect(writeReport.path).toBe(
          join(architectureRoot, 'generated/llm/task-pack.md')
        );
        expect(writeReport.bytes).toBeGreaterThan(0);
        expect(taskPack).toContain('# zdp-products-lab 작업 팩');
        expect(taskPack).toContain('작업: Create product spec');
      }
    );
  });

  test('checks that generated task pack is up to date', async () => {
    await withArchitectureFiles(
      createMinimalArchitectureFiles({
        ...createPackCatalogFiles(),
        'generated/README.md': '# Generated Outputs\n'
      }),
      async ({ architectureRoot }) => {
        const writeResult = await runCli([
          'pack',
          '--architecture',
          architectureRoot,
          '--repo',
          'zdp-products-lab',
          '--task',
          'Create product spec',
          '--out',
          'generated/llm/task-pack.md',
          '--json'
        ]);
        const checkResult = await runCli([
          'pack',
          '--architecture',
          architectureRoot,
          '--repo',
          'zdp-products-lab',
          '--task',
          'Create product spec',
          '--out',
          'generated/llm/task-pack.md',
          '--check',
          '--json'
        ]);

        expect(writeResult.exitCode).toBe(0);
        expect(checkResult.exitCode).toBe(0);
        expect(checkResult.stderr).toBe('');

        const report = JSON.parse(checkResult.stdout) as PackCheckCliReport;

        expect(report.status).toBe('up-to-date');
        expect(report.path).toBe(
          join(architectureRoot, 'generated/llm/task-pack.md')
        );
        expect(report.bytes).toBeGreaterThan(0);
      }
    );
  });

  test('fails check when generated task pack is stale', async () => {
    await withArchitectureFiles(
      createMinimalArchitectureFiles({
        ...createPackCatalogFiles(),
        'generated/README.md': '# Generated Outputs\n',
        'generated/llm/task-pack.md': '# stale\n'
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
          '--out',
          'generated/llm/task-pack.md',
          '--check'
        ]);

        expect(result.exitCode).toBe(1);
        expect(result.stdout).toBe('');
        expect(result.stderr).toContain('Generated pack is stale:');
        expect(result.stderr).toContain(
          'Run `zdp-arch pack --architecture <path> --repo zdp-products-lab --task "Create product spec" --out generated/llm/task-pack.md` to regenerate it.'
        );
      }
    );
  });

  test('fails check when generated task pack is missing', async () => {
    await withArchitectureFiles(
      createMinimalArchitectureFiles({
        ...createPackCatalogFiles(),
        'generated/README.md': '# Generated Outputs\n'
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
          '--out',
          'generated/llm/task-pack.md',
          '--check'
        ]);

        expect(result.exitCode).toBe(1);
        expect(result.stdout).toBe('');
        expect(result.stderr).toContain('Generated output file does not exist:');
      }
    );
  });

  test('refuses to write task pack outside the generated directory', async () => {
    await withArchitectureFiles(
      createMinimalArchitectureFiles({
        ...createPackCatalogFiles(),
        'generated/README.md': '# Generated Outputs\n'
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
          '--out',
          'task-pack.md'
        ]);

        expect(result.exitCode).toBe(1);
        expect(result.stdout).toBe('');
        expect(result.stderr).toContain(
          'Generated output path must stay under `generated/`.'
        );
      }
    );
  });

  test('requires the generated boundary file before writing task pack', async () => {
    await withArchitectureFiles(
      createMinimalArchitectureFiles(createPackCatalogFiles()),
      async ({ architectureRoot }) => {
        const result = await runCli([
          'pack',
          '--architecture',
          architectureRoot,
          '--repo',
          'zdp-products-lab',
          '--task',
          'Create product spec',
          '--out',
          'generated/llm/task-pack.md'
        ]);

        expect(result.exitCode).toBe(1);
        expect(result.stdout).toBe('');
        expect(result.stderr).toContain(
          'Generated output requires `generated/README.md` boundary file.'
        );
      }
    );
  });

  test('prints usage when repo or task is missing', async () => {
    const result = await runCli(['pack', '--architecture', '.']);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain(
      'zdp-arch pack --architecture <path> --repo <repo> --task <task> [--out generated/llm/task-pack.md [--check]] [--json]'
    );
  });

  test('prints usage when check is provided without out', async () => {
    await withArchitectureFiles(
      createMinimalArchitectureFiles(createPackCatalogFiles()),
      async ({ architectureRoot }) => {
        const result = await runCli([
          'pack',
          '--architecture',
          architectureRoot,
          '--repo',
          'zdp-products-lab',
          '--task',
          'Create product spec',
          '--check'
        ]);

        expect(result.exitCode).toBe(1);
        expect(result.stdout).toBe('');
        expect(result.stderr).toContain(
          'zdp-arch pack --architecture <path> --repo <repo> --task <task> [--out generated/llm/task-pack.md [--check]] [--json]'
        );
      }
    );
  });
});

function createPackCatalogFiles(): Record<string, string> {
  return {
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
  };
}

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

interface PackWriteCliReport {
  readonly status: 'written';
  readonly path: string;
  readonly bytes: number;
}

interface PackCheckCliReport {
  readonly status: 'up-to-date';
  readonly path: string;
  readonly bytes: number;
}
