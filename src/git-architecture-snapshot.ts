import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, normalize, relative, resolve, sep, win32 } from 'node:path';
import { promisify } from 'node:util';
import { buildHardenedGitArgs } from './git-command.ts';

const execFileAsync = promisify(execFile);

export interface ArchitectureSnapshot {
  readonly root: string;
  readonly cleanup: () => Promise<void>;
}

export async function loadArchitectureSnapshot(input: {
  readonly architectureRoot: string;
  readonly ref?: string;
}): Promise<ArchitectureSnapshot> {
  if (input.ref === undefined || input.ref === 'worktree') {
    return {
      root: input.architectureRoot,
      cleanup: async () => {}
    };
  }

  const snapshotRoot = await mkdtemp(join(tmpdir(), 'zdp-arch-diff-'));

  try {
    const files = await listGitFiles(input.architectureRoot, input.ref);

    for (const file of files) {
      const absolutePath = resolveSnapshotPath(snapshotRoot, file);

      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(
        absolutePath,
        await readGitFile(input.architectureRoot, input.ref, file)
      );
    }

    return {
      root: snapshotRoot,
      cleanup: async () => {
        await rm(snapshotRoot, { recursive: true, force: true });
      }
    };
  } catch (error) {
    await rm(snapshotRoot, { recursive: true, force: true });
    throw error;
  }
}

export function resolveSnapshotPath(snapshotRoot: string, file: string): string {
  const normalizedTreePath = file.trim().replaceAll('\\', '/');
  const segments = normalizedTreePath.split('/');

  if (
    normalizedTreePath.length === 0 ||
    isAbsolute(normalizedTreePath) ||
    win32.isAbsolute(normalizedTreePath) ||
    segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')
  ) {
    throw new Error(`Unsafe git tree path "${file}": paths must be relative descendants of the snapshot root.`);
  }

  const snapshotRootPath = resolve(snapshotRoot);
  const absolutePath = resolve(snapshotRootPath, ...segments);
  const relativePath = relative(snapshotRootPath, absolutePath);

  if (
    relativePath === '' ||
    relativePath.startsWith(`..${sep}`) ||
    relativePath === '..' ||
    isAbsolute(relativePath)
  ) {
    throw new Error(`Unsafe git tree path "${file}": resolved path escapes snapshot root.`);
  }

  return normalize(absolutePath);
}

async function listGitFiles(
  repositoryRoot: string,
  ref: string
): Promise<readonly string[]> {
  const { stdout } = await execGit(repositoryRoot, [
    'ls-tree',
    '-r',
    '--name-only',
    ref
  ]);

  return stdout
    .toString('utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

async function readGitFile(
  repositoryRoot: string,
  ref: string,
  file: string
): Promise<Buffer> {
  const { stdout } = await execGit(repositoryRoot, [
    'show',
    `${ref}:${file}`
  ]);

  return stdout;
}

async function execGit(
  repositoryRoot: string,
  args: readonly string[]
): Promise<{ readonly stdout: Buffer; readonly stderr: Buffer }> {
  const result = await execFileAsync('git', buildSnapshotGitArgs(repositoryRoot, args), {
    encoding: 'buffer',
    maxBuffer: 50 * 1024 * 1024
  });

  return {
    stdout: result.stdout,
    stderr: result.stderr
  };
}

export function buildSnapshotGitArgs(
  repositoryRoot: string,
  args: readonly string[]
): readonly string[] {
  return buildHardenedGitArgs(repositoryRoot, args);
}
