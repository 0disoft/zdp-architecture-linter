import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { validateRepositoryTermSheetContract } from '../src/xcut-term-rules.ts';

describe('cross-cutting term sheet rules', () => {
  test('skips repositories without glossary surfaces', async () => {
    await withRepositoryRoot({}, async (repositoryRoot) => {
      const diagnostics = await validateRepositoryTermSheetContract({
        repositoryRoot,
        repositoryServiceContract: {
          service: {
            repo: 'zdp-core-platform'
          },
          notes: ['No terminology helper surface is declared here.']
        }
      });

      expect(diagnostics).toEqual([]);
    });
  });

  test('passes click-open term sheet contracts with ad-excluded sheet roots', async () => {
    await withRepositoryRoot(
      {
        'glossary/terms/public.yaml': 'terms: []\n',
        'src/content/glossary-manifest.json': '[]\n'
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryTermSheetContract({
          repositoryRoot,
          repositoryServiceContract: {
            service: {
              repo: 'zdp-web-public'
            },
            notes: [
              'Glossary explanations use stable term_id values and glossary/terms YAML sources.',
              'Glossary explanations use click-open Term Sheet surfaces with desktop right sheet and mobile bottom sheet placement.',
              'Hover tooltip/card ad slots are forbidden.',
              'Term Sheet roots keep data-zdp-ad-exclude and do not include ad slots; AdSense, Ezoic, iframe, script, and provider advertising belong to a separate Term Detail Page experiment contract.'
            ]
          }
        });

        expect(diagnostics).toEqual([]);
      }
    );
  });

  test('fails when hover glossary surfaces carry ad slots without a ban', async () => {
    await withRepositoryRoot(
      {
        'glossary/terms/public.yaml': 'terms: []\n'
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryTermSheetContract({
          repositoryRoot,
          repositoryServiceContract: {
            service: {
              repo: 'zdp-content-site'
            },
            notes: [
              'Glossary hover card surfaces may include an AdSense ad slot for related explanations.',
              'Term Sheet surfaces are available for longer explanations.'
            ]
          }
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-XCUT-TERM-ADS-001',
          severity: 'error',
          file: 'service.yaml',
          path: 'notes',
          message:
            'Glossary hover tooltip/card surfaces must not contain ad slots or ad providers; use click-open Term Sheet or Term Detail Page surfaces instead.'
        });
      }
    );
  });

  test('fails when term sheet ads are declared as sheet slots or providers', async () => {
    await withRepositoryRoot(
      {
        'glossary/terms/public.yaml': 'terms: []\n'
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryTermSheetContract({
          repositoryRoot,
          repositoryServiceContract: {
            service: {
              repo: 'zdp-content-site'
            },
            notes: [
              'Glossary uses stable term_id values and a click-open Term Sheet.',
              'Term Sheet loads Ezoic script and iframe placements on MVP pages.'
            ]
          }
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-XCUT-TERM-ADS-002',
          severity: 'error',
          file: 'service.yaml',
          path: 'notes',
          message:
            'MVP Term Sheet surfaces must not contain ad slots, ad providers, iframes, or scripts; use a separate Term Detail Page experiment contract for ads.'
        });
      }
    );
  });

  test('warns when glossary surfaces omit stable term_id identity', async () => {
    await withRepositoryRoot(
      {
        'glossary/terms/public.yaml': 'terms: []\n'
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryTermSheetContract({
          repositoryRoot,
          repositoryServiceContract: {
            service: {
              repo: 'zdp-content-site'
            },
            notes: [
              'Glossary explanations use click-open Term Sheet surfaces.',
              'Hover tooltip/card ad slots are forbidden.',
              'Term Sheet roots keep data-zdp-ad-exclude and do not include ad slots.'
            ]
          }
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-XCUT-TERM-001',
          severity: 'warning',
          file: 'service.yaml',
          path: 'notes',
          message:
            'Glossary surfaces should declare stable `term_id` ownership so labels, aliases, translations, analytics, and sheet events do not use display text as identity.'
        });
      }
    );
  });

  test('warns when generated glossary manifest has no YAML source', async () => {
    await withRepositoryRoot(
      {
        'src/content/glossary-manifest.json': '[]\n'
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryTermSheetContract({
          repositoryRoot,
          repositoryServiceContract: {
            service: {
              repo: 'zdp-content-site'
            },
            notes: [
              'Glossary explanations use stable term_id values and click-open Term Sheet surfaces.',
              'Hover tooltip/card ad slots are forbidden.',
              'Term Sheet roots keep data-zdp-ad-exclude and do not include ad slots.'
            ]
          }
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-XCUT-TERM-007',
          severity: 'warning',
          file: 'service.yaml',
          path: 'repository.root',
          message:
            '`src/content/glossary-manifest.json` is generated runtime state and should have `glossary/terms` YAML source in the repository contract so CI can detect stale manifest drift.'
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
    join(tmpdir(), 'zdp-architecture-linter-xcut-term-')
  );

  try {
    for (const [file, source] of Object.entries(files)) {
      const fullPath = join(repositoryRoot, file);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, source);
    }

    await callback(repositoryRoot);
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true });
  }
}
