import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { loadArchitectureCatalogs } from '../src/catalog-loader.ts';
import { validateArchitectureCatalogSchemas } from '../src/catalog-schema-validation.ts';
import { getJsonSchemaValidatorCacheStats } from '../src/json-schema-validator-cache.ts';
import {
  validateRepositoryServiceContract,
  validateServiceSchemaFixtures
} from '../src/service-schema-validation.ts';

interface TimingSummary {
  readonly coldMs: number;
  readonly warm: {
    readonly iterations: number;
    readonly minMs: number;
    readonly medianMs: number;
    readonly p95Ms: number;
    readonly maxMs: number;
    readonly meanMs: number;
  };
  readonly resultCount: number;
}

const architectureRoot = resolve(
  import.meta.dir,
  '../../../docs/zdp-architecture'
);
const repositoryRoot = resolve(import.meta.dir, '..');
const iterations = readIterations(process.argv.slice(2));

const catalogs = await loadArchitectureCatalogs(architectureRoot);
const measurements = {
  catalogLoadAndYamlParse: await measure(iterations, async () => {
    const loaded = await loadArchitectureCatalogs(architectureRoot);
    return Object.keys(loaded).length;
  }),
  catalogSchemaReadCompileValidate: await measure(iterations, async () => {
    const result = await validateArchitectureCatalogSchemas({
      architectureRoot,
      catalogs
    });
    return result.diagnostics.length;
  }),
  serviceFixtureReadCompileValidate: await measure(iterations, async () => {
    const diagnostics = await validateServiceSchemaFixtures(architectureRoot);
    return diagnostics.length;
  }),
  repositoryServiceReadCompileValidate: await measure(iterations, async () => {
    const diagnostics = await validateRepositoryServiceContract({
      architectureRoot,
      repositoryRoot
    });
    return diagnostics.length;
  })
};

console.log(
  JSON.stringify(
    {
      schemaVersion: 'zdp.architecture-linter.validation-performance/v1',
      runtime: {
        bun: process.versions.bun ?? null,
        platform: process.platform,
        arch: process.arch
      },
      architectureRoot,
      repositoryRoot,
      measurements,
      schemaValidatorCache: getJsonSchemaValidatorCacheStats()
    },
    null,
    2
  )
);

async function measure(
  warmIterations: number,
  operation: () => Promise<number>
): Promise<TimingSummary> {
  const cold = await measureOnce(operation);
  const warmSamples: number[] = [];

  for (let index = 0; index < warmIterations; index += 1) {
    const sample = await measureOnce(operation);
    if (sample.resultCount !== cold.resultCount) {
      throw new Error(
        `Performance measurement result count drifted from ${cold.resultCount} to ${sample.resultCount}.`
      );
    }
    warmSamples.push(sample.durationMs);
  }

  const sorted = [...warmSamples].sort((left, right) => left - right);
  return {
    coldMs: round(cold.durationMs),
    warm: {
      iterations: warmIterations,
      minMs: round(sorted[0] ?? 0),
      medianMs: round(percentile(sorted, 0.5)),
      p95Ms: round(percentile(sorted, 0.95)),
      maxMs: round(sorted.at(-1) ?? 0),
      meanMs: round(
        warmSamples.reduce((total, sample) => total + sample, 0) /
          warmSamples.length
      )
    },
    resultCount: cold.resultCount
  };
}

async function measureOnce(operation: () => Promise<number>): Promise<{
  readonly durationMs: number;
  readonly resultCount: number;
}> {
  const startedAt = performance.now();
  const resultCount = await operation();

  return {
    durationMs: performance.now() - startedAt,
    resultCount
  };
}

function percentile(sorted: readonly number[], ratio: number): number {
  if (sorted.length === 0) {
    return 0;
  }

  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * ratio) - 1)
  );
  return sorted[index] ?? 0;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function readIterations(args: readonly string[]): number {
  const optionIndex = args.indexOf('--iterations');
  if (optionIndex === -1) {
    return 10;
  }

  const value = Number(args[optionIndex + 1]);
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    throw new Error('--iterations must be an integer between 1 and 100.');
  }

  return value;
}
