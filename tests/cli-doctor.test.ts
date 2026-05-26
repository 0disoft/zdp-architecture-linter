import { describe, expect, test } from 'bun:test';
import {
  createMinimalArchitectureFiles,
  runCli,
  withArchitectureFiles
} from './cli-test-helpers.ts';

describe('doctor CLI', () => {
  test('prints a JSON health report', async () => {
    await withArchitectureFiles(
      createMinimalArchitectureFiles({}),
      async ({ architectureRoot }) => {
        const result = await runCli([
          'doctor',
          '--architecture',
          architectureRoot,
          '--json'
        ]);

        expect(result.exitCode).toBe(0);
        expect(result.stderr).toBe('');

        const report = JSON.parse(result.stdout) as DoctorCliReport;

        expect(report.validation).toEqual({
          diagnostics: 0,
          errors: 0,
          warnings: 0
        });
        expect(report.checks.map((check) => check.id)).toContain(
          'architecture.required_files'
        );
        expect(report.checks.map((check) => check.id)).toContain(
          'architecture.validate'
        );
      }
    );
  });

  test('returns an error when a requested repository is missing service.yaml', async () => {
    await withArchitectureFiles(
      createMinimalArchitectureFiles({}),
      async ({ architectureRoot, repositoryRoot }) => {
        const result = await runCli([
          'doctor',
          '--architecture',
          architectureRoot,
          '--repository',
          repositoryRoot,
          '--json'
        ]);

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toBe('');

        const report = JSON.parse(result.stdout) as DoctorCliReport;

        expect(report.status).toBe('error');
        expect(report.checks).toContainEqual({
          id: 'repository.service_yaml',
          status: 'error',
          message: 'repository root is missing service.yaml'
        });
      }
    );
  });

  test('prints usage when architecture is missing', async () => {
    const result = await runCli(['doctor']);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain(
      'zdp-arch doctor --architecture <path> [--repository <path>] [--json]'
    );
  });
});

interface DoctorCliReport {
  readonly status: string;
  readonly validation: {
    readonly diagnostics: number;
    readonly errors: number;
    readonly warnings: number;
  };
  readonly checks: ReadonlyArray<{
    readonly id: string;
    readonly status: string;
    readonly message: string;
  }>;
}
