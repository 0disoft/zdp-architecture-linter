import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Diagnostic } from './diagnostics.ts';

const FEED_RULE_ID = 'ZDP-XCUT-FEED-001';

const ROOT_FEED_CONTRACT_FILES = [
  'service.yaml',
  'service.yml',
  'product-spec.md',
  'webpub.toml',
  'feed.xml',
  'rss.xml',
  'atom.xml',
  'feed.json'
] as const;

const FEED_CONTRACT_DIRECTORIES = [
  'api',
  'app',
  'contracts',
  'functions',
  'public',
  'routes',
  'schemas',
  'src/pages',
  'src/routes',
  'static'
] as const;

const REVIEWED_FILE_EXTENSIONS = [
  '.xml',
  '.json',
  '.toml',
  '.yaml',
  '.yml',
  '.md',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.astro'
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

const FEED_PATH_PATTERN =
  /(?:^|\/)(?:rss|atom|feed)(?:[./-]|$)|(?:rss|atom|feed)\.(?:xml|json)(?:\/|$)|\+server\.(?:ts|tsx|js|jsx)$/i;
const RUNTIME_FEED_DECLARATION_PATTERN =
  /\b(?:rss|atom|json feed|feed)\b.*\b(?:runtime|worker|server|dynamic|request-time|per-request|database|db)\b|\b(?:runtime|worker|server|dynamic|request-time|per-request|database|db)\b.*\b(?:rss|atom|json feed|feed)\b/i;
const STATIC_FEED_MARKER_PATTERN =
  /\b(?:static|build-time|prebuilt|pre-rendered|prerendered|generated at build|정적|빌드 타임)\b/i;
const FORBIDDEN_CONTEXT_PATTERN =
  /\b(?:forbidden|not allowed|must not|prohibit(?:ed)?|reject(?:ed)?|ban(?:ned)?|금지|허용하지|허용 안|차단)\b/i;
const STATIC_DEFAULT_CONTEXT_PATTERN =
  /\b(?:must be generated as static|generated as static build artifacts|runtime feed generation is not the default|runtime feed generation is not allowed|not runtime generated|default feeds? (?:must|should) be static)\b/i;
const PRERENDER_TRUE_PATTERN = /\bprerender\s*=\s*true\b/i;
const PRERENDER_FALSE_PATTERN = /\bprerender\s*=\s*false\b/i;
const RUNTIME_PATH_PATTERN =
  /(?:^|\/)(?:api|functions|routes|src\/routes)\/|\/\+server\.(?:ts|tsx|js|jsx)$/i;
const EXCEPTION_REASON_PATTERN =
  /\b(?:runtime feed exception|feed runtime exception|exception_reason|exception reason|personalized feed|permission feed|authorized feed|per-user feed|near-real-time feed|초단위|권한 피드|개인화 피드)\b/i;
const COST_POLICY_PATTERN =
  /\b(?:feed[_ -]?cost|cost policy|cost budget|worker cpu|cpu budget|request budget|monthly_budget|비용)\b/i;
const CACHE_POLICY_PATTERN =
  /\b(?:feed[_ -]?cache|cache policy|cache-control|ttl|revalidate|max-age|stale-while-revalidate|캐시)\b/i;

export async function validateRepositoryFeedContract(input: {
  readonly repositoryRoot: string;
  readonly repositoryServiceContract: unknown;
}): Promise<readonly Diagnostic[]> {
  const files = await collectFeedContractFiles(input.repositoryRoot);

  if (files.length === 0) {
    return [];
  }

  const sources = await Promise.all(
    files.map(async (file) => ({
      file,
      source: await readFile(join(input.repositoryRoot, file), 'utf8')
    }))
  );
  const combinedSource = sources.map(({ source }) => source).join('\n');
  const runtimeFeedSurfaces = sources.filter(({ file, source }) =>
    declaresRuntimeFeedSurface(file, source)
  );

  if (runtimeFeedSurfaces.length === 0) {
    return [];
  }

  if (hasRuntimeFeedExceptionContract(combinedSource)) {
    return [];
  }

  return runtimeFeedSurfaces.map(({ file }) =>
    createFeedDiagnostic({
      file,
      path: 'feed.runtime_generation',
      message:
        'Runtime RSS/Atom/JSON Feed generation must declare an exception reason plus feed cost and cache policy in the service contract; default feeds must be static build-time artifacts.'
    })
  );
}

function declaresRuntimeFeedSurface(file: string, source: string): boolean {
  if (!isFeedSurfacePath(file)) {
    return declaresRuntimeFeedContract(source);
  }

  if (isStaticFeedArtifactPath(file)) {
    return false;
  }

  if (PRERENDER_TRUE_PATTERN.test(source) || STATIC_FEED_MARKER_PATTERN.test(source)) {
    return false;
  }

  if (PRERENDER_FALSE_PATTERN.test(source) || RUNTIME_PATH_PATTERN.test(file)) {
    return true;
  }

  return declaresRuntimeFeedContract(source);
}

function declaresRuntimeFeedContract(source: string): boolean {
  return source.split(/\r?\n/).some((line) => {
    if (
      line.trim().length === 0 ||
      FORBIDDEN_CONTEXT_PATTERN.test(line) ||
      STATIC_DEFAULT_CONTEXT_PATTERN.test(line)
    ) {
      return false;
    }

    return RUNTIME_FEED_DECLARATION_PATTERN.test(line);
  });
}

function hasRuntimeFeedExceptionContract(source: string): boolean {
  return (
    EXCEPTION_REASON_PATTERN.test(source) &&
    COST_POLICY_PATTERN.test(source) &&
    CACHE_POLICY_PATTERN.test(source)
  );
}

function isFeedSurfacePath(file: string): boolean {
  return FEED_PATH_PATTERN.test(normalizePath(file));
}

function isStaticFeedArtifactPath(file: string): boolean {
  const normalized = normalizePath(file);

  return /^(?:public|static)\//i.test(normalized) &&
    /\.(?:xml|json)$/i.test(normalized);
}

async function collectFeedContractFiles(
  repositoryRoot: string
): Promise<readonly string[]> {
  const rootFiles = (
    await Promise.all(
      ROOT_FEED_CONTRACT_FILES.map(async (file) =>
        (await isFile(join(repositoryRoot, file))) ? [file] : []
      )
    )
  ).flat();
  const directoryFiles = (
    await Promise.all(
      FEED_CONTRACT_DIRECTORIES.map((directory) =>
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

    if (
      entry.isFile() &&
      hasReviewedExtension(entry.name) &&
      isFeedSurfacePath(relativePath)
    ) {
      files.push(relativePath);
    }
  }

  return files;
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

function createFeedDiagnostic(input: {
  readonly file: string;
  readonly path: string;
  readonly message: string;
}): Diagnostic {
  return {
    ruleId: FEED_RULE_ID,
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
