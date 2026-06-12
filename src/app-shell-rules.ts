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

const REQUIRED_SERVICE_CONTRACT_SNIPPETS = [
  'platform-localization',
  'localization-adoption-gate',
  'fixture catalog diagnostics 0',
  'generated large-catalog diagnostics 0',
  'production fallback 0',
  'limited to the six app-shell navigation and page-title messages',
  'keep the previous app-shell copy or i18n runtime path',
  'does not require a runtime feature flag'
] as const;

const REQUIRED_SURFACES = [
  { id: 'console', route: '/console', call: 'core-api' },
  { id: 'admin', route: '/admin', call: 'core-api' }
] as const;

const REQUIRED_LOCALIZATION_CANARY_MESSAGE_KEYS = [
  'nav.app',
  'nav.console',
  'nav.admin',
  'page.home.title',
  'page.console.title',
  'page.admin.title'
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

  diagnostics.push(
    ...validateServiceContractIncludes(input.repositoryServiceContract)
  );
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
    ...validateLocalizationCanary(value),
    ...validateRequiredSurfaces(value)
  ];
}

function validateLocalizationCanary(value: unknown): readonly Diagnostic[] {
  const canary = readPath(value, 'localization_canary');

  if (!isRecord(canary)) {
    return [
      createAppShellDiagnostic(
        APP_SHELL_CONTRACT_FILE,
        'localization_canary',
        'App shell contract must declare a `localization_canary` object.'
      )
    ];
  }

  const diagnostics: Diagnostic[] = [];
  const provider = readStringField(canary, 'provider');
  const scope = readStringField(canary, 'scope');
  const rollbackBoundary = readStringField(canary, 'rollback_boundary');

  if (provider !== 'zdp-platform-localization') {
    diagnostics.push(
      createAppShellDiagnostic(
        APP_SHELL_CONTRACT_FILE,
        'localization_canary.provider',
        'App shell localization canary provider must be `zdp-platform-localization`.'
      )
    );
  }

  if (scope !== 'app-shell') {
    diagnostics.push(
      createAppShellDiagnostic(
        APP_SHELL_CONTRACT_FILE,
        'localization_canary.scope',
        'App shell localization canary scope must stay `app-shell`.'
      )
    );
  }

  if (canary.expansion_requires_review !== true) {
    diagnostics.push(
      createAppShellDiagnostic(
        APP_SHELL_CONTRACT_FILE,
        'localization_canary.expansion_requires_review',
        'App shell localization canary expansion must require review.'
      )
    );
  }

  if (canary.runtime_feature_flag_required !== false) {
    diagnostics.push(
      createAppShellDiagnostic(
        APP_SHELL_CONTRACT_FILE,
        'localization_canary.runtime_feature_flag_required',
        'App shell localization canary must keep runtime feature flag requirement disabled while rollback uses app-slice disablement and previous copy/runtime path.'
      )
    );
  }

  if (
    rollbackBoundary === null ||
    !rollbackBoundary.includes('previous app-shell copy or i18n runtime path')
  ) {
    diagnostics.push(
      createAppShellDiagnostic(
        APP_SHELL_CONTRACT_FILE,
        'localization_canary.rollback_boundary',
        'App shell localization canary rollback boundary must keep previous app-shell copy or i18n runtime path available.'
      )
    );
  }

  diagnostics.push(
    ...validateExactStringArrayEntries({
      value: canary,
      file: APP_SHELL_CONTRACT_FILE,
      path: 'localization_canary.message_keys',
      field: 'message_keys',
      expectedEntries: REQUIRED_LOCALIZATION_CANARY_MESSAGE_KEYS
    })
  );

  return diagnostics;
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

function validateServiceContractIncludes(value: unknown): readonly Diagnostic[] {
  const source = stringify(value);
  const diagnostics: Diagnostic[] = [];

  for (const snippet of REQUIRED_SERVICE_CONTRACT_SNIPPETS) {
    if (source.includes(snippet)) {
      continue;
    }

    diagnostics.push(
      createAppShellDiagnostic(
        'service.yaml',
        'service.contract',
        `App shell service contract must include \`${snippet}\`.`
      )
    );
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

function validateExactStringArrayEntries(input: {
  readonly value: unknown;
  readonly file: string;
  readonly path: string;
  readonly field: string;
  readonly expectedEntries: readonly string[];
}): readonly Diagnostic[] {
  const entries = readStringArrayPath(input.value, input.field);
  const diagnostics: Diagnostic[] = [];

  for (const expectedEntry of input.expectedEntries) {
    if (entries.includes(expectedEntry)) {
      continue;
    }

    diagnostics.push(
      createAppShellDiagnostic(
        input.file,
        input.path,
        `App shell localization canary must include \`${expectedEntry}\` in \`${input.field}\`.`
      )
    );
  }

  for (const entry of entries) {
    if (input.expectedEntries.includes(entry)) {
      continue;
    }

    diagnostics.push(
      createAppShellDiagnostic(
        input.file,
        input.path,
        `App shell localization canary must not include out-of-scope message key \`${entry}\` without expansion review.`
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

function stringify(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
