import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Diagnostic } from './diagnostics.ts';

export const REPOSITORY_BASELINE_REQUIRED_FILES = [
  '.editorconfig',
  '.gitattributes',
  'AGENTS.md',
  'README.md'
] as const;

const REPOSITORY_BASELINE_RULE_ID = 'ZDP-REPO-BASELINE-001';

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
