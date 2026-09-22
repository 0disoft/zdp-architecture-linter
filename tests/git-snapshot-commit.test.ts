import { expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadArchitectureSnapshot, resolveSnapshotCommit } from '../src/git-architecture-snapshot.ts';

test('resolves tags to a commit and records the immutable snapshot source', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zdp-git-commit-'));
  const git = (...args: string[]): string => execFileSync('git', [
    '-c', 'core.hooksPath=', '-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false',
    '-c', 'user.name=Snapshot Test', '-c', 'user.email=snapshot@example.invalid', '-C', root, ...args
  ], { encoding: 'utf8', stdio: 'pipe' }).trim();
  try {
    git('init');
    await writeFile(join(root, 'input.txt'), 'base');
    git('add', '--all'); git('commit', '-m', 'base');
    git('tag', '-a', 'snapshot-tag', '-m', 'tag');
    const commit = git('rev-parse', 'HEAD');
    expect(await resolveSnapshotCommit(root, 'snapshot-tag')).toBe(commit);
    const snapshot = await loadArchitectureSnapshot({ architectureRoot: root, ref: 'snapshot-tag' });
    try {
      expect(snapshot.requestedRef).toBe('snapshot-tag');
      expect(snapshot.resolvedRef).toBe(commit);
      await writeFile(join(root, 'input.txt'), 'head');
      git('add', '--all'); git('commit', '-m', 'head');
      git('tag', '-f', 'snapshot-tag');
      expect(await readFile(join(snapshot.root, 'input.txt'), 'utf8')).toBe('base');
      expect(snapshot.resolvedRef).toBe(commit);
    } finally { await snapshot.cleanup(); }
    await expect(resolveSnapshotCommit(root, 'HEAD:input.txt')).rejects.toThrow();
  } finally { await rm(root, { recursive: true, force: true }); }
});
