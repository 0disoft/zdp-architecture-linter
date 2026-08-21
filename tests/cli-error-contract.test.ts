import { describe, expect, test } from 'bun:test';
import type { CliErrorReport } from '../src/cli-error-report.ts';
import {
  createMinimalArchitectureFiles,
  runCli,
  withArchitectureFiles
} from './cli-test-helpers.ts';

describe('CLI failure contract', () => {
  test('returns machine-readable JSON and exit one for invalid arguments', async () => {
    const result = await runCli([
      'validate',
      '--architecture',
      '.',
      '--unknown-option',
      '--json'
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe('');

    const report = JSON.parse(result.stdout) as CliErrorReport;

    expect(report).toMatchObject({
      schemaVersion: 'zdp.architecture.cli-error.v1',
      status: 'failed',
      error: {
        code: 'invalid_arguments',
        message: 'Invalid command or arguments.'
      }
    });
    const usage = report.error.details.usage;
    expect(Array.isArray(usage) ? usage : []).toContain(
      'zdp-arch validate --architecture <path> [--repository <path>] [--json]'
    );
  });

  test('returns a typed JSON failure when a generated task pack is stale', async () => {
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
`,
        'catalogs/services.yaml': `
services:
  - id: products-lab-api
    repo: zdp-products-lab
`,
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
          '--check',
          '--json'
        ]);

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toBe('');
        expect(JSON.parse(result.stdout)).toEqual({
          schemaVersion: 'zdp.architecture.cli-error.v1',
          status: 'failed',
          error: {
            code: 'generated_output_stale',
            message: 'Generated pack is stale.',
            details: {
              path: 'generated/llm/task-pack.md',
              remediation:
                'zdp-arch pack --architecture <path> --repo zdp-products-lab --task "Create product spec" --out generated/llm/task-pack.md'
            }
          }
        });
      }
    );
  });

  test('returns a typed JSON failure when normalize refuses invalid input', async () => {
    await withArchitectureFiles(
      createMinimalArchitectureFiles({
        'catalogs/services.yaml': `
services:
  - id: orphan-api
    repo: zdp-missing-repository
`,
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

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toBe('');

        const report = JSON.parse(result.stdout) as CliErrorReport;

        expect(report).toMatchObject({
          schemaVersion: 'zdp.architecture.cli-error.v1',
          status: 'failed',
          error: {
            code: 'validation_failed',
            message:
              'Refusing to write generated registry because validation has errors.',
            details: {
              operation: 'write'
            }
          }
        });
        const errorCount = report.error.details.errorCount;
        expect(
          typeof errorCount === 'number' ? errorCount : 0
        ).toBeGreaterThan(0);
      }
    );
  });
});

