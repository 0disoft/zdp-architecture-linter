import { describe, expect, test } from 'bun:test';
import {
  createArchitectureDoctorReport,
  formatArchitectureDoctorReportText
} from '../src/architecture-doctor-report.ts';
import {
  createMinimalArchitectureFiles,
  withArchitectureFiles
} from './cli-test-helpers.ts';

describe('architecture doctor report', () => {
  test('reports a healthy minimal architecture root', async () => {
    await withArchitectureFiles(
      createMinimalArchitectureFiles({}),
      async ({ architectureRoot }) => {
        const report = await createArchitectureDoctorReport({ architectureRoot });

        expect(report.status).toBe('warning');
        expect(report.validation).toEqual({
          diagnostics: 0,
          errors: 0,
          warnings: 0
        });
        expect(report.checks).toContainEqual({
          id: 'architecture.required_files',
          status: 'ok',
          message: 'required architecture files are present'
        });
        expect(report.checks).toContainEqual({
          id: 'architecture.catalog_load',
          status: 'ok',
          message: 'catalogs, schemas, rules, and roadmap text load successfully'
        });
      }
    );
  });

  test('formats checks and validation summary', () => {
    const text = formatArchitectureDoctorReportText({
      status: 'warning',
      architectureRoot: 'C:/zdp-architecture',
      repositoryRoot: 'C:/zdp-labs-jiffy',
      validation: {
        diagnostics: 1,
        errors: 0,
        warnings: 1
      },
      checks: [
        {
          id: 'architecture.git',
          status: 'warning',
          message: 'Git work tree has 1 pending change(s)',
          details: ['M README.md']
        }
      ]
    });

    expect(text).toContain('# zdp-arch doctor');
    expect(text).toContain('- status: warning');
    expect(text).toContain('- repository: C:/zdp-labs-jiffy');
    expect(text).toContain('- diagnostics: 1 (0 errors, 1 warnings)');
    expect(text).toContain('- [warning] architecture.git: Git work tree has 1 pending change(s)');
    expect(text).toContain('  - M README.md');
  });
});
