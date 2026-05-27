import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Diagnostic } from './diagnostics.ts';

const WEBPUB_CONTRACT_FILE = 'webpub.toml';
const WEBPUB_CONTRACT_RULE_ID = 'ZDP-WEBPUB-001';

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
      createWebpubDiagnostic(
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
        createWebpubDiagnostic(
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
        createWebpubDiagnostic(
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
      createWebpubDiagnostic(
        'domain_status',
        `\`webpub.toml\` domain_status must match \`service.yaml\` runtime.domain_status. service.yaml has \`${formatNullableString(
          serviceDomainStatus
        )}\`, webpub.toml has \`${formatNullableString(webpub.domainStatus)}\`.`
      )
    );
  }

  if (!sameStringSet(webpub.candidatePublicDomains, serviceCandidateDomains)) {
    diagnostics.push(
      createWebpubDiagnostic(
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
      createWebpubDiagnostic(
        'site_url',
        '`domain_status = "candidate"` requires empty `site_url`; candidate domains must not become sitemap or feed base URLs before ownership and routing are ready.'
      )
    );
  }

  if ((webpub.canonicalDomain ?? '').length > 0) {
    diagnostics.push(
      createWebpubDiagnostic(
        'canonical_domain',
        '`domain_status = "candidate"` requires empty `canonical_domain`; the canonical domain is set only after ownership and routing are ready.'
      )
    );
  }

  if (webpub.robots.enabled !== true) {
    diagnostics.push(
      createWebpubDiagnostic(
        'robots.enabled',
        '`domain_status = "candidate"` requires `robots.enabled = true` so pre-public pages are explicitly blocked from indexing.'
      )
    );
  }

  if (!webpub.robots.disallow.includes('/')) {
    diagnostics.push(
      createWebpubDiagnostic(
        'robots.disallow',
        '`domain_status = "candidate"` requires `robots.disallow` to include `/` so the whole preview surface stays blocked.'
      )
    );
  }

  return diagnostics;
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

function createWebpubDiagnostic(path: string, message: string): Diagnostic {
  return {
    ruleId: WEBPUB_CONTRACT_RULE_ID,
    severity: 'error',
    file: WEBPUB_CONTRACT_FILE,
    path,
    message
  };
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
