import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Diagnostic } from './diagnostics.ts';

const SECRET_EXPOSURE_RULE_ID = 'ZDP-XCUT-SECRET-001';

const PUBLIC_DISCOVERY_FILES = [
  'llms.txt',
  'public/llms.txt',
  'static/llms.txt',
  'src/content/llms.txt',
  'sitemap.xml',
  'public/sitemap.xml',
  'static/sitemap.xml',
  'src/content/sitemap.xml',
  'robots.txt',
  'public/robots.txt',
  'static/robots.txt',
  '.well-known/ai-plugin.json',
  'public/.well-known/ai-plugin.json',
  '.well-known/security.txt',
  'public/.well-known/security.txt',
  'discovery.json',
  'public/discovery.json'
] as const;

const INTERNAL_URL_PATTERN =
  /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2}|[^/\s"'<>]+(?:\.internal|\.local|\.lan|\.corp)(?::\d+)?)(?:[/?#][^\s"'<>]*)?/i;
const PRIVATE_PATH_PATTERN =
  /(?:^|[\s"'>(]|https?:\/\/[^/\s"'<>]+)\/(?:admin|internal|private|customer-data|ops|backoffice)(?:[/?#\s"'<)]|$)/i;
const PRIVATE_KEY_PATTERN =
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA |)?PRIVATE KEY-----/i;
const TOKEN_LIKE_PATTERN =
  /\b(?:sk-[A-Za-z0-9_-]{16,}|sk_(?:live|test)_[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{16,}|AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{20,})\b/;
const SECRET_ASSIGNMENT_PATTERN =
  /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|webhook[_-]?secret|password)\s*[:=]\s*["']?([A-Za-z0-9._~+/=-]{12,})/gi;

const SAFE_PLACEHOLDER_VALUES = [
  'example',
  'placeholder',
  'redacted',
  'masked',
  'dummy',
  'fake',
  'test-value',
  'changeme',
  'replace-me',
  'your-token',
  'your-api-key'
] as const;

export async function validateRepositorySecretExposureContract(input: {
  readonly repositoryRoot: string;
  readonly repositoryServiceContract: unknown;
}): Promise<readonly Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];

  for (const relativePath of PUBLIC_DISCOVERY_FILES) {
    const source = await readOptionalTextFile(input.repositoryRoot, relativePath);

    if (source === null) {
      continue;
    }

    diagnostics.push(...validatePublicDiscoveryFile(relativePath, source));
  }

  return diagnostics;
}

function validatePublicDiscoveryFile(
  relativePath: string,
  source: string
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (INTERNAL_URL_PATTERN.test(source)) {
    diagnostics.push(
      createSecretDiagnostic({
        file: relativePath,
        path: 'public_discovery.internal_url',
        message:
          'Public discovery artifacts must not contain localhost, private-network, or internal host URLs.'
      })
    );
  }

  if (PRIVATE_PATH_PATTERN.test(source)) {
    diagnostics.push(
      createSecretDiagnostic({
        file: relativePath,
        path: 'public_discovery.private_path',
        message:
          'Public discovery artifacts must not list private, admin, internal, customer-data, ops, or backoffice paths.'
      })
    );
  }

  if (PRIVATE_KEY_PATTERN.test(source) || TOKEN_LIKE_PATTERN.test(source)) {
    diagnostics.push(
      createSecretDiagnostic({
        file: relativePath,
        path: 'public_discovery.secret_value',
        message:
          'Public discovery artifacts must not contain private keys, API keys, access tokens, or secret-looking credential values.'
      })
    );
  }

  if (containsUnsafeSecretAssignment(source)) {
    diagnostics.push(
      createSecretDiagnostic({
        file: relativePath,
        path: 'public_discovery.secret_assignment',
        message:
          'Public discovery artifacts must not contain populated secret, token, password, or API key assignments.'
      })
    );
  }

  return diagnostics;
}

async function readOptionalTextFile(
  repositoryRoot: string,
  relativePath: string
): Promise<string | null> {
  try {
    return await readFile(join(repositoryRoot, relativePath), 'utf8');
  } catch (error) {
    if (isMissingPathError(error)) {
      return null;
    }

    throw error;
  }
}

function containsUnsafeSecretAssignment(source: string): boolean {
  for (const match of source.matchAll(SECRET_ASSIGNMENT_PATTERN)) {
    const value = match[1]?.toLowerCase();

    if (value === undefined || isSafePlaceholder(value)) {
      continue;
    }

    return true;
  }

  return false;
}

function isSafePlaceholder(value: string): boolean {
  return SAFE_PLACEHOLDER_VALUES.some((placeholder) =>
    value.includes(placeholder)
  );
}

function createSecretDiagnostic(input: {
  readonly file: string;
  readonly path: string;
  readonly message: string;
}): Diagnostic {
  return {
    ruleId: SECRET_EXPOSURE_RULE_ID,
    severity: 'error',
    file: input.file,
    path: input.path,
    message: input.message
  };
}

function isMissingPathError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as { readonly code?: unknown }).code === 'ENOENT'
  );
}
