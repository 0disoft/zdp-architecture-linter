import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { validateRepositoryLocalizationContract } from '../src/localization-contract-rules.ts';

describe('localization contract rules', () => {
  test('passes when the localization repository declares adoption gates', async () => {
    await withRepositoryRoot(createValidLocalizationFiles(), async (repositoryRoot) => {
      const diagnostics = await validateRepositoryLocalizationContract({
        repositoryRoot,
        repositoryServiceContract: createLocalizationServiceContract()
      });

      expect(diagnostics).toEqual([]);
    });
  });

  test('skips repositories that are not zdp-platform-localization', async () => {
    await withRepositoryRoot({}, async (repositoryRoot) => {
      const diagnostics = await validateRepositoryLocalizationContract({
        repositoryRoot,
        repositoryServiceContract: {
          service: {
            repo: 'zdp-platform-devex'
          }
        }
      });

      expect(diagnostics).toEqual([]);
    });
  });

  test('fails when the adoption gate script is missing', async () => {
    const files = createValidLocalizationFiles();
    delete files['scripts/check-adoption-gate.ts'];

    await withRepositoryRoot(files, async (repositoryRoot) => {
      const diagnostics = await validateRepositoryLocalizationContract({
        repositoryRoot,
        repositoryServiceContract: createLocalizationServiceContract()
      });

      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-LOCALIZATION-001',
        severity: 'error',
        file: 'scripts/check-adoption-gate.ts',
        path: 'repository.root',
        message:
          'Localization repository must include `scripts/check-adoption-gate.ts`.'
      });
    });
  });

  test('fails when check:adoption is not wired to the gate script', async () => {
    await withRepositoryRoot(
      {
        ...createValidLocalizationFiles(),
        'package.json': JSON.stringify(
          {
            name: 'zdp-platform-localization-workspace',
            private: true,
            scripts: {
              check: 'tsc -p tsconfig.json --noEmit',
              test: 'bun test',
              'check:adoption': 'bun scripts/measure-large-catalog.ts',
              'verify:hmr': 'bun scripts/verify-dev-hmr.ts',
              'measure:large-catalog': 'bun scripts/measure-large-catalog.ts',
              'format:check': 'bunx prettier --check .'
            }
          },
          null,
          2
        )
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryLocalizationContract({
          repositoryRoot,
          repositoryServiceContract: createLocalizationServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-LOCALIZATION-001',
          severity: 'error',
          file: 'package.json',
          path: 'scripts.check:adoption',
          message:
            'Localization `check:adoption` must run `bun scripts/check-adoption-gate.ts`.'
        });
      }
    );
  });

  test('fails when an internal localization package is missing', async () => {
    const files = createValidLocalizationFiles();
    delete files['packages/runtime/package.json'];

    await withRepositoryRoot(files, async (repositoryRoot) => {
      const diagnostics = await validateRepositoryLocalizationContract({
        repositoryRoot,
        repositoryServiceContract: createLocalizationServiceContract()
      });

      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-LOCALIZATION-001',
        severity: 'error',
        file: 'packages/runtime/package.json',
        path: 'repository.root',
        message:
          'Localization repository must include `packages/runtime/package.json`.'
      });
    });
  });

  test('fails when internal localization package metadata drifts', async () => {
    await withRepositoryRoot(
      {
        ...createValidLocalizationFiles(),
        'packages/core/package.json': JSON.stringify(
          {
            name: '@example/localization-core',
            private: false,
            bin: {
              'example-localization': './src/index.ts'
            }
          },
          null,
          2
        ),
        'packages/cli/package.json': JSON.stringify(
          {
            name: '@zdp/localization-cli',
            private: true,
            bin: {
              'zdp-localization': './src/index.ts',
              'zdp-localization-dev': './src/dev.ts'
            }
          },
          null,
          2
        ),
        'packages/editor/package.json': JSON.stringify(
          {
            name: '@zdp/localization-editor',
            private: true
          },
          null,
          2
        )
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryLocalizationContract({
          repositoryRoot,
          repositoryServiceContract: createLocalizationServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-LOCALIZATION-001',
          severity: 'error',
          file: 'packages/core/package.json',
          path: 'package.private',
          message:
            'Localization package `packages/core/package.json` must set `private: true`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-LOCALIZATION-001',
          severity: 'error',
          file: 'packages/core/package.json',
          path: 'package.name',
          message:
            'Localization package `packages/core/package.json` must be named `@zdp/localization-core`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-LOCALIZATION-001',
          severity: 'error',
          file: 'packages/core/package.json',
          path: 'package.bin',
          message:
            'Only `packages/cli/package.json` may declare a localization CLI bin.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-LOCALIZATION-001',
          severity: 'error',
          file: 'packages/cli/package.json',
          path: 'package.bin',
          message:
            'Localization CLI package must expose only `zdp-localization` mapped to `./src/index.ts`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-LOCALIZATION-001',
          severity: 'error',
          file: 'packages/editor/package.json',
          path: 'package.registration',
          message:
            'Localization package must be registered in the internal package boundary contract.'
        });
      }
    );
  });

  test('fails when the adoption gate no longer enforces the route-scope ratio', async () => {
    await withRepositoryRoot(
      {
        ...createValidLocalizationFiles(),
        'scripts/check-adoption-gate.ts': 'const status = "ok";'
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryLocalizationContract({
          repositoryRoot,
          repositoryServiceContract: createLocalizationServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-LOCALIZATION-001',
          severity: 'error',
          file: 'scripts/check-adoption-gate.ts',
          path: 'scripts.check-adoption-gate',
          message:
            'Localization contract must include `large-catalog-scope-ratio`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-LOCALIZATION-001',
          severity: 'error',
          file: 'scripts/check-adoption-gate.ts',
          path: 'scripts.check-adoption-gate',
          message:
            'Localization contract must include `maxLargestRouteScopeShare = 0.25`.'
        });
      }
    );
  });

  test('fails when large catalog measurement no longer reports diagnostic evidence', async () => {
    await withRepositoryRoot(
      {
        ...createValidLocalizationFiles(),
        'scripts/measure-large-catalog.ts':
          'export async function measureLargeCatalog() { return {}; }'
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryLocalizationContract({
          repositoryRoot,
          repositoryServiceContract: createLocalizationServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-LOCALIZATION-001',
          severity: 'error',
          file: 'scripts/measure-large-catalog.ts',
          path: 'scripts.measure-large-catalog',
          message:
            'Localization contract must include `zdp.localization.large-catalog-measurement@1`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-LOCALIZATION-001',
          severity: 'error',
          file: 'scripts/measure-large-catalog.ts',
          path: 'scripts.measure-large-catalog',
          message: 'Localization contract must include `diagnosticCount`.'
        });
      }
    );
  });

  test('fails when the internal-only posture no longer blocks open source escape hatches', async () => {
    await withRepositoryRoot(
      {
        ...createValidLocalizationFiles(),
        'scripts/check-internal-posture.ts':
          'const code = "INTERNAL_POSTURE_PUBLIC_NPM_DOC";'
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryLocalizationContract({
          repositoryRoot,
          repositoryServiceContract: createLocalizationServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-LOCALIZATION-001',
          severity: 'error',
          file: 'scripts/check-internal-posture.ts',
          path: 'scripts.check-internal-posture',
          message:
            'Localization contract must include `INTERNAL_POSTURE_OSS_ESCAPE_HATCH`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-LOCALIZATION-001',
          severity: 'error',
          file: 'scripts/check-internal-posture.ts',
          path: 'scripts.check-internal-posture',
          message:
            'Localization contract must include `Open source escape-hatch language is not allowed`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-LOCALIZATION-001',
          severity: 'error',
          file: 'scripts/check-internal-posture.ts',
          path: 'scripts.check-internal-posture',
          message:
            'Localization contract must include `INTERNAL_POSTURE_OSS_CONSIDERATION`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-LOCALIZATION-001',
          severity: 'error',
          file: 'scripts/check-internal-posture.ts',
          path: 'scripts.check-internal-posture',
          message:
            'Localization contract must include `Open source consideration language is not allowed`.'
        });
      }
    );
  });
});

async function withRepositoryRoot(
  files: Record<string, string>,
  callback: (repositoryRoot: string) => Promise<void>
): Promise<void> {
  const repositoryRoot = await mkdtemp(join(tmpdir(), 'zdp-localization-rule-'));

  try {
    for (const [file, source] of Object.entries(files)) {
      const filePath = join(repositoryRoot, file);
      await mkdir(dirname(filePath), {
        recursive: true
      });
      await writeFile(filePath, source);
    }

    await callback(repositoryRoot);
  } finally {
    await rm(repositoryRoot, {
      force: true,
      recursive: true
    });
  }
}

function createLocalizationServiceContract(): unknown {
  return {
    service: {
      repo: 'zdp-platform-localization'
    },
    cost: {
      unit_metrics: [
        'localization-adoption-gate-runs',
        'large-catalog-diagnostic-checks',
        'large-catalog-route-scope-ratio-checks'
      ],
      automatic_actions: [
        'block internal adoption when bun run check:adoption reports fixture catalog diagnostics, generated large-catalog diagnostics, fallback usage, or large-catalog route-scope ratio above 25 percent'
      ]
    },
    exit: {
      success_criteria: [
        'bun run check:adoption passes with fixture catalog diagnostics 0, generated large-catalog diagnostics 0, production fallback count 0, and largest route-loaded scope chunk at or below 25 percent of the naive monolith'
      ]
    },
    notes: [
      'Public package publishing, external contribution workflows, public roadmap promises, and open source licensing are out of scope under ADR 0016; open source conversion is not under consideration and is not a roadmap item.',
      'bun run check:adoption is the non-browser internal adoption gate; bun run verify:hmr remains the separate browser/dev-server proof.'
    ]
  };
}

function createValidLocalizationFiles(): Record<string, string> {
  return {
    'package.json': JSON.stringify(
      {
        name: 'zdp-platform-localization-workspace',
        private: true,
        scripts: {
          check: 'tsc -p tsconfig.json --noEmit',
          test: 'bun test',
          'check:adoption': 'bun scripts/check-adoption-gate.ts',
          'verify:hmr': 'bun scripts/verify-dev-hmr.ts',
          'measure:large-catalog': 'bun scripts/measure-large-catalog.ts',
          'format:check': 'bunx prettier --check .'
        }
      },
      null,
      2
    ),
    'scripts/check-adoption-gate.ts': [
      'const format = "zdp.localization.adoption-gate@1";',
      'const catalog = "catalog-check";',
      'const compile = "production-compile";',
      'const ratio = "large-catalog-scope-ratio";',
      'const catalogDiagnosticCount = 0;',
      'const maxLargestRouteScopeShare = 0.25;',
      'if (fallbackCount !== 0) throw new Error(format + catalog + compile + ratio + catalogDiagnosticCount);'
    ].join('\n'),
    'scripts/check-adoption-gate.test.ts': 'test("adoption gate", () => {});\n',
    'scripts/measure-large-catalog.ts': [
      'const format = "zdp.localization.large-catalog-measurement@1";',
      'const catalogCheck = { diagnosticCount: 0 };',
      'export async function measureLargeCatalog() { return { format, catalogCheck }; }'
    ].join('\n'),
    'scripts/verify-dev-hmr.ts': 'console.log("verify hmr");\n',
    'scripts/check-internal-posture.ts': [
      'const dora = "INTERNAL_POSTURE_DORA_NAME";',
      'const npmDoc = "INTERNAL_POSTURE_PUBLIC_NPM_DOC";',
      'const escapeHatch = "INTERNAL_POSTURE_OSS_ESCAPE_HATCH";',
      'const missingPackage = "INTERNAL_POSTURE_PACKAGE_MISSING";',
      'const nameMismatch = "INTERNAL_POSTURE_PACKAGE_NAME_MISMATCH";',
      'const unregisteredPackage = "INTERNAL_POSTURE_UNREGISTERED_PACKAGE";',
      'const cliBinMismatch = "INTERNAL_POSTURE_CLI_BIN_MISMATCH";',
      'const doraMessage = "Dora branding is not allowed in the internal ZDP localization repository.";',
      'const escapeMessage = "Open source escape-hatch language is not allowed";',
      'const consideration = "INTERNAL_POSTURE_OSS_CONSIDERATION";',
      'const considerationMessage = "Open source consideration language is not allowed";',
      'const roadmap = "Open source conversion is not under consideration and is not a roadmap item";',
      'console.log(dora + npmDoc + escapeHatch + missingPackage + nameMismatch + unregisteredPackage + cliBinMismatch + doraMessage + escapeMessage + consideration + considerationMessage + roadmap);'
    ].join('\n'),
    'README.md': [
      'private internal project scaffold',
      'Open source conversion is not under consideration and is not a roadmap item',
      'Do not publish them or document them as public npm packages'
    ].join('\n'),
    'AGENTS.md': [
      'internal ZDP localization runtime and compiler experiment',
      'Open source conversion is not under consideration and is not a roadmap item'
    ].join('\n'),
    'adr/0016-internal-only-tooling-posture.md': [
      'Internal-Only Tooling Posture',
      'Open source conversion is not under consideration and is not a roadmap item',
      'Do not add open source licensing, public package publishing, community contribution workflows, external roadmap promises, or public brand positioning.'
    ].join('\n'),
    'docs/milestones.md': [
      'bun run check:adoption',
      'generated 1,000-key catalog for diagnostics',
      'production compile must emit one chunk per locale/scope with zero fallback messages',
      'largest route-loaded scope chunk must stay at or below 25% of the naive monolith'
    ].join('\n'),
    ...createValidLocalizationPackageFiles()
  };
}

function createValidLocalizationPackageFiles(): Record<string, string> {
  return {
    'packages/astro/package.json': createPackageJson('@zdp/localization-astro'),
    'packages/cli/package.json': createPackageJson('@zdp/localization-cli', {
      bin: {
        'zdp-localization': './src/index.ts'
      }
    }),
    'packages/compiler/package.json': createPackageJson(
      '@zdp/localization-compiler'
    ),
    'packages/core/package.json': createPackageJson('@zdp/localization-core'),
    'packages/runtime/package.json': createPackageJson(
      '@zdp/localization-runtime'
    ),
    'packages/svelte/package.json': createPackageJson(
      '@zdp/localization-svelte'
    ),
    'packages/vite/package.json': createPackageJson('@zdp/localization-vite')
  };
}

function createPackageJson(
  name: string,
  extras: Record<string, unknown> = {}
): string {
  return JSON.stringify(
    {
      name,
      private: true,
      ...extras
    },
    null,
    2
  );
}
