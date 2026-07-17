import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { assertPinnedLinterHead, readArchitectureLinterPin } from '../src/architecture-ci-pin.ts';
import { buildHardenedGitArgs } from '../src/git-command.ts';

function readArchitectureArgument(argv: string[]): string {
  const flagIndex = argv.indexOf('--architecture');
  const value = flagIndex >= 0 ? argv[flagIndex + 1] : undefined;
  if (value === undefined || value.trim() === '') {
    throw new Error('Usage: bun scripts/validate-architecture-workflow-pin.ts --architecture <path>');
  }
  return value;
}

const linterRoot = process.cwd();
const architectureRoot = resolve(linterRoot, readArchitectureArgument(process.argv.slice(2)));
const workflowPath = resolve(architectureRoot, '.github', 'workflows', 'validate.yml');
const pinnedRef = readArchitectureLinterPin(readFileSync(workflowPath, 'utf8'));
const linterHead = execFileSync(
  'git',
  buildHardenedGitArgs(linterRoot, ['rev-parse', 'HEAD']),
  { encoding: 'utf8', windowsHide: true },
);

assertPinnedLinterHead(pinnedRef, linterHead);
execFileSync(
  process.execPath,
  ['src/cli.ts', 'validate', '--architecture', architectureRoot],
  { cwd: linterRoot, stdio: 'inherit', windowsHide: true },
);
