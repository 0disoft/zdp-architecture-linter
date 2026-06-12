import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Diagnostic } from './diagnostics.ts';

const LOCALIZATION_REPOSITORY_NAME = 'zdp-platform-localization';
const LOCALIZATION_RULE_ID = 'ZDP-LOCALIZATION-001';

const REQUIRED_FILES = [
  'scripts/check-adoption-gate.ts',
  'scripts/check-adoption-gate.test.ts',
  'scripts/measure-large-catalog.ts',
  'scripts/verify-dev-hmr.ts',
  'scripts/check-internal-posture.ts',
  'docs/milestones.md'
] as const;

const REQUIRED_PACKAGE_SCRIPTS = [
  'check',
  'test',
  'check:adoption',
  'verify:hmr',
  'measure:large-catalog',
  'format:check'
] as const;

const REQUIRED_ADOPTION_SOURCE_SNIPPETS = [
  'zdp.localization.adoption-gate@1',
  'catalog-check',
  'production-compile',
  'large-catalog-scope-ratio',
  'catalogDiagnosticCount',
  'maxLargestRouteScopeShare = 0.25',
  'fallbackCount !== 0'
] as const;

const REQUIRED_LARGE_CATALOG_SOURCE_SNIPPETS = [
  'zdp.localization.large-catalog-measurement@1',
  'catalogCheck',
  'diagnosticCount'
] as const;

const REQUIRED_SERVICE_SNIPPETS = [
  'localization-adoption-gate-runs',
  'large-catalog-diagnostic-checks',
  'large-catalog-route-scope-ratio-checks',
  'bun run check:adoption passes with fixture catalog diagnostics 0, generated large-catalog diagnostics 0',
  'bun run verify:hmr remains the separate browser/dev-server proof',
  'open source conversion is not under consideration and is not a roadmap item'
] as const;

const REQUIRED_MILESTONE_SNIPPETS = [
  'bun run check:adoption',
  'generated 1,000-key catalog for diagnostics',
  'production compile must emit one chunk per locale/scope with zero fallback messages',
  'largest route-loaded scope chunk must stay at or below 25% of the naive monolith'
] as const;

const REQUIRED_INTERNAL_POSTURE_SOURCE_SNIPPETS = [
  'INTERNAL_POSTURE_DORA_NAME',
  'INTERNAL_POSTURE_PUBLIC_NPM_DOC',
  'INTERNAL_POSTURE_OSS_ESCAPE_HATCH',
  'INTERNAL_POSTURE_PACKAGE_MISSING',
  'INTERNAL_POSTURE_PACKAGE_NAME_MISMATCH',
  'INTERNAL_POSTURE_UNREGISTERED_PACKAGE',
  'INTERNAL_POSTURE_CLI_BIN_MISMATCH',
  'Dora branding is not allowed in the internal ZDP localization repository.',
  'Open source escape-hatch language is not allowed',
  'INTERNAL_POSTURE_OSS_CONSIDERATION',
  'Open source consideration language is not allowed',
  'Open source conversion is not under consideration and is not a roadmap item'
] as const;

const REQUIRED_LOCALIZATION_PACKAGE_NAMES = new Map<string, string>([
  ['package.json', 'zdp-platform-localization-workspace'],
  ['packages/astro/package.json', '@zdp/localization-astro'],
  ['packages/cli/package.json', '@zdp/localization-cli'],
  ['packages/compiler/package.json', '@zdp/localization-compiler'],
  ['packages/core/package.json', '@zdp/localization-core'],
  ['packages/runtime/package.json', '@zdp/localization-runtime'],
  ['packages/svelte/package.json', '@zdp/localization-svelte'],
  ['packages/vite/package.json', '@zdp/localization-vite']
]);

const REQUIRED_README_SNIPPETS = [
  'private internal project scaffold',
  'Open source conversion is not under consideration and is not a roadmap item',
  'Do not publish them or document them as public npm packages'
] as const;

const REQUIRED_AGENTS_SNIPPETS = [
  'internal ZDP localization runtime and compiler experiment',
  'Open source conversion is not under consideration and is not a roadmap item'
] as const;

const REQUIRED_ADR_SNIPPETS = [
  'Internal-Only Tooling Posture',
  'Open source conversion is not under consideration and is not a roadmap item',
  'Do not add open source licensing, public package publishing, community contribution workflows, external roadmap promises, or public brand positioning.'
] as const;

export async function validateRepositoryLocalizationContract(input: {
  readonly repositoryRoot: string | undefined;
  readonly repositoryServiceContract: unknown;
}): Promise<readonly Diagnostic[]> {
  if (
    input.repositoryRoot === undefined ||
    readRepositoryName(input.repositoryServiceContract) !==
      LOCALIZATION_REPOSITORY_NAME
  ) {
    return [];
  }

  const diagnostics: Diagnostic[] = [];

  for (const file of REQUIRED_FILES) {
    diagnostics.push(...(await validateRequiredFile(input.repositoryRoot, file)));
  }

  diagnostics.push(...(await validatePackageScripts(input.repositoryRoot)));
  diagnostics.push(
    ...(await validateInternalPackageBoundary(input.repositoryRoot))
  );
  diagnostics.push(
    ...(await validateSourceIncludes({
      repositoryRoot: input.repositoryRoot,
      file: 'scripts/check-adoption-gate.ts',
      path: 'scripts.check-adoption-gate',
      snippets: REQUIRED_ADOPTION_SOURCE_SNIPPETS
    }))
  );
  diagnostics.push(
    ...(await validateSourceIncludes({
      repositoryRoot: input.repositoryRoot,
      file: 'scripts/measure-large-catalog.ts',
      path: 'scripts.measure-large-catalog',
      snippets: REQUIRED_LARGE_CATALOG_SOURCE_SNIPPETS
    }))
  );
  diagnostics.push(
    ...(await validateSourceIncludes({
      repositoryRoot: input.repositoryRoot,
      file: 'scripts/check-internal-posture.ts',
      path: 'scripts.check-internal-posture',
      snippets: REQUIRED_INTERNAL_POSTURE_SOURCE_SNIPPETS
    }))
  );
  diagnostics.push(
    ...(await validateSourceIncludes({
      repositoryRoot: input.repositoryRoot,
      file: 'README.md',
      path: 'docs.readme',
      snippets: REQUIRED_README_SNIPPETS
    }))
  );
  diagnostics.push(
    ...(await validateSourceIncludes({
      repositoryRoot: input.repositoryRoot,
      file: 'AGENTS.md',
      path: 'docs.agents',
      snippets: REQUIRED_AGENTS_SNIPPETS
    }))
  );
  diagnostics.push(
    ...validateTextIncludes({
      source: stringify(input.repositoryServiceContract),
      file: 'service.yaml',
      path: 'service.contract',
      snippets: REQUIRED_SERVICE_SNIPPETS
    })
  );
  diagnostics.push(
    ...(await validateSourceIncludes({
      repositoryRoot: input.repositoryRoot,
      file: 'adr/0016-internal-only-tooling-posture.md',
      path: 'adr.0016',
      snippets: REQUIRED_ADR_SNIPPETS
    }))
  );
  diagnostics.push(
    ...(await validateSourceIncludes({
      repositoryRoot: input.repositoryRoot,
      file: 'docs/milestones.md',
      path: 'docs.milestones',
      snippets: REQUIRED_MILESTONE_SNIPPETS
    }))
  );

  return diagnostics;
}

async function validateInternalPackageBoundary(
  repositoryRoot: string
): Promise<readonly Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
  const discoveredPackageFiles = await discoverPackageJsonFiles(repositoryRoot);

  for (const [file, expectedName] of REQUIRED_LOCALIZATION_PACKAGE_NAMES) {
    const parsed = await readPackageJson(repositoryRoot, file, diagnostics);

    if (!parsed) {
      continue;
    }

    if (parsed.private !== true) {
      diagnostics.push(
        createLocalizationDiagnostic(
          file,
          'package.private',
          `Localization package \`${file}\` must set \`private: true\`.`
        )
      );
    }

    if (parsed.name !== expectedName) {
      diagnostics.push(
        createLocalizationDiagnostic(
          file,
          'package.name',
          `Localization package \`${file}\` must be named \`${expectedName}\`.`
        )
      );
    }

    validatePackageBin(file, parsed, diagnostics);
  }

  for (const file of discoveredPackageFiles) {
    if (REQUIRED_LOCALIZATION_PACKAGE_NAMES.has(file)) {
      continue;
    }

    diagnostics.push(
      createLocalizationDiagnostic(
        file,
        'package.registration',
        'Localization package must be registered in the internal package boundary contract.'
      )
    );
  }

  return diagnostics;
}

async function readPackageJson(
  repositoryRoot: string,
  file: string,
  diagnostics: Diagnostic[]
): Promise<Record<string, unknown> | null> {
  let source: string;

  try {
    source = await readFile(join(repositoryRoot, file), 'utf8');
  } catch (error) {
    if (!isMissingPathError(error)) {
      throw error;
    }

    diagnostics.push(
      createLocalizationDiagnostic(
        file,
        'repository.root',
        `Localization repository must include \`${file}\`.`
      )
    );
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(source);

    if (isRecord(parsed)) {
      return parsed;
    }

    diagnostics.push(
      createLocalizationDiagnostic(
        file,
        'json',
        `Localization package file \`${file}\` must parse as a JSON object.`
      )
    );
  } catch (error) {
    diagnostics.push(
      createLocalizationDiagnostic(
        file,
        'json',
        `Localization package file \`${file}\` must parse as JSON: ${formatError(error)}`
      )
    );
  }

  return null;
}

function validatePackageBin(
  file: string,
  parsed: Record<string, unknown>,
  diagnostics: Diagnostic[]
): void {
  if (file !== 'packages/cli/package.json') {
    if (parsed.bin !== undefined) {
      diagnostics.push(
        createLocalizationDiagnostic(
          file,
          'package.bin',
          'Only `packages/cli/package.json` may declare a localization CLI bin.'
        )
      );
    }
    return;
  }

  if (
    !isRecord(parsed.bin) ||
    parsed.bin['zdp-localization'] !== './src/index.ts' ||
    Object.keys(parsed.bin).length !== 1
  ) {
    diagnostics.push(
      createLocalizationDiagnostic(
        file,
        'package.bin',
        'Localization CLI package must expose only `zdp-localization` mapped to `./src/index.ts`.'
      )
    );
  }
}

async function discoverPackageJsonFiles(
  repositoryRoot: string
): Promise<readonly string[]> {
  const packagesRoot = join(repositoryRoot, 'packages');
  const files: string[] = [];

  let entries: ReadonlyArray<{
    readonly name: string;
    isDirectory(): boolean;
  }>;
  try {
    entries = await readdir(packagesRoot, {
      withFileTypes: true
    });
  } catch (error) {
    if (isMissingPathError(error)) {
      return files;
    }
    throw error;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const file = `packages/${entry.name}/package.json`;
    try {
      const info = await stat(join(repositoryRoot, file));
      if (info.isFile()) {
        files.push(file);
      }
    } catch (error) {
      if (!isMissingPathError(error)) {
        throw error;
      }
    }
  }

  return files.sort();
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
    createLocalizationDiagnostic(
      file,
      'repository.root',
      `Localization repository must include \`${file}\`.`
    )
  ];
}

async function validatePackageScripts(
  repositoryRoot: string
): Promise<readonly Diagnostic[]> {
  let source: string;

  try {
    source = await readFile(join(repositoryRoot, 'package.json'), 'utf8');
  } catch (error) {
    if (!isMissingPathError(error)) {
      throw error;
    }

    return [
      createLocalizationDiagnostic(
        'package.json',
        'repository.root',
        'Localization repository must include `package.json`.'
      )
    ];
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(source);
  } catch (error) {
    return [
      createLocalizationDiagnostic(
        'package.json',
        'json',
        `Localization package.json must parse as JSON: ${formatError(error)}`
      )
    ];
  }

  const scripts = isRecord(parsed) && isRecord(parsed.scripts) ? parsed.scripts : {};
  const diagnostics: Diagnostic[] = [];

  for (const scriptName of REQUIRED_PACKAGE_SCRIPTS) {
    if (typeof scripts[scriptName] === 'string') {
      continue;
    }

    diagnostics.push(
      createLocalizationDiagnostic(
        'package.json',
        `scripts.${scriptName}`,
        `Localization package.json must declare \`${scriptName}\` script.`
      )
    );
  }

  if (scripts['check:adoption'] !== 'bun scripts/check-adoption-gate.ts') {
    diagnostics.push(
      createLocalizationDiagnostic(
        'package.json',
        'scripts.check:adoption',
        'Localization `check:adoption` must run `bun scripts/check-adoption-gate.ts`.'
      )
    );
  }

  return diagnostics;
}

async function validateSourceIncludes(input: {
  readonly repositoryRoot: string;
  readonly file: string;
  readonly path: string;
  readonly snippets: readonly string[];
}): Promise<readonly Diagnostic[]> {
  let source: string;

  try {
    source = await readFile(join(input.repositoryRoot, input.file), 'utf8');
  } catch (error) {
    if (!isMissingPathError(error)) {
      throw error;
    }

    return [
      createLocalizationDiagnostic(
        input.file,
        'repository.root',
        `Localization repository must include \`${input.file}\`.`
      )
    ];
  }

  return validateTextIncludes({
    source,
    file: input.file,
    path: input.path,
    snippets: input.snippets
  });
}

function validateTextIncludes(input: {
  readonly source: string;
  readonly file: string;
  readonly path: string;
  readonly snippets: readonly string[];
}): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const snippet of input.snippets) {
    if (input.source.includes(snippet)) {
      continue;
    }

    diagnostics.push(
      createLocalizationDiagnostic(
        input.file,
        input.path,
        `Localization contract must include \`${snippet}\`.`
      )
    );
  }

  return diagnostics;
}

function readRepositoryName(value: unknown): string | null {
  if (!isRecord(value) || !isRecord(value.service)) {
    return null;
  }

  const candidate = value.service.repo;

  return typeof candidate === 'string' && candidate.trim().length > 0
    ? candidate.trim()
    : null;
}

function stringify(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function createLocalizationDiagnostic(
  file: string,
  path: string,
  message: string
): Diagnostic {
  return {
    ruleId: LOCALIZATION_RULE_ID,
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
