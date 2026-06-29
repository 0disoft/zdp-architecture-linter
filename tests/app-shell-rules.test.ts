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
        file: '.github/workflows/ci.yml',
        path: 'repository.root',
        message: 'App shell repository must include `.github/workflows/ci.yml`.'
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
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-APP-001',
          severity: 'error',
          file: 'contracts/app-shell.yaml',
          path: 'auth_route_promotion',
          message:
            'App shell contract must declare an `auth_route_promotion` object.'
        });
      }
    );
  });

  test('fails when auth route promotion opens before runtime handoff and review', async () => {
    await withRepositoryRoot(
      {
        ...createValidAppShellFiles(),
        'contracts/app-shell.yaml': `
environment:
  required:
    - ZDP_CORE_API_BASE_URL
surfaces:
  - id: console
    route: /console
    calls:
      - core-api
  - id: admin
    route: /admin
    calls:
      - core-api
readiness:
  routes:
    - /healthz
    - /readyz
  required_env:
    - ZDP_CORE_API_BASE_URL
auth_route_promotion:
  status: ready
  catalog_source: local/auth.yaml
  required_operations:
    - core.auth.sessions.create
  allowed_routes:
    - /login
  requires:
    - product reviewer approval evidence for auth UI paths
localization_canary:
  provider: zdp-platform-localization
  scope: app-shell
  message_keys:
    - nav.app
    - nav.console
    - nav.admin
    - page.home.title
    - page.console.title
    - page.admin.title
  expansion_requires_review: true
  rollback_boundary: disable affected app slice and keep previous app-shell copy or i18n runtime path
  runtime_feature_flag_required: false
allowed_upstreams:
  - core-api
forbidden:
  - direct_database_reads
  - final_authorization_in_ui
  - refresh_token_storage
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
          path: 'auth_route_promotion.status',
          message:
            'App shell auth route promotion status must stay `blocked_until_core_auth_runtime_and_product_review`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-APP-001',
          severity: 'error',
          file: 'contracts/app-shell.yaml',
          path: 'auth_route_promotion.catalog_source',
          message:
            'App shell auth route promotion must reference `zdp-api-contracts/contracts/apis/catalog.yaml`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-APP-001',
          severity: 'error',
          file: 'contracts/app-shell.yaml',
          path: 'auth_route_promotion.required_operations',
          message:
            'App shell contract `contracts/app-shell.yaml` must include `core.auth.sessions.refresh` in `required_operations`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-APP-001',
          severity: 'error',
          file: 'contracts/app-shell.yaml',
          path: 'auth_route_promotion.requires',
          message:
            'App shell contract `contracts/app-shell.yaml` must include `zdp-core-platform auth/session promotion blockers cleared` in `requires`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-APP-001',
          severity: 'error',
          file: 'contracts/app-shell.yaml',
          path: 'auth_route_promotion.requires',
          message:
            'App shell contract `contracts/app-shell.yaml` must include `zdp-core-platform contracts/auth-product-review-approval.yaml receipt reviewed` in `requires`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-APP-001',
          severity: 'error',
          file: 'contracts/app-shell.yaml',
          path: 'auth_route_promotion.allowed_routes',
          message:
            'App shell auth route promotion must keep `allowed_routes` empty before live runtime handoff, auth product review receipt review, and product reviewer approval evidence; found `/login`.'
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

  test('fails when app shell CI workflow loses provider bootstrap', async () => {
    await withRepositoryRoot(
      {
        ...createValidAppShellFiles(),
        '.github/workflows/ci.yml': `
name: CI

jobs:
  app-shell:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: bun install --frozen-lockfile
      - run: bun run check
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
          file: '.github/workflows/ci.yml',
          path: 'ci.workflow',
          message:
            'App shell CI workflow must include `0disoft/zdp-platform-localization`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-APP-001',
          severity: 'error',
          file: '.github/workflows/ci.yml',
          path: 'ci.workflow',
          message:
            'App shell CI workflow must include `secrets.ZDP_CI_READ_TOKEN || github.token`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-APP-001',
          severity: 'error',
          file: '.github/workflows/ci.yml',
          path: 'ci.workflow',
          message:
            'App shell CI workflow must include `Install localization platform dependencies`.'
        });
      }
    );
  });

  test('fails when app shell localization canary expands without review contract', async () => {
    await withRepositoryRoot(
      {
        ...createValidAppShellFiles(),
        'contracts/app-shell.yaml': `
environment:
  required:
    - ZDP_CORE_API_BASE_URL
surfaces:
  - id: console
    route: /console
    calls:
      - core-api
  - id: admin
    route: /admin
    calls:
      - core-api
readiness:
  routes:
    - /healthz
    - /readyz
  required_env:
    - ZDP_CORE_API_BASE_URL
auth_route_promotion:
  status: blocked_until_core_auth_runtime_and_product_review
  catalog_source: zdp-api-contracts/contracts/apis/catalog.yaml
  required_operations:
    - core.auth.registrations.create
    - core.auth.sessions.create
    - core.auth.sessions.refresh
    - core.auth.sessions.revoke_current
    - core.auth.recovery_requests.create
    - core.auth.passkey_challenges.create
    - core.auth.passkey_assertions.verify
    - core.auth.oauth_callbacks.accept
  allowed_routes: []
  requires:
    - zdp-api-contracts core-api auth/session route catalog adoption
    - zdp-core-platform live auth/session runtime handoff
    - zdp-core-platform auth/session promotion blockers cleared
    - zdp-core-platform contracts/auth-product-review-approval.yaml receipt reviewed
    - zdp-core-platform typed_product_approval_gate_receipt_no_route_unblock observed
    - zdp-core-platform no_product_reviewer_approval remains until product_reviewer_approval_present and product_approval_evidence_ref_present are true
    - product reviewer approval evidence for auth UI paths
localization_canary:
  provider: zdp-platform-localization
  scope: full-product-ui
  message_keys:
    - nav.app
    - nav.console
    - nav.admin
    - page.home.title
    - page.console.title
    - page.admin.title
    - billing.invoice.title
  expansion_requires_review: false
  rollback_boundary: remove localization runtime
  runtime_feature_flag_required: true
allowed_upstreams:
  - core-api
forbidden:
  - direct_database_reads
  - final_authorization_in_ui
  - refresh_token_storage
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
          path: 'localization_canary.scope',
          message: 'App shell localization canary scope must stay `app-shell`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-APP-001',
          severity: 'error',
          file: 'contracts/app-shell.yaml',
          path: 'localization_canary.message_keys',
          message:
            'App shell localization canary must not include out-of-scope message key `billing.invoice.title` without expansion review.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-APP-001',
          severity: 'error',
          file: 'contracts/app-shell.yaml',
          path: 'localization_canary.runtime_feature_flag_required',
          message:
            'App shell localization canary must keep runtime feature flag requirement disabled while rollback uses app-slice disablement and previous copy/runtime path.'
        });
      }
    );
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

  test('fails when auth route alias files appear before promotion', async () => {
    await withRepositoryRoot(
      {
        ...createValidAppShellFiles(),
        'src/routes/oauth/callback/+page.svelte': `
<script lang="ts">
  import { AuthShell } from 'zdp-auth-ui';
</script>

<AuthShell locale="ko" mode="login" providers={[]} title="로그인" />
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
          file: 'src/routes/oauth/callback/+page.svelte',
          path: 'source.auth_route_promotion',
          message:
            'App shell auth route `src/routes/oauth/callback/+page.svelte` is blocked until core auth/session route catalog adoption, live runtime handoff, cleared promotion blockers, auth product review receipt review, and product reviewer approval evidence exist.'
        });
      }
    );
  });

  test('allows non-auth callback route files before auth route promotion', async () => {
    await withRepositoryRoot(
      {
        ...createValidAppShellFiles(),
        'src/routes/payments/callback/+page.svelte': `
<h1>Payment callback</h1>
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryAppShellContract({
          repositoryRoot,
          repositoryServiceContract: createWebAppsServiceContract()
        });

        expect(diagnostics).not.toContainEqual({
          ruleId: 'ZDP-APP-001',
          severity: 'error',
          file: 'src/routes/payments/callback/+page.svelte',
          path: 'source.auth_route_promotion',
          message:
            'App shell auth route `src/routes/payments/callback/+page.svelte` is blocked until core auth/session route catalog adoption, live runtime handoff, cleared promotion blockers, auth product review receipt review, and product reviewer approval evidence exist.'
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
    release: {
      migration_policy:
        'zdp-platform-localization adoption is limited to the six app-shell navigation and page-title messages until product UI slices are reviewed',
      change_approval:
        'auth route promotion requires core auth/session route catalog adoption, live runtime handoff, credential ownership review, cleared core auth/session promotion blockers, zdp-core-platform contracts/auth-product-review-approval.yaml receipt review, typed_product_approval_gate_receipt_no_route_unblock, and manual approval for auth UI paths',
      canary_policy:
        'app-shell localization dogfood only; keep the previous app-shell copy or i18n runtime path available before expanding to product UI copy',
      feature_flag_required: false
    },
    notes: [
      'check:localization is this consumer repository gate; zdp-platform-localization owns bun run check:adoption, generated large-catalog diagnostics, and bun run verify:hmr.',
      'auth route promotion remains blocked until the core auth/session route catalog is adopted, live runtime handoff exists, core auth/session promotion blockers are cleared, zdp-core-platform contracts/auth-product-review-approval.yaml receipt is reviewed, typed_product_approval_gate_receipt_no_route_unblock is observed, and product_reviewer_approval_present plus product_approval_evidence_ref_present are true.',
      'Required auth catalog operations are core.auth.registrations.create, core.auth.sessions.create, core.auth.sessions.refresh, core.auth.sessions.revoke_current, core.auth.recovery_requests.create, core.auth.passkey_challenges.create, core.auth.passkey_assertions.verify, and core.auth.oauth_callbacks.accept.',
      'The first zdp-platform-localization app canary is intentionally limited to the six app-shell navigation and page-title messages.',
      'Disabling the affected app slice and keeping the previous app-shell copy or i18n runtime path is the rollback boundary for the localization canary, so this shell does not require a runtime feature flag.'
    ]
  };
}

function createValidAppShellFiles(): Record<string, string> {
  return {
    '.github/workflows/ci.yml': `
name: CI

on:
  pull_request:
  push:
    branches: ["main"]

permissions:
  contents: read

jobs:
  app-shell:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: projects/zdp-platforms/client-surfaces/zdp-web-apps
    env:
      ZDP_CORE_API_BASE_URL: http://127.0.0.1:3001
    steps:
      - name: Checkout web apps
        uses: actions/checkout@v7
        with:
          path: projects/zdp-platforms/client-surfaces/zdp-web-apps
      - name: Checkout localization platform
        uses: actions/checkout@v7
        with:
          repository: 0disoft/zdp-platform-localization
          token: \${{ secrets.ZDP_CI_READ_TOKEN || github.token }}
          path: projects/zdp-platforms/platform/zdp-platform-localization
      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
      - name: Install localization platform dependencies
        working-directory: projects/zdp-platforms/platform/zdp-platform-localization
        run: bun install --frozen-lockfile
      - name: Install web apps dependencies
        run: bun install --frozen-lockfile
      - name: Check
        run: bun run check
      - name: Build
        run: bun run build
`,
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
auth_route_promotion:
  status: blocked_until_core_auth_runtime_and_product_review
  catalog_source: zdp-api-contracts/contracts/apis/catalog.yaml
  required_operations:
    - core.auth.registrations.create
    - core.auth.sessions.create
    - core.auth.sessions.refresh
    - core.auth.sessions.revoke_current
    - core.auth.recovery_requests.create
    - core.auth.passkey_challenges.create
    - core.auth.passkey_assertions.verify
    - core.auth.oauth_callbacks.accept
  allowed_routes: []
  requires:
    - zdp-api-contracts core-api auth/session route catalog adoption
    - zdp-core-platform live auth/session runtime handoff
    - zdp-core-platform auth/session promotion blockers cleared
    - zdp-core-platform contracts/auth-product-review-approval.yaml receipt reviewed
    - zdp-core-platform typed_product_approval_gate_receipt_no_route_unblock observed
    - zdp-core-platform no_product_reviewer_approval remains until product_reviewer_approval_present and product_approval_evidence_ref_present are true
    - product reviewer approval evidence for auth UI paths
localization_canary:
  provider: zdp-platform-localization
  scope: app-shell
  message_keys:
    - nav.app
    - nav.console
    - nav.admin
    - page.home.title
    - page.console.title
    - page.admin.title
  expansion_requires_review: true
  rollback_boundary: disable affected app slice and keep previous app-shell copy or i18n runtime path
  runtime_feature_flag_required: false
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
