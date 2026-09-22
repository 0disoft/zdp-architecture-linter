import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open, readFile, readdir, stat } from 'node:fs/promises';
import { promisify } from 'node:util';
import { loadArchitectureCatalogs } from './catalog-loader.ts';
import { validateArchitectureCatalogSchemas } from './catalog-schema-validation.ts';
import { createValidationContext, type ValidationContext } from './validation-context.ts';
import { assertSafeSnapshotRef, buildSnapshotGitArgs, loadArchitectureSnapshot } from './git-architecture-snapshot.ts';
import { resolveRootBoundPath } from './root-bound-input.ts';

const execFileAsync = promisify(execFile);
const INPUT_ROOTS = ['catalogs', 'rules', 'schemas', 'fixtures', 'docs', 'adr', 'ROADMAP.md'] as const;
const MAX_FILES = 50000;
const MAX_TOTAL_BYTES = 256 * 1024 * 1024;
interface FileDigest { readonly path: string; readonly sha256: string; readonly bytes: number; }
export interface ArchitectureInputManifest {
  readonly sha256: string; readonly policySha256: string; readonly schemaSha256: string;
  readonly fileCount: number; readonly bytes: number; readonly scope: readonly string[];
}
export interface DiffSourceProvenance {
  readonly kind: 'git' | 'worktree'; readonly requestedRef: string; readonly commit: string | null;
  readonly input: ArchitectureInputManifest;
}
export interface DiffProvenance {
  readonly schemaVersion: 'zdp-architecture-linter/diff-provenance/v1';
  readonly observedAt: string;
  readonly tool: { readonly version: string; readonly bunVersion: string; };
  readonly base: DiffSourceProvenance; readonly head: DiffSourceProvenance;
}

export async function loadProvenanceSnapshot(root: string, ref?: string): Promise<{
  readonly snapshot: Awaited<ReturnType<typeof loadArchitectureSnapshot>>;
  readonly source: Omit<DiffSourceProvenance, 'input'>;
}> {
  const requestedRef = ref ?? 'worktree';
  if (requestedRef === 'worktree') return {
    snapshot: await loadArchitectureSnapshot({ architectureRoot: root, ref: 'worktree' }),
    source: { kind: 'worktree', requestedRef, commit: null }
  };
  assertSafeSnapshotRef(requestedRef);
  const { stdout } = await execFileAsync('git', buildSnapshotGitArgs(root, ['rev-parse', '--verify', '--end-of-options', `${requestedRef}^{commit}`]), {
    encoding: 'utf8', maxBuffer: 64 * 1024, timeout: 10000
  });
  const commit = stdout.trim();
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(commit)) throw new Error('Diff source did not resolve to a full commit id.');
  return {
    snapshot: await loadArchitectureSnapshot({ architectureRoot: root, ref: commit }),
    source: { kind: 'git', requestedRef, commit }
  };
}
export async function loadDiffValidationContext(architectureRoot: string, observedAt: Date): Promise<ValidationContext> {
  if (!Number.isFinite(observedAt.getTime())) throw new Error('Diff observation time must be valid.');
  const catalogs = await loadArchitectureCatalogs(architectureRoot);
  const validation = await validateArchitectureCatalogSchemas({ architectureRoot, catalogs, observedAt });
  return createValidationContext({ architectureRoot, catalogSchemaPreflight: { catalogs, validation } });
}

export async function hashArchitectureInputs(root: string): Promise<ArchitectureInputManifest> {
  const files: FileDigest[] = [];
  let totalBytes = 0;
  const visit = async (path: string, ancestors: ReadonlySet<string>): Promise<void> => {
    const absolute = await resolveRootBoundPath(root, path);
    const info = await stat(absolute);
    if (info.isDirectory()) {
      if (ancestors.has(absolute)) throw new Error('Architecture input manifest contains a directory-link cycle.');
      const next = new Set(ancestors); next.add(absolute);
      for (const entry of (await readdir(absolute)).sort()) await visit(`${path}/${entry}`, next);
      return;
    }
    if (!info.isFile()) throw new Error('Architecture manifest inputs must be regular files.');
    if (files.length >= MAX_FILES || info.size > MAX_TOTAL_BYTES - totalBytes) throw new Error('Architecture input manifest exceeds its resource limit.');
    const handle = await open(absolute, constants.O_RDONLY | (process.platform === 'win32' ? 0 : constants.O_NOFOLLOW));
    try {
      const opened = await handle.stat();
      if (!opened.isFile() || opened.dev !== info.dev || opened.ino !== info.ino) throw new Error('Architecture input changed before hashing.');
      const hash = createHash('sha256');
      let bytes = 0;
      for await (const chunk of handle.createReadStream({ autoClose: false })) {
        const buffer = chunk as Buffer;
        bytes += buffer.length; totalBytes += buffer.length;
        if (totalBytes > MAX_TOTAL_BYTES) throw new Error('Architecture input manifest exceeds its byte limit.');
        hash.update(buffer);
      }
      const after = await handle.stat();
      if (bytes !== opened.size || after.size !== opened.size || after.mtimeMs !== opened.mtimeMs) throw new Error('Architecture input changed during hashing.');
      files.push({ path, sha256: hash.digest('hex'), bytes });
    } finally { await handle.close(); }
  };
  for (const path of INPUT_ROOTS) {
    try { await resolveRootBoundPath(root, path); }
    catch (error) {
      if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
    await visit(path, new Set());
  }
  files.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  const digest = (selected: readonly FileDigest[]): string => createHash('sha256').update(JSON.stringify(['architecture-input-manifest/v1', selected])).digest('hex');
  return {
    sha256: digest(files), policySha256: digest(files.filter((file) => file.path.startsWith('rules/'))),
    schemaSha256: digest(files.filter((file) => file.path.startsWith('schemas/'))),
    fileCount: files.length, bytes: totalBytes, scope: INPUT_ROOTS
  };
}
export function assertManifestUnchanged(before: ArchitectureInputManifest, after: ArchitectureInputManifest): void {
  if (before.sha256 !== after.sha256) throw new Error('Architecture worktree changed during validation; retry against a stable input.');
}
export async function readLinterVersion(): Promise<string> {
  const metadata: unknown = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  if (typeof metadata !== 'object' || metadata === null || !('version' in metadata) || typeof metadata.version !== 'string' || metadata.version.length === 0) {
    throw new Error('Linter package metadata has no version.');
  }
  return metadata.version;
}
