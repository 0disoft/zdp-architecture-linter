import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { validateRepositoryErrorEnvelopeContract } from '../src/xcut-error-rules.ts';

describe('cross-cutting error envelope rules', () => {
  test('skips repositories without public API or error contract files', async () => {
    await withRepositoryRoot({}, async (repositoryRoot) => {
      const diagnostics = await validateRepositoryErrorEnvelopeContract({
        repositoryRoot,
        repositoryServiceContract: {
          domain: {
            public_api: false
          },
          api: {
            exposure: 'none'
          }
        }
      });

      expect(diagnostics).toEqual([]);
    });
  });

  test('passes standard API error envelope contracts', async () => {
    await withRepositoryRoot(
      {
        'contracts/error-envelope.yaml': `
error_envelope:
  required_fields:
    - code
    - message
    - request_id
`,
        'contracts/openapi.yaml': `
openapi: 3.1.0
components:
  schemas:
    ErrorEnvelope:
      type: object
      required: [error]
      properties:
        error:
          type: object
          required: [code, message, request_id]
          properties:
            code:
              type: string
            message:
              type: string
            request_id:
              type: string
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryErrorEnvelopeContract({
          repositoryRoot,
          repositoryServiceContract: {
            domain: {
              public_api: true
            },
            api: {
              exposure: 'public'
            }
          }
        });

        expect(diagnostics).toEqual([]);
      }
    );
  });

  test('fails raw string error responses in public API contracts', async () => {
    await withRepositoryRoot(
      {
        'contracts/api-errors.yaml': `
responses:
  404:
    error: "not found"
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryErrorEnvelopeContract({
          repositoryRoot,
          repositoryServiceContract: {
            domain: {
              public_api: true
            },
            api: {
              exposure: 'public'
            }
          }
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-XCUT-ERROR-001',
          severity: 'error',
          file: 'contracts/api-errors.yaml',
          path: 'line.3',
          message:
            'Public API error responses must not expose raw string `error` values; use an envelope with `code`, `message`, and `request_id`.'
        });
      }
    );
  });

  test('fails message-only error response contracts', async () => {
    await withRepositoryRoot(
      {
        'openapi.yaml': `
openapi: 3.1.0
paths:
  /v1/widgets:
    get:
      responses:
        "404":
          description: error response
          content:
            application/json:
              example: { "message": "not found" }
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryErrorEnvelopeContract({
          repositoryRoot,
          repositoryServiceContract: {
            domain: {
              public_api: true
            },
            api: {
              exposure: 'public'
            }
          }
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-XCUT-ERROR-001',
          severity: 'error',
          file: 'openapi.yaml',
          path: 'error_envelope.wrapper',
          message:
            'Public API error responses must use an `error` envelope instead of a top-level message-only object.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-XCUT-ERROR-001',
          severity: 'error',
          file: 'openapi.yaml',
          path: 'error_envelope.required_fields',
          message:
            'Public API error envelopes must declare an error object with `error`, `code`, `request_id`.'
        });
      }
    );
  });

  test('fails public service contracts that do not declare an error envelope', async () => {
    await withRepositoryRoot(
      {
        'service.yaml': `
domain:
  public_api: true
api:
  exposure: public
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryErrorEnvelopeContract({
          repositoryRoot,
          repositoryServiceContract: {
            domain: {
              public_api: true
            },
            api: {
              exposure: 'public'
            }
          }
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-XCUT-ERROR-001',
          severity: 'error',
          file: 'service.yaml',
          path: 'error_envelope.required_fields',
          message:
            'Public API error envelopes must declare an error object with `error`, `code`, `message`, `request_id`.'
        });
      }
    );
  });
});

async function withRepositoryRoot(
  files: Record<string, string>,
  callback: (repositoryRoot: string) => Promise<void>
): Promise<void> {
  const repositoryRoot = await mkdtemp(
    join(tmpdir(), 'zdp-architecture-linter-xcut-error-')
  );

  try {
    for (const [file, source] of Object.entries(files)) {
      const fullPath = join(repositoryRoot, file);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, source.trimStart(), 'utf8');
    }

    await callback(repositoryRoot);
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true });
  }
}
