import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { validateRepositoryPerformanceContract } from '../src/xcut-perf-rules.ts';

describe('cross-cutting performance rules', () => {
  test('skips repositories that are not user-facing web, auth UI, or app shells', async () => {
    await withRepositoryRoot(
      {
        'service.yaml': `
domain:
  user_facing: false
runtime:
  framework: rust-axum
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryPerformanceContract({
          repositoryRoot,
          repositoryServiceContract: {
            domain: {
              user_facing: false
            },
            runtime: {
              framework: 'rust-axum'
            }
          }
        });

        expect(diagnostics).toEqual([]);
      }
    );
  });

  test('warns when a user-facing web surface has no performance contract', async () => {
    await withRepositoryRoot(
      {
        'service.yaml': `
domain:
  user_facing: true
runtime:
  framework: astro
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryPerformanceContract({
          repositoryRoot,
          repositoryServiceContract: {
            domain: {
              user_facing: true
            },
            runtime: {
              framework: 'astro'
            }
          }
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-XCUT-PERF-001',
          severity: 'warning',
          file: 'service.yaml',
          path: 'performance.contract',
          message:
            'User-facing web, auth UI, and app shell repositories must declare a performance budget and measurement method in service.yaml or an equivalent contract.'
        });
      }
    );
  });

  test('warns when a user-facing app shell has a budget but no measurement method', async () => {
    await withRepositoryRoot(
      {
        'service.yaml': `
domain:
  user_facing: true
runtime:
  framework: sveltekit-contracts
reliability:
  slo_latency_p95_ms: 1000
notes:
  - Performance p95 latency budget is tracked for the app shell.
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryPerformanceContract({
          repositoryRoot,
          repositoryServiceContract: {
            domain: {
              user_facing: true
            },
            runtime: {
              framework: 'sveltekit-contracts'
            },
            reliability: {
              slo_latency_p95_ms: 1000
            }
          }
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-XCUT-PERF-001',
          severity: 'warning',
          file: 'service.yaml',
          path: 'performance.measurement',
          message:
            'Performance contracts must name the measurement method, such as Lighthouse, WebPageTest, Core Web Vitals/RUM, bundle analyze, or a CI build/check gate.'
        });
      }
    );
  });

  test('warns when an auth UI package names a measurement method but no budget', async () => {
    await withRepositoryRoot(
      {
        'service.yaml': `
domain:
  user_facing: true
runtime:
  framework: auth-ui-package
notes:
  - bun run check measures package build and Storybook build drift.
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryPerformanceContract({
          repositoryRoot,
          repositoryServiceContract: {
            domain: {
              user_facing: true
            },
            runtime: {
              framework: 'auth-ui-package'
            }
          }
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-XCUT-PERF-001',
          severity: 'warning',
          file: 'service.yaml',
          path: 'performance.budget',
          message:
            'Performance contracts must name the budget being protected, such as LCP, INP, CLS, initial JS gzip, bundle budget, asset budget, or p95 latency.'
        });
      }
    );
  });

  test('passes user-facing surfaces with a budget and measurement method', async () => {
    await withRepositoryRoot(
      {
        'service.yaml': `
domain:
  user_facing: true
runtime:
  framework: astro
notes:
  - Performance budget follows LCP <= 2.5s, INP <= 200ms, CLS <= 0.1, and initial JS gzip <= 200KB.
  - Measurement method is Lighthouse plus Core Web Vitals review and the zdp_web_public_bundle_analyze CI build gate.
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryPerformanceContract({
          repositoryRoot,
          repositoryServiceContract: {
            domain: {
              user_facing: true
            },
            runtime: {
              framework: 'astro'
            }
          }
        });

        expect(diagnostics).toEqual([]);
      }
    );
  });
});

async function withRepositoryRoot(
  files: Record<string, string>,
  callback: (repositoryRoot: string) => Promise<void>
): Promise<void> {
  const repositoryRoot = await mkdtemp(
    join(tmpdir(), 'zdp-architecture-linter-xcut-perf-')
  );

  try {
    for (const [file, source] of Object.entries(files)) {
      const fullPath = join(repositoryRoot, file);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, source.trimStart(), 'utf8');
    }

    await callback(repositoryRoot);
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true });
  }
}
