import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { validateRepositoryFeedContract } from '../src/xcut-feed-rules.ts';

describe('cross-cutting feed rules', () => {
  test('skips repositories without RSS, Atom, or JSON Feed surfaces', async () => {
    await withRepositoryRoot(
      {
        'service.yaml': `
domain:
  user_facing: true
runtime:
  edge: cloudflare-static-assets
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryFeedContract({
          repositoryRoot,
          repositoryServiceContract: {
            domain: {
              user_facing: true
            }
          }
        });

        expect(diagnostics).toEqual([]);
      }
    );
  });

  test('passes build-time static feed artifacts', async () => {
    await withRepositoryRoot(
      {
        'service.yaml': `
domain:
  user_facing: true
runtime:
  edge: cloudflare-static-assets
notes:
  - RSS, Atom, and JSON Feed artifacts are generated at build time.
`,
        'public/feed.json': `
{
  "version": "https://jsonfeed.org/version/1.1",
  "title": "ZeroDi",
  "items": []
}
`,
        'static/rss.xml': `
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>ZeroDi</title></channel></rss>
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryFeedContract({
          repositoryRoot,
          repositoryServiceContract: {
            domain: {
              user_facing: true
            }
          }
        });

        expect(diagnostics).toEqual([]);
      }
    );
  });

  test('passes service notes that require static feeds and reject runtime defaults', async () => {
    await withRepositoryRoot(
      {
        'service.yaml': `
notes:
  - Public feeds must be generated as static build artifacts once real public content exists; runtime feed generation is not the default.
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryFeedContract({
          repositoryRoot,
          repositoryServiceContract: {}
        });

        expect(diagnostics).toEqual([]);
      }
    );
  });

  test('passes prerendered feed server routes', async () => {
    await withRepositoryRoot(
      {
        'src/routes/rss.xml/+server.ts': `
export const prerender = true;

export function GET() {
  return new Response('<rss version="2.0"></rss>');
}
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryFeedContract({
          repositoryRoot,
          repositoryServiceContract: {}
        });

        expect(diagnostics).toEqual([]);
      }
    );
  });

  test('passes non-feed server routes without feed contracts', async () => {
    await withRepositoryRoot(
      {
        'src/routes/healthz/+server.ts': `
export function GET() {
  return new Response('ok');
}
`,
        'src/routes/readyz/+server.ts': `
export function GET() {
  return new Response('ready');
}
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryFeedContract({
          repositoryRoot,
          repositoryServiceContract: {}
        });

        expect(diagnostics).toEqual([]);
      }
    );
  });

  test('fails runtime feed server routes without exception, cost, and cache contracts', async () => {
    await withRepositoryRoot(
      {
        'src/routes/rss.xml/+server.ts': `
export async function GET() {
  return new Response('<rss version="2.0"></rss>');
}
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryFeedContract({
          repositoryRoot,
          repositoryServiceContract: {}
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-XCUT-FEED-001',
          severity: 'error',
          file: 'src/routes/rss.xml/+server.ts',
          path: 'feed.runtime_generation',
          message:
            'Runtime RSS/Atom/JSON Feed generation must declare an exception reason plus feed cost and cache policy in the service contract; default feeds must be static build-time artifacts.'
        });
      }
    );
  });

  test('passes runtime feed routes with explicit exception, cost, and cache contracts', async () => {
    await withRepositoryRoot(
      {
        'service.yaml': `
notes:
  - Runtime feed exception is allowed only for a personalized feed.
  - Feed cost policy limits worker CPU and request budget.
  - Feed cache policy requires Cache-Control max-age=900 and stale-while-revalidate.
`,
        'src/routes/feed.json/+server.ts': `
export async function GET() {
  return new Response(JSON.stringify({ items: [] }));
}
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryFeedContract({
          repositoryRoot,
          repositoryServiceContract: {}
        });

        expect(diagnostics).toEqual([]);
      }
    );
  });

  test('fails service contracts that declare runtime feeds without cache policy', async () => {
    await withRepositoryRoot(
      {
        'service.yaml': `
notes:
  - RSS runtime generation reads a database.
  - Runtime feed exception is allowed for a permission feed.
  - Feed cost policy limits worker CPU.
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryFeedContract({
          repositoryRoot,
          repositoryServiceContract: {}
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-XCUT-FEED-001',
          severity: 'error',
          file: 'service.yaml',
          path: 'feed.runtime_generation',
          message:
            'Runtime RSS/Atom/JSON Feed generation must declare an exception reason plus feed cost and cache policy in the service contract; default feeds must be static build-time artifacts.'
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
    join(tmpdir(), 'zdp-architecture-linter-xcut-feed-')
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
