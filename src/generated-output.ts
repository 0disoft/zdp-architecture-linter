import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';

const GENERATED_DIRECTORY = 'generated';
const GENERATED_BOUNDARY_FILE = 'README.md';

export interface GeneratedOutputWriteResult {
  readonly path: string;
  readonly bytes: number;
}

export interface GeneratedOutputCheckResult {
  readonly path: string;
  readonly bytes: number;
  readonly expectedBytes: number;
  readonly matches: boolean;
}

/**
 * mf:anchor zdp.architecture-linter.generated-output-boundary
 * purpose: Locate the path containment and boundary-file checks for generated architecture reports and registries.
 * search: generated output, registry write, pack report, path containment, generated README
 * invariant: Generated writes stay under architecture generated/ and require the generated boundary README.
 * risk: config, state, data_consistency
 */
export async function writeGeneratedArchitectureFile(input: {
  readonly architectureRoot: string;
  readonly outputPath: string;
  readonly contents: string;
}): Promise<GeneratedOutputWriteResult> {
  const { outputPath } = await resolveGeneratedOutputPath(input);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, input.contents, 'utf8');

  return {
    path: outputPath,
    bytes: Buffer.byteLength(input.contents, 'utf8')
  };
}

export async function checkGeneratedArchitectureFile(input: {
  readonly architectureRoot: string;
  readonly outputPath: string;
  readonly contents: string;
}): Promise<GeneratedOutputCheckResult> {
  const { outputPath } = await resolveGeneratedOutputPath(input);
  let currentContents: string;

  try {
    currentContents = await readFile(outputPath, 'utf8');
  } catch {
    throw new Error(`Generated output file does not exist: ${outputPath}`);
  }

  return {
    path: outputPath,
    bytes: Buffer.byteLength(currentContents, 'utf8'),
    expectedBytes: Buffer.byteLength(input.contents, 'utf8'),
    matches: currentContents === input.contents
  };
}

async function resolveGeneratedOutputPath(input: {
  readonly architectureRoot: string;
  readonly outputPath: string;
}): Promise<{
  readonly outputPath: string;
  readonly generatedRoot: string;
}> {
  const architectureRoot = resolve(input.architectureRoot);
  const generatedRoot = resolve(architectureRoot, GENERATED_DIRECTORY);
  const outputPath = resolve(architectureRoot, input.outputPath);

  if (!isInsideDirectory(outputPath, generatedRoot) || outputPath === generatedRoot) {
    throw new Error(
      `Generated output path must stay under \`${GENERATED_DIRECTORY}/\`.`
    );
  }

  await assertGeneratedBoundary(generatedRoot);

  return { outputPath, generatedRoot };
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
