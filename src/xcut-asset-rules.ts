import { readdir, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import type { Diagnostic } from './diagnostics.ts';

const ASSET_RULE_ID = 'ZDP-XCUT-ASSET-001';

const ASSET_DIRECTORIES = [
  'assets',
  'brand',
  'media',
  'public',
  'static',
  'src/assets',
  'src/content',
  'src/lib/assets'
] as const;

const IGNORED_DIRECTORY_NAMES = new Set([
  '.git',
  '.astro',
  '.svelte-kit',
  'coverage',
  'dist',
  'node_modules',
  'storybook-static',
  'target'
]);

const ORIGINAL_SOURCE_EXTENSIONS = new Set([
  '.ai',
  '.dng',
  '.fig',
  '.indd',
  '.psb',
  '.psd',
  '.raw',
  '.sketch',
  '.tif',
  '.tiff',
  '.xcf'
]);

const RASTER_EXTENSIONS = new Set([
  '.bmp',
  '.gif',
  '.jpeg',
  '.jpg',
  '.png'
]);

const VIDEO_EXTENSIONS = new Set([
  '.avi',
  '.m4v',
  '.mov',
  '.mp4',
  '.webm'
]);

const LARGE_RASTER_BYTES = 1_000_000;
const LARGE_VIDEO_BYTES = 2_000_000;

export async function validateRepositoryAssetContract(input: {
  readonly repositoryRoot: string;
  readonly repositoryServiceContract: unknown;
}): Promise<readonly Diagnostic[]> {
  if (!isProductAssetContractRelevant(input.repositoryServiceContract)) {
    return [];
  }

  const files = await collectAssetFiles(input.repositoryRoot);
  const diagnostics: Diagnostic[] = [];

  for (const file of files) {
    const extension = extname(file).toLowerCase();
    const fileStat = await stat(join(input.repositoryRoot, file));

    if (ORIGINAL_SOURCE_EXTENSIONS.has(extension)) {
      diagnostics.push(
        createAssetDiagnostic({
          file,
          path: 'assets.original_source',
          message:
            'Product repositories must not directly own original brand, design, or media source assets; keep originals in a brand asset or media pipeline repository.'
        })
      );
      continue;
    }

    if (RASTER_EXTENSIONS.has(extension) && fileStat.size > LARGE_RASTER_BYTES) {
      diagnostics.push(
        createAssetDiagnostic({
          file,
          path: 'assets.large_raster',
          message:
            'Large raster images in product repositories must move behind an asset manifest, optimized public URL, or CDN URL instead of being owned directly.'
        })
      );
      continue;
    }

    if (VIDEO_EXTENSIONS.has(extension) && fileStat.size > LARGE_VIDEO_BYTES) {
      diagnostics.push(
        createAssetDiagnostic({
          file,
          path: 'assets.large_video',
          message:
            'Large video assets in product repositories must move behind a media pipeline, optimized public URL, or CDN URL instead of being owned directly.'
        })
      );
    }
  }

  return diagnostics;
}

function isProductAssetContractRelevant(repositoryServiceContract: unknown): boolean {
  const userFacing = readBooleanAtPath(repositoryServiceContract, [
    'domain',
    'user_facing'
  ]);
  const domainType = readStringAtPath(repositoryServiceContract, ['domain', 'type']);

  return userFacing === true || domainType === 'product' || domainType === 'admin';
}

async function collectAssetFiles(
  repositoryRoot: string
): Promise<readonly string[]> {
  const files = (
    await Promise.all(
      ASSET_DIRECTORIES.map((directory) =>
        collectFilesFromDirectory(repositoryRoot, directory)
      )
    )
  ).flat();

  return Array.from(new Set(files)).sort((left, right) =>
    left.localeCompare(right)
  );
}

async function collectFilesFromDirectory(
  repositoryRoot: string,
  relativeDirectory: string
): Promise<readonly string[]> {
  const absoluteDirectory = join(repositoryRoot, relativeDirectory);

  if (!(await isDirectory(absoluteDirectory))) {
    return [];
  }

  const entries = await readdir(absoluteDirectory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const relativePath = `${relativeDirectory}/${entry.name}`;

    if (entry.isDirectory()) {
      if (!IGNORED_DIRECTORY_NAMES.has(entry.name)) {
        files.push(...(await collectFilesFromDirectory(repositoryRoot, relativePath)));
      }

      continue;
    }

    if (entry.isFile() && isReviewedAssetFile(relativePath)) {
      files.push(relativePath);
    }
  }

  return files;
}

function isReviewedAssetFile(file: string): boolean {
  const extension = extname(file).toLowerCase();

  return (
    ORIGINAL_SOURCE_EXTENSIONS.has(extension) ||
    RASTER_EXTENSIONS.has(extension) ||
    VIDEO_EXTENSIONS.has(extension)
  );
}

function readBooleanAtPath(
  value: unknown,
  path: readonly string[]
): boolean | null {
  const candidate = readValueAtPath(value, path);

  return typeof candidate === 'boolean' ? candidate : null;
}

function readStringAtPath(
  value: unknown,
  path: readonly string[]
): string | null {
  const candidate = readValueAtPath(value, path);

  return typeof candidate === 'string' ? candidate : null;
}

function readValueAtPath(value: unknown, path: readonly string[]): unknown {
  return path.reduce<unknown>((current, segment) => {
    if (!isRecord(current)) {
      return undefined;
    }

    return current[segment];
  }, value);
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch (error) {
    if (isMissingPathError(error)) {
      return false;
    }

    throw error;
  }
}

function createAssetDiagnostic(input: {
  readonly file: string;
  readonly path: string;
  readonly message: string;
}): Diagnostic {
  return {
    ruleId: ASSET_RULE_ID,
    severity: 'warning',
    file: input.file,
    path: input.path,
    message: input.message
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMissingPathError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as { readonly code?: unknown }).code === 'ENOENT'
  );
}
