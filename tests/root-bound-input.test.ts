import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readRootBoundText, readRootBoundTextSync } from '../src/root-bound-input.ts';
import { compileJsonSchemaFile } from '../src/json-schema-validator-cache.ts';
import { loadArchitectureCatalogs } from '../src/catalog-loader.ts';
import { createMinimalArchitectureFiles, withArchitectureFiles } from './cli-test-helpers.ts';

async function withRoots(run: (root: string, outside: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'zdp-root-'));
  const outside = await mkdtemp(join(tmpdir(), 'zdp-outside-'));
  try { await run(root, outside); }
  finally { await Promise.all([rm(root, { recursive: true, force: true }), rm(outside, { recursive: true, force: true })]); }
}
const linkType = process.platform === 'win32' ? 'junction' : 'dir';

describe('selected-root input reads', () => {
  test('allows regular files and internal directory links', async () => {
    await withRoots(async (root) => {
      await mkdir(join(root, 'real'));
      await writeFile(join(root, 'real', '한글.txt'), 'content');
      await symlink(join(root, 'real'), join(root, 'alias'), linkType);
      expect(await readRootBoundText(root, 'alias/한글.txt')).toBe('content');
      expect(readRootBoundTextSync(root, 'alias/한글.txt')).toBe('content');
    });
  });
  test('rejects escaping links, traversal and directories for both readers', async () => {
    await withRoots(async (root, outside) => {
      await writeFile(join(outside, 'secret.txt'), 'not allowed');
      await symlink(outside, join(root, 'external'), linkType);
      await mkdir(join(root, 'directory'));
      for (const path of ['external/secret.txt', '../secret.txt', 'C:secret.txt', 'directory']) {
        await expect(readRootBoundText(root, path)).rejects.toThrow();
        expect(() => readRootBoundTextSync(root, path)).toThrow();
      }
    });
  });
  test('rechecks containment even when the schema contents are already cached', async () => {
    await withRoots(async (root, outside) => {
      await mkdir(join(root, 'inside'));
      const schema = JSON.stringify({ type: 'object' });
      await writeFile(join(root, 'inside', 'schema.json'), schema);
      await writeFile(join(outside, 'schema.json'), schema);
      const link = join(root, 'schemas');
      await symlink(join(root, 'inside'), link, linkType);
      const input = { absolutePath: join(link, 'schema.json'), allowedRoot: root };
      expect((await compileJsonSchemaFile(input))({})).toBe(true);
      await rm(link);
      await symlink(outside, link, linkType);
      await expect(compileJsonSchemaFile(input)).rejects.toThrow('outside the selected root');
    });
  });
  test('catalog loader cannot follow an external rules directory', async () => {
    await withRoots(async (_root, outside) => {
      await writeFile(join(outside, 'money.rules.yaml'), 'rules: []\n');
      await withArchitectureFiles(createMinimalArchitectureFiles({}), async ({ architectureRoot }) => {
        await rm(join(architectureRoot, 'rules'), { recursive: true });
        await symlink(outside, join(architectureRoot, 'rules'), linkType);
        await expect(loadArchitectureCatalogs(architectureRoot)).rejects.toThrow();
      });
    });
  });
});
