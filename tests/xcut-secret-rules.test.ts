import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { validateRepositorySecretExposureContract } from '../src/xcut-secret-rules.ts';

describe('cross-cutting secret exposure rules', () => {
  test('skips repositories without public discovery artifacts', async () => {
    await withRepositoryRoot({}, async (repositoryRoot) => {
      const diagnostics = await validateRepositorySecretExposureContract({
        repositoryRoot,
        repositoryServiceContract: {
          service: {
            repo: 'zdp-core-platform'
          }
        }
      });

      expect(diagnostics).toEqual([]);
    });
  });

  test('passes safe llms and sitemap discovery artifacts', async () => {
    await withRepositoryRoot(
      {
        'public/llms.txt': `
# ZeroDi

## Core pages
- https://zerodi.com/
- https://zerodi.com/docs

Use public docs only. Tokens are represented as REDACTED placeholders.
`,
        'public/sitemap.xml': `
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://zerodi.com/</loc></url>
  <url><loc>https://zerodi.com/docs</loc></url>
</urlset>
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositorySecretExposureContract({
          repositoryRoot,
          repositoryServiceContract: {
            service: {
              repo: 'zdp-web-public'
            }
          }
        });

        expect(diagnostics).toEqual([]);
      }
    );
  });

  test('fails when llms.txt exposes internal URLs and private paths', async () => {
    await withRepositoryRoot(
      {
        'llms.txt': `
# ZeroDi internal draft

- http://localhost:8787/admin
- https://core.internal/customer-data/export
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositorySecretExposureContract({
          repositoryRoot,
          repositoryServiceContract: {
            service: {
              repo: 'zdp-web-public'
            }
          }
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-XCUT-SECRET-001',
          severity: 'error',
          file: 'llms.txt',
          path: 'public_discovery.internal_url',
          message:
            'Public discovery artifacts must not contain localhost, private-network, or internal host URLs.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-XCUT-SECRET-001',
          severity: 'error',
          file: 'llms.txt',
          path: 'public_discovery.private_path',
          message:
            'Public discovery artifacts must not list private, admin, internal, customer-data, ops, or backoffice paths.'
        });
      }
    );
  });

  test('fails when sitemap exposes populated secret assignments or token-like values', async () => {
    await withRepositoryRoot(
      {
        'public/sitemap.xml': `
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://zerodi.com/docs?client_secret=supersensitivevalue12345</loc></url>
  <url><loc>https://zerodi.com/docs?token=sk-test-secretsecretsecret</loc></url>
</urlset>
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositorySecretExposureContract({
          repositoryRoot,
          repositoryServiceContract: {
            service: {
              repo: 'zdp-web-public'
            }
          }
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-XCUT-SECRET-001',
          severity: 'error',
          file: 'public/sitemap.xml',
          path: 'public_discovery.secret_assignment',
          message:
            'Public discovery artifacts must not contain populated secret, token, password, or API key assignments.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-XCUT-SECRET-001',
          severity: 'error',
          file: 'public/sitemap.xml',
          path: 'public_discovery.secret_value',
          message:
            'Public discovery artifacts must not contain private keys, API keys, access tokens, or secret-looking credential values.'
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
    join(tmpdir(), 'zdp-architecture-linter-xcut-secret-')
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
