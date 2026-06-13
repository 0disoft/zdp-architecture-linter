import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Diagnostic } from './diagnostics.ts';

const WEBPUB_CONTRACT_FILE = 'webpub.toml';
const WEBPUB_CONTRACT_RULE_ID = 'ZDP-WEBPUB-001';
const WEB_PUBLIC_REPOSITORY_NAME = 'zdp-web-public';

const REQUIRED_WEB_PUBLIC_FILES = [
  'scripts/check-localization.ts',
  'scripts/check-glossary.ts',
  'scripts/generate-glossary.ts',
  'scripts/glossary-build.ts',
  'glossary/terms/public.yaml',
  'src/content/glossary-manifest.json'
] as const;

const WEB_PUBLIC_OPERATIONAL_GATE_TRIGGER_FILES = [
  'package.json',
  'scripts/check-localization.ts',
  'scripts/check-glossary.ts',
  'scripts/generate-glossary.ts',
  'scripts/glossary-build.ts',
  'src/content/glossary-manifest.json'
] as const;

const REQUIRED_LOCALIZATION_CHECK_SNIPPETS = [
  'zdp.localization.cli-result@1',
  'runZdpLocalizationCli(["check"])',
  '"compile"',
  '"--strict-missing"',
  'fallbackCount !== 0',
  'totals.fallbackCount',
  'manifestFallbackCount !== 0'
] as const;

const REQUIRED_GLOSSARY_CHECK_SNIPPETS = [
  'buildRuntimeGlossaryManifest',
  'GLOSSARY_RUNTIME_MANIFEST_PATH',
  'is stale',
  'Run bun run glossary:generate',
  'Glossary check passed'
] as const;

const REQUIRED_GLOSSARY_BUILD_SNIPPETS = [
  'buildGlossaryManifest',
  'GLOSSARY_LOCALE = "ko"',
  'GLOSSARY_PRODUCT = "zdp-web-public"',
  'GLOSSARY_SITE = "web-public-home"',
  'Public glossary must include at least 10 reviewed terms',
  'term.interaction.trigger !== "click"',
  'term.interaction.surface !== "term-sheet"',
  'term.interaction.desktopPlacement !== "right-sheet"',
  'term.interaction.mobilePlacement !== "bottom-sheet"',
  'term.adPolicy.hoverCard !== "forbidden"',
  'term.adPolicy.termSheet !== "forbidden"',
  'createReservedDetailAdPolicy',
  'createForbiddenAdPolicy'
] as const;

const REQUIRED_WEB_PUBLIC_SERVICE_SNIPPETS = [
  'bun run check:localization passes with catalog diagnostics 0 and production fallback count 0',
  'bun run check:localization runs zdp-platform-localization catalog check and strict production compile',
  'fallback messages are not allowed',
  'zdp-platform-localization adoption is limited to the home hero Astro canary until a broader public-copy migration is reviewed',
  'home hero localization dogfood only; keep static Astro copy rollback available before expanding to more public copy',
  'feature_flag_required":false',
  'The first zdp-platform-localization product canary is intentionally limited to the home hero title and CTA messages',
  'Static Astro copy remains the rollback boundary for the localization canary, so this static public site does not require a runtime feature flag',
  'bun run check must fail on stale glossary-manifest.json instead of regenerating it before the freshness check',
  'Glossary term sheets do not include ad slots; AdSense, Ezoic, or another provider may only be considered through a separate detail-page experiment contract'
] as const;

const REQUIRED_WEB_PUBLIC_CI_SNIPPETS = [
  'public-site:',
  'uses: actions/checkout@v6',
  'path: projects/zdp-platforms/client-surfaces/zdp-web-public',
  'repository: 0disoft/zdp-design-system',
  'path: projects/zdp-platforms/client-surfaces/zdp-design-system',
  'repository: 0disoft/zdp-platform-localization',
  'secrets.ZDP_CI_READ_TOKEN || github.token',
  'path: projects/zdp-platforms/platform/zdp-platform-localization',
  'bun install --frozen-lockfile',
  'bun run package:build',
  'bun install --no-save',
  'bun run check',
  'bun run build'
] as const;

const WEB_PUBLIC_OPERATIONAL_GATE_SERVICE_TRIGGER_SNIPPETS = [
  'bun run check:localization passes with catalog diagnostics 0 and production fallback count 0',
  'bun run check:localization runs zdp-platform-localization catalog check and strict production compile',
  'fallback messages are not allowed',
  'bun run check must fail on stale glossary-manifest.json instead of regenerating it before the freshness check'
] as const;

interface WebpubContract {
  readonly domainStatus: string | null;
  readonly candidatePublicDomains: readonly string[];
  readonly siteUrl: string | null;
  readonly canonicalDomain: string | null;
  readonly robots: {
    readonly enabled: boolean | null;
    readonly disallow: readonly string[];
  };
}

interface ParsedTomlValue {
  readonly value: string | boolean | readonly string[];
  readonly ok: boolean;
}

export async function validateRepositoryWebpubContract(input: {
  readonly repositoryRoot: string | undefined;
  readonly repositoryServiceContract: unknown;
}): Promise<readonly Diagnostic[]> {
  if (
    input.repositoryRoot === undefined ||
    !requiresWebpubContract(input.repositoryServiceContract)
  ) {
    return [];
  }

  const source = await readOptionalWebpubContract(input.repositoryRoot);

  if (source === null) {
    return [
      createWebpubContractDiagnostic(
        'repository.root',
        'Public static web repositories must include root `webpub.toml` so domain status and pre-public robots policy are machine-checkable.'
      )
    ];
  }

  const parsed = parseWebpubContract(source);
  const diagnostics = [...parsed.diagnostics];

  if (parsed.contract !== null) {
    diagnostics.push(
      ...validateWebpubServiceAlignment(
        parsed.contract,
        input.repositoryServiceContract
      ),
      ...validateCandidateWebpubContract(parsed.contract)
    );
  }

  if (
    readRepositoryName(input.repositoryServiceContract) === WEB_PUBLIC_REPOSITORY_NAME &&
    (await declaresWebPublicOperationalGates(
      input.repositoryRoot,
      input.repositoryServiceContract
    ))
  ) {
    diagnostics.push(
      ...(await validateWebPublicOperationalGates(
        input.repositoryRoot,
        input.repositoryServiceContract
      ))
    );
  }

  return diagnostics;
}

function requiresWebpubContract(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  const domain = isRecord(value.domain) ? value.domain : {};
  const runtime = isRecord(value.runtime) ? value.runtime : {};
  const api = isRecord(value.api) ? value.api : {};
  const edge = readStringField(runtime, 'edge');
  const apiExposure = readStringField(api, 'exposure') ?? 'none';

  return (
    domain.user_facing === true &&
    edge === 'cloudflare-static-assets' &&
    domain.public_api !== true &&
    apiExposure === 'none'
  );
}

async function readOptionalWebpubContract(
  repositoryRoot: string
): Promise<string | null> {
  try {
    return await readFile(join(repositoryRoot, WEBPUB_CONTRACT_FILE), 'utf8');
  } catch (error) {
    if (isMissingPathError(error)) {
      return null;
    }

    throw error;
  }
}

function parseWebpubContract(source: string): {
  readonly contract: WebpubContract | null;
  readonly diagnostics: readonly Diagnostic[];
} {
  const diagnostics: Diagnostic[] = [];
  let section: string | null = null;
  let domainStatus: string | null = null;
  let candidatePublicDomains: readonly string[] = [];
  let siteUrl: string | null = null;
  let canonicalDomain: string | null = null;
  let robotsEnabled: boolean | null = null;
  let robotsDisallow: readonly string[] = [];

  for (const [lineIndex, rawLine] of source.split(/\r?\n/).entries()) {
    const lineNumber = lineIndex + 1;
    const line = stripTomlComment(rawLine).trim();

    if (line.length === 0) {
      continue;
    }

    const arrayTableMatch = line.match(/^\[\[([A-Za-z0-9_-]+)\]\]$/);

    if (arrayTableMatch !== null) {
      section = arrayTableMatch[1] ?? null;
      continue;
    }

    const tableMatch = line.match(/^\[([A-Za-z0-9_-]+)\]$/);

    if (tableMatch !== null) {
      section = tableMatch[1] ?? null;
      continue;
    }

    const separatorIndex = findTomlKeySeparator(line);

    if (separatorIndex === -1) {
      diagnostics.push(
        createWebpubContractDiagnostic(
          `line ${lineNumber}`,
          `Cannot parse \`webpub.toml\` line ${lineNumber}; use simple key/value TOML for the publishing contract.`
        )
      );
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trim();
    const parsed = parseTomlValue(rawValue);

    if (!parsed.ok) {
      diagnostics.push(
        createWebpubContractDiagnostic(
          `${sectionPath(section, key)}`,
          `Cannot parse \`webpub.toml\` value for \`${sectionPath(
            section,
            key
          )}\`; supported policy values are strings, booleans, and string arrays.`
        )
      );
      continue;
    }

    if (section === null) {
      if (key === 'domain_status' && typeof parsed.value === 'string') {
        domainStatus = parsed.value.trim();
      } else if (
        key === 'candidate_public_domains' &&
        Array.isArray(parsed.value)
      ) {
        candidatePublicDomains = parsed.value;
      } else if (key === 'site_url' && typeof parsed.value === 'string') {
        siteUrl = parsed.value.trim();
      } else if (key === 'canonical_domain' && typeof parsed.value === 'string') {
        canonicalDomain = parsed.value.trim();
      }
    } else if (section === 'robots') {
      if (key === 'enabled' && typeof parsed.value === 'boolean') {
        robotsEnabled = parsed.value;
      } else if (key === 'disallow' && Array.isArray(parsed.value)) {
        robotsDisallow = parsed.value;
      }
    }
  }

  if (diagnostics.length > 0) {
    return {
      contract: null,
      diagnostics
    };
  }

  return {
    contract: {
      domainStatus,
      candidatePublicDomains,
      siteUrl,
      canonicalDomain,
      robots: {
        enabled: robotsEnabled,
        disallow: robotsDisallow
      }
    },
    diagnostics: []
  };
}

function validateWebpubServiceAlignment(
  webpub: WebpubContract,
  serviceContract: unknown
): readonly Diagnostic[] {
  if (!isRecord(serviceContract) || !isRecord(serviceContract.runtime)) {
    return [];
  }

  const runtime = serviceContract.runtime;
  const diagnostics: Diagnostic[] = [];
  const serviceDomainStatus = readStringField(runtime, 'domain_status');
  const serviceCandidateDomains = readStringArrayField(
    runtime,
    'candidate_public_domains'
  );

  if (webpub.domainStatus !== serviceDomainStatus) {
    diagnostics.push(
      createWebpubContractDiagnostic(
        'domain_status',
        `\`webpub.toml\` domain_status must match \`service.yaml\` runtime.domain_status. service.yaml has \`${formatNullableString(
          serviceDomainStatus
        )}\`, webpub.toml has \`${formatNullableString(webpub.domainStatus)}\`.`
      )
    );
  }

  if (!sameStringSet(webpub.candidatePublicDomains, serviceCandidateDomains)) {
    diagnostics.push(
      createWebpubContractDiagnostic(
        'candidate_public_domains',
        `\`webpub.toml\` candidate_public_domains must match \`service.yaml\` runtime.candidate_public_domains. service.yaml has ${formatStringArray(
          serviceCandidateDomains
        )}, webpub.toml has ${formatStringArray(webpub.candidatePublicDomains)}.`
      )
    );
  }

  return diagnostics;
}

function validateCandidateWebpubContract(
  webpub: WebpubContract
): readonly Diagnostic[] {
  if (webpub.domainStatus !== 'candidate') {
    return [];
  }

  const diagnostics: Diagnostic[] = [];

  if ((webpub.siteUrl ?? '').length > 0) {
    diagnostics.push(
      createWebpubContractDiagnostic(
        'site_url',
        '`domain_status = "candidate"` requires empty `site_url`; candidate domains must not become sitemap or feed base URLs before ownership and routing are ready.'
      )
    );
  }

  if ((webpub.canonicalDomain ?? '').length > 0) {
    diagnostics.push(
      createWebpubContractDiagnostic(
        'canonical_domain',
        '`domain_status = "candidate"` requires empty `canonical_domain`; the canonical domain is set only after ownership and routing are ready.'
      )
    );
  }

  if (webpub.robots.enabled !== true) {
    diagnostics.push(
      createWebpubContractDiagnostic(
        'robots.enabled',
        '`domain_status = "candidate"` requires `robots.enabled = true` so pre-public pages are explicitly blocked from indexing.'
      )
    );
  }

  if (!webpub.robots.disallow.includes('/')) {
    diagnostics.push(
      createWebpubContractDiagnostic(
        'robots.disallow',
        '`domain_status = "candidate"` requires `robots.disallow` to include `/` so the whole preview surface stays blocked.'
      )
    );
  }

  return diagnostics;
}

async function declaresWebPublicOperationalGates(
  repositoryRoot: string,
  repositoryServiceContract: unknown
): Promise<boolean> {
  const serviceContractSource = stringify(repositoryServiceContract);

  if (WEB_PUBLIC_OPERATIONAL_GATE_SERVICE_TRIGGER_SNIPPETS.some((snippet) =>
    serviceContractSource.includes(snippet)
  )) {
    return true;
  }

  for (const file of WEB_PUBLIC_OPERATIONAL_GATE_TRIGGER_FILES) {
    if ((await readOptionalTextFile(repositoryRoot, file)) !== null) {
      return true;
    }
  }

  return false;
}

async function validateWebPublicOperationalGates(
  repositoryRoot: string,
  repositoryServiceContract: unknown
): Promise<readonly Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];

  for (const file of REQUIRED_WEB_PUBLIC_FILES) {
    const source = await readOptionalTextFile(repositoryRoot, file);

    if (source === null) {
      diagnostics.push(
        createWebpubDiagnostic(
          file,
          'repository.root',
          `zdp-web-public must include \`${file}\` for glossary and localization adoption checks.`
        )
      );
    }
  }

  diagnostics.push(...(await validateWebPublicPackageScripts(repositoryRoot)));
  diagnostics.push(
    ...(await validateRequiredSourceSnippets({
      repositoryRoot,
      file: 'scripts/check-localization.ts',
      path: 'scripts.check-localization',
      snippets: REQUIRED_LOCALIZATION_CHECK_SNIPPETS,
      description:
        'zdp-web-public localization check must prove strict production compile and zero fallback messages'
    }))
  );
  diagnostics.push(
    ...(await validateRequiredSourceSnippets({
      repositoryRoot,
      file: 'scripts/check-glossary.ts',
      path: 'scripts.check-glossary',
      snippets: REQUIRED_GLOSSARY_CHECK_SNIPPETS,
      description:
        'zdp-web-public glossary check must fail on stale generated runtime manifests'
    }))
  );
  diagnostics.push(
    ...(await validateRequiredSourceSnippets({
      repositoryRoot,
      file: 'scripts/glossary-build.ts',
      path: 'scripts.glossary-build',
      snippets: REQUIRED_GLOSSARY_BUILD_SNIPPETS,
      description:
        'zdp-web-public glossary builder must preserve reviewed public terms, click-open Term Sheet placement, and hover-ad exclusion'
    }))
  );
  diagnostics.push(
    ...validateTextIncludes({
      source: stringify(repositoryServiceContract),
      file: 'service.yaml',
      path: 'service.contract',
      snippets: REQUIRED_WEB_PUBLIC_SERVICE_SNIPPETS,
      description:
        'zdp-web-public service contract must document localization and glossary gates'
    })
  );
  diagnostics.push(
    ...(await validateRequiredSourceSnippets({
      repositoryRoot,
      file: '.github/workflows/ci.yml',
      path: 'github.workflow.ci',
      snippets: REQUIRED_WEB_PUBLIC_CI_SNIPPETS,
      description:
        'zdp-web-public CI workflow must install private sibling providers and run public site check/build'
    }))
  );

  return diagnostics;
}

async function validateWebPublicPackageScripts(
  repositoryRoot: string
): Promise<readonly Diagnostic[]> {
  const source = await readOptionalTextFile(repositoryRoot, 'package.json');

  if (source === null) {
    return [
      createWebpubDiagnostic(
        'package.json',
        'repository.root',
        'zdp-web-public must include `package.json`.'
      )
    ];
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(source);
  } catch (error) {
    return [
      createWebpubDiagnostic(
        'package.json',
        'json',
        `zdp-web-public package.json must parse as JSON: ${formatError(error)}`
      )
    ];
  }

  const scripts = isRecord(parsed) && isRecord(parsed.scripts) ? parsed.scripts : {};
  const diagnostics: Diagnostic[] = [];

  const requiredScripts: Readonly<Record<string, string>> = {
    'check:glossary': 'bun scripts/check-glossary.ts',
    'check:localization': 'bun scripts/check-localization.ts',
    'glossary:generate': 'bun scripts/generate-glossary.ts'
  };

  for (const [scriptName, expected] of Object.entries(requiredScripts)) {
    if (scripts[scriptName] === expected) {
      continue;
    }

    diagnostics.push(
      createWebpubDiagnostic(
        'package.json',
        `scripts.${scriptName}`,
        `zdp-web-public package.json must declare \`${scriptName}\` as \`${expected}\`.`
      )
    );
  }

  const checkScript =
    typeof scripts.check === 'string' ? scripts.check.trim() : null;

  if (checkScript === null) {
    diagnostics.push(
      createWebpubDiagnostic(
        'package.json',
        'scripts.check',
        'zdp-web-public package.json must declare `check` script.'
      )
    );
  } else {
    if (!checkScript.startsWith('bun run check:glossary &&')) {
      diagnostics.push(
        createWebpubDiagnostic(
          'package.json',
          'scripts.check',
          '`check` must run `bun run check:glossary` first so stale glossary manifests fail before generated output can hide drift.'
        )
      );
    }

    if (checkScript.includes('bun run glossary:generate')) {
      diagnostics.push(
        createWebpubDiagnostic(
          'package.json',
          'scripts.check',
          '`check` must not run `bun run glossary:generate`; generated glossary manifests must be refreshed explicitly before freshness checks.'
        )
      );
    }

    for (const requiredCommand of [
      'bun run check:localization',
      'bun run check:discovery'
    ]) {
      if (!checkScript.includes(requiredCommand)) {
        diagnostics.push(
          createWebpubDiagnostic(
            'package.json',
            'scripts.check',
            `\`check\` must include \`${requiredCommand}\`.`
          )
        );
      }
    }
  }

  return diagnostics;
}

async function validateRequiredSourceSnippets(input: {
  readonly repositoryRoot: string;
  readonly file: string;
  readonly path: string;
  readonly snippets: readonly string[];
  readonly description: string;
}): Promise<readonly Diagnostic[]> {
  const source = await readOptionalTextFile(input.repositoryRoot, input.file);

  if (source === null) {
    return [
      createWebpubDiagnostic(
        input.file,
        'repository.root',
        `zdp-web-public must include \`${input.file}\`.`
      )
    ];
  }

  return validateTextIncludes({
    source,
    file: input.file,
    path: input.path,
    snippets: input.snippets,
    description: input.description
  });
}

function validateTextIncludes(input: {
  readonly source: string;
  readonly file: string;
  readonly path: string;
  readonly snippets: readonly string[];
  readonly description: string;
}): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const snippet of input.snippets) {
    if (input.source.includes(snippet)) {
      continue;
    }

    diagnostics.push(
      createWebpubDiagnostic(
        input.file,
        input.path,
        `${input.description}; missing \`${snippet}\`.`
      )
    );
  }

  return diagnostics;
}

async function readOptionalTextFile(
  repositoryRoot: string,
  file: string
): Promise<string | null> {
  try {
    return await readFile(join(repositoryRoot, file), 'utf8');
  } catch (error) {
    if (isMissingPathError(error)) {
      return null;
    }

    throw error;
  }
}

function parseTomlValue(rawValue: string): ParsedTomlValue {
  if (rawValue === 'true') {
    return { value: true, ok: true };
  }

  if (rawValue === 'false') {
    return { value: false, ok: true };
  }

  if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
    return { value: parseTomlString(rawValue), ok: true };
  }

  if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
    const inner = rawValue.slice(1, -1).trim();

    if (inner.length === 0) {
      return { value: [], ok: true };
    }

    const entries = splitTomlArray(inner);

    if (
      entries.length === 0 ||
      entries.some((entry) => !entry.startsWith('"') || !entry.endsWith('"'))
    ) {
      return { value: [], ok: false };
    }

    return {
      value: entries.map((entry) => parseTomlString(entry).trim()),
      ok: true
    };
  }

  return { value: '', ok: false };
}

function parseTomlString(rawValue: string): string {
  return rawValue
    .slice(1, -1)
    .replaceAll('\\"', '"')
    .replaceAll('\\\\', '\\');
}

function splitTomlArray(inner: string): readonly string[] {
  const entries: string[] = [];
  let current = '';
  let inString = false;
  let escaped = false;

  for (const character of inner) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }

    if (character === '\\') {
      current += character;
      escaped = true;
      continue;
    }

    if (character === '"') {
      inString = !inString;
      current += character;
      continue;
    }

    if (character === ',' && !inString) {
      entries.push(current.trim());
      current = '';
      continue;
    }

    current += character;
  }

  if (inString) {
    return [];
  }

  entries.push(current.trim());

  return entries.filter((entry) => entry.length > 0);
}

function findTomlKeySeparator(line: string): number {
  let inString = false;
  let escaped = false;

  for (const [index, character] of [...line].entries()) {
    if (escaped) {
      escaped = false;
      continue;
    }

    if (character === '\\') {
      escaped = true;
      continue;
    }

    if (character === '"') {
      inString = !inString;
      continue;
    }

    if (character === '=' && !inString) {
      return index;
    }
  }

  return -1;
}

function stripTomlComment(line: string): string {
  let inString = false;
  let escaped = false;

  for (const [index, character] of [...line].entries()) {
    if (escaped) {
      escaped = false;
      continue;
    }

    if (character === '\\') {
      escaped = true;
      continue;
    }

    if (character === '"') {
      inString = !inString;
      continue;
    }

    if (character === '#' && !inString) {
      return line.slice(0, index);
    }
  }

  return line;
}

function readStringArrayField(
  value: Record<string, unknown>,
  field: string
): readonly string[] {
  const candidate = value[field];

  if (!Array.isArray(candidate)) {
    return [];
  }

  return candidate.flatMap((entry) =>
    typeof entry === 'string' && entry.trim().length > 0 ? [entry.trim()] : []
  );
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

function sameStringSet(
  left: readonly string[],
  right: readonly string[]
): boolean {
  return normalizeStringSet(left) === normalizeStringSet(right);
}

function normalizeStringSet(values: readonly string[]): string {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right)).join('\n');
}

function formatStringArray(values: readonly string[]): string {
  return `[${values.map((value) => `\`${value}\``).join(', ')}]`;
}

function formatNullableString(value: string | null): string {
  return value ?? 'null';
}

function sectionPath(section: string | null, key: string): string {
  return section === null ? key : `${section}.${key}`;
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

function createWebpubDiagnostic(
  file: string,
  path: string,
  message: string
): Diagnostic {
  return {
    ruleId: WEBPUB_CONTRACT_RULE_ID,
    severity: 'error',
    file,
    path,
    message
  };
}

function createWebpubContractDiagnostic(
  path: string,
  message: string
): Diagnostic {
  return createWebpubDiagnostic(WEBPUB_CONTRACT_FILE, path, message);
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
