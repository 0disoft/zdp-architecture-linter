export interface ValidationPerformanceRuntime {
  readonly bun: string | null;
  readonly platform: string;
  readonly arch: string;
}

export interface ValidationPerformanceSample {
  readonly runtime: ValidationPerformanceRuntime;
  readonly warmP95Ms: number;
}

export interface ValidationPerformanceBudget {
  readonly maxWarmP95RegressionPercent: number;
}

export interface ValidationPerformanceBudgetEvaluation {
  readonly schemaVersion: 'zdp.architecture-linter.validation-performance-budget-result/v1';
  readonly measurement: 'fullArchitectureValidation';
  readonly status: 'passed' | 'failed' | 'not_comparable';
  readonly baselineWarmP95Ms: number;
  readonly currentWarmP95Ms: number;
  readonly deltaMs: number | null;
  readonly regressionPercent: number | null;
  readonly maxRegressionPercent: number;
  readonly reason?: 'runtime_mismatch';
}

export function evaluateValidationPerformanceBudget(input: {
  readonly baseline: ValidationPerformanceSample;
  readonly current: ValidationPerformanceSample;
  readonly budget: ValidationPerformanceBudget;
}): ValidationPerformanceBudgetEvaluation {
  assertFiniteNumber(input.baseline.warmP95Ms, 'baseline warm p95');
  assertFiniteNumber(input.current.warmP95Ms, 'current warm p95');
  assertFiniteNumber(
    input.budget.maxWarmP95RegressionPercent,
    'maximum warm p95 regression percent'
  );

  if (input.baseline.warmP95Ms <= 0) {
    throw new Error('Baseline warm p95 must be greater than zero.');
  }

  if (input.current.warmP95Ms < 0) {
    throw new Error('Current warm p95 must not be negative.');
  }

  if (input.budget.maxWarmP95RegressionPercent < 0) {
    throw new Error('Maximum warm p95 regression percent must not be negative.');
  }

  const base = {
    schemaVersion:
      'zdp.architecture-linter.validation-performance-budget-result/v1' as const,
    measurement: 'fullArchitectureValidation' as const,
    baselineWarmP95Ms: input.baseline.warmP95Ms,
    currentWarmP95Ms: input.current.warmP95Ms,
    maxRegressionPercent: input.budget.maxWarmP95RegressionPercent
  };

  if (!sameRuntime(input.baseline.runtime, input.current.runtime)) {
    return {
      ...base,
      status: 'not_comparable',
      deltaMs: null,
      regressionPercent: null,
      reason: 'runtime_mismatch'
    };
  }

  const rawDeltaMs = input.current.warmP95Ms - input.baseline.warmP95Ms;
  const rawRegressionPercent =
    (rawDeltaMs / input.baseline.warmP95Ms) * 100;

  return {
    ...base,
    status:
      rawRegressionPercent <= input.budget.maxWarmP95RegressionPercent
        ? 'passed'
        : 'failed',
    deltaMs: round(rawDeltaMs),
    regressionPercent: round(rawRegressionPercent)
  };
}

function sameRuntime(
  baseline: ValidationPerformanceRuntime,
  current: ValidationPerformanceRuntime
): boolean {
  return (
    baseline.bun === current.bun &&
    baseline.platform === current.platform &&
    baseline.arch === current.arch
  );
}

function assertFiniteNumber(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
