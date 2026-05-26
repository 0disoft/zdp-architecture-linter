import { stat } from 'node:fs/promises';
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
const EXPERIMENT_FILE = 'EXPERIMENT.md';

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

  if (repository === undefined || !isLabRepository(repository)) {
    return [];
  }

  if (await isRegularFile(join(input.repositoryRoot, EXPERIMENT_FILE))) {
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

function isLabRepository(repository: RepositoryCatalogRecord): boolean {
  return (
    repository.repoStage === 'lab_only' ||
    repository.kind === 'lab' ||
    repository.area === 'labs'
  );
}

function readRepositoryName(value: unknown): string | null {
  if (!isRecord(value) || !isRecord(value.service)) {
    return null;
  }

  const repo = value.service.repo;

  return typeof repo === 'string' && repo.trim().length > 0 ? repo.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
