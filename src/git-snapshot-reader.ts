import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { buildHardenedGitArgs } from './git-command.ts';
import { parseGitTreePaths } from './git-tree-paths.ts';

const execFileAsync = promisify(execFile);
export interface SnapshotReadLimits {
  readonly maxFiles: number;
  readonly maxFileBytes: number;
  readonly maxTotalBytes: number;
  readonly timeoutMs: number;
}
export const DEFAULT_SNAPSHOT_READ_LIMITS: SnapshotReadLimits = {
  maxFiles: 50000, maxFileBytes: 50 * 1024 * 1024,
  maxTotalBytes: 256 * 1024 * 1024, timeoutMs: 30000
};
export interface GitTreeBlob {
  readonly path: string;
  readonly oid: string;
  readonly size: number;
}

export function parseGitTreeEntries(output: Buffer, limits: SnapshotReadLimits): readonly GitTreeBlob[] {
  const records = parseGitTreePaths(output);
  if (records.length > limits.maxFiles) throw new Error('Git snapshot exceeds the file count limit.');
  let total = 0;
  return records.map((record) => {
    const tab = record.indexOf('\t');
    const metadata = tab < 0 ? null : /^(100644|100755) blob ([0-9a-f]{40}|[0-9a-f]{64}) +(\d+)$/.exec(record.slice(0, tab));
    if (metadata === null || tab === record.length - 1) {
      throw new Error('Git snapshot requires regular blobs; symlinks, submodules and malformed entries are not supported.');
    }
    const size = Number(metadata[3]);
    if (!Number.isSafeInteger(size) || size < 0 || size > limits.maxFileBytes) {
      throw new Error('Git snapshot exceeds the per-file size limit.');
    }
    total += size;
    if (!Number.isSafeInteger(total) || total > limits.maxTotalBytes) throw new Error('Git snapshot exceeds the total size limit.');
    return { path: record.slice(tab + 1), oid: metadata[2]!, size };
  });
}

export function parseGitBatchOutput(output: Buffer, entries: readonly GitTreeBlob[]): ReadonlyMap<string, Buffer> {
  const expected = new Map(entries.map((entry) => [entry.oid, entry.size] as const));
  const blobs = new Map<string, Buffer>();
  let offset = 0;
  for (const [oid, size] of expected) {
    const end = output.indexOf(10, offset);
    if (end < 0) throw new Error('Truncated Git batch header.');
    const header = output.subarray(offset, end).toString('ascii');
    if (header !== `${oid} blob ${size}`) throw new Error('Git batch object identity, type or size does not match the tree.');
    const start = end + 1;
    const next = start + size;
    if (next >= output.length || output[next] !== 10) throw new Error('Truncated Git batch object.');
    blobs.set(oid, output.subarray(start, next));
    offset = next + 1;
  }
  if (offset !== output.length) throw new Error('Unexpected trailing Git batch output.');
  return blobs;
}

export async function readGitTreeBlobs(
  repositoryRoot: string,
  commit: string,
  overrides: Partial<SnapshotReadLimits> = {}
): Promise<readonly { readonly path: string; readonly content: Buffer }[]> {
  const limits = { ...DEFAULT_SNAPSHOT_READ_LIMITS, ...overrides };
  for (const value of Object.values(limits)) {
    if (!Number.isSafeInteger(value) || value < 1) throw new Error('Snapshot read limits must be positive safe integers.');
  }
  const { stdout } = await execFileAsync('git', buildHardenedGitArgs(repositoryRoot, ['ls-tree', '-r', '-z', '--long', commit]), {
    encoding: 'buffer', maxBuffer: 50 * 1024 * 1024, timeout: limits.timeoutMs
  });
  const entries = parseGitTreeEntries(stdout, limits);
  if (entries.length === 0) return [];
  const oids = [...new Set(entries.map((entry) => entry.oid))];
  const output = await readBatch(repositoryRoot, oids, limits);
  const contents = parseGitBatchOutput(output, entries);
  return entries.map((entry) => {
    const content = contents.get(entry.oid);
    if (content === undefined) throw new Error('Git batch omitted an expected blob.');
    return { path: entry.path, content };
  });
}

function readBatch(repositoryRoot: string, oids: readonly string[], limits: SnapshotReadLimits): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', buildHardenedGitArgs(repositoryRoot, ['cat-file', '--batch']), { stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks: Buffer[] = [];
    let bytes = 0;
    let failure: Error | undefined;
    const fail = (message: string): void => {
      failure ??= new Error(message);
      child.kill('SIGKILL');
    };
    const timer = setTimeout(() => fail('Git batch read timed out.'), limits.timeoutMs);
    const outputLimit = limits.maxTotalBytes + oids.length * 128;
    child.stdout.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > outputLimit) { fail('Git batch output exceeds the total size limit.'); return; }
      if (failure === undefined) chunks.push(chunk);
    });
    // Drain stderr without retaining repository-controlled output.
    child.stderr.resume();
    child.stdin.on('error', () => fail('Git batch input was interrupted.'));
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (failure !== undefined) { reject(failure); return; }
      if (code !== 0) { reject(new Error('Git batch read failed.')); return; }
      resolve(Buffer.concat(chunks, bytes));
    });
    child.stdin.end(`${oids.join('\n')}\n`);
  });
}
