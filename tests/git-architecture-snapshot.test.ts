import { describe, expect, test } from 'bun:test';
import { join, normalize, resolve } from 'node:path';
import { resolveSnapshotPath } from '../src/git-architecture-snapshot.ts';

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
});
