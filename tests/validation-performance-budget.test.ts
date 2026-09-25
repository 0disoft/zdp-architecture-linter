import { describe, expect, test } from 'bun:test';
import {
  evaluateValidationPerformanceBudget,
  type ValidationPerformanceRuntime
} from '../src/validation-performance-budget.ts';

const RUNTIME: ValidationPerformanceRuntime = {
  bun: '1.3.3',
  platform: 'linux',
  arch: 'x64'
};

describe('validation performance budget', () => {
  test('passes a warm p95 regression at the configured limit', () => {
    const evaluation = evaluateValidationPerformanceBudget({
      baseline: { runtime: RUNTIME, warmP95Ms: 100 },
      current: { runtime: RUNTIME, warmP95Ms: 120 },
      budget: { maxWarmP95RegressionPercent: 20 }
    });

    expect(evaluation).toMatchObject({
      status: 'passed',
      deltaMs: 20,
      regressionPercent: 20,
      maxRegressionPercent: 20
    });
  });

  test('fails a warm p95 regression beyond the configured limit', () => {
    const evaluation = evaluateValidationPerformanceBudget({
      baseline: { runtime: RUNTIME, warmP95Ms: 100 },
      current: { runtime: RUNTIME, warmP95Ms: 121 },
      budget: { maxWarmP95RegressionPercent: 20 }
    });

    expect(evaluation).toMatchObject({
      status: 'failed',
      deltaMs: 21,
      regressionPercent: 21
    });
  });

  test('passes an improvement', () => {
    const evaluation = evaluateValidationPerformanceBudget({
      baseline: { runtime: RUNTIME, warmP95Ms: 100 },
      current: { runtime: RUNTIME, warmP95Ms: 80 },
      budget: { maxWarmP95RegressionPercent: 20 }
    });

    expect(evaluation).toMatchObject({
      status: 'passed',
      deltaMs: -20,
      regressionPercent: -20
    });
  });

  test('refuses to compare reports from different runtimes', () => {
    const evaluation = evaluateValidationPerformanceBudget({
      baseline: { runtime: RUNTIME, warmP95Ms: 100 },
      current: {
        runtime: { ...RUNTIME, arch: 'arm64' },
        warmP95Ms: 90
      },
      budget: { maxWarmP95RegressionPercent: 20 }
    });

    expect(evaluation).toMatchObject({
      status: 'not_comparable',
      deltaMs: null,
      regressionPercent: null,
      reason: 'runtime_mismatch'
    });
  });
});
