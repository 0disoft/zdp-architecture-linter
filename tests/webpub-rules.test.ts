import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { validateRepositoryWebpubContract } from '../src/webpub-rules.ts';

describe('webpub publishing contract rules', () => {
  test('passes when a public static web repository has matching candidate webpub metadata', async () => {
    await withRepositoryRoot(
      {
        'webpub.toml': `
version = "https://zdp.local/spec/webpub/v0.1"
site_url = ""
canonical_domain = ""
domain_status = "candidate"
candidate_public_domains = ["8ailors.xyz"]

[robots]
enabled = true
disallow = ["/"]
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryWebpubContract({
          repositoryRoot,
          repositoryServiceContract: createPublicWebServiceContract()
        });

        expect(diagnostics).toEqual([]);
      }
    );
  });

  test('requires webpub.toml for public static web repositories', async () => {
    await withRepositoryRoot({}, async (repositoryRoot) => {
      const diagnostics = await validateRepositoryWebpubContract({
        repositoryRoot,
        repositoryServiceContract: createPublicWebServiceContract()
      });

      expect(diagnostics).toEqual([
        {
          ruleId: 'ZDP-WEBPUB-001',
          severity: 'error',
          file: 'webpub.toml',
          path: 'repository.root',
          message:
            'Public static web repositories must include root `webpub.toml` so domain status and pre-public robots policy are machine-checkable.'
        }
      ]);
    });
  });

  test('skips non-public static web repositories', async () => {
    await withRepositoryRoot({}, async (repositoryRoot) => {
      const diagnostics = await validateRepositoryWebpubContract({
        repositoryRoot,
        repositoryServiceContract: {
          service: {
            repo: 'zdp-core-platform'
          },
          domain: {
            user_facing: false,
            public_api: false
          },
          runtime: {
            edge: null
          },
          api: {
            exposure: 'none'
          }
        }
      });

      expect(diagnostics).toEqual([]);
    });
  });

  test('fails when webpub domain metadata drifts from service.yaml', async () => {
    await withRepositoryRoot(
      {
        'webpub.toml': `
domain_status = "live"
candidate_public_domains = ["8ailors.xyz", "other.example"]

[robots]
enabled = true
disallow = ["/"]
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryWebpubContract({
          repositoryRoot,
          repositoryServiceContract: createPublicWebServiceContract()
        });

        expect(diagnostics).toEqual([
          {
            ruleId: 'ZDP-WEBPUB-001',
            severity: 'error',
            file: 'webpub.toml',
            path: 'domain_status',
            message:
              '`webpub.toml` domain_status must match `service.yaml` runtime.domain_status. service.yaml has `candidate`, webpub.toml has `live`.'
          },
          {
            ruleId: 'ZDP-WEBPUB-001',
            severity: 'error',
            file: 'webpub.toml',
            path: 'candidate_public_domains',
            message:
              '`webpub.toml` candidate_public_domains must match `service.yaml` runtime.candidate_public_domains. service.yaml has [`8ailors.xyz`], webpub.toml has [`8ailors.xyz`, `other.example`].'
          }
        ]);
      }
    );
  });

  test('fails when candidate webpub metadata can leak into public indexing', async () => {
    await withRepositoryRoot(
      {
        'webpub.toml': `
site_url = "https://8ailors.xyz"
canonical_domain = "8ailors.xyz"
domain_status = "candidate"
candidate_public_domains = ["8ailors.xyz"]

[robots]
enabled = false
disallow = []
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryWebpubContract({
          repositoryRoot,
          repositoryServiceContract: createPublicWebServiceContract()
        });

        expect(diagnostics).toEqual([
          {
            ruleId: 'ZDP-WEBPUB-001',
            severity: 'error',
            file: 'webpub.toml',
            path: 'site_url',
            message:
              '`domain_status = "candidate"` requires empty `site_url`; candidate domains must not become sitemap or feed base URLs before ownership and routing are ready.'
          },
          {
            ruleId: 'ZDP-WEBPUB-001',
            severity: 'error',
            file: 'webpub.toml',
            path: 'canonical_domain',
            message:
              '`domain_status = "candidate"` requires empty `canonical_domain`; the canonical domain is set only after ownership and routing are ready.'
          },
          {
            ruleId: 'ZDP-WEBPUB-001',
            severity: 'error',
            file: 'webpub.toml',
            path: 'robots.enabled',
            message:
              '`domain_status = "candidate"` requires `robots.enabled = true` so pre-public pages are explicitly blocked from indexing.'
          },
          {
            ruleId: 'ZDP-WEBPUB-001',
            severity: 'error',
            file: 'webpub.toml',
            path: 'robots.disallow',
            message:
              '`domain_status = "candidate"` requires `robots.disallow` to include `/` so the whole preview surface stays blocked.'
          }
        ]);
      }
    );
  });

  test('fails when policy fields use unsupported TOML value shapes', async () => {
    await withRepositoryRoot(
      {
        'webpub.toml': `
domain_status = candidate
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryWebpubContract({
          repositoryRoot,
          repositoryServiceContract: createPublicWebServiceContract()
        });

        expect(diagnostics).toEqual([
          {
            ruleId: 'ZDP-WEBPUB-001',
            severity: 'error',
            file: 'webpub.toml',
            path: 'domain_status',
            message:
              'Cannot parse `webpub.toml` value for `domain_status`; supported policy values are strings, booleans, and string arrays.'
          }
        ]);
      }
    );
  });
});

async function withRepositoryRoot(
  files: Record<string, string>,
  callback: (repositoryRoot: string) => Promise<void>
): Promise<void> {
  const repositoryRoot = await mkdtemp(join(tmpdir(), 'zdp-webpub-'));

  try {
    for (const [relativePath, source] of Object.entries(files)) {
      const absolutePath = join(repositoryRoot, relativePath);

      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, source.trimStart(), 'utf8');
    }

    await callback(repositoryRoot);
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true });
  }
}

function createPublicWebServiceContract(): unknown {
  return {
    service: {
      repo: 'zdp-web-public'
    },
    domain: {
      user_facing: true,
      public_api: false
    },
    runtime: {
      edge: 'cloudflare-static-assets',
      domain_status: 'candidate',
      candidate_public_domains: ['8ailors.xyz']
    },
    api: {
      exposure: 'none'
    }
  };
}
