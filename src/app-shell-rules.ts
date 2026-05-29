import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { parse } from 'yaml';
import type { Diagnostic } from './diagnostics.ts';

const APP_SHELL_REPOSITORY_NAME = 'zdp-web-apps';
const APP_SHELL_RULE_ID = 'ZDP-APP-001';

const APP_SHELL_CONTRACT_FILE = 'contracts/app-shell.yaml';

const REQUIRED_FILES = [
  APP_SHELL_CONTRACT_FILE,
  'scripts/check-app-shell.ts',
  'src/lib/app-shell.ts',
  'src/lib/server/app-shell.ts',
  'src/routes/+layout.svelte',
  'src/routes/+page.svelte',
  'src/routes/console/+page.svelte',
  'src/routes/admin/+page.svelte',
  'src/routes/healthz/+server.ts',
  'src/routes/readyz/+server.ts'
] as const;

const REQUIRED_ENVIRONMENT = ['ZDP_CORE_API_BASE_URL'] as const;
const REQUIRED_READINESS_ROUTES = ['/healthz', '/readyz'] as const;
const REQUIRED_ALLOWED_UPSTREAMS = ['core-api'] as const;
const REQUIRED_FORBIDDEN_CONTRACTS = [
  'direct_database_reads',
  'final_authorization_in_ui',
  'refresh_token_storage'
] as const;

const REQUIRED_SURFACES = [
  { id: 'console', route: '/console', call: 'core-api' },
  { id: 'admin', route: '/admin', call: 'core-api' }
] as const;

const FORBIDDEN_SOURCE_PATTERNS = [
  { pattern: /\bDATABASE_URL\b/, label: 'DATABASE_URL' },
  { pattern: /\bpostgres(?:ql)?\b/i, label: 'postgres' },
  { pattern: /\bprisma\b/i, label: 'prisma' },
  { pattern: /\bdrizzle\b/i, label: 'drizzle' },
  { pattern: /\bsupabase\b/i, label: 'supabase' },
  { pattern: /\brefresh[_-]?token\b/i, label: 'refresh_token' },
  { pattern: /\bfinal[_-]?authorization\b/i, label: 'final_authorization' },
  { pattern: /from\s+['"]pg['"]/, label: "from 'pg'" },
  { pattern: /from\s+['"]@prisma\//, label: "from '@prisma/'" },
  { pattern: /from\s+['"]drizzle-orm/, label: "from 'drizzle-orm'" }
] as const;

const SOURCE_EXTENSIONS = new Set(['.js', '.ts', '.svelte']);

export async function validateRepositoryAppShellContract(input: {
  readonly repositoryRoot: string | undefined;
  readonly repositoryServiceContract: unknown;
}): Promise<readonly Diagnostic[]> {
  if (
    input.repositoryRoot === undefined ||
    readRepositoryName(input.repositoryServiceContract) !== APP_SHELL_REPOSITORY_NAME
  ) {
    return [];
  }

  const diagnostics: Diagnostic[] = [];

  for (const file of REQUIRED_FILES) {
    diagnostics.push(...(await validateRequiredFile(input.repositoryRoot, file)));
  }

  const contract = await readRequiredYamlContract(
    input.repositoryRoot,
    APP_SHELL_CONTRACT_FILE
  );

  diagnostics.push(...contract.diagnostics);

  if (contract.value !== null) {
    diagnostics.push(...validateAppShellContract(contract.value));
  }

  diagnostics.push(...(await validateSourceBoundaries(input.repositoryRoot)));

  return diagnostics;
}

async function validateRequiredFile(
  repositoryRoot: string,
  file: string
): Promise<readonly Diagnostic[]> {
  try {
    const info = await stat(join(repositoryRoot, file));

    if (info.isFile()) {
      return [];
    }
  } catch (error) {
    if (!isMissingPathError(error)) {
      throw error;
    }
  }

  return [
    createAppShellDiagnostic(
      file,
      'repository.root',
      `App shell repository must include \`${file}\`.`
    )
  ];
}

async function readRequiredYamlContract(
  repositoryRoot: string,
  file: string
): Promise<{
  readonly value: unknown | null;
  readonly diagnostics: readonly Diagnostic[];
}> {
  let source: string;

  try {
    source = await readFile(join(repositoryRoot, file), 'utf8');
  } catch (error) {
    if (isMissingPathError(error)) {
      return {
        value: null,
        diagnostics: [
          createAppShellDiagnostic(
            file,
            'repository.root',
            `App shell repository must include \`${file}\`.`
          )
        ]
      };
    }

    throw error;
  }

  try {
    return {
      value: parse(source) as unknown,
      diagnostics: []
    };
  } catch (error) {
    return {
      value: null,
      diagnostics: [
        createAppShellDiagnostic(
          file,
          'yaml',
          `App shell contract \`${file}\` must be valid YAML: ${formatError(error)}`
        )
      ]
    };
  }
}

function validateAppShellContract(value: unknown): readonly Diagnostic[] {
  return [
    ...validateRequiredStringArrayEntries({
      value,
      file: APP_SHELL_CONTRACT_FILE,
      path: 'environment.required',
      field: 'environment.required',
      requiredEntries: REQUIRED_ENVIRONMENT
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: APP_SHELL_CONTRACT_FILE,
      path: 'readiness.routes',
      field: 'readiness.routes',
      requiredEntries: REQUIRED_READINESS_ROUTES
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: APP_SHELL_CONTRACT_FILE,
      path: 'readiness.required_env',
      field: 'readiness.required_env',
      requiredEntries: REQUIRED_ENVIRONMENT
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: APP_SHELL_CONTRACT_FILE,
      path: 'allowed_upstreams',
      field: 'allowed_upstreams',
      requiredEntries: REQUIRED_ALLOWED_UPSTREAMS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: APP_SHELL_CONTRACT_FILE,
      path: 'forbidden',
      field: 'forbidden',
      requiredEntries: REQUIRED_FORBIDDEN_CONTRACTS
    }),
    ...validateRequiredSurfaces(value)
  ];
}

function validateRequiredSurfaces(value: unknown): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const surfaces = readPath(value, 'surfaces');

  if (!Array.isArray(surfaces)) {
    return [
      createAppShellDiagnostic(
        APP_SHELL_CONTRACT_FILE,
        'surfaces',
        'App shell contract must declare a `surfaces` array.'
      )
    ];
  }

  const surfaceById = new Map<string, Record<string, unknown>>();

  for (const surface of surfaces) {
    if (!isRecord(surface)) {
      continue;
    }

    const id = readStringField(surface, 'id');

    if (id !== null) {
      surfaceById.set(id, surface);
    }
  }

  for (const requiredSurface of REQUIRED_SURFACES) {
    const surface = surfaceById.get(requiredSurface.id);

    if (surface === undefined) {
      diagnostics.push(
        createAppShellDiagnostic(
          APP_SHELL_CONTRACT_FILE,
          `surfaces.${requiredSurface.id}`,
          `App shell contract must declare \`${requiredSurface.id}\` surface.`
        )
      );
      continue;
    }

    if (readStringField(surface, 'route') !== requiredSurface.route) {
      diagnostics.push(
        createAppShellDiagnostic(
          APP_SHELL_CONTRACT_FILE,
          `surfaces.${requiredSurface.id}.route`,
          `App shell \`${requiredSurface.id}\` surface must use route \`${requiredSurface.route}\`.`
        )
      );
    }

    if (!readStringArrayPath(surface, 'calls').includes(requiredSurface.call)) {
      diagnostics.push(
        createAppShellDiagnostic(
          APP_SHELL_CONTRACT_FILE,
          `surfaces.${requiredSurface.id}.calls`,
          `App shell \`${requiredSurface.id}\` surface must call \`${requiredSurface.call}\`.`
        )
      );
    }
  }

  return diagnostics;
}

async function validateSourceBoundaries(
  repositoryRoot: string
): Promise<readonly Diagnostic[]> {
  const sourceRoot = join(repositoryRoot, 'src');
  const sourceFiles = await listSourceFiles(sourceRoot);
  const diagnostics: Diagnostic[] = [];

  for (const file of sourceFiles) {
    const source = await readFile(file, 'utf8');
    const relativePath = relative(repositoryRoot, file).replaceAll('\\', '/');

    for (const forbidden of FORBIDDEN_SOURCE_PATTERNS) {
      if (!forbidden.pattern.test(source)) {
        continue;
      }

      diagnostics.push(
        createAppShellDiagnostic(
          relativePath,
          'source.forbidden',
          `App shell source must not contain platform ownership pattern \`${forbidden.label}\`.`
        )
      );
    }
  }

  return diagnostics;
}

async function listSourceFiles(root: string): Promise<readonly string[]> {
  let entries;

  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (isMissingPathError(error)) {
      return [];
    }

    throw error;
  }

  const files: string[] = [];

  for (const entry of entries) {
    const path = join(root, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listSourceFiles(path)));
      continue;
    }

    if (!entry.isFile() || !isSourceFile(path)) {
      continue;
    }

    files.push(path);
  }

  return files;
}

function isSourceFile(path: string): boolean {
  for (const extension of SOURCE_EXTENSIONS) {
    if (path.endsWith(extension)) {
      return true;
    }
  }

  return false;
}

function validateRequiredStringArrayEntries(input: {
  readonly value: unknown;
  readonly file: string;
  readonly path: string;
  readonly field: string;
  readonly requiredEntries: readonly string[];
}): readonly Diagnostic[] {
  const entries = readStringArrayPath(input.value, input.field);
  const diagnostics: Diagnostic[] = [];

  for (const requiredEntry of input.requiredEntries) {
    if (entries.includes(requiredEntry)) {
      continue;
    }

    diagnostics.push(
      createAppShellDiagnostic(
        input.file,
        input.path,
        `App shell contract \`${input.file}\` must include \`${requiredEntry}\` in \`${input.field}\`.`
      )
    );
  }

  return diagnostics;
}

function readRepositoryName(value: unknown): string | null {
  if (!isRecord(value) || !isRecord(value.service)) {
    return null;
  }

  return readStringField(value.service, 'repo');
}

function readStringArrayPath(value: unknown, path: string): readonly string[] {
  const candidate = readPath(value, path);

  if (!Array.isArray(candidate)) {
    return [];
  }

  return candidate.flatMap((entry) =>
    typeof entry === 'string' && entry.trim().length > 0 ? [entry.trim()] : []
  );
}

function readPath(value: unknown, path: string): unknown {
  let current = value;

  for (const segment of path.split('.')) {
    if (!isRecord(current)) {
      return undefined;
    }

    current = current[segment];
  }

  return current;
}

function readStringField(
  value: Record<string, unknown>,
  field: string
): string | null {
  const candidate = value[field];

  return typeof candidate === 'string' && candidate.trim().length > 0
    ? candidate.trim()
    : null;
}

function createAppShellDiagnostic(
  file: string,
  path: string,
  message: string
): Diagnostic {
  return {
    ruleId: APP_SHELL_RULE_ID,
    severity: 'error',
    file,
    path,
    message
  };
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isMissingPathError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
