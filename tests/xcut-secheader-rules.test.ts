import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { validateRepositorySecurityHeaderContract } from '../src/xcut-secheader-rules.ts';

describe('cross-cutting security header rules', () => {
  test('skips repositories that are not user-facing web, auth UI, or app shells', async () => {
    await withRepositoryRoot(
      {
        'service.yaml': `
domain:
  user_facing: false
runtime:
  framework: rust-axum
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositorySecurityHeaderContract({
          repositoryRoot,
          repositoryServiceContract: {
            domain: {
              user_facing: false
            },
            runtime: {
              framework: 'rust-axum'
            }
          }
        });

        expect(diagnostics).toEqual([]);
      }
    );
  });

  test('warns when a user-facing web surface has no security header contract', async () => {
    await withRepositoryRoot(
      {
        'service.yaml': `
domain:
  user_facing: true
runtime:
  framework: astro
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositorySecurityHeaderContract({
          repositoryRoot,
          repositoryServiceContract: {
            domain: {
              user_facing: true
            },
            runtime: {
              framework: 'astro'
            }
          }
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-XCUT-SECHEADER-001',
          severity: 'warning',
          file: 'service.yaml',
          path: 'security_headers.contract',
          message:
            'Public web, auth UI, and app shell repositories must declare the default security header contract in service.yaml or an equivalent contract.'
        });
      }
    );
  });

  test('warns when a security header contract omits required headers', async () => {
    await withRepositoryRoot(
      {
        'service.yaml': `
domain:
  user_facing: true
runtime:
  framework: sveltekit-contracts
notes:
  - Security headers include Content-Security-Policy and Strict-Transport-Security.
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositorySecurityHeaderContract({
          repositoryRoot,
          repositoryServiceContract: {
            domain: {
              user_facing: true
            },
            runtime: {
              framework: 'sveltekit-contracts'
            }
          }
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-XCUT-SECHEADER-001',
          severity: 'warning',
          file: 'service.yaml',
          path: 'security_headers.x_content_type_options',
          message:
            'Security header contracts must declare X-Content-Type-Options for public web, auth UI, and app shell surfaces.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-XCUT-SECHEADER-001',
          severity: 'warning',
          file: 'service.yaml',
          path: 'security_headers.frame_ancestors',
          message:
            'Security header contracts must declare frame-ancestors or X-Frame-Options for public web, auth UI, and app shell surfaces.'
        });
      }
    );
  });

  test('warns when CSP unsafe-inline has no nonce, hash, or reviewed exception', async () => {
    await withRepositoryRoot(
      {
        'security-headers-contract.yaml': `
security_headers:
  Content-Security-Policy: "default-src 'self'; script-src 'self' 'unsafe-inline'"
  Strict-Transport-Security: "max-age=31536000; includeSubDomains"
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  frame-ancestors: "'none'"
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositorySecurityHeaderContract({
          repositoryRoot,
          repositoryServiceContract: {
            domain: {
              user_facing: true
            },
            runtime: {
              framework: 'auth-ui-package'
            }
          }
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-XCUT-SECHEADER-001',
          severity: 'warning',
          file: 'security-headers-contract.yaml',
          path: 'security_headers.csp_inline_exception',
          message:
            'CSP unsafe-inline or unsafe-eval usage must include a nonce, hash, or reviewed exception reason.'
        });
      }
    );
  });

  test('passes complete security header contracts', async () => {
    await withRepositoryRoot(
      {
        'service.yaml': `
domain:
  user_facing: true
runtime:
  framework: astro
notes:
  - Security headers include Content-Security-Policy, Strict-Transport-Security, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, and frame-ancestors.
  - CSP unsafe-inline and unsafe-eval stay disabled; any required inline theme script must use a nonce or hash with a reviewed exception.
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositorySecurityHeaderContract({
          repositoryRoot,
          repositoryServiceContract: {
            domain: {
              user_facing: true
            },
            runtime: {
              framework: 'astro'
            }
          }
        });

        expect(diagnostics).toEqual([]);
      }
    );
  });
});

async function withRepositoryRoot(
  files: Record<string, string>,
  callback: (repositoryRoot: string) => Promise<void>
): Promise<void> {
  const repositoryRoot = await mkdtemp(
    join(tmpdir(), 'zdp-architecture-linter-xcut-secheader-')
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
