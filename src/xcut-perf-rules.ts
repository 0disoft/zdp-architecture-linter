import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Diagnostic } from './diagnostics.ts';

const PERF_RULE_ID = 'ZDP-XCUT-PERF-001';

const ROOT_PERFORMANCE_CONTRACT_FILES = [
  'service.yaml',
  'service.yml',
  'product-spec.md',
  'performance-contract.yaml',
  'performance-contract.yml',
  'web-performance-contract.yaml',
  'web-performance-contract.yml'
] as const;

const PERFORMANCE_CONTRACT_DIRECTORIES = [
  'contracts',
  'schemas'
] as const;

const REVIEWED_FILE_EXTENSIONS = [
  '.json',
  '.md',
  '.toml',
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

const PERFORMANCE_SURFACE_PATTERN =
  /\b(?:performance|perf|core web vitals|web vitals|lcp|inp|cls|ttfb|fcp|initial js|javascript budget|js gzip|bundle budget|asset budget|latency|p95|bundle analy[sz]e|storybook(?: static)? build|bun run build|bun run check|성능|측정)\b/i;
const PERFORMANCE_BUDGET_PATTERN =
  /\b(?:performance budget|perf budget|core web vitals|web vitals|lcp|largest contentful paint|inp|interaction to next paint|cls|cumulative layout shift|ttfb|fcp|initial js gzip|js gzip|javascript budget|bundle budget|asset budget|max[_ -]?(?:js|css|asset|bundle)|latency_p95|p95_ms|성능 예산)\b/i;
const MEASUREMENT_METHOD_PATTERN =
  /\b(?:measurement method|measure(?:ment|d)?|lighthouse|webpagetest|page speed|pagespeed|core web vitals|web vitals|rum|real user monitoring|crux|bundle analy[sz]e|bundle_analy[sz]e|storybook(?: static)? build|bun run build|bun run check|ci gate|synthetic|field data|측정 방법|측정)\b/i;

export async function validateRepositoryPerformanceContract(input: {
  readonly repositoryRoot: string;
  readonly repositoryServiceContract: unknown;
}): Promise<readonly Diagnostic[]> {
  if (!isPerformanceContractRequired(input.repositoryServiceContract)) {
    return [];
  }

  const files = await collectPerformanceContractFiles(input.repositoryRoot);

  if (files.length === 0) {
    return [
      createPerformanceDiagnostic({
        file: 'service.yaml',
        path: 'performance.contract',
        message:
          'User-facing web, auth UI, and app shell repositories must declare a performance budget and measurement method in service.yaml or an equivalent contract.'
      })
    ];
  }

  const sources = await Promise.all(
    files.map(async (file) => ({
      file,
      source: await readFile(join(input.repositoryRoot, file), 'utf8')
    }))
  );
  const combinedSource = sources.map(({ source }) => source).join('\n');

  if (!declaresPerformanceSurface(combinedSource)) {
    return [
      createPerformanceDiagnostic({
        file: findPreferredContractFile(sources),
        path: 'performance.contract',
        message:
          'User-facing web, auth UI, and app shell repositories must declare a performance budget and measurement method in service.yaml or an equivalent contract.'
      })
    ];
  }

  const diagnostics: Diagnostic[] = [];

  if (!hasPerformanceBudget(input.repositoryServiceContract, combinedSource)) {
    diagnostics.push(
      createPerformanceDiagnostic({
        file: findPreferredContractFile(sources),
        path: 'performance.budget',
        message:
          'Performance contracts must name the budget being protected, such as LCP, INP, CLS, initial JS gzip, bundle budget, asset budget, or p95 latency.'
      })
    );
  }

  if (!MEASUREMENT_METHOD_PATTERN.test(combinedSource)) {
    diagnostics.push(
      createPerformanceDiagnostic({
        file: findPreferredContractFile(sources),
        path: 'performance.measurement',
        message:
          'Performance contracts must name the measurement method, such as Lighthouse, WebPageTest, Core Web Vitals/RUM, bundle analyze, or a CI build/check gate.'
      })
    );
  }

  return diagnostics;
}

function isPerformanceContractRequired(repositoryServiceContract: unknown): boolean {
  if (readBooleanAtPath(repositoryServiceContract, ['domain', 'user_facing']) !== true) {
    return false;
  }

  const runtimeFramework = readStringAtPath(repositoryServiceContract, [
    'runtime',
    'framework'
  ]);
  const runtimeCore = readStringAtPath(repositoryServiceContract, ['runtime', 'core']);
  const runtimeEdge = readStringAtPath(repositoryServiceContract, ['runtime', 'edge']);
  const serviceId = readStringAtPath(repositoryServiceContract, ['service', 'id']);

  return [runtimeFramework, runtimeCore, runtimeEdge, serviceId]
    .filter((value): value is string => value !== null)
    .some((value) =>
      /\b(?:astro|svelte|sveltekit|auth-ui|app-shell|cloudflare|static-assets|web|console|admin)\b/i.test(
        value
      )
    );
}

function declaresPerformanceSurface(source: string): boolean {
  return PERFORMANCE_SURFACE_PATTERN.test(source);
}

function hasPerformanceBudget(
  repositoryServiceContract: unknown,
  source: string
): boolean {
  return (
    PERFORMANCE_BUDGET_PATTERN.test(source) ||
    readNumberAtPath(repositoryServiceContract, ['reliability', 'slo_latency_p95_ms']) !==
      null
  );
}

function findPreferredContractFile(
  sources: readonly { readonly file: string; readonly source: string }[]
): string {
  return sources.find(({ file }) => /^service\.ya?ml$/i.test(file))?.file ??
    sources[0]?.file ??
    'service.yaml';
}

async function collectPerformanceContractFiles(
  repositoryRoot: string
): Promise<readonly string[]> {
  const rootFiles = (
    await Promise.all(
      ROOT_PERFORMANCE_CONTRACT_FILES.map(async (file) =>
        (await isFile(join(repositoryRoot, file))) ? [file] : []
      )
    )
  ).flat();
  const directoryFiles = (
    await Promise.all(
      PERFORMANCE_CONTRACT_DIRECTORIES.map((directory) =>
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

function hasReviewedExtension(fileName: string): boolean {
  const normalized = fileName.toLowerCase();

  return REVIEWED_FILE_EXTENSIONS.some((extension) =>
    normalized.endsWith(extension)
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

function readNumberAtPath(
  value: unknown,
  path: readonly string[]
): number | null {
  const candidate = readValueAtPath(value, path);

  return typeof candidate === 'number' ? candidate : null;
}

function readValueAtPath(value: unknown, path: readonly string[]): unknown {
  return path.reduce<unknown>((current, segment) => {
    if (!isRecord(current)) {
      return undefined;
    }

    return current[segment];
  }, value);
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

function createPerformanceDiagnostic(input: {
  readonly file: string;
  readonly path: string;
  readonly message: string;
}): Diagnostic {
  return {
    ruleId: PERF_RULE_ID,
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
