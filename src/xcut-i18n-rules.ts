import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Diagnostic } from './diagnostics.ts';

const MESSAGE_KEY_RULE_ID = 'ZDP-XCUT-I18N-001';
const ACTIVE_LOCALE_RULE_ID = 'ZDP-XCUT-I18N-002';

const ROOT_I18N_CONTRACT_FILES = [
  'service.yaml',
  'service.yml',
  'product-spec.md',
  'i18n-contract.yaml',
  'i18n-contract.yml',
  'localization-contract.yaml',
  'localization-contract.yml'
] as const;

const I18N_CONTRACT_DIRECTORIES = [
  'contracts',
  'schemas',
  'messages',
  'locales',
  'src/messages'
] as const;

const REVIEWED_FILE_EXTENSIONS = [
  '.yaml',
  '.yml',
  '.json',
  '.md',
  '.ts',
  '.tsx'
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

const MESSAGE_KEY_CONTRACT_PATTERN =
  /\b(?:message[_ -]?keys?|message key contract|i18n contract|localization catalog|check:localization|@zdp\/i18n-contract|platform-localization|zdp-platform-localization)\b/i;
const ACTIVE_LOCALE_DECLARATION_PATTERN =
  /\b(?:active[_ -]?locales?|locales\.active|active locale)\b/i;
const ZERO_FALLBACK_PROOF_PATTERN =
  /\b(?:production[_ -]?fallback[_ -]?messages?\s*:\s*0|production fallback (?:message )?0|fallback messages are not allowed|zero production fallback|zero[_ -]?fallback[_ -]?(?:required|proof)|production fallback count 0)\b/i;
const FORBIDDEN_CONTEXT_PATTERN =
  /\b(?:forbidden|not allowed|must not|prohibit(?:ed)?|reject(?:ed)?|ban(?:ned)?|금지|허용하지|허용 안|차단)\b/i;
const MESSAGE_KEY_CONTEXT_PATTERN =
  /\b(?:message[_ -]?key|messageKey|msg[_ -]?key|translation[_ -]?key|i18n[_ -]?key)\b/i;
const LITERAL_UI_CONTRACT_FIELD_PATTERN =
  /\b(?:button_label|buttonLabel|cta_label|ctaLabel|cta_text|ctaText|tab_label|tabLabel|empty_state|emptyState|loading_text|loadingText|error_text|errorText|placeholder|aria_label|ariaLabel|title|heading|label)\s*:\s*["'`][^"'`]{2,}["'`]/;

export async function validateRepositoryI18nContract(input: {
  readonly repositoryRoot: string;
  readonly repositoryServiceContract: unknown;
}): Promise<readonly Diagnostic[]> {
  const files = await collectI18nContractFiles(input.repositoryRoot);
  const sources = await Promise.all(
    files.map(async (file) => ({
      file,
      source: await readFile(join(input.repositoryRoot, file), 'utf8')
    }))
  );
  const combinedSource = sources.map(({ source }) => source).join('\n');
  const diagnostics: Diagnostic[] = [];

  if (isUserFacingRepositoryContract(input.repositoryServiceContract)) {
    diagnostics.push(
      ...validateUserFacingMessageKeyContract({
        files,
        combinedSource
      })
    );
  }

  for (const { file, source } of sources) {
    diagnostics.push(...validateLiteralUiContractFields(file, source));
  }

  diagnostics.push(
    ...validateActiveLocaleFallbackContract({
      files,
      combinedSource
    })
  );

  return diagnostics;
}

function validateUserFacingMessageKeyContract(input: {
  readonly files: readonly string[];
  readonly combinedSource: string;
}): readonly Diagnostic[] {
  if (MESSAGE_KEY_CONTRACT_PATTERN.test(input.combinedSource)) {
    return [];
  }

  return [
    createI18nDiagnostic({
      ruleId: MESSAGE_KEY_RULE_ID,
      file: input.files.includes('service.yaml') ? 'service.yaml' : 'service.yml',
      path: 'i18n.message_keys_required',
      message:
        'User-facing repositories must declare a message key or localization contract before hardcoded UI copy can ship.'
    })
  ];
}

function validateLiteralUiContractFields(
  file: string,
  source: string
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lines = source.split(/\r?\n/);

  lines.forEach((line, index) => {
    if (
      line.trim().length === 0 ||
      FORBIDDEN_CONTEXT_PATTERN.test(line) ||
      !LITERAL_UI_CONTRACT_FIELD_PATTERN.test(line)
    ) {
      return;
    }

    const nearbySource = lines
      .slice(Math.max(0, index - 2), Math.min(lines.length, index + 3))
      .join('\n');

    if (MESSAGE_KEY_CONTEXT_PATTERN.test(nearbySource)) {
      return;
    }

    diagnostics.push(
      createI18nDiagnostic({
        ruleId: MESSAGE_KEY_RULE_ID,
        file,
        path: `line.${index + 1}`,
        message:
          'User-facing UI copy in contracts must reference a message key instead of a literal label, title, placeholder, or state message.'
      })
    );
  });

  return diagnostics;
}

function validateActiveLocaleFallbackContract(input: {
  readonly files: readonly string[];
  readonly combinedSource: string;
}): readonly Diagnostic[] {
  if (!ACTIVE_LOCALE_DECLARATION_PATTERN.test(input.combinedSource)) {
    return [];
  }

  if (ZERO_FALLBACK_PROOF_PATTERN.test(input.combinedSource)) {
    return [];
  }

  return [
    createI18nDiagnostic({
      ruleId: ACTIVE_LOCALE_RULE_ID,
      file: input.files.includes('service.yaml') ? 'service.yaml' : 'service.yml',
      path: 'i18n.production_fallback_messages',
      message:
        'Active locale declarations must prove production fallback message count is 0 or declare an equivalent zero-fallback proof.'
    })
  ];
}

async function collectI18nContractFiles(
  repositoryRoot: string
): Promise<readonly string[]> {
  const rootFiles = (
    await Promise.all(
      ROOT_I18N_CONTRACT_FILES.map(async (file) =>
        (await isFile(join(repositoryRoot, file))) ? [file] : []
      )
    )
  ).flat();
  const directoryFiles = (
    await Promise.all(
      I18N_CONTRACT_DIRECTORIES.map((directory) =>
        collectFilesFromDirectory(repositoryRoot, directory)
      )
    )
  ).flat();

  return [...rootFiles, ...directoryFiles].sort((left, right) =>
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

function createI18nDiagnostic(input: {
  readonly ruleId: typeof MESSAGE_KEY_RULE_ID | typeof ACTIVE_LOCALE_RULE_ID;
  readonly file: string;
  readonly path: string;
  readonly message: string;
}): Diagnostic {
  return {
    ruleId: input.ruleId,
    severity: 'error',
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
