import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { validateRepositoryAssetContract } from '../src/xcut-asset-rules.ts';

describe('cross-cutting asset rules', () => {
  test('skips non-product and non-user-facing repositories', async () => {
    await withRepositoryRoot(
      {
        'assets/source.psd': 'fake psd'
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryAssetContract({
          repositoryRoot,
          repositoryServiceContract: {
            domain: {
              type: 'platform',
              user_facing: false
            }
          }
        });

        expect(diagnostics).toEqual([]);
      }
    );
  });

  test('warns when product repositories own original design source assets', async () => {
    await withRepositoryRoot(
      {
        'brand/hero-source.psd': 'fake psd'
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryAssetContract({
          repositoryRoot,
          repositoryServiceContract: {
            domain: {
              type: 'product',
              user_facing: true
            }
          }
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-XCUT-ASSET-001',
          severity: 'warning',
          file: 'brand/hero-source.psd',
          path: 'assets.original_source',
          message:
            'Product repositories must not directly own original brand, design, or media source assets; keep originals in a brand asset or media pipeline repository.'
        });
      }
    );
  });

  test('warns when product repositories own large raster images directly', async () => {
    await withRepositoryRoot(
      {
        'public/hero.png': Buffer.alloc(1_000_001)
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryAssetContract({
          repositoryRoot,
          repositoryServiceContract: {
            domain: {
              type: 'product',
              user_facing: true
            }
          }
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-XCUT-ASSET-001',
          severity: 'warning',
          file: 'public/hero.png',
          path: 'assets.large_raster',
          message:
            'Large raster images in product repositories must move behind an asset manifest, optimized public URL, or CDN URL instead of being owned directly.'
        });
      }
    );
  });

  test('warns when product repositories own large video assets directly', async () => {
    await withRepositoryRoot(
      {
        'media/launch.mp4': Buffer.alloc(2_000_001)
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryAssetContract({
          repositoryRoot,
          repositoryServiceContract: {
            domain: {
              type: 'product',
              user_facing: true
            }
          }
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-XCUT-ASSET-001',
          severity: 'warning',
          file: 'media/launch.mp4',
          path: 'assets.large_video',
          message:
            'Large video assets in product repositories must move behind a media pipeline, optimized public URL, or CDN URL instead of being owned directly.'
        });
      }
    );
  });

  test('passes small optimized assets', async () => {
    await withRepositoryRoot(
      {
        'public/og-preview.jpg': Buffer.alloc(40_000),
        'src/assets/icon.png': Buffer.alloc(5_000)
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryAssetContract({
          repositoryRoot,
          repositoryServiceContract: {
            domain: {
              type: 'product',
              user_facing: true
            }
          }
        });

        expect(diagnostics).toEqual([]);
      }
    );
  });
});

async function withRepositoryRoot(
  files: Record<string, string | Buffer>,
  callback: (repositoryRoot: string) => Promise<void>
): Promise<void> {
  const repositoryRoot = await mkdtemp(
    join(tmpdir(), 'zdp-architecture-linter-xcut-asset-')
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
