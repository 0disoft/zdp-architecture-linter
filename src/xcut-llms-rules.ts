import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Diagnostic } from './diagnostics.ts';

const LLMS_RULE_ID = 'ZDP-XCUT-LLMS-001';

const LLMS_FILES = [
  'llms.txt',
  'public/llms.txt',
  'static/llms.txt',
  'src/content/llms.txt'
] as const;

const MAX_CURATED_LINKS = 20;

const URL_PATTERN = /https?:\/\/[^\s"'<>)]*/gi;
const SITEMAP_XML_PATTERN = /<(?:urlset|url|loc)\b/i;
const INTERNAL_URL_PATTERN =
  /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2}|[^/\s"'<>]+(?:\.internal|\.local|\.lan|\.corp)(?::\d+)?)(?:[/?#][^\s"'<>]*)?/i;
const PRIVATE_PATH_PATTERN =
  /(?:^|[\s"'>(]|https?:\/\/[^/\s"'<>]+)\/(?:admin|internal|private|customer-data|ops|backoffice)(?:[/?#\s"'<)]|$)/i;

export async function validateRepositoryLlmsContract(input: {
  readonly repositoryRoot: string;
  readonly repositoryServiceContract: unknown;
}): Promise<readonly Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];

  for (const relativePath of LLMS_FILES) {
    const source = await readOptionalTextFile(input.repositoryRoot, relativePath);

    if (source === null) {
      continue;
    }

    diagnostics.push(...validateLlmsFile(relativePath, source));
  }

  return diagnostics;
}

function validateLlmsFile(
  relativePath: string,
  source: string
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const links = Array.from(source.matchAll(URL_PATTERN), (match) => match[0]);

  if (SITEMAP_XML_PATTERN.test(source)) {
    diagnostics.push(
      createLlmsDiagnostic({
        file: relativePath,
        path: 'llms.sitemap_copy',
        message:
          'llms.txt must be a curated guide, not a copied sitemap XML document.'
      })
    );
  }

  if (links.length > MAX_CURATED_LINKS) {
    diagnostics.push(
      createLlmsDiagnostic({
        file: relativePath,
        path: 'llms.too_many_links',
        message:
          'llms.txt should stay curated to the most important public links instead of copying the full sitemap.'
      })
    );
  }

  if (INTERNAL_URL_PATTERN.test(source) || PRIVATE_PATH_PATTERN.test(source)) {
    diagnostics.push(
      createLlmsDiagnostic({
        file: relativePath,
        path: 'llms.private_url',
        message:
          'llms.txt must not include localhost, private-network, internal, admin, customer-data, ops, or backoffice URLs.'
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

function createLlmsDiagnostic(input: {
  readonly file: string;
  readonly path: string;
  readonly message: string;
}): Diagnostic {
  return {
    ruleId: LLMS_RULE_ID,
    severity: 'warning',
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
