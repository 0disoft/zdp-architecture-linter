import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';

const GENERATED_DIRECTORY = 'generated';
const GENERATED_BOUNDARY_FILE = 'README.md';

export interface GeneratedOutputWriteResult {
  readonly path: string;
  readonly bytes: number;
}

export async function writeGeneratedArchitectureFile(input: {
  readonly architectureRoot: string;
  readonly outputPath: string;
  readonly contents: string;
}): Promise<GeneratedOutputWriteResult> {
  const architectureRoot = resolve(input.architectureRoot);
  const generatedRoot = resolve(architectureRoot, GENERATED_DIRECTORY);
  const outputPath = resolve(architectureRoot, input.outputPath);

  if (!isInsideDirectory(outputPath, generatedRoot) || outputPath === generatedRoot) {
    throw new Error(
      `Generated output path must stay under \`${GENERATED_DIRECTORY}/\`.`
    );
  }

  await assertGeneratedBoundary(generatedRoot);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, input.contents, 'utf8');

  return {
    path: outputPath,
    bytes: Buffer.byteLength(input.contents, 'utf8')
  };
}

function isInsideDirectory(candidatePath: string, directoryPath: string): boolean {
  const relativePath = relative(directoryPath, candidatePath);

  return (
    relativePath.length > 0 &&
    !relativePath.startsWith('..') &&
    !relativePath.includes(':')
  );
}

async function assertGeneratedBoundary(generatedRoot: string): Promise<void> {
  try {
    await readFile(resolve(generatedRoot, GENERATED_BOUNDARY_FILE), 'utf8');
  } catch {
    throw new Error(
      `Generated output requires \`${GENERATED_DIRECTORY}/${GENERATED_BOUNDARY_FILE}\` boundary file.`
    );
  }
}
