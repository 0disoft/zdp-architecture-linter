import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'bun:test';
import { writeGeneratedArchitectureFile } from '../src/generated-output.ts';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe('generated output writes', () => {
  test('replaces the final file only after the staged contents are complete', async () => {
    const architectureRoot = await createArchitectureRoot();
    const outputPath = join(architectureRoot, 'generated', 'registry.json');
    await writeFile(outputPath, 'previous contents\n', 'utf8');

    const result = await writeGeneratedArchitectureFile({
      architectureRoot,
      outputPath: 'generated/registry.json',
      contents: 'replacement contents\n'
    });

    expect(result).toEqual({
      path: outputPath,
      bytes: Buffer.byteLength('replacement contents\n', 'utf8')
    });
    expect(await readFile(outputPath, 'utf8')).toBe('replacement contents\n');
    expect(await listTemporaryOutputs(architectureRoot)).toEqual([]);
  });

  test('leaves one complete result when concurrent writers target the same file', async () => {
    const architectureRoot = await createArchitectureRoot();
    const firstContents = `first:${'a'.repeat(512 * 1024)}`;
    const secondContents = `second:${'b'.repeat(512 * 1024)}`;

    await Promise.all([
      writeGeneratedArchitectureFile({
        architectureRoot,
        outputPath: 'generated/registry.json',
        contents: firstContents
      }),
      writeGeneratedArchitectureFile({
        architectureRoot,
        outputPath: 'generated/registry.json',
        contents: secondContents
      })
    ]);

    const finalContents = await readFile(
      join(architectureRoot, 'generated', 'registry.json'),
      'utf8'
    );
    expect([firstContents, secondContents]).toContain(finalContents);
    expect(await listTemporaryOutputs(architectureRoot)).toEqual([]);
  });

  test('cleans the staged file when final-path promotion fails', async () => {
    const architectureRoot = await createArchitectureRoot();
    const outputDirectory = join(architectureRoot, 'generated', 'registry.json');
    await mkdir(outputDirectory);
    await writeFile(join(outputDirectory, 'sentinel.txt'), 'keep me\n', 'utf8');

    await expect(
      writeGeneratedArchitectureFile({
        architectureRoot,
        outputPath: 'generated/registry.json',
        contents: 'replacement contents\n'
      })
    ).rejects.toBeDefined();

    expect(await readFile(join(outputDirectory, 'sentinel.txt'), 'utf8')).toBe(
      'keep me\n'
    );
    expect(await listTemporaryOutputs(architectureRoot)).toEqual([]);
  });
});

async function createArchitectureRoot(): Promise<string> {
  const architectureRoot = await mkdtemp(join(tmpdir(), 'zdp-generated-output-'));
  temporaryRoots.push(architectureRoot);
  await mkdir(join(architectureRoot, 'generated'));
  await writeFile(
    join(architectureRoot, 'generated', 'README.md'),
    '# Generated\n',
    'utf8'
  );
  return architectureRoot;
}

async function listTemporaryOutputs(architectureRoot: string): Promise<string[]> {
  const entries = await readdir(join(architectureRoot, 'generated'));
  return entries.filter((entry) => entry.endsWith('.tmp'));
}
