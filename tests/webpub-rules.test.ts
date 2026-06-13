import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { validateRepositoryWebpubContract } from '../src/webpub-rules.ts';

describe('webpub publishing contract rules', () => {
  test('passes when a public static web repository has matching candidate webpub metadata', async () => {
    await withRepositoryRoot(
      createValidPublicWebRepositoryFiles(),
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryWebpubContract({
          repositoryRoot,
          repositoryServiceContract: createPublicWebServiceContract()
        });

        expect(diagnostics).toEqual([]);
      }
    );
  });

  test('passes a root-only zdp-web-public scaffold before app operational gates are declared', async () => {
    await withRepositoryRoot(
      {
        'webpub.toml': createValidWebpubToml(),
        'glossary/terms/public.yaml': 'terms: []\n'
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryWebpubContract({
          repositoryRoot,
          repositoryServiceContract: createPublicWebServiceContract({
            includeOperationalGateNotes: false
          })
        });

        expect(diagnostics).toEqual([]);
      }
    );
  });

  test('does not treat root-only glossary ad policy notes as app operational gates', async () => {
    await withRepositoryRoot(
      {
        'webpub.toml': createValidWebpubToml(),
        'glossary/terms/public.yaml': 'terms: []\n'
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryWebpubContract({
          repositoryRoot,
          repositoryServiceContract: createPublicWebServiceContract({
            includeOnlyRootGlossaryAdPolicyNote: true
          })
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
        ...createValidPublicWebRepositoryFiles(),
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
        ...createValidPublicWebRepositoryFiles(),
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
        ...createValidPublicWebRepositoryFiles(),
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

  test('fails when zdp-web-public localization and glossary gates drift', async () => {
    await withRepositoryRoot(
      {
        ...createValidPublicWebRepositoryFiles(),
        'package.json': JSON.stringify(
          {
            scripts: {
              check: 'bun run glossary:generate && astro check',
              'check:glossary': 'bun scripts/check-glossary.ts',
              'check:localization': 'bun scripts/check-localization.ts',
              'glossary:generate': 'bun scripts/generate-glossary.ts'
            }
          },
          null,
          2
        ),
        'scripts/check-localization.ts': 'console.log("check only");\n',
        'scripts/check-glossary.ts': 'console.log("regenerate");\n',
        'scripts/glossary-build.ts': 'export function buildRuntimeGlossaryManifest() {}\n'
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryWebpubContract({
          repositoryRoot,
          repositoryServiceContract: createPublicWebServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-WEBPUB-001',
          severity: 'error',
          file: 'package.json',
          path: 'scripts.check',
          message:
            '`check` must run `bun run check:glossary` first so stale glossary manifests fail before generated output can hide drift.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-WEBPUB-001',
          severity: 'error',
          file: 'package.json',
          path: 'scripts.check',
          message:
            '`check` must not run `bun run glossary:generate`; generated glossary manifests must be refreshed explicitly before freshness checks.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-WEBPUB-001',
          severity: 'error',
          file: 'package.json',
          path: 'scripts.check',
          message: '`check` must include `bun run check:localization`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-WEBPUB-001',
          severity: 'error',
          file: 'scripts/check-localization.ts',
          path: 'scripts.check-localization',
          message:
            'zdp-web-public localization check must prove strict production compile and zero fallback messages; missing `"--strict-missing"`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-WEBPUB-001',
          severity: 'error',
          file: 'scripts/check-glossary.ts',
          path: 'scripts.check-glossary',
          message:
            'zdp-web-public glossary check must fail on stale generated runtime manifests; missing `is stale`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-WEBPUB-001',
          severity: 'error',
          file: 'scripts/glossary-build.ts',
          path: 'scripts.glossary-build',
          message:
            'zdp-web-public glossary builder must preserve reviewed public terms, click-open Term Sheet placement, and hover-ad exclusion; missing `term.adPolicy.hoverCard !== "forbidden"`.'
        });
      }
    );
  });

  test('fails when zdp-web-public service contract omits localization and glossary gate notes', async () => {
    await withRepositoryRoot(createValidPublicWebRepositoryFiles(), async (repositoryRoot) => {
      const diagnostics = await validateRepositoryWebpubContract({
        repositoryRoot,
        repositoryServiceContract: createPublicWebServiceContract({
          includeOperationalGateNotes: false
        })
      });

      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-WEBPUB-001',
        severity: 'error',
        file: 'service.yaml',
        path: 'service.contract',
        message:
          'zdp-web-public service contract must document localization and glossary gates; missing `fallback messages are not allowed`.'
      });
      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-WEBPUB-001',
        severity: 'error',
        file: 'service.yaml',
        path: 'service.contract',
        message:
          'zdp-web-public service contract must document localization and glossary gates; missing `Glossary term sheets do not include ad slots; AdSense, Ezoic, or another provider may only be considered through a separate detail-page experiment contract`.'
      });
    });
  });

  test('fails when zdp-web-public localization canary contract drifts', async () => {
    await withRepositoryRoot(createValidPublicWebRepositoryFiles(), async (repositoryRoot) => {
      const diagnostics = await validateRepositoryWebpubContract({
        repositoryRoot,
        repositoryServiceContract: createPublicWebServiceContract({
          includeLocalizationCanaryNotes: false
        })
      });

      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-WEBPUB-001',
        severity: 'error',
        file: 'service.yaml',
        path: 'service.contract',
        message:
          'zdp-web-public service contract must document localization and glossary gates; missing `zdp-platform-localization adoption is limited to the home hero Astro canary until a broader public-copy migration is reviewed`.'
      });
      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-WEBPUB-001',
        severity: 'error',
        file: 'service.yaml',
        path: 'service.contract',
        message:
          'zdp-web-public service contract must document localization and glossary gates; missing `feature_flag_required":false`.'
      });
    });
  });

  test('fails when zdp-web-public CI omits private sibling provider checks', async () => {
    await withRepositoryRoot(
      {
        ...createValidPublicWebRepositoryFiles(),
        '.github/workflows/ci.yml': 'name: CI\njobs:\n  repository-contract:\n    steps: []\n'
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryWebpubContract({
          repositoryRoot,
          repositoryServiceContract: createPublicWebServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-WEBPUB-001',
          severity: 'error',
          file: '.github/workflows/ci.yml',
          path: 'github.workflow.ci',
          message:
            'zdp-web-public CI workflow must install private sibling providers and run public site check/build; missing `public-site:`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-WEBPUB-001',
          severity: 'error',
          file: '.github/workflows/ci.yml',
          path: 'github.workflow.ci',
          message:
            'zdp-web-public CI workflow must install private sibling providers and run public site check/build; missing `secrets.ZDP_CI_READ_TOKEN || github.token`.'
        });
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

function createValidPublicWebRepositoryFiles(): Record<string, string> {
  return {
    'webpub.toml': createValidWebpubToml(),
    'package.json': JSON.stringify(
      {
        scripts: {
          check:
            'bun run check:glossary && astro check && bun run check:localization && bun run check:discovery',
          'check:glossary': 'bun scripts/check-glossary.ts',
          'check:localization': 'bun scripts/check-localization.ts',
          'glossary:generate': 'bun scripts/generate-glossary.ts'
        }
      },
      null,
      2
    ),
    'scripts/check-localization.ts': [
      'const format = "zdp.localization.cli-result@1";',
      'const checkResult = await runZdpLocalizationCli(["check"]);',
      'const compileCommand = "compile";',
      'const strict = "--strict-missing";',
      'const totals = "totals.fallbackCount";',
      'if (fallbackCount !== 0) throw new Error(format + compileCommand + strict + totals);',
      'if (manifestFallbackCount !== 0) throw new Error("fallback");'
    ].join('\n'),
    'scripts/check-glossary.ts': [
      'import { buildRuntimeGlossaryManifest, GLOSSARY_RUNTIME_MANIFEST_PATH } from "./glossary-build";',
      'const result = await buildRuntimeGlossaryManifest(".");',
      'const stale = "is stale";',
      'const hint = "Run bun run glossary:generate";',
      'console.log("Glossary check passed", result, GLOSSARY_RUNTIME_MANIFEST_PATH, stale, hint);'
    ].join('\n'),
    'scripts/generate-glossary.ts': 'console.log("generate glossary");\n',
    'scripts/glossary-build.ts': [
      'import { buildGlossaryManifest } from "../../../platform/zdp-platform-devex/src/glossary-devex";',
      'export const GLOSSARY_LOCALE = "ko";',
      'export const GLOSSARY_PRODUCT = "zdp-web-public";',
      'export const GLOSSARY_SITE = "web-public-home";',
      'export function buildRuntimeGlossaryManifest() {',
      '  const result = buildGlossaryManifest({ sources: [], locale: GLOSSARY_LOCALE, product: GLOSSARY_PRODUCT, site: GLOSSARY_SITE });',
      '  if (result.manifest.terms.length < 10) throw new Error("Public glossary must include at least 10 reviewed terms");',
      '  for (const term of result.manifest.terms) {',
      '    if (term.interaction.trigger !== "click") throw new Error("click");',
      '    if (term.interaction.surface !== "term-sheet" || term.interaction.desktopPlacement !== "right-sheet" || term.interaction.mobilePlacement !== "bottom-sheet") throw new Error("placement");',
      '    if (term.adPolicy.hoverCard !== "forbidden") throw new Error("hover ad");',
      '    if (term.adPolicy.termSheet !== "forbidden") throw new Error("Term Sheet advertising");',
      '  }',
      '  return result;',
      '}',
      'function createReservedDetailAdPolicy() {}',
      'function createForbiddenAdPolicy() {}'
    ].join('\n'),
    '.github/workflows/ci.yml': [
      'name: CI',
      'jobs:',
      '  public-site:',
      '    steps:',
      '      - uses: actions/checkout@v6',
      '        with:',
      '          path: projects/zdp-platforms/client-surfaces/zdp-web-public',
      '      - uses: actions/checkout@v6',
      '        with:',
      '          repository: 0disoft/zdp-design-system',
      '          token: ${{ secrets.ZDP_CI_READ_TOKEN || github.token }}',
      '          path: projects/zdp-platforms/client-surfaces/zdp-design-system',
      '      - uses: actions/checkout@v6',
      '        with:',
      '          repository: 0disoft/zdp-platform-localization',
      '          token: ${{ secrets.ZDP_CI_READ_TOKEN || github.token }}',
      '          path: projects/zdp-platforms/platform/zdp-platform-localization',
      '      - run: bun install --frozen-lockfile',
      '      - run: bun run package:build',
      '      - run: bun run check',
      '      - run: bun run build'
    ].join('\n'),
    'glossary/terms/public.yaml': 'terms: []\n',
    'src/content/glossary-manifest.json': '[]\n'
  };
}

function createValidWebpubToml(): string {
  return `
version = "https://zdp.local/spec/webpub/v0.1"
site_url = ""
canonical_domain = ""
domain_status = "candidate"
candidate_public_domains = ["8ailors.xyz"]

[robots]
enabled = true
disallow = ["/"]
`;
}

function createPublicWebServiceContract(
  options: {
    readonly includeOperationalGateNotes?: boolean;
    readonly includeOnlyRootGlossaryAdPolicyNote?: boolean;
    readonly includeLocalizationCanaryNotes?: boolean;
  } = {}
): unknown {
  const includeOperationalGateNotes =
    options.includeOperationalGateNotes ??
    options.includeOnlyRootGlossaryAdPolicyNote !== true;
  const includeLocalizationCanaryNotes = options.includeLocalizationCanaryNotes ?? true;
  const contract: Record<string, unknown> = {
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
    },
    release: {
      migration_policy: includeLocalizationCanaryNotes
        ? 'zdp-platform-localization adoption is limited to the home hero Astro canary until a broader public-copy migration is reviewed'
        : 'localization canary scope is not documented',
      canary_policy: includeLocalizationCanaryNotes
        ? 'home hero localization dogfood only; keep static Astro copy rollback available before expanding to more public copy'
        : 'localization canary policy is not documented',
      feature_flag_required: includeLocalizationCanaryNotes
        ? false
        : true
    }
  };

  if (includeOperationalGateNotes) {
    contract.exit = {
      success_criteria: [
        'bun run check:localization passes with catalog diagnostics 0 and production fallback count 0'
      ]
    };
    contract.notes = [
      'bun run check:localization runs zdp-platform-localization catalog check and strict production compile; fallback messages are not allowed in the public site localization manifest.',
      ...(includeLocalizationCanaryNotes
        ? [
            'The first zdp-platform-localization product canary is intentionally limited to the home hero title and CTA messages.',
            'Static Astro copy remains the rollback boundary for the localization canary, so this static public site does not require a runtime feature flag.'
          ]
        : []),
      'bun run check must fail on stale glossary-manifest.json instead of regenerating it before the freshness check.',
      'Glossary term sheets do not include ad slots; AdSense, Ezoic, or another provider may only be considered through a separate detail-page experiment contract.'
    ];
  } else if (options.includeOnlyRootGlossaryAdPolicyNote === true) {
    contract.notes = [
      'Glossary term sheets do not include ad slots; AdSense, Ezoic, or another provider may only be considered through a separate detail-page experiment contract.'
    ];
  }

  return contract;
}
