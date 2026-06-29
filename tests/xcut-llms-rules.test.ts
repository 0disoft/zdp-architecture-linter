import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { validateRepositoryLlmsContract } from '../src/xcut-llms-rules.ts';

describe('cross-cutting llms.txt rules', () => {
  test('skips repositories without llms.txt artifacts', async () => {
    await withRepositoryRoot({}, async (repositoryRoot) => {
      const diagnostics = await validateRepositoryLlmsContract({
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

  test('passes curated public llms.txt guides', async () => {
    await withRepositoryRoot(
      {
        'public/llms.txt': `
# ZeroDi

## Core public pages
- https://zerodi.com/
- https://zerodi.com/docs
- https://zerodi.com/pricing

Only public documentation and public product pages belong here.
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryLlmsContract({
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

  test('warns when llms.txt copies sitemap XML', async () => {
    await withRepositoryRoot(
      {
        'llms.txt': `
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://zerodi.com/</loc></url>
</urlset>
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryLlmsContract({
          repositoryRoot,
          repositoryServiceContract: {
            service: {
              repo: 'zdp-web-public'
            }
          }
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-XCUT-LLMS-001',
          severity: 'warning',
          file: 'llms.txt',
          path: 'llms.sitemap_copy',
          message:
            'llms.txt must be a curated guide, not a copied sitemap XML document.'
        });
      }
    );
  });

  test('warns when llms.txt carries too many public links', async () => {
    const links = Array.from(
      { length: 21 },
      (_, index) => `- https://zerodi.com/docs/page-${index + 1}`
    ).join('\n');

    await withRepositoryRoot(
      {
        'llms.txt': `
# ZeroDi docs

${links}
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryLlmsContract({
          repositoryRoot,
          repositoryServiceContract: {
            service: {
              repo: 'zdp-web-public'
            }
          }
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-XCUT-LLMS-001',
          severity: 'warning',
          file: 'llms.txt',
          path: 'llms.too_many_links',
          message:
            'llms.txt should stay curated to the most important public links instead of copying the full sitemap.'
        });
      }
    );
  });

  test('warns when llms.txt includes internal or private URLs', async () => {
    await withRepositoryRoot(
      {
        'src/content/llms.txt': `
# ZeroDi internal draft

- https://zerodi.com/docs
- http://localhost:8787/admin
- https://core.internal/customer-data/export
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryLlmsContract({
          repositoryRoot,
          repositoryServiceContract: {
            service: {
              repo: 'zdp-web-public'
            }
          }
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-XCUT-LLMS-001',
          severity: 'warning',
          file: 'src/content/llms.txt',
          path: 'llms.private_url',
          message:
            'llms.txt must not include localhost, private-network, internal, admin, customer-data, ops, or backoffice URLs.'
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
    join(tmpdir(), 'zdp-architecture-linter-xcut-llms-')
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
