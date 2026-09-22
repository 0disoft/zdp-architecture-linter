import { describe, expect, test } from 'bun:test';
import { DEFAULT_SNAPSHOT_READ_LIMITS, parseGitBatchOutput, parseGitTreeEntries } from '../src/git-snapshot-reader.ts';

const oid = '1'.repeat(40);
const body = Buffer.from([0, 10, 255, 65]);
const entry = { path: '문서/ file.bin', oid, size: body.length };
const output = Buffer.concat([Buffer.from(`${oid} blob ${body.length}\n`), body, Buffer.from('\n')]);

describe('bounded binary Git batch reads', () => {
  test('preserves binary payload and deduplicates repeated objects', () => {
    expect(parseGitBatchOutput(output, [entry, { ...entry, path: 'copy.bin' }]).get(oid)).toEqual(body);
  });
  test('rejects truncated, missing, mismatched and trailing objects', () => {
    for (const invalid of [output.subarray(0, -1), Buffer.from(`${oid} missing\n`), Buffer.concat([output, Buffer.from('extra')])]) {
      expect(() => parseGitBatchOutput(invalid, [entry])).toThrow();
    }
    expect(() => parseGitBatchOutput(output, [{ ...entry, size: 3 }])).toThrow();
  });
  test('checks counts and sizes before reading payloads', () => {
    const tree = Buffer.from(`100644 blob ${oid}       4\t문서/ file.bin\0`);
    expect(parseGitTreeEntries(tree, DEFAULT_SNAPSHOT_READ_LIMITS)).toEqual([entry]);
    expect(() => parseGitTreeEntries(tree, { ...DEFAULT_SNAPSHOT_READ_LIMITS, maxFileBytes: 3 })).toThrow();
    expect(() => parseGitTreeEntries(Buffer.concat([tree, tree]), { ...DEFAULT_SNAPSHOT_READ_LIMITS, maxFiles: 1 })).toThrow();
    expect(() => parseGitTreeEntries(Buffer.concat([tree, tree]), { ...DEFAULT_SNAPSHOT_READ_LIMITS, maxTotalBytes: 7 })).toThrow();
  });
  test('does not silently flatten symlinks or submodules into files', () => {
    expect(() => parseGitTreeEntries(Buffer.from(`120000 blob ${oid}       4\tlink\0`), DEFAULT_SNAPSHOT_READ_LIMITS)).toThrow();
    expect(() => parseGitTreeEntries(Buffer.from(`160000 commit ${oid}       -\tmodule\0`), DEFAULT_SNAPSHOT_READ_LIMITS)).toThrow();
  });
});
