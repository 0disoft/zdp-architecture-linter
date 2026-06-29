import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Diagnostic } from './diagnostics.ts';

const SECHEADER_RULE_ID = 'ZDP-XCUT-SECHEADER-001';

const ROOT_SECURITY_HEADER_CONTRACT_FILES = [
  'service.yaml',
  'service.yml',
  'product-spec.md',
  'webpub.toml',
  'security-headers-contract.yaml',
  'security-headers-contract.yml',
  'security-header-contract.yaml',
  'security-header-contract.yml'
] as const;

const SECURITY_HEADER_CONTRACT_DIRECTORIES = [
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

const SECURITY_HEADER_SURFACE_PATTERN =
  /\b(?:security headers?|content-security-policy|strict-transport-security|x-content-type-options|referrer-policy|permissions-policy|frame-ancestors|x-frame-options|csp|보안 헤더)\b/i;
const CSP_INLINE_UNSAFE_PATTERN = /'unsafe-(?:inline|eval)'|unsafe-(?:inline|eval)/i;
const CSP_INLINE_EXCEPTION_PATTERN =
  /\b(?:nonce|hash|sha256-|sha384-|sha512-|exception|reviewed exception|inline script reason|테마 초기화|예외)\b/i;

const REQUIRED_HEADER_GROUPS: readonly {
  readonly path: string;
  readonly message: string;
  readonly pattern: RegExp;
}[] = [
  {
    path: 'security_headers.content_security_policy',
    message:
      'Security header contracts must declare Content-Security-Policy for public web, auth UI, and app shell surfaces.',
    pattern: /\bContent-Security-Policy\b|\bCSP\b/i
  },
  {
    path: 'security_headers.strict_transport_security',
    message:
      'Security header contracts must declare Strict-Transport-Security for public web, auth UI, and app shell surfaces.',
    pattern: /\bStrict-Transport-Security\b|\bHSTS\b/i
  },
  {
    path: 'security_headers.x_content_type_options',
    message:
      'Security header contracts must declare X-Content-Type-Options for public web, auth UI, and app shell surfaces.',
    pattern: /\bX-Content-Type-Options\b/i
  },
  {
    path: 'security_headers.referrer_policy',
    message:
      'Security header contracts must declare Referrer-Policy for public web, auth UI, and app shell surfaces.',
    pattern: /\bReferrer-Policy\b/i
  },
  {
    path: 'security_headers.permissions_policy',
    message:
      'Security header contracts must declare Permissions-Policy for public web, auth UI, and app shell surfaces.',
    pattern: /\bPermissions-Policy\b/i
  },
  {
    path: 'security_headers.frame_ancestors',
    message:
      'Security header contracts must declare frame-ancestors or X-Frame-Options for public web, auth UI, and app shell surfaces.',
    pattern: /\bframe-ancestors\b|\bX-Frame-Options\b/i
  }
];

export async function validateRepositorySecurityHeaderContract(input: {
  readonly repositoryRoot: string;
  readonly repositoryServiceContract: unknown;
}): Promise<readonly Diagnostic[]> {
  if (!isSecurityHeaderContractRequired(input.repositoryServiceContract)) {
    return [];
  }

  const files = await collectSecurityHeaderContractFiles(input.repositoryRoot);

  if (files.length === 0) {
    return [
      createSecurityHeaderDiagnostic({
        file: 'service.yaml',
        path: 'security_headers.contract',
        message:
          'Public web, auth UI, and app shell repositories must declare the default security header contract in service.yaml or an equivalent contract.'
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
  const preferredFile = findPreferredContractFile(sources);

  if (!SECURITY_HEADER_SURFACE_PATTERN.test(combinedSource)) {
    return [
      createSecurityHeaderDiagnostic({
        file: preferredFile,
        path: 'security_headers.contract',
        message:
          'Public web, auth UI, and app shell repositories must declare the default security header contract in service.yaml or an equivalent contract.'
      })
    ];
  }

  const diagnostics = REQUIRED_HEADER_GROUPS.flatMap((header) =>
    header.pattern.test(combinedSource)
      ? []
      : [
          createSecurityHeaderDiagnostic({
            file: preferredFile,
            path: header.path,
            message: header.message
          })
        ]
  );

  if (
    CSP_INLINE_UNSAFE_PATTERN.test(combinedSource) &&
    !CSP_INLINE_EXCEPTION_PATTERN.test(combinedSource)
  ) {
    diagnostics.push(
      createSecurityHeaderDiagnostic({
        file: preferredFile,
        path: 'security_headers.csp_inline_exception',
        message:
          'CSP unsafe-inline or unsafe-eval usage must include a nonce, hash, or reviewed exception reason.'
      })
    );
  }

  return diagnostics;
}

function isSecurityHeaderContractRequired(
  repositoryServiceContract: unknown
): boolean {
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

function findPreferredContractFile(
  sources: readonly { readonly file: string; readonly source: string }[]
): string {
  return sources.find(({ file }) => /^service\.ya?ml$/i.test(file))?.file ??
    sources[0]?.file ??
    'service.yaml';
}

async function collectSecurityHeaderContractFiles(
  repositoryRoot: string
): Promise<readonly string[]> {
  const rootFiles = (
    await Promise.all(
      ROOT_SECURITY_HEADER_CONTRACT_FILES.map(async (file) =>
        (await isFile(join(repositoryRoot, file))) ? [file] : []
      )
    )
  ).flat();
  const directoryFiles = (
    await Promise.all(
      SECURITY_HEADER_CONTRACT_DIRECTORIES.map((directory) =>
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

function createSecurityHeaderDiagnostic(input: {
  readonly file: string;
  readonly path: string;
  readonly message: string;
}): Diagnostic {
  return {
    ruleId: SECHEADER_RULE_ID,
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
