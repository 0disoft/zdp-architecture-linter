import { describe, expect, test } from 'bun:test';
import { join, normalize, resolve } from 'node:path';
import {
  assertSafeSnapshotRef,
  buildSnapshotGitArgs,
  resolveSnapshotPath
} from '../src/git-architecture-snapshot.ts';

describe('resolveSnapshotPath', () => {
  test('allows regular repository-relative paths', () => {
    expect(resolveSnapshotPath('/tmp/snapshot', 'catalogs/services.yaml')).toBe(
      normalize(join(resolve('/tmp/snapshot'), 'catalogs', 'services.yaml'))
    );
  });

  test('rejects parent-directory traversal paths', () => {
    expect(() =>
      resolveSnapshotPath('/tmp/snapshot', 'a/../../../workspace/pwned')
    ).toThrow('paths must be relative descendants of the snapshot root');
  });

  test('rejects absolute paths', () => {
    expect(() => resolveSnapshotPath('/tmp/snapshot', '/workspace/pwned')).toThrow(
      'paths must be relative descendants of the snapshot root'
    );
  });

  test('rejects Windows absolute paths from crafted trees', () => {
    expect(() =>
      resolveSnapshotPath('/tmp/snapshot', 'C:/Users/Public/pwned')
    ).toThrow('paths must be relative descendants of the snapshot root');
  });

  test('uses hardened git args for snapshot reads', () => {
    expect(buildSnapshotGitArgs('/tmp/arch', ['show', 'HEAD:catalogs/services.yaml'])).toEqual([
      '-c',
      'core.fsmonitor=false',
      '-c',
      'core.hooksPath=',
      '-c',
      'credential.helper=',
      '-C',
      '/tmp/arch',
      'show',
      'HEAD:catalogs/services.yaml'
    ]);
  });

  test('accepts revision expressions that cannot become Git options', () => {
    expect(() => assertSafeSnapshotRef('HEAD~1')).not.toThrow();
    expect(() => assertSafeSnapshotRef('refs/heads/main')).not.toThrow();
  });

  test('rejects option-like and control-character Git revisions', () => {
    for (const ref of [
      '--output=outside.txt',
      '-p',
      ' HEAD',
      'HEAD\n-p',
      'HEAD\t-p'
    ]) {
      expect(() => assertSafeSnapshotRef(ref)).toThrow('Unsafe Git revision');
    }
  });
});
