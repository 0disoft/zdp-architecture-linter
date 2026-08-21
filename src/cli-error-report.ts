export const CLI_ERROR_SCHEMA_VERSION = 'zdp.architecture.cli-error.v1' as const;

export type CliErrorCode =
  | 'invalid_arguments'
  | 'generated_output_stale'
  | 'validation_failed'
  | 'command_failed';

export interface CliErrorReport {
  readonly schemaVersion: typeof CLI_ERROR_SCHEMA_VERSION;
  readonly status: 'failed';
  readonly error: {
    readonly code: CliErrorCode;
    readonly message: string;
    readonly details: Readonly<Record<string, unknown>>;
  };
}

export interface CliFailureInput {
  readonly code: CliErrorCode;
  readonly message: string;
  readonly publicMessage?: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export class CliFailure extends Error {
  readonly code: CliErrorCode;
  readonly publicMessage: string;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(input: CliFailureInput) {
    super(input.message);
    this.name = 'CliFailure';
    this.code = input.code;
    this.publicMessage = input.publicMessage ?? input.message;
    this.details = input.details ?? {};
  }
}

export function createCliErrorReport(error: unknown): CliErrorReport {
  if (error instanceof CliFailure) {
    return {
      schemaVersion: CLI_ERROR_SCHEMA_VERSION,
      status: 'failed',
      error: {
        code: error.code,
        message: error.publicMessage,
        details: error.details
      }
    };
  }

  return {
    schemaVersion: CLI_ERROR_SCHEMA_VERSION,
    status: 'failed',
    error: {
      code: 'command_failed',
      message: 'The command could not be completed.',
      details: {}
    }
  };
}

export function formatCliFailureText(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
