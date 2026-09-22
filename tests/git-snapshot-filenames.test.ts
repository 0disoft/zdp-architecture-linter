import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { loadArchitectureSnapshot, parseGitTreePaths, resolveSnapshotPath } from '../src/git-architecture-snapshot.ts';

describe('Git snapshot filenames', () => {
  test('parses NUL records without quoting, trimming or newline splitting', () => {
    const names = ['catalogs/한글.yaml', 'docs/a"b.md', 'docs/ leading ', 'docs/line\nbreak.md', 'docs/tab\tname.md'];
    expect(parseGitTreePaths(Buffer.from(`${names.join('\0')}\0`))).toEqual(names);
    expect(parseGitTreePaths(Buffer.alloc(0))).toEqual([]);
    expect(() => parseGitTreePaths(Buffer.from('unterminated'))).toThrow();
    expect(() => parseGitTreePaths(Buffer.from([0xff, 0]))).toThrow();
  });
  test('preserves leading spaces in path components', () => {
    expect(resolveSnapshotPath('/tmp/snapshot', ' leading/file.yaml')).toBe(resolve('/tmp/snapshot', ' leading/file.yaml'));
  });
  test('never interprets a drive-relative name as a safe descendant', () => {
    expect(() => resolveSnapshotPath('/tmp/snapshot', 'C:outside')).toThrow();
  });
  test('materializes Unicode and space-containing names through real Git', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zdp-git-names-'));
    const git = (...args: string[]): void => {
      execFileSync('git', ['-c', 'core.hooksPath=', '-c', 'commit.gpgsign=false', '-C', root, ...args], { stdio: 'pipe' });
    };
    try {
      git('init');
      await mkdir(join(root, '문서'));
      await writeFile(join(root, '문서', ' 공백 파일.md'), '원문\n');
      git('add', '--all');
      git('-c', 'user.name=Snapshot Test', '-c', 'user.email=snapshot@example.invalid', 'commit', '-m', 'fixture');
      const snapshot = await loadArchitectureSnapshot({ architectureRoot: root, ref: 'HEAD' });
      try {
        expect(await readFile(join(snapshot.root, '문서', ' 공백 파일.md'), 'utf8')).toBe('원문\n');
      } finally { await snapshot.cleanup(); }
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
