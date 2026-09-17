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
    return { root: input.architectureRoot, cleanup: async () => {} };
  }
  assertSafeSnapshotRef(input.ref);
  const snapshotRoot = await mkdtemp(join(tmpdir(), 'zdp-arch-diff-'));
  try {
    const files = await listGitFiles(input.architectureRoot, input.ref);
    for (const file of files) {
      const absolutePath = resolveSnapshotPath(snapshotRoot, file);
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, await readGitFile(input.architectureRoot, input.ref, file));
    }
    return {
      root: snapshotRoot,
      cleanup: async () => { await rm(snapshotRoot, { recursive: true, force: true }); }
    };
  } catch (error) {
    await rm(snapshotRoot, { recursive: true, force: true });
    throw error;
  }
}

export function assertSafeSnapshotRef(ref: string): void {
  if (ref.length === 0 || ref !== ref.trim() || ref.startsWith('-') || /[\u0000-\u001F\u007F]/.test(ref)) {
    throw new Error('Unsafe Git revision: refs must be non-empty, free of surrounding or control whitespace, and must not start with `-`.');
  }
}

export function resolveSnapshotPath(snapshotRoot: string, file: string): string {
  // Git paths use '/', not the host platform's separator. Never trim names.
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

export function parseGitTreePaths(output: Buffer): readonly string[] {
  if (output.length === 0) return [];
  if (output[output.length - 1] !== 0) throw new Error('Git tree path output must be NUL terminated.');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const paths: string[] = [];
  let start = 0;
  while (start < output.length) {
    const end = output.indexOf(0, start);
    if (end === start || end < 0) throw new Error('Git tree output contains an empty or unterminated path.');
    paths.push(decoder.decode(output.subarray(start, end)));
    start = end + 1;
  }
  return paths;
}

async function listGitFiles(repositoryRoot: string, ref: string): Promise<readonly string[]> {
  const { stdout } = await execGit(repositoryRoot, ['ls-tree', '-r', '-z', '--name-only', ref]);
  return parseGitTreePaths(stdout);
}

async function readGitFile(repositoryRoot: string, ref: string, file: string): Promise<Buffer> {
  const { stdout } = await execGit(repositoryRoot, ['show', `${ref}:${file}`]);
  return stdout;
}

async function execGit(repositoryRoot: string, args: readonly string[]): Promise<{ readonly stdout: Buffer; readonly stderr: Buffer }> {
  const result = await execFileAsync('git', buildSnapshotGitArgs(repositoryRoot, args), {
    encoding: 'buffer', maxBuffer: 50 * 1024 * 1024
  });
  return { stdout: result.stdout, stderr: result.stderr };
}

export function buildSnapshotGitArgs(repositoryRoot: string, args: readonly string[]): readonly string[] {
  return buildHardenedGitArgs(repositoryRoot, args);
}
