import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { validateRepositoryClientSdksContract } from '../src/client-sdks-contract-rules.ts';

describe('client SDKs repository rules', () => {
  test('passes when the client SDKs repository declares contracts and checker surface', async () => {
    await withRepositoryRoot(
      createValidClientSdkContractFiles(),
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryClientSdksContract({
          repositoryRoot,
          repositoryServiceContract: createClientSdksServiceContract()
        });

        expect(diagnostics).toEqual([]);
      }
    );
  });

  test('skips repositories that are not zdp-client-sdks', async () => {
    await withRepositoryRoot({}, async (repositoryRoot) => {
      const diagnostics = await validateRepositoryClientSdksContract({
        repositoryRoot,
        repositoryServiceContract: {
          service: {
            repo: 'zdp-api-contracts'
          }
        }
      });

      expect(diagnostics).toEqual([]);
    });
  });

  test('fails when required client SDK contract files are missing', async () => {
    await withRepositoryRoot({}, async (repositoryRoot) => {
      const diagnostics = await validateRepositoryClientSdksContract({
        repositoryRoot,
        repositoryServiceContract: createClientSdksServiceContract()
      });

      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-CLIENT-SDKS-001',
        severity: 'error',
        file: 'contracts/sdk-surface.yaml',
        path: 'repository.root',
        message:
          'Client SDKs repository must include `contracts/sdk-surface.yaml`.'
      });
      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-CLIENT-SDKS-001',
        severity: 'error',
        file: 'contracts/auth-helper.yaml',
        path: 'repository.root',
        message:
          'Client SDKs repository must include `contracts/auth-helper.yaml`.'
      });
      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-CLIENT-SDKS-001',
        severity: 'error',
        file: 'contracts/upload-client.yaml',
        path: 'repository.root',
        message:
          'Client SDKs repository must include `contracts/upload-client.yaml`.'
      });
    });
  });

  test('fails when a client SDK contract file is not valid YAML', async () => {
    await withRepositoryRoot(
      {
        ...createValidClientSdkContractFiles(),
        'contracts/sdk-surface.yaml': 'sdk_surface: [broken'
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryClientSdksContract({
          repositoryRoot,
          repositoryServiceContract: createClientSdksServiceContract()
        });

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]).toMatchObject({
          ruleId: 'ZDP-CLIENT-SDKS-001',
          severity: 'error',
          file: 'contracts/sdk-surface.yaml',
          path: 'yaml'
        });
      }
    );
  });

  test('fails when SDK surface loses languages, behaviors, or forbidden ownership', async () => {
    await withRepositoryRoot(
      {
        ...createValidClientSdkContractFiles(),
        'contracts/sdk-surface.yaml': `
sdk_surface:
  languages:
    - typescript
  required_behaviors:
    - standard error envelope handling
  must_not_own:
    - refresh token storage
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryClientSdksContract({
          repositoryRoot,
          repositoryServiceContract: createClientSdksServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CLIENT-SDKS-001',
          severity: 'error',
          file: 'contracts/sdk-surface.yaml',
          path: 'sdk_surface.languages',
          message:
            'Client SDKs contract `contracts/sdk-surface.yaml` must include `dart` in `sdk_surface.languages`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CLIENT-SDKS-001',
          severity: 'error',
          file: 'contracts/sdk-surface.yaml',
          path: 'sdk_surface.required_behaviors',
          message:
            'Client SDKs contract `contracts/sdk-surface.yaml` must include `request_id propagation` in `sdk_surface.required_behaviors`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CLIENT-SDKS-001',
          severity: 'error',
          file: 'contracts/sdk-surface.yaml',
          path: 'sdk_surface.must_not_own',
          message:
            'Client SDKs contract `contracts/sdk-surface.yaml` must include `API contract source` in `sdk_surface.must_not_own`.'
        });
      }
    );
  });

  test('fails when auth helper ownership drifts', async () => {
    await withRepositoryRoot(
      {
        ...createValidClientSdkContractFiles(),
        'contracts/auth-helper.yaml': `
auth_helper:
  status: live
  owns:
    - access token attachment boundary
  must_not_own:
    - refresh token storage
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryClientSdksContract({
          repositoryRoot,
          repositoryServiceContract: createClientSdksServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CLIENT-SDKS-001',
          severity: 'error',
          file: 'contracts/auth-helper.yaml',
          path: 'auth_helper.status',
          message:
            'Client SDKs auth helper must stay skeleton until generated SDK packages exist.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CLIENT-SDKS-001',
          severity: 'error',
          file: 'contracts/auth-helper.yaml',
          path: 'auth_helper.owns',
          message:
            'Client SDKs contract `contracts/auth-helper.yaml` must include `current user context normalization input` in `auth_helper.owns`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CLIENT-SDKS-001',
          severity: 'error',
          file: 'contracts/auth-helper.yaml',
          path: 'auth_helper.must_not_own',
          message:
            'Client SDKs contract `contracts/auth-helper.yaml` must include `entitlement authority` in `auth_helper.must_not_own`.'
        });
      }
    );
  });

  test('fails when upload client ownership drifts', async () => {
    await withRepositoryRoot(
      {
        ...createValidClientSdkContractFiles(),
        'contracts/upload-client.yaml': `
upload_client:
  status: live
  owns:
    - signed upload request shape
  must_not_own:
    - object storage bucket names
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryClientSdksContract({
          repositoryRoot,
          repositoryServiceContract: createClientSdksServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CLIENT-SDKS-001',
          severity: 'error',
          file: 'contracts/upload-client.yaml',
          path: 'upload_client.status',
          message:
            'Client SDKs upload client must stay skeleton until generated SDK packages exist.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CLIENT-SDKS-001',
          severity: 'error',
          file: 'contracts/upload-client.yaml',
          path: 'upload_client.owns',
          message:
            'Client SDKs contract `contracts/upload-client.yaml` must include `request_id propagation` in `upload_client.owns`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CLIENT-SDKS-001',
          severity: 'error',
          file: 'contracts/upload-client.yaml',
          path: 'upload_client.must_not_own',
          message:
            'Client SDKs contract `contracts/upload-client.yaml` must include `raw provider URLs as public contract` in `upload_client.must_not_own`.'
        });
      }
    );
  });

  test('fails when client SDK checker files and scripts drift', async () => {
    await withRepositoryRoot(
      {
        ...createValidClientSdkContractFiles(),
        'package.json': `
{
  "scripts": {
    "check": "bun test"
  }
}
`,
        'src/client-sdk-contracts/validator.ts': `
export function validateClientSdkContracts(): void {}
`,
        'tests/client-sdk-contracts.test.ts': `
import { test } from 'bun:test';
test('client SDK placeholder', () => {});
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryClientSdksContract({
          repositoryRoot,
          repositoryServiceContract: createClientSdksServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CLIENT-SDKS-001',
          severity: 'error',
          file: 'package.json',
          path: 'scripts.test',
          message: 'Client SDKs package must declare `test` script.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CLIENT-SDKS-001',
          severity: 'error',
          file: 'src/client-sdk-contracts/validator.ts',
          path: 'source',
          message:
            'Client SDKs checker source must include `REQUIRED_SDK_LANGUAGES`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CLIENT-SDKS-001',
          severity: 'error',
          file: 'tests/client-sdk-contracts.test.ts',
          path: 'source',
          message:
            'Client SDKs checker source must include `fails when SDKs stop propagating request ids`.'
        });
      }
    );
  });

  test('fails when service contract does not require the client SDKs gate', async () => {
    await withRepositoryRoot(
      createValidClientSdkContractFiles(),
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryClientSdksContract({
          repositoryRoot,
          repositoryServiceContract: {
            service: {
              repo: 'zdp-client-sdks'
            },
            policy_gates: {
              required_linter_rules: ['ZDP-REPO-BASELINE-001']
            }
          }
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CLIENT-SDKS-001',
          severity: 'error',
          file: 'service.yaml',
          path: 'policy_gates.required_linter_rules',
          message:
            'Client SDKs service contract must require `ZDP-CLIENT-SDKS-001`.'
        });
      }
    );
  });
});

async function withRepositoryRoot(
  files: Record<string, string>,
  callback: (repositoryRoot: string) => Promise<void>
): Promise<void> {
  const repositoryRoot = await mkdtemp(join(tmpdir(), 'zdp-client-sdks-'));

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

function createClientSdksServiceContract(): unknown {
  return {
    service: {
      repo: 'zdp-client-sdks'
    },
    policy_gates: {
      required_linter_rules: [
        'ZDP-REPO-BASELINE-001',
        'ZDP-REPO-MARKDOWN-002',
        'ZDP-CLIENT-SDKS-001'
      ]
    }
  };
}

function createValidClientSdkContractFiles(): Record<string, string> {
  return {
    ...createValidClientSdkCheckerFiles(),
    'contracts/sdk-surface.yaml': `
sdk_surface:
  languages:
    - typescript
    - dart
    - rust
  required_behaviors:
    - request_id propagation
    - standard error envelope handling
    - pagination handling
    - upload handoff
  must_not_own:
    - API contract source
    - refresh token storage
    - final authorization decisions
    - product-specific business rules
`,
    'contracts/auth-helper.yaml': `
auth_helper:
  status: skeleton
  owns:
    - access token attachment boundary
    - current user context normalization input
  must_not_own:
    - refresh token storage
    - membership authority
    - entitlement authority
    - provider identity mapping source
`,
    'contracts/upload-client.yaml': `
upload_client:
  status: skeleton
  owns:
    - signed upload request shape
    - upload error mapping
    - request_id propagation
  must_not_own:
    - object storage bucket names
    - raw provider URLs as public contract
    - file ownership decisions
`
  };
}

function createValidClientSdkCheckerFiles(): Record<string, string> {
  return {
    'package.json': `
{
  "scripts": {
    "check": "tsc --noEmit && bun test && bun run contracts:check",
    "test": "bun test",
    "contracts:check": "bun scripts/check-client-sdk-contracts.ts"
  }
}
`,
    'bun.lock': `
{
  "lockfileVersion": 1
}
`,
    'tsconfig.json': `
{
  "compilerOptions": {
    "strict": true
  }
}
`,
    'scripts/check-client-sdk-contracts.ts': `
import { runClientSdkContractCheckCli } from '../src/client-sdk-contracts/cli';
const exitCode = await runClientSdkContractCheckCli(process.argv.slice(2));
process.exit(exitCode);
`,
    'src/client-sdk-contracts/cli.ts': `
export async function runClientSdkContractCheckCli(): Promise<number> {
  return 0;
}
`,
    'src/client-sdk-contracts/parser.ts': `
import { join } from 'node:path';
const files = [
  'sdk-surface.yaml',
  'auth-helper.yaml',
  'upload-client.yaml'
];
function readContract(root: string, fileName: string): string {
  return join(root, 'contracts', fileName);
}
export { files };
`,
    'src/client-sdk-contracts/types.ts': `
export interface ClientSdkContractDiagnostic {
  readonly code: string;
}
`,
    'src/client-sdk-contracts/validator.ts': `
const REQUIRED_SDK_LANGUAGES = [];
const REQUIRED_SDK_BEHAVIORS = [];
const REQUIRED_SDK_FORBIDDEN_OWNERSHIP = [];
const REQUIRED_AUTH_HELPER_FORBIDDEN_OWNERSHIP = [];
const REQUIRED_UPLOAD_CLIENT_FORBIDDEN_OWNERSHIP = [];
const CLIENT_SDK_LANGUAGE_MISSING = 'CLIENT_SDK_LANGUAGE_MISSING';
const CLIENT_SDK_BEHAVIOR_MISSING = 'CLIENT_SDK_BEHAVIOR_MISSING';
const CLIENT_SDK_FORBIDDEN_OWNERSHIP_MISSING = 'CLIENT_SDK_FORBIDDEN_OWNERSHIP_MISSING';
const CLIENT_SDK_AUTH_HELPER_FORBIDDEN_OWNERSHIP_MISSING = 'CLIENT_SDK_AUTH_HELPER_FORBIDDEN_OWNERSHIP_MISSING';
const CLIENT_SDK_UPLOAD_CLIENT_FORBIDDEN_OWNERSHIP_MISSING = 'CLIENT_SDK_UPLOAD_CLIENT_FORBIDDEN_OWNERSHIP_MISSING';
export {
  REQUIRED_SDK_LANGUAGES,
  REQUIRED_SDK_BEHAVIORS,
  REQUIRED_SDK_FORBIDDEN_OWNERSHIP,
  REQUIRED_AUTH_HELPER_FORBIDDEN_OWNERSHIP,
  REQUIRED_UPLOAD_CLIENT_FORBIDDEN_OWNERSHIP,
  CLIENT_SDK_LANGUAGE_MISSING,
  CLIENT_SDK_BEHAVIOR_MISSING,
  CLIENT_SDK_FORBIDDEN_OWNERSHIP_MISSING,
  CLIENT_SDK_AUTH_HELPER_FORBIDDEN_OWNERSHIP_MISSING,
  CLIENT_SDK_UPLOAD_CLIENT_FORBIDDEN_OWNERSHIP_MISSING
};
`,
    'tests/client-sdk-contracts.test.ts': `
const cases = [
  'fails when TypeScript SDK language support disappears',
  'fails when SDKs stop propagating request ids',
  'fails when SDKs become the API contract source',
  'fails when auth helpers store refresh tokens',
  'fails when upload clients expose raw provider URLs as public contracts'
];
export { cases };
`
  };
}
