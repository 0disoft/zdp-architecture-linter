import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { loadArchitectureCatalogs } from '../src/catalog-loader.ts';
import { validateArchitectureCatalogSchemas } from '../src/catalog-schema-validation.ts';
import { getJsonSchemaValidatorCacheStats } from '../src/json-schema-validator-cache.ts';
import {
  validateRepositoryServiceContract,
  validateServiceSchemaFixtures
} from '../src/service-schema-validation.ts';
import { validateArchitecture } from '../src/validation.ts';
import {
  evaluateValidationPerformanceBudget,
  type ValidationPerformanceBudget,
  type ValidationPerformanceBudgetEvaluation,
  type ValidationPerformanceRuntime,
  type ValidationPerformanceSample
} from '../src/validation-performance-budget.ts';

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

interface ProfileOptions {
  readonly architectureRoot: string;
  readonly repositoryRoot: string;
  readonly iterations: number;
  readonly baselinePath?: string;
  readonly budgetPath: string;
}

interface PerformanceBudgetDocument {
  readonly schemaVersion: 'zdp.architecture-linter.validation-performance-budget/v1';
  readonly fullArchitectureValidation: ValidationPerformanceBudget;
}

interface UnevaluatedPerformanceBudget {
  readonly schemaVersion: 'zdp.architecture-linter.validation-performance-budget-result/v1';
  readonly measurement: 'fullArchitectureValidation';
  readonly status: 'not_evaluated';
  readonly maxRegressionPercent: number;
  readonly reason: 'baseline_not_provided';
}

type PerformanceBudgetResult =
  | ValidationPerformanceBudgetEvaluation
  | UnevaluatedPerformanceBudget;

const DEFAULT_ARCHITECTURE_ROOT = resolve(
  import.meta.dir,
  '../../../docs/zdp-architecture'
);
const DEFAULT_REPOSITORY_ROOT = resolve(import.meta.dir, '..');
const DEFAULT_BUDGET_PATH = resolve(
  import.meta.dir,
  '../performance/validation-performance-budget.json'
);

try {
  await main(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

async function main(args: readonly string[]): Promise<void> {
  const options = readProfileOptions(args);
  const runtime: ValidationPerformanceRuntime = {
    bun: process.versions.bun ?? null,
    platform: process.platform,
    arch: process.arch
  };
  const catalogs = await loadArchitectureCatalogs(options.architectureRoot);
  const measurements = {
    catalogLoadAndYamlParse: await measure(options.iterations, async () => {
      const loaded = await loadArchitectureCatalogs(options.architectureRoot);
      return Object.keys(loaded).length;
    }),
    catalogSchemaReadCompileValidate: await measure(
      options.iterations,
      async () => {
        const result = await validateArchitectureCatalogSchemas({
          architectureRoot: options.architectureRoot,
          catalogs
        });
        return result.diagnostics.length;
      }
    ),
    serviceFixtureReadCompileValidate: await measure(
      options.iterations,
      async () => {
        const diagnostics = await validateServiceSchemaFixtures(
          options.architectureRoot
        );
        return diagnostics.length;
      }
    ),
    repositoryServiceReadCompileValidate: await measure(
      options.iterations,
      async () => {
        const diagnostics = await validateRepositoryServiceContract({
          architectureRoot: options.architectureRoot,
          repositoryRoot: options.repositoryRoot
        });
        return diagnostics.length;
      }
    ),
    fullArchitectureValidation: await measure(options.iterations, async () => {
      const result = await validateArchitecture({
        architectureRoot: options.architectureRoot,
        repositoryRoot: options.repositoryRoot
      });
      return result.diagnostics.length;
    })
  };
  const budgetDocument = await loadPerformanceBudget(options.budgetPath);
  const budget = await createPerformanceBudgetResult({
    baselinePath: options.baselinePath,
    current: {
      runtime,
      warmP95Ms: measurements.fullArchitectureValidation.warm.p95Ms
    },
    budget: budgetDocument.fullArchitectureValidation
  });

  console.log(
    JSON.stringify(
      {
        schemaVersion: 'zdp.architecture-linter.validation-performance/v2',
        runtime,
        architectureRoot: options.architectureRoot,
        repositoryRoot: options.repositoryRoot,
        measurements,
        budget,
        schemaValidatorCache: getJsonSchemaValidatorCacheStats()
      },
      null,
      2
    )
  );

  if (budget.status === 'failed' || budget.status === 'not_comparable') {
    process.exitCode = 1;
  }
}

async function createPerformanceBudgetResult(input: {
  readonly baselinePath: string | undefined;
  readonly current: ValidationPerformanceSample;
  readonly budget: ValidationPerformanceBudget;
}): Promise<PerformanceBudgetResult> {
  if (input.baselinePath === undefined) {
    return {
      schemaVersion:
        'zdp.architecture-linter.validation-performance-budget-result/v1',
      measurement: 'fullArchitectureValidation',
      status: 'not_evaluated',
      maxRegressionPercent: input.budget.maxWarmP95RegressionPercent,
      reason: 'baseline_not_provided'
    };
  }

  return evaluateValidationPerformanceBudget({
    baseline: await loadPerformanceSample(input.baselinePath),
    current: input.current,
    budget: input.budget
  });
}

async function loadPerformanceBudget(
  absolutePath: string
): Promise<PerformanceBudgetDocument> {
  const value = JSON.parse(await readFile(absolutePath, 'utf8')) as unknown;

  if (!isRecord(value)) {
    throw new Error(`Performance budget is not an object: ${absolutePath}`);
  }

  if (
    value.schemaVersion !==
    'zdp.architecture-linter.validation-performance-budget/v1'
  ) {
    throw new Error(`Unsupported performance budget schema: ${absolutePath}`);
  }

  const fullValidation = value.fullArchitectureValidation;
  if (!isRecord(fullValidation)) {
    throw new Error(
      `Performance budget is missing fullArchitectureValidation: ${absolutePath}`
    );
  }

  const maxRegression = fullValidation.maxWarmP95RegressionPercent;
  if (
    typeof maxRegression !== 'number' ||
    !Number.isFinite(maxRegression) ||
    maxRegression < 0
  ) {
    throw new Error(
      `Performance budget maxWarmP95RegressionPercent is invalid: ${absolutePath}`
    );
  }

  return {
    schemaVersion: value.schemaVersion,
    fullArchitectureValidation: {
      maxWarmP95RegressionPercent: maxRegression
    }
  };
}

async function loadPerformanceSample(
  absolutePath: string
): Promise<ValidationPerformanceSample> {
  const value = JSON.parse(await readFile(absolutePath, 'utf8')) as unknown;

  if (!isRecord(value)) {
    throw new Error(`Performance baseline is not an object: ${absolutePath}`);
  }

  const runtime = readRuntime(value.runtime, absolutePath);
  const measurements = value.measurements;
  if (!isRecord(measurements)) {
    throw new Error(`Performance baseline is missing measurements: ${absolutePath}`);
  }

  const fullValidation = measurements.fullArchitectureValidation;
  if (!isRecord(fullValidation) || !isRecord(fullValidation.warm)) {
    throw new Error(
      `Performance baseline is missing fullArchitectureValidation.warm: ${absolutePath}`
    );
  }

  const warmP95Ms = fullValidation.warm.p95Ms;
  if (
    typeof warmP95Ms !== 'number' ||
    !Number.isFinite(warmP95Ms) ||
    warmP95Ms <= 0
  ) {
    throw new Error(
      `Performance baseline fullArchitectureValidation warm p95 is invalid: ${absolutePath}`
    );
  }

  return { runtime, warmP95Ms };
}

function readRuntime(
  value: unknown,
  sourcePath: string
): ValidationPerformanceRuntime {
  if (!isRecord(value)) {
    throw new Error(`Performance baseline is missing runtime: ${sourcePath}`);
  }

  const bun = value.bun;
  const platform = value.platform;
  const arch = value.arch;

  if (
    (typeof bun !== 'string' && bun !== null) ||
    typeof platform !== 'string' ||
    typeof arch !== 'string'
  ) {
    throw new Error(`Performance baseline runtime is invalid: ${sourcePath}`);
  }

  return { bun, platform, arch };
}

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

function readProfileOptions(args: readonly string[]): ProfileOptions {
  const parsed = parseArgs({
    args: [...args],
    options: {
      iterations: { type: 'string' },
      architecture: { type: 'string' },
      repository: { type: 'string' },
      baseline: { type: 'string' },
      budget: { type: 'string' }
    },
    strict: true,
    allowPositionals: false
  });
  const iterations = readIterations(parsed.values.iterations);
  const architecture = readNonEmptyOption(parsed.values.architecture);
  const repository = readNonEmptyOption(parsed.values.repository);
  const baseline = readNonEmptyOption(parsed.values.baseline);
  const budget = readNonEmptyOption(parsed.values.budget);

  return {
    iterations,
    architectureRoot: resolve(architecture ?? DEFAULT_ARCHITECTURE_ROOT),
    repositoryRoot: resolve(repository ?? DEFAULT_REPOSITORY_ROOT),
    baselinePath: baseline === undefined ? undefined : resolve(baseline),
    budgetPath: resolve(budget ?? DEFAULT_BUDGET_PATH)
  };
}

function readIterations(value: string | boolean | undefined): number {
  if (value === undefined) {
    return 10;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new Error('--iterations must be an integer between 1 and 100.');
  }

  return parsed;
}

function readNonEmptyOption(
  value: string | boolean | undefined
): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
