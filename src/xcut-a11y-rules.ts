import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Diagnostic } from './diagnostics.ts';

const A11Y_RULE_ID = 'ZDP-XCUT-A11Y-001';

const ROOT_A11Y_CONTRACT_FILES = [
  'service.yaml',
  'service.yml',
  'product-spec.md',
  'a11y-contract.yaml',
  'a11y-contract.yml',
  'accessibility-contract.yaml',
  'accessibility-contract.yml'
] as const;

const A11Y_CONTRACT_DIRECTORIES = [
  'app',
  'components',
  'contracts',
  'routes',
  'schemas',
  'src/components',
  'src/lib/components',
  'src/pages',
  'src/routes'
] as const;

const REVIEWED_FILE_EXTENSIONS = [
  '.astro',
  '.css',
  '.html',
  '.js',
  '.jsx',
  '.json',
  '.md',
  '.svelte',
  '.ts',
  '.tsx',
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

const STATEFUL_UI_PATTERN =
  /\b(?:fetch|load\s*\(|async|Promise|form|table|grid|list|search|filter|pagination|providers|items|records|results|EmptyState|Skeleton|StatusToast|Progress)\b|<#?form\b|{#each\b/i;
const STATIC_CONTENT_ONLY_PATTERN =
  /\b(?:static public surface|static content|static astro copy|no datastore|does not implement product UI|minimal route skeleton|정적)\b/i;
const LOADING_STATE_PATTERN =
  /\b(?:loading|loaded|skeleton|spinner|progress|pending|submitting|aria-busy|busy|fallback|로딩)\b/i;
const EMPTY_STATE_PATTERN =
  /\b(?:empty|empty state|no records|no results|not found|zero results|provider list empty|fallback_paths|빈 상태|비어)\b/i;
const ERROR_STATE_PATTERN =
  /\b(?:error|invalid|alert|failure|failed|request_id|request id|retriable|retry|status|오류|에러|실패)\b/i;
const DATA_STATE_PATTERN =
  /\b(?:data state|data-ready|ready|success|content|records|results|items|loaded|provider|screen content|데이터)\b/i;
const A11Y_WIRING_PATTERN =
  /\b(?:accessibility|a11y|aria-|ariaLabel|aria-label|aria-labelledby|aria-describedby|role=|keyboard|focus|focus ring|label|describedby|prefers-reduced-motion|reduced motion|accessible name|접근성|키보드)\b/i;

const INPUT_TAG_PATTERN = /<input\b[^>]*>/g;
const BUTTON_BLOCK_PATTERN = /<button\b[\s\S]*?<\/button>/gi;
const CLICKABLE_NON_INTERACTIVE_TAG_PATTERN =
  /<(?:div|span|p|li|section|article)\b(?=[^>]*(?:onclick|on:click|onClick)\b)(?![^>]*\brole=)(?![^>]*\btabindex=)(?![^>]*(?:onkeydown|on:keydown|onKeyDown)\b)[^>]*>/gi;

export async function validateRepositoryA11yContract(input: {
  readonly repositoryRoot: string;
  readonly repositoryServiceContract: unknown;
}): Promise<readonly Diagnostic[]> {
  const files = await collectA11yContractFiles(input.repositoryRoot);

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
  const diagnostics: Diagnostic[] = [];
  const userFacingRepository = isUserFacingRepositoryContract(
    input.repositoryServiceContract
  );

  if (userFacingRepository) {
    diagnostics.push(
      ...validateScreenStateContract({
        sources,
        combinedSource
      })
    );
  }

  if (!userFacingRepository) {
    return diagnostics;
  }

  for (const { file, source } of sources) {
    diagnostics.push(...validateNativeInputLabels(file, source));
    diagnostics.push(...validateIconOnlyButtons(file, source));
    diagnostics.push(...validateClickableNonInteractiveElements(file, source));
  }

  return diagnostics;
}

function validateScreenStateContract(input: {
  readonly sources: readonly { readonly file: string; readonly source: string }[];
  readonly combinedSource: string;
}): readonly Diagnostic[] {
  const statefulSurface = input.sources.find(({ source }) =>
    declaresStatefulUiSurface(source)
  );

  if (statefulSurface === undefined) {
    return [];
  }

  if (STATIC_CONTENT_ONLY_PATTERN.test(input.combinedSource)) {
    return [];
  }

  if (
    LOADING_STATE_PATTERN.test(input.combinedSource) &&
    EMPTY_STATE_PATTERN.test(input.combinedSource) &&
    ERROR_STATE_PATTERN.test(input.combinedSource) &&
    DATA_STATE_PATTERN.test(input.combinedSource) &&
    A11Y_WIRING_PATTERN.test(input.combinedSource)
  ) {
    return [];
  }

  return [
    createA11yDiagnostic({
      file: statefulSurface.file,
      path: 'a11y.screen_states',
      message:
        'Stateful user-facing UI surfaces must declare loading, empty, error, and data states plus basic accessibility wiring evidence.'
    })
  ];
}

function validateNativeInputLabels(
  file: string,
  source: string
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const tag of source.matchAll(INPUT_TAG_PATTERN)) {
    if (
      isHiddenOrNonTextInput(tag[0]) ||
      hasAccessibleName(tag[0]) ||
      isInsideLabel(source, tag.index)
    ) {
      continue;
    }

    const id = readAttribute(tag[0], 'id');
    if (id !== null && hasLabelForId(source, id)) {
      continue;
    }

    diagnostics.push(
      createA11yDiagnostic({
        file,
        path: 'a11y.input_label',
        message:
          'Visible native inputs must have a label, aria-label, or aria-labelledby connection.'
      })
    );
    break;
  }

  return diagnostics;
}

function validateIconOnlyButtons(
  file: string,
  source: string
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const block of source.matchAll(BUTTON_BLOCK_PATTERN)) {
    if (!containsOnlyHiddenIcon(block[0]) || hasAccessibleName(block[0])) {
      continue;
    }

    diagnostics.push(
      createA11yDiagnostic({
        file,
        path: 'a11y.icon_button_name',
        message:
          'Icon-only native buttons must provide an accessible name with aria-label, aria-labelledby, or visible text.'
      })
    );
    break;
  }

  return diagnostics;
}

function validateClickableNonInteractiveElements(
  file: string,
  source: string
): readonly Diagnostic[] {
  if (!CLICKABLE_NON_INTERACTIVE_TAG_PATTERN.test(source)) {
    return [];
  }

  return [
    createA11yDiagnostic({
      file,
      path: 'a11y.clickable_semantics',
      message:
        'Clickable non-interactive elements must declare keyboard semantics with role, tabindex, and key handling, or use a native button/link.'
    })
  ];
}

function declaresStatefulUiSurface(source: string): boolean {
  return source.split(/\r?\n/).some((line) => {
    const trimmed = line.trim();

    if (trimmed.length === 0 || trimmed.startsWith('#')) {
      return false;
    }

    return STATEFUL_UI_PATTERN.test(trimmed);
  });
}

async function collectA11yContractFiles(
  repositoryRoot: string
): Promise<readonly string[]> {
  const rootFiles = (
    await Promise.all(
      ROOT_A11Y_CONTRACT_FILES.map(async (file) =>
        (await isFile(join(repositoryRoot, file))) ? [file] : []
      )
    )
  ).flat();
  const directoryFiles = (
    await Promise.all(
      A11Y_CONTRACT_DIRECTORIES.map((directory) =>
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

function isHiddenOrNonTextInput(tag: string): boolean {
  const type = readAttribute(tag, 'type')?.toLowerCase();

  return (
    type === 'hidden' ||
    type === 'button' ||
    type === 'submit' ||
    type === 'reset' ||
    type === 'image'
  );
}

function hasAccessibleName(source: string): boolean {
  return /\b(?:aria-label|aria-labelledby|ariaLabel|labelledBy|labelledby)=/i.test(
    source
  );
}

function hasLabelForId(source: string, id: string): boolean {
  const escapedId = escapeRegExp(id);
  const staticLabelPattern = new RegExp(
    `<label\\b[^>]*\\bfor=["']${escapedId}["'][^>]*>`,
    'i'
  );

  return (
    staticLabelPattern.test(source) ||
    /\b<Label\b[^>]*\bforId=\{?id\}?/i.test(source) ||
    /\b<Label\b[^>]*\bfor=\{?id\}?/i.test(source)
  );
}

function containsOnlyHiddenIcon(block: string): boolean {
  const withoutScript = block.replace(/<script[\s\S]*?<\/script>/gi, '');
  const visibleText = withoutScript
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\{#[\s\S]*?\}/g, '')
    .replace(/\{:[\s\S]*?\}/g, '')
    .replace(/\{\/[\s\S]*?\}/g, '')
    .replace(/\{[^}]+\}/g, 'text')
    .trim();

  return /<svg\b/i.test(block) && visibleText.length === 0;
}

function isInsideLabel(source: string, index: number): boolean {
  const before = source.slice(0, index);
  const lastOpenLabel = before.lastIndexOf('<label');
  const lastCloseLabel = before.lastIndexOf('</label>');

  return lastOpenLabel > lastCloseLabel;
}

function readAttribute(tag: string, name: string): string | null {
  const match = tag.match(
    new RegExp(`\\b${escapeRegExp(name)}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i')
  );

  return match?.[1] ?? match?.[2] ?? null;
}

function isUserFacingRepositoryContract(value: unknown): boolean {
  return readBooleanAtPath(value, ['domain', 'user_facing']) === true;
}

function readBooleanAtPath(
  value: unknown,
  path: readonly string[]
): boolean | null {
  const candidate = readValueAtPath(value, path);

  return typeof candidate === 'boolean' ? candidate : null;
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

function createA11yDiagnostic(input: {
  readonly file: string;
  readonly path: string;
  readonly message: string;
}): Diagnostic {
  return {
    ruleId: A11Y_RULE_ID,
    severity: 'error',
    file: input.file,
    path: input.path,
    message: input.message
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
