import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, normalize, relative, resolve, sep, win32 } from 'node:path';
import { promisify } from 'node:util';
import { buildHardenedGitArgs } from './git-command.ts';
import { readGitTreeBlobs, type SnapshotReadLimits } from './git-snapshot-reader.ts';
export { parseGitTreePaths } from './git-tree-paths.ts';

const execFileAsync = promisify(execFile);

export interface ArchitectureSnapshot {
  readonly root: string;
  readonly requestedRef?: string;
  readonly resolvedRef?: string;
  readonly cleanup: () => Promise<void>;
}

export async function loadArchitectureSnapshot(input: {
  readonly architectureRoot: string;
  readonly ref?: string;
  readonly limits?: Partial<SnapshotReadLimits>;
}): Promise<ArchitectureSnapshot> {
  if (input.ref === undefined || input.ref === 'worktree') {
    return { root: input.architectureRoot, requestedRef: 'worktree', cleanup: async () => {} };
  }
  const commit = await resolveSnapshotCommit(input.architectureRoot, input.ref);
  const snapshotRoot = await mkdtemp(join(tmpdir(), 'zdp-arch-diff-'));
  try {
    const files = await readGitTreeBlobs(input.architectureRoot, commit, input.limits);
    const destinations = new Set<string>();
    for (const file of files) {
      const absolutePath = resolveSnapshotPath(snapshotRoot, file.path);
      const key = process.platform === 'win32' ? absolutePath.toLowerCase() : absolutePath;
      if (destinations.has(key)) throw new Error('Git snapshot paths alias the same destination.');
      destinations.add(key);
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, file.content, { flag: 'wx' });
    }
    return {
      root: snapshotRoot, requestedRef: input.ref, resolvedRef: commit,
      cleanup: async () => { await rm(snapshotRoot, { recursive: true, force: true }); }
    };
  } catch (error) {
    await rm(snapshotRoot, { recursive: true, force: true });
    throw error;
  }
}

export async function resolveSnapshotCommit(repositoryRoot: string, ref: string): Promise<string> {
  assertSafeSnapshotRef(ref);
  const { stdout } = await execGit(repositoryRoot, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]);
  const commit = stdout.toString('ascii').trim();
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(commit)) {
    throw new Error('Git revision did not resolve to a full commit object id.');
  }
  return commit;
}

export function assertSafeSnapshotRef(ref: string): void {
  if (ref.length === 0 || ref !== ref.trim() || ref.startsWith('-') || /[\u0000-\u001F\u007F]/.test(ref)) {
    throw new Error('Unsafe Git revision: refs must be non-empty, free of surrounding or control whitespace, and must not start with `-`.');
  }
}

export function resolveSnapshotPath(snapshotRoot: string, file: string): string {
  const segments = file.split('/');
  if (file.length === 0 || file.includes('\0') || isAbsolute(file) || win32.isAbsolute(file) ||
      /^[A-Za-z]:/.test(file) || segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')) {
    throw new Error(`Unsafe git tree path "${file}": paths must be relative descendants of the snapshot root.`);
  }
  if (process.platform === 'win32' && segments.some((segment) =>
    /[<>:"\\|?*\u0000-\u001F]/.test(segment) || /[ .]$/.test(segment) ||
    /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(segment))) {
    throw new Error('Git tree contains a path that cannot be represented without aliasing on Windows.');
  }
  const snapshotRootPath = resolve(snapshotRoot);
  const absolutePath = resolve(snapshotRootPath, ...segments);
  const relativePath = relative(snapshotRootPath, absolutePath);
  if (relativePath === '' || relativePath.startsWith(`..${sep}`) || relativePath === '..' || isAbsolute(relativePath)) {
    throw new Error(`Unsafe git tree path "${file}": resolved path escapes snapshot root.`);
  }
  return normalize(absolutePath);
}

async function execGit(repositoryRoot: string, args: readonly string[]): Promise<{ readonly stdout: Buffer; readonly stderr: Buffer }> {
  const result = await execFileAsync('git', buildSnapshotGitArgs(repositoryRoot, args), {
    encoding: 'buffer', maxBuffer: 50 * 1024 * 1024, timeout: 30000
  });
  return { stdout: result.stdout, stderr: result.stderr };
}

export function buildSnapshotGitArgs(repositoryRoot: string, args: readonly string[]): readonly string[] {
  return buildHardenedGitArgs(repositoryRoot, args);
}
