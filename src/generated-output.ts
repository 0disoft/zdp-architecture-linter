import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { basename, dirname, relative, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const GENERATED_DIRECTORY = 'generated';
const GENERATED_BOUNDARY_FILE = 'README.md';
const RENAME_RETRY_DELAYS_MS = [5, 20, 50, 100] as const;

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
 * purpose: Locate the contained atomic-write boundary for generated architecture reports and registries.
 * search: generated output, atomic write, registry write, pack report, path containment, generated README
 * invariant: Generated writes stay under architecture generated/, require its boundary README, and replace final files only after a complete staged write.
 * risk: config, state, data_consistency
 */
export async function writeGeneratedArchitectureFile(input: {
  readonly architectureRoot: string;
  readonly outputPath: string;
  readonly contents: string;
}): Promise<GeneratedOutputWriteResult> {
  const { outputPath } = await resolveGeneratedOutputPath(input);
  const outputDirectory = dirname(outputPath);
  await mkdir(outputDirectory, { recursive: true });
  await writeFileAtomically(outputPath, input.contents);

  return {
    path: outputPath,
    bytes: Buffer.byteLength(input.contents, 'utf8')
  };
}

async function writeFileAtomically(
  outputPath: string,
  contents: string
): Promise<void> {
  const outputDirectory = dirname(outputPath);
  const temporaryPath = resolve(
    outputDirectory,
    `.${basename(outputPath)}.${process.pid}.${randomUUID()}.tmp`
  );
  let temporaryFile: Awaited<ReturnType<typeof open>> | undefined;

  try {
    temporaryFile = await open(temporaryPath, 'wx', 0o600);
    await temporaryFile.writeFile(contents, 'utf8');
    await temporaryFile.sync();
    await temporaryFile.close();
    temporaryFile = undefined;
    await renameWithTransientRetry(temporaryPath, outputPath);
  } catch (error) {
    if (temporaryFile !== undefined) {
      await temporaryFile.close().catch(() => undefined);
    }
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function renameWithTransientRetry(
  sourcePath: string,
  destinationPath: string
): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(sourcePath, destinationPath);
      return;
    } catch (error) {
      const retryDelay = RENAME_RETRY_DELAYS_MS[attempt];

      if (retryDelay === undefined || !isTransientRenameError(error)) {
        throw error;
      }

      await delay(retryDelay);
    }
  }
}

function isTransientRenameError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }

  const code = error.code;

  return code === 'EPERM' || code === 'EACCES' || code === 'EBUSY';
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
