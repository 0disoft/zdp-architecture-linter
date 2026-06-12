import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { validateRepositoryAppShellContract } from '../src/app-shell-rules.ts';

describe('app shell contract rules', () => {
  test('passes when the web apps repository declares the app shell gate', async () => {
    await withRepositoryRoot(createValidAppShellFiles(), async (repositoryRoot) => {
      const diagnostics = await validateRepositoryAppShellContract({
        repositoryRoot,
        repositoryServiceContract: createWebAppsServiceContract()
      });

      expect(diagnostics).toEqual([]);
    });
  });

  test('skips repositories that are not zdp-web-apps', async () => {
    await withRepositoryRoot({}, async (repositoryRoot) => {
      const diagnostics = await validateRepositoryAppShellContract({
        repositoryRoot,
        repositoryServiceContract: {
          service: {
            repo: 'zdp-web-public'
          }
        }
      });

      expect(diagnostics).toEqual([]);
    });
  });

  test('fails when required app shell files are missing', async () => {
    await withRepositoryRoot({}, async (repositoryRoot) => {
      const diagnostics = await validateRepositoryAppShellContract({
        repositoryRoot,
        repositoryServiceContract: createWebAppsServiceContract()
      });

      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-APP-001',
        severity: 'error',
        file: 'contracts/app-shell.yaml',
        path: 'repository.root',
        message: 'App shell repository must include `contracts/app-shell.yaml`.'
      });
      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-APP-001',
        severity: 'error',
        file: 'src/routes/readyz/+server.ts',
        path: 'repository.root',
        message: 'App shell repository must include `src/routes/readyz/+server.ts`.'
      });
    });
  });

  test('fails when the app shell contract file is not valid YAML', async () => {
    await withRepositoryRoot(
      {
        ...createValidAppShellFiles(),
        'contracts/app-shell.yaml': 'environment: [ZDP_CORE_API_BASE_URL'
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryAppShellContract({
          repositoryRoot,
          repositoryServiceContract: createWebAppsServiceContract()
        });

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]).toMatchObject({
          ruleId: 'ZDP-APP-001',
          severity: 'error',
          file: 'contracts/app-shell.yaml',
          path: 'yaml'
        });
      }
    );
  });

  test('fails when app shell contract fields drift', async () => {
    await withRepositoryRoot(
      {
        ...createValidAppShellFiles(),
        'contracts/app-shell.yaml': `
environment:
  required: []
surfaces:
  - id: console
    route: /dashboard
    calls: []
readiness:
  routes:
    - /healthz
  required_env: []
allowed_upstreams: []
forbidden:
  - direct_database_reads
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryAppShellContract({
          repositoryRoot,
          repositoryServiceContract: createWebAppsServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-APP-001',
          severity: 'error',
          file: 'contracts/app-shell.yaml',
          path: 'environment.required',
          message:
            'App shell contract `contracts/app-shell.yaml` must include `ZDP_CORE_API_BASE_URL` in `environment.required`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-APP-001',
          severity: 'error',
          file: 'contracts/app-shell.yaml',
          path: 'surfaces.console.route',
          message: 'App shell `console` surface must use route `/console`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-APP-001',
          severity: 'error',
          file: 'contracts/app-shell.yaml',
          path: 'surfaces.admin',
          message: 'App shell contract must declare `admin` surface.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-APP-001',
          severity: 'error',
          file: 'contracts/app-shell.yaml',
          path: 'forbidden',
          message:
            'App shell contract `contracts/app-shell.yaml` must include `refresh_token_storage` in `forbidden`.'
        });
      }
    );
  });

  test('fails when app shell service contract loses localization provider prerequisites', async () => {
    await withRepositoryRoot(createValidAppShellFiles(), async (repositoryRoot) => {
      const diagnostics = await validateRepositoryAppShellContract({
        repositoryRoot,
        repositoryServiceContract: {
          service: {
            repo: 'zdp-web-apps'
          },
          dependencies: {
            services: ['core-api']
          }
        }
      });

      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-APP-001',
        severity: 'error',
        file: 'service.yaml',
        path: 'service.contract',
        message:
          'App shell service contract must include `generated large-catalog diagnostics 0`.'
      });
      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-APP-001',
        severity: 'error',
        file: 'service.yaml',
        path: 'service.contract',
        message:
          'App shell service contract must include `platform-localization`.'
      });
    });
  });

  test('fails when app shell source owns platform truth directly', async () => {
    await withRepositoryRoot(
      {
        ...createValidAppShellFiles(),
        'src/lib/server/app-shell.ts': `
import { PrismaClient } from '@prisma/client';

export const database = new PrismaClient();
export const finalAuthorization = true;
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryAppShellContract({
          repositoryRoot,
          repositoryServiceContract: createWebAppsServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-APP-001',
          severity: 'error',
          file: 'src/lib/server/app-shell.ts',
          path: 'source.forbidden',
          message:
            "App shell source must not contain platform ownership pattern `from '@prisma/'`."
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-APP-001',
          severity: 'error',
          file: 'src/lib/server/app-shell.ts',
          path: 'source.forbidden',
          message:
            'App shell source must not contain platform ownership pattern `final_authorization`.'
        });
      }
    );
  });
});

async function withRepositoryRoot(
  files: Record<string, string>,
  callback: (repositoryRoot: string) => Promise<void>
): Promise<void> {
  const repositoryRoot = await mkdtemp(join(tmpdir(), 'zdp-app-shell-contract-'));

  try {
    for (const [relativePath, source] of Object.entries(files)) {
      const absolutePath = join(repositoryRoot, relativePath);

      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, source.trimStart(), 'utf8');
    }

    await callback(repositoryRoot);
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true });
  }
}

function createWebAppsServiceContract(): unknown {
  return {
    service: {
      repo: 'zdp-web-apps'
    },
    cost: {
      unit_metrics: ['app-shell-validation', 'localization-adoption-gate']
    },
    dependencies: {
      services: ['core-api', 'money-api', 'platform-localization']
    },
    exit: {
      success_criteria: [
        'provider zdp-platform-localization bun run check:adoption passes with fixture catalog diagnostics 0, generated large-catalog diagnostics 0, and production fallback 0 before this app shell consumes updated file dependencies'
      ]
    },
    notes: [
      'check:localization is this consumer repository gate; zdp-platform-localization owns bun run check:adoption, generated large-catalog diagnostics, and bun run verify:hmr.'
    ]
  };
}

function createValidAppShellFiles(): Record<string, string> {
  return {
    'contracts/app-shell.yaml': `
environment:
  required:
    - ZDP_CORE_API_BASE_URL
surfaces:
  - id: console
    route: /console
    calls:
      - core-api
    must_not_own:
      - permission_truth
  - id: admin
    route: /admin
    calls:
      - core-api
    must_not_own:
      - final_authorization_decision
readiness:
  routes:
    - /healthz
    - /readyz
  required_env:
    - ZDP_CORE_API_BASE_URL
allowed_upstreams:
  - core-api
forbidden:
  - direct_database_reads
  - final_authorization_in_ui
  - refresh_token_storage
`,
    'scripts/check-app-shell.ts': 'console.log("ok");\n',
    'src/lib/app-shell.ts': 'export const shellNavItems = [] as const;\n',
    'src/lib/server/app-shell.ts':
      "export const CORE_API_BASE_URL_ENV = 'ZDP_CORE_API_BASE_URL';\n",
    'src/routes/+layout.svelte': '<slot />\n',
    'src/routes/+page.svelte': '<h1>App</h1>\n',
    'src/routes/console/+page.svelte': '<h1>Console</h1>\n',
    'src/routes/admin/+page.svelte': '<h1>Admin</h1>\n',
    'src/routes/healthz/+server.ts': 'export function GET() {}\n',
    'src/routes/readyz/+server.ts': 'export function GET() {}\n'
  };
}
