import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { Diagnostic } from './diagnostics.ts';

const ERROR_ENVELOPE_RULE_ID = 'ZDP-XCUT-ERROR-001';

const ROOT_ERROR_CONTRACT_FILES = [
  'service.yaml',
  'service.yml',
  'product-spec.md',
  'openapi.json',
  'openapi.yaml',
  'openapi.yml',
  'swagger.json',
  'swagger.yaml',
  'swagger.yml'
] as const;

const ERROR_CONTRACT_DIRECTORIES = ['contracts', 'schemas'] as const;
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

const PUBLIC_API_EXPOSURES = new Set(['public', 'partner']);

const ERROR_CONTRACT_MARKER_PATTERN =
  /\b(?:error_envelope|error_response|error response|error schema|error object|standard error|api error|errors)\b/i;
const OPENAPI_ERROR_RESPONSE_PATTERN =
  /\b(?:responses|components|openapi|swagger)\b[\s\S]*\b(?:default|4\d\d|5\d\d)\b[\s\S]*\berror\b/i;
const ERROR_PROPERTY_PATTERN = /(^|[{\s,])["']?error["']?\s*:/im;
const RAW_STRING_ERROR_PATTERN = /(^|[{\s,])["']?error["']?\s*:\s*["'`]/im;
const MESSAGE_ONLY_OBJECT_PATTERN =
  /(^|[{\s,])["']?message["']?\s*:\s*["'`][^"'`]+["'`]\s*[,}]/im;
const FORBIDDEN_CONTEXT_PATTERN =
  /\b(?:forbidden|not allowed|must not|prohibit(?:ed)?|reject(?:ed)?|ban(?:ned)?|금지|허용하지|허용 안|차단)\b/i;

const ERROR_WRAPPER_PATTERN =
  /\berror_envelope\b|(^|[{\s,])["']?error["']?\s*:/im;
const ERROR_CODE_PATTERN = /\berror\.code\b|(^|[\s{,["'-])code($|[\s:,\]}"'-])/im;
const ERROR_MESSAGE_PATTERN =
  /\berror\.message\b|(^|[\s{,["'-])message($|[\s:,\]}"'-])/im;
const ERROR_REQUEST_ID_PATTERN =
  /\berror\.request_id\b|\brequest_id\b|\bx-request-id\b/i;

export async function validateRepositoryErrorEnvelopeContract(input: {
  readonly repositoryRoot: string;
  readonly repositoryServiceContract: unknown;
}): Promise<readonly Diagnostic[]> {
  const repositoryDeclaresPublicApi = isPublicApiRepositoryContract(
    input.repositoryServiceContract
  );
  const files = await collectErrorContractFiles(input.repositoryRoot);
  const diagnostics: Diagnostic[] = [];

  for (const file of files) {
    const source = await readFile(join(input.repositoryRoot, file), 'utf8');
    diagnostics.push(
      ...validateErrorContractSource({
        file,
        source,
        repositoryDeclaresPublicApi
      })
    );
  }

  return diagnostics;
}

function validateErrorContractSource(input: {
  readonly file: string;
  readonly source: string;
  readonly repositoryDeclaresPublicApi: boolean;
}): readonly Diagnostic[] {
  const declaresErrorContract = declaresPublicApiErrorContract(
    input.file,
    input.source
  );

  if (!input.repositoryDeclaresPublicApi && !declaresErrorContract) {
    return [];
  }

  if (!declaresErrorContract && !isRootServiceContract(input.file)) {
    return [];
  }

  const diagnostics: Diagnostic[] = [
    ...validateRawStringErrors(input.file, input.source)
  ];

  if (
    MESSAGE_ONLY_OBJECT_PATTERN.test(input.source) &&
    !ERROR_WRAPPER_PATTERN.test(input.source)
  ) {
    diagnostics.push(
      createErrorEnvelopeDiagnostic({
        file: input.file,
        path: 'error_envelope.wrapper',
        message:
          'Public API error responses must use an `error` envelope instead of a top-level message-only object.'
      })
    );
  }

  const missingFields = readMissingEnvelopeFields(input.source);

  if (missingFields.length > 0) {
    diagnostics.push(
      createErrorEnvelopeDiagnostic({
        file: input.file,
        path: 'error_envelope.required_fields',
        message: `Public API error envelopes must declare an error object with ${missingFields.join(
          ', '
        )}.`
      })
    );
  }

  return diagnostics;
}

function validateRawStringErrors(
  file: string,
  source: string
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lines = source.split(/\r?\n/);

  lines.forEach((line, index) => {
    if (line.trim().length === 0 || FORBIDDEN_CONTEXT_PATTERN.test(line)) {
      return;
    }

    if (RAW_STRING_ERROR_PATTERN.test(line)) {
      diagnostics.push(
        createErrorEnvelopeDiagnostic({
          file,
          path: `line.${index + 1}`,
          message:
            'Public API error responses must not expose raw string `error` values; use an envelope with `code`, `message`, and `request_id`.'
        })
      );
    }
  });

  return diagnostics;
}

function readMissingEnvelopeFields(source: string): readonly string[] {
  const missingFields: string[] = [];

  if (!ERROR_WRAPPER_PATTERN.test(source)) {
    missingFields.push('`error`');
  }

  if (!ERROR_CODE_PATTERN.test(source)) {
    missingFields.push('`code`');
  }

  if (!ERROR_MESSAGE_PATTERN.test(source)) {
    missingFields.push('`message`');
  }

  if (!ERROR_REQUEST_ID_PATTERN.test(source)) {
    missingFields.push('`request_id`');
  }

  return missingFields;
}

function declaresPublicApiErrorContract(file: string, source: string): boolean {
  if (isErrorContractFileName(file)) {
    return true;
  }

  return (
    ERROR_CONTRACT_MARKER_PATTERN.test(source) ||
    ERROR_PROPERTY_PATTERN.test(source) ||
    OPENAPI_ERROR_RESPONSE_PATTERN.test(source)
  );
}

function isErrorContractFileName(file: string): boolean {
  const normalized = basename(file).toLowerCase();

  return (
    normalized.includes('error') ||
    normalized === 'openapi.json' ||
    normalized === 'openapi.yaml' ||
    normalized === 'openapi.yml' ||
    normalized === 'swagger.json' ||
    normalized === 'swagger.yaml' ||
    normalized === 'swagger.yml'
  );
}

function isRootServiceContract(file: string): boolean {
  return file === 'service.yaml' || file === 'service.yml';
}

async function collectErrorContractFiles(
  repositoryRoot: string
): Promise<readonly string[]> {
  const rootFiles = (
    await Promise.all(
      ROOT_ERROR_CONTRACT_FILES.map(async (file) =>
        (await isFile(join(repositoryRoot, file))) ? [file] : []
      )
    )
  ).flat();
  const directoryFiles = (
    await Promise.all(
      ERROR_CONTRACT_DIRECTORIES.map((directory) =>
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

function isPublicApiRepositoryContract(value: unknown): boolean {
  return (
    readBooleanAtPath(value, ['domain', 'public_api']) === true ||
    PUBLIC_API_EXPOSURES.has(readStringAtPath(value, ['api', 'exposure']) ?? '')
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

  return typeof candidate === 'string' && candidate.trim().length > 0
    ? candidate.trim()
    : null;
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

function createErrorEnvelopeDiagnostic(input: {
  readonly file: string;
  readonly path: string;
  readonly message: string;
}): Diagnostic {
  return {
    ruleId: ERROR_ENVELOPE_RULE_ID,
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
