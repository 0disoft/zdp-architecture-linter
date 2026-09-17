import { closeSync, constants, fstatSync, openSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { open, realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep, win32 } from 'node:path';

function lexicalPath(root: string, path: string): string {
  if (path.length === 0 || path.includes('\0') || path.includes('\\') || isAbsolute(path) || win32.isAbsolute(path) || /^[A-Za-z]:/.test(path) ||
      path.split('/').some((part) => part === '' || part === '.' || part === '..')) {
    throw new Error('Input path must be a relative descendant of the selected root.');
  }
  const candidate = resolve(root, path);
  assertContained(root, candidate);
  return candidate;
}
function assertContained(root: string, target: string): void {
  const path = relative(root, target);
  if (path === '' || path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path)) {
    throw new Error('Input resolves outside the selected root.');
  }
}

export async function resolveRootBoundPath(root: string, path: string): Promise<string> {
  const realRoot = await realpath(root);
  const target = await realpath(lexicalPath(realRoot, path));
  assertContained(realRoot, target);
  return target;
}
export function resolveRootBoundPathSync(root: string, path: string): string {
  const realRoot = realpathSync(root);
  const target = realpathSync(lexicalPath(realRoot, path));
  assertContained(realRoot, target);
  return target;
}

/** Resolve inside the chosen root, then read the verified regular-file handle. */
export async function readRootBoundText(root: string, path: string): Promise<string> {
  const realRoot = await realpath(root);
  const candidate = lexicalPath(realRoot, path);
  const target = await realpath(candidate);
  assertContained(realRoot, target);
  const handle = await open(target, constants.O_RDONLY | (process.platform === 'win32' ? 0 : constants.O_NOFOLLOW));
  try {
    const opened = await handle.stat();
    if (!opened.isFile()) throw new Error('Input must be a regular file.');
    const current = await realpath(candidate);
    assertContained(realRoot, current);
    const currentStat = await stat(current);
    if (opened.dev !== currentStat.dev || opened.ino !== currentStat.ino) throw new Error('Input changed while it was being opened.');
    return await handle.readFile('utf8');
  } finally { await handle.close(); }
}
export function readRootBoundTextSync(root: string, path: string): string {
  const realRoot = realpathSync(root);
  const candidate = lexicalPath(realRoot, path);
  const target = realpathSync(candidate);
  assertContained(realRoot, target);
  const descriptor = openSync(target, constants.O_RDONLY | (process.platform === 'win32' ? 0 : constants.O_NOFOLLOW));
  try {
    const opened = fstatSync(descriptor);
    if (!opened.isFile()) throw new Error('Input must be a regular file.');
    const current = realpathSync(candidate);
    assertContained(realRoot, current);
    const currentStat = statSync(current);
    if (opened.dev !== currentStat.dev || opened.ino !== currentStat.ino) throw new Error('Input changed while it was being opened.');
    return readFileSync(descriptor, 'utf8');
  } finally { closeSync(descriptor); }
}
