import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Diagnostic } from './diagnostics.ts';
import type {
  RepositoryCatalogRecord,
  RepositoryIndex
} from './repository-rules.ts';

export const REPOSITORY_BASELINE_REQUIRED_FILES = [
  '.editorconfig',
  '.gitattributes',
  'AGENTS.md',
  'README.md'
] as const;

const REPOSITORY_BASELINE_RULE_ID = 'ZDP-REPO-BASELINE-001';
const REPOSITORY_MARKDOWN_LAB_RULE_ID = 'ZDP-REPO-MARKDOWN-001';
const REPOSITORY_MARKDOWN_PACKAGE_TOOL_RULE_ID = 'ZDP-REPO-MARKDOWN-002';
const REPOSITORY_MARKDOWN_RUNBOOK_RULE_ID = 'ZDP-REPO-MARKDOWN-003';
const REPOSITORY_MARKDOWN_SECURITY_RULE_ID = 'ZDP-REPO-MARKDOWN-004';
const REPOSITORY_MARKDOWN_BOUNDARY_RULE_ID = 'ZDP-REPO-MARKDOWN-005';
const REPOSITORY_MARKDOWN_PRODUCT_SPEC_RULE_ID = 'ZDP-REPO-MARKDOWN-006';
const EXPERIMENT_FILE = 'EXPERIMENT.md';
const CONTRIBUTING_FILE = 'CONTRIBUTING.md';
const CHANGELOG_FILE = 'CHANGELOG.md';
const RUNBOOK_FILE = 'RUNBOOK.md';
const SECURITY_FILE = 'SECURITY.md';
const BOUNDARY_FILE = 'BOUNDARY.md';
const PRODUCT_SPEC_FILE = 'product-spec.md';
const PACKAGE_TOOLING_KINDS = new Set(['cli', 'library', 'sdk', 'template', 'tooling']);
const PACKAGE_TOOLING_PURPOSE_PATTERNS = [
  'CLI',
  'SDK',
  '템플릿',
  '패키지',
  '코드 생성기',
  'generator'
] as const;
const TIER_WITH_RUNBOOK = new Set(['tier0', 'tier1', 'tier2']);
const RISK_WITH_SECURITY = new Set(['high', 'critical']);
const RISK_WITH_BOUNDARY = new Set(['critical']);
const SENSITIVE_SERVICE_FLAGS = [
  'data.payment_data',
  'data.money_movement',
  'data.message_content',
  'data.ai_user_data',
  'data.crypto_key_material',
  'domain.money_movement'
] as const;
const SENSITIVE_REPOSITORY_AREAS = new Set([
  'admin',
  'ai',
  'comm',
  'connectors',
  'data',
  'desktop',
  'infra',
  'mobile',
  'money',
  'privacy',
  'security'
]);
const PRODUCT_REPOSITORY_AREAS = new Set(['products', 'verticals']);
const PRODUCT_REPOSITORY_PURPOSE_PATTERNS = ['제품 저장소', 'product repository'] as const;
const EDITORCONFIG_REQUIRED_SNIPPETS = [
  'root = true',
  '[*]',
  'charset = utf-8',
  'end_of_line = lf',
  'insert_final_newline = true',
  'indent_style = space',
  'indent_size = 2',
  'trim_trailing_whitespace = true'
] as const;
const GITATTRIBUTES_REQUIRED_SNIPPETS = ['* text=auto eol=lf'] as const;

export interface RepositoryRootMarkdownInput {
  readonly repositoryRoot: string | undefined;
  readonly repositoryServiceContract: unknown;
  readonly repositoryIndex: RepositoryIndex;
}

export async function validateRepositoryBaselineFiles(
  repositoryRoot: string | undefined
): Promise<readonly Diagnostic[]> {
  if (repositoryRoot === undefined) {
    return [];
  }

  const diagnostics: Diagnostic[] = [];

  for (const fileName of REPOSITORY_BASELINE_REQUIRED_FILES) {
    if (await isRegularFile(join(repositoryRoot, fileName))) {
      continue;
    }

    diagnostics.push({
      ruleId: REPOSITORY_BASELINE_RULE_ID,
      severity: 'error',
      file: fileName,
      path: 'repository.root',
      message: `Repository root is missing required baseline file \`${fileName}\`.`
    });
  }

  diagnostics.push(
    ...(await validateRequiredTextSnippets(
      repositoryRoot,
      '.editorconfig',
      EDITORCONFIG_REQUIRED_SNIPPETS
    )),
    ...(await validateRequiredTextSnippets(
      repositoryRoot,
      '.gitattributes',
      GITATTRIBUTES_REQUIRED_SNIPPETS
    ))
  );

  return diagnostics;
}

export async function validateRepositoryRootMarkdownFiles(
  input: RepositoryRootMarkdownInput
): Promise<readonly Diagnostic[]> {
  if (input.repositoryRoot === undefined) {
    return [];
  }

  const repoName = readRepositoryName(input.repositoryServiceContract);

  if (repoName === null) {
    return [];
  }

  const repository = input.repositoryIndex.byName.get(repoName);

  if (repository === undefined) {
    return [];
  }

  return [
    ...(await validateLabRootMarkdown(input.repositoryRoot, repoName, repository)),
    ...(await validatePackageToolingRootMarkdown(
      input.repositoryRoot,
      repoName,
      repository,
      input.repositoryServiceContract
    )),
    ...(await validateRunbookRootMarkdown(
      input.repositoryRoot,
      repoName,
      repository,
      input.repositoryServiceContract
    )),
    ...(await validateSecurityRootMarkdown(
      input.repositoryRoot,
      repoName,
      repository,
      input.repositoryServiceContract
    )),
    ...(await validateBoundaryRootMarkdown(
      input.repositoryRoot,
      repoName,
      repository,
      input.repositoryServiceContract
    )),
    ...(await validateProductSpecRootMarkdown(
      input.repositoryRoot,
      repoName,
      repository
    ))
  ];
}

async function validateLabRootMarkdown(
  repositoryRoot: string,
  repoName: string,
  repository: RepositoryCatalogRecord
): Promise<readonly Diagnostic[]> {
  if (!isLabRepository(repository)) {
    return [];
  }

  if (await isRegularFile(join(repositoryRoot, EXPERIMENT_FILE))) {
    return [];
  }

  return [
    {
      ruleId: REPOSITORY_MARKDOWN_LAB_RULE_ID,
      severity: 'error',
      file: EXPERIMENT_FILE,
      path: 'repository.root',
      message: `Lab repository \`${repoName}\` must include root \`${EXPERIMENT_FILE}\`.`
    }
  ];
}

async function validatePackageToolingRootMarkdown(
  repositoryRoot: string,
  repoName: string,
  repository: RepositoryCatalogRecord,
  serviceContract: unknown
): Promise<readonly Diagnostic[]> {
  if (!isPackageToolingRepository(repository, serviceContract)) {
    return [];
  }

  const diagnostics: Diagnostic[] = [];

  for (const fileName of [CONTRIBUTING_FILE, CHANGELOG_FILE] as const) {
    if (await isRegularFile(join(repositoryRoot, fileName))) {
      continue;
    }

    diagnostics.push({
      ruleId: REPOSITORY_MARKDOWN_PACKAGE_TOOL_RULE_ID,
      severity: 'error',
      file: fileName,
      path: 'repository.root',
      message:
        `Package, CLI, or template repository \`${repoName}\` must include root \`${fileName}\`.`
    });
  }

  return diagnostics;
}

async function validateRunbookRootMarkdown(
  repositoryRoot: string,
  repoName: string,
  repository: RepositoryCatalogRecord,
  serviceContract: unknown
): Promise<readonly Diagnostic[]> {
  if (!requiresRunbook(repository, serviceContract)) {
    return [];
  }

  return await validateConditionalMarkdownFile({
    repositoryRoot,
    fileName: RUNBOOK_FILE,
    ruleId: REPOSITORY_MARKDOWN_RUNBOOK_RULE_ID,
    message: `Operational repository \`${repoName}\` must include root \`${RUNBOOK_FILE}\`.`
  });
}

async function validateSecurityRootMarkdown(
  repositoryRoot: string,
  repoName: string,
  repository: RepositoryCatalogRecord,
  serviceContract: unknown
): Promise<readonly Diagnostic[]> {
  if (!requiresSecurity(repository, serviceContract)) {
    return [];
  }

  return await validateConditionalMarkdownFile({
    repositoryRoot,
    fileName: SECURITY_FILE,
    ruleId: REPOSITORY_MARKDOWN_SECURITY_RULE_ID,
    message: `Sensitive repository \`${repoName}\` must include root \`${SECURITY_FILE}\`.`
  });
}

async function validateBoundaryRootMarkdown(
  repositoryRoot: string,
  repoName: string,
  repository: RepositoryCatalogRecord,
  serviceContract: unknown
): Promise<readonly Diagnostic[]> {
  if (!requiresBoundary(repository, serviceContract)) {
    return [];
  }

  return await validateConditionalMarkdownFile({
    repositoryRoot,
    fileName: BOUNDARY_FILE,
    ruleId: REPOSITORY_MARKDOWN_BOUNDARY_RULE_ID,
    message: `Boundary-heavy repository \`${repoName}\` must include root \`${BOUNDARY_FILE}\`.`
  });
}

async function validateProductSpecRootMarkdown(
  repositoryRoot: string,
  repoName: string,
  repository: RepositoryCatalogRecord
): Promise<readonly Diagnostic[]> {
  if (!requiresProductSpec(repository)) {
    return [];
  }

  return await validateConditionalMarkdownFile({
    repositoryRoot,
    fileName: PRODUCT_SPEC_FILE,
    ruleId: REPOSITORY_MARKDOWN_PRODUCT_SPEC_RULE_ID,
    message: `Product repository \`${repoName}\` must include root \`${PRODUCT_SPEC_FILE}\`.`
  });
}

async function validateConditionalMarkdownFile(input: {
  readonly repositoryRoot: string;
  readonly fileName: string;
  readonly ruleId: string;
  readonly message: string;
}): Promise<readonly Diagnostic[]> {
  if (await isRegularFile(join(input.repositoryRoot, input.fileName))) {
    return [];
  }

  return [
    {
      ruleId: input.ruleId,
      severity: 'error',
      file: input.fileName,
      path: 'repository.root',
      message: input.message
    }
  ];
}

async function validateRequiredTextSnippets(
  repositoryRoot: string,
  fileName: string,
  snippets: readonly string[]
): Promise<readonly Diagnostic[]> {
  const content = await readOptionalTextFile(join(repositoryRoot, fileName));

  if (content === null) {
    return [];
  }

  return snippets.flatMap((snippet) =>
    content.includes(snippet)
      ? []
      : [
          {
            ruleId: REPOSITORY_BASELINE_RULE_ID,
            severity: 'error' as const,
            file: fileName,
            path: 'repository.root',
            message:
              `Repository baseline file \`${fileName}\` must include \`${snippet}\`.`
          }
        ]
  );
}

async function isRegularFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch (error) {
    if (isMissingPathError(error)) {
      return false;
    }

    throw error;
  }
}

function isMissingPathError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}

async function readOptionalTextFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (isMissingPathError(error)) {
      return null;
    }

    throw error;
  }
}

function isLabRepository(repository: RepositoryCatalogRecord): boolean {
  return (
    repository.repoStage === 'lab_only' ||
    repository.kind === 'lab' ||
    repository.area === 'labs'
  );
}

function isPackageToolingRepository(
  repository: RepositoryCatalogRecord,
  serviceContract: unknown
): boolean {
  if (
    repository.kind !== null &&
    PACKAGE_TOOLING_KINDS.has(repository.kind)
  ) {
    return true;
  }

  if (
    repository.purpose !== null &&
    PACKAGE_TOOLING_PURPOSE_PATTERNS.some((pattern) =>
      repository.purpose?.includes(pattern)
    )
  ) {
    return true;
  }

  return readRuntimeCore(serviceContract) === 'local-cli';
}

function requiresRunbook(
  repository: RepositoryCatalogRecord,
  serviceContract: unknown
): boolean {
  return (
    TIER_WITH_RUNBOOK.has(readServiceTier(serviceContract) ?? '') ||
    RISK_WITH_SECURITY.has(readRepositoryOrServiceRiskLevel(repository, serviceContract) ?? '') ||
    hasOperationalRecoverySurface(serviceContract)
  );
}

function requiresSecurity(
  repository: RepositoryCatalogRecord,
  serviceContract: unknown
): boolean {
  return (
    RISK_WITH_SECURITY.has(readRepositoryOrServiceRiskLevel(repository, serviceContract) ?? '') ||
    SENSITIVE_REPOSITORY_AREAS.has(repository.area ?? '') ||
    hasSensitiveServiceFlag(serviceContract)
  );
}

function requiresBoundary(
  repository: RepositoryCatalogRecord,
  serviceContract: unknown
): boolean {
  return (
    RISK_WITH_BOUNDARY.has(readRepositoryOrServiceRiskLevel(repository, serviceContract) ?? '') ||
    repository.splitTargets.length > 0 ||
    repository.ownsData.length > 1 ||
    readStringArrayAtPath(serviceContract, 'data.datastores').length > 0 ||
    hasSensitiveServiceFlag(serviceContract)
  );
}

function requiresProductSpec(repository: RepositoryCatalogRecord): boolean {
  return (
    repository.name === 'zdp-products-lab' ||
    PRODUCT_REPOSITORY_AREAS.has(repository.area ?? '') ||
    PRODUCT_REPOSITORY_PURPOSE_PATTERNS.some((pattern) =>
      repository.purpose?.includes(pattern)
    )
  );
}

function hasOperationalRecoverySurface(value: unknown): boolean {
  return (
    readBooleanAtPath(value, 'audit.required') === true ||
    readBooleanAtPath(value, 'idempotency.required') === true ||
    readStringArrayAtPath(value, 'events.produced').length > 0 ||
    readStringArrayAtPath(value, 'events.consumed').length > 0 ||
    readStringAtPath(value, 'events.dead_letter_policy') !== null
  );
}

function hasSensitiveServiceFlag(value: unknown): boolean {
  return SENSITIVE_SERVICE_FLAGS.some((path) => readBooleanAtPath(value, path) === true);
}

function readRepositoryOrServiceRiskLevel(
  repository: RepositoryCatalogRecord,
  serviceContract: unknown
): string | null {
  return repository.riskLevel ?? readStringAtPath(serviceContract, 'service.risk_level');
}

function readServiceTier(value: unknown): string | null {
  return readStringAtPath(value, 'service.tier') ?? readStringAtPath(value, 'tier');
}

function readRepositoryName(value: unknown): string | null {
  if (!isRecord(value) || !isRecord(value.service)) {
    return null;
  }

  const repo = value.service.repo;

  return typeof repo === 'string' && repo.trim().length > 0 ? repo.trim() : null;
}

function readRuntimeCore(value: unknown): string | null {
  if (!isRecord(value) || !isRecord(value.runtime)) {
    return null;
  }

  const core = value.runtime.core;

  return typeof core === 'string' && core.trim().length > 0 ? core.trim() : null;
}

function readBooleanAtPath(value: unknown, path: string): boolean | null {
  const field = readValueAtPath(value, path);

  return typeof field === 'boolean' ? field : null;
}

function readStringAtPath(value: unknown, path: string): string | null {
  const field = readValueAtPath(value, path);

  return typeof field === 'string' && field.trim().length > 0
    ? field.trim()
    : null;
}

function readStringArrayAtPath(value: unknown, path: string): readonly string[] {
  const field = readValueAtPath(value, path);

  if (!Array.isArray(field)) {
    return [];
  }

  return field.flatMap((item) =>
    typeof item === 'string' && item.trim().length > 0 ? [item.trim()] : []
  );
}

function readValueAtPath(value: unknown, path: string): unknown {
  let current = value;

  for (const part of path.split('.')) {
    if (!isRecord(current)) {
      return undefined;
    }

    current = current[part];
  }

  return current;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
