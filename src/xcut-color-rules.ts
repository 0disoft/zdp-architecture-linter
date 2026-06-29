import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { Diagnostic } from './diagnostics.ts';

const COLOR_RULE_ID = 'ZDP-XCUT-COLOR-001';

const ROOT_COLOR_CONTRACT_FILES = [
  'service.yaml',
  'service.yml',
  'product-spec.md',
  'design-tokens.json',
  'tokens.css',
  'tailwind.config.js',
  'tailwind.config.cjs',
  'tailwind.config.mjs',
  'tailwind.config.ts'
] as const;

const COLOR_CONTRACT_DIRECTORIES = [
  'contracts',
  'schemas',
  'src/styles',
  'styles',
  'tokens'
] as const;

const REVIEWED_FILE_EXTENSIONS = [
  '.css',
  '.json',
  '.md',
  '.ts',
  '.js',
  '.mjs',
  '.cjs',
  '.yaml',
  '.yml'
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

const RAW_COLOR_LITERAL_PATTERN =
  /#[0-9a-fA-F]{3,8}\b|(?:rgba?|hsla?)\(\s*[^)]*\)/i;
const OKLCH_PATTERN = /\boklch\(\s*[^)]*\)/i;
const SEMANTIC_TOKEN_PATTERN =
  /(?:--[\w-]*(?:surface|text|ink|border|line|danger|success|accent|focus|selection|warning|error)[\w-]*\s*:)|(?:"(?:surface|text|ink|border|line|danger|success|accent|focus|selection|warning|error)"\s*:)/i;
const COMPONENT_TOKEN_PATTERN =
  /(?:--[\w-]*(?:button|tab|card|input|tooltip|dialog|sheet|modal|toast|control)[\w-]*\s*:)|(?:"(?:button|tab|card|input|tooltip|dialog|sheet|modal|toast|control)"\s*:)/i;
const RAW_COLOR_PROPERTY_PATTERN =
  /^\s*(?:--[\w-]+\s*:|(?:background(?:-color)?|color|border(?:-(?:color|block(?:-start|-end)?-color|inline(?:-start|-end)?-color|top-color|right-color|bottom-color|left-color))?|outline(?:-color)?|box-shadow|text-shadow|fill|stroke|caret-color|accent-color)\s*:)\s*(?!var\()[^;]*(?:#[0-9a-fA-F]{3,8}\b|(?:rgba?|hsla?)\(\s*[^)]*\))/i;
const INVERT_FILTER_PATTERN = /^\s*filter\s*:\s*[^;]*\binvert\(/i;
const P3_COLOR_PATTERN = /\b(?:color\s*\(\s*display-p3|display-p3|color-gamut\s*:\s*p3)\b/i;
const P3_MEDIA_PATTERN = /@media[^{]*\(\s*color-gamut\s*:\s*p3\s*\)/i;

export async function validateRepositoryColorContract(input: {
  readonly repositoryRoot: string;
  readonly repositoryServiceContract: unknown;
}): Promise<readonly Diagnostic[]> {
  const files = await collectColorContractFiles(input.repositoryRoot);

  if (files.length === 0) {
    return [];
  }

  const diagnostics: Diagnostic[] = [];

  for (const file of files) {
    const source = await readFile(join(input.repositoryRoot, file), 'utf8');

    if (isTokenSourcePath(file)) {
      diagnostics.push(...validateTokenSource(file, source));
      continue;
    }

    diagnostics.push(...validateStyleSource(file, source));
  }

  return diagnostics;
}

function validateTokenSource(
  file: string,
  source: string
): readonly Diagnostic[] {
  if (!RAW_COLOR_LITERAL_PATTERN.test(source)) {
    return [];
  }

  if (
    OKLCH_PATTERN.test(source) &&
    (SEMANTIC_TOKEN_PATTERN.test(source) || COMPONENT_TOKEN_PATTERN.test(source))
  ) {
    return [];
  }

  return [
    createColorDiagnostic({
      file,
      path: 'color.token_source',
      message:
        'Design token sources that contain raw hex/rgb/hsl colors must also expose OKLCH source values and semantic or component token layers.'
    })
  ];
}

function validateStyleSource(
  file: string,
  source: string
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lines = source.split(/\r?\n/);

  for (const line of lines) {
    if (RAW_COLOR_PROPERTY_PATTERN.test(line)) {
      diagnostics.push(
        createColorDiagnostic({
          file,
          path: 'color.raw_property',
          message:
            'Product style sources must use semantic or component design tokens instead of raw hex/rgb/hsl color property values.'
        })
      );
      break;
    }
  }

  if (lines.some((line) => INVERT_FILTER_PATTERN.test(line))) {
    diagnostics.push(
      createColorDiagnostic({
        file,
        path: 'color.dark_mode_invert_filter',
        message:
          'Dark mode must be expressed with semantic token values, not filter: invert().'
      })
    );
  }

  if (P3_COLOR_PATTERN.test(source) && !P3_MEDIA_PATTERN.test(source)) {
    diagnostics.push(
      createColorDiagnostic({
        file,
        path: 'color.p3_without_gate',
        message:
          'P3 color usage must be scoped under @media (color-gamut: p3) with an sRGB fallback.'
      })
    );
  }

  return diagnostics;
}

async function collectColorContractFiles(
  repositoryRoot: string
): Promise<readonly string[]> {
  const rootFiles = (
    await Promise.all(
      ROOT_COLOR_CONTRACT_FILES.map(async (file) =>
        (await isFile(join(repositoryRoot, file))) ? [file] : []
      )
    )
  ).flat();
  const directoryFiles = (
    await Promise.all(
      COLOR_CONTRACT_DIRECTORIES.map((directory) =>
        collectFilesFromDirectory(repositoryRoot, directory)
      )
    )
  ).flat();

  return Array.from(new Set([...rootFiles, ...directoryFiles])).sort(
    (left, right) => left.localeCompare(right)
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

    if (entry.isFile() && hasReviewedExtension(entry.name)) {
      files.push(relativePath);
    }
  }

  return files;
}

function isTokenSourcePath(file: string): boolean {
  const normalized = normalizePath(file).toLowerCase();
  const name = basename(normalized);

  return (
    normalized.includes('/tokens/') ||
    normalized.includes('/design-tokens/') ||
    name === 'tokens.css' ||
    name === 'design-tokens.json' ||
    name.endsWith('.tokens.json') ||
    name.endsWith('.tokens.css')
  );
}

function hasReviewedExtension(fileName: string): boolean {
  const normalized = fileName.toLowerCase();

  return REVIEWED_FILE_EXTENSIONS.some((extension) =>
    normalized.endsWith(extension)
  );
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch (error) {
    if (isMissingPathError(error)) {
      return false;
    }

    throw error;
  }
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

function createColorDiagnostic(input: {
  readonly file: string;
  readonly path: string;
  readonly message: string;
}): Diagnostic {
  return {
    ruleId: COLOR_RULE_ID,
    severity: 'error',
    file: input.file,
    path: input.path,
    message: input.message
  };
}

function normalizePath(file: string): string {
  return file.replace(/\\/g, '/');
}

function isMissingPathError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as { readonly code?: unknown }).code === 'ENOENT'
  );
}
