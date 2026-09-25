import { describe, expect, test } from 'bun:test';
import {
  CLI_ERROR_SCHEMA_VERSION,
  CliFailure,
  createCliErrorReport,
  formatCliFailureText
} from '../src/cli-error-report.ts';

describe('CLI error report', () => {
  test('keeps machine-readable details separate from human usage text', () => {
    const failure = new CliFailure({
      code: 'invalid_arguments',
      message: 'Invalid command or arguments.\n\nUsage:\n  zdp-arch validate ...',
      publicMessage: 'Invalid command or arguments.',
      details: {
        usage: ['zdp-arch validate ...']
      }
    });

    expect(createCliErrorReport(failure)).toEqual({
      schemaVersion: CLI_ERROR_SCHEMA_VERSION,
      status: 'failed',
      error: {
        code: 'invalid_arguments',
        message: 'Invalid command or arguments.',
        details: {
          usage: ['zdp-arch validate ...']
        }
      }
    });
    expect(formatCliFailureText(failure)).toContain('Usage:');
  });

  test('redacts unknown runtime failures from JSON output', () => {
    const failure = new Error('provider payload: private-value');
    const report = createCliErrorReport(failure);

    expect(report).toEqual({
      schemaVersion: CLI_ERROR_SCHEMA_VERSION,
      status: 'failed',
      error: {
        code: 'command_failed',
        message: 'The command could not be completed.',
        details: {}
      }
    });
    expect(JSON.stringify(report)).not.toContain('private-value');
    expect(formatCliFailureText(failure)).toBe(
      'provider payload: private-value'
    );
  });
});
