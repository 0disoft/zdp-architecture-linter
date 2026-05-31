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
        file: 'contracts/sdk-generation-source.yaml',
        path: 'repository.root',
        message:
          'Client SDKs repository must include `contracts/sdk-generation-source.yaml`.'
      });
      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-CLIENT-SDKS-001',
        severity: 'error',
        file: 'contracts/libs-export-source.yaml',
        path: 'repository.root',
        message:
          'Client SDKs repository must include `contracts/libs-export-source.yaml`.'
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

  test('fails when SDK generation source handoff drifts', async () => {
    await withRepositoryRoot(
      {
        ...createValidClientSdkContractFiles(),
        'contracts/sdk-generation-source.yaml': `
sdk_generation_source:
  status: live
  source_repo: zdp-client-sdks
  source_contract: contracts/local-sdk-input.yaml
  generation_targets:
    - typescript
  required_route_metadata:
    - operation_id
  required_error_metadata:
    - code
  required_webhook_metadata:
    - event_id
  must_not_own:
    - API contract source
  forbidden_values:
    - raw_customer_payload
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
          file: 'contracts/sdk-generation-source.yaml',
          path: 'sdk_generation_source.status',
          message:
            'Client SDKs generation source must stay skeleton until generated SDK packages exist.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CLIENT-SDKS-001',
          severity: 'error',
          file: 'contracts/sdk-generation-source.yaml',
          path: 'sdk_generation_source.source_repo',
          message:
            'Client SDKs generation source must consume `zdp-api-contracts`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CLIENT-SDKS-001',
          severity: 'error',
          file: 'contracts/sdk-generation-source.yaml',
          path: 'sdk_generation_source.source_contract',
          message:
            'Client SDKs generation source must consume `contracts/sdk-generation-input.yaml`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CLIENT-SDKS-001',
          severity: 'error',
          file: 'contracts/sdk-generation-source.yaml',
          path: 'sdk_generation_source.generation_targets',
          message:
            'Client SDKs contract `contracts/sdk-generation-source.yaml` must include `rust` in `sdk_generation_source.generation_targets`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CLIENT-SDKS-001',
          severity: 'error',
          file: 'contracts/sdk-generation-source.yaml',
          path: 'sdk_generation_source.required_route_metadata',
          message:
            'Client SDKs contract `contracts/sdk-generation-source.yaml` must include `idempotency` in `sdk_generation_source.required_route_metadata`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CLIENT-SDKS-001',
          severity: 'error',
          file: 'contracts/sdk-generation-source.yaml',
          path: 'sdk_generation_source.required_error_metadata',
          message:
            'Client SDKs contract `contracts/sdk-generation-source.yaml` must include `trace_id` in `sdk_generation_source.required_error_metadata`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CLIENT-SDKS-001',
          severity: 'error',
          file: 'contracts/sdk-generation-source.yaml',
          path: 'sdk_generation_source.required_webhook_metadata',
          message:
            'Client SDKs contract `contracts/sdk-generation-source.yaml` must include `dead_letter_policy` in `sdk_generation_source.required_webhook_metadata`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CLIENT-SDKS-001',
          severity: 'error',
          file: 'contracts/sdk-generation-source.yaml',
          path: 'sdk_generation_source.must_not_own',
          message:
            'Client SDKs contract `contracts/sdk-generation-source.yaml` must include `final authorization decisions` in `sdk_generation_source.must_not_own`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CLIENT-SDKS-001',
          severity: 'error',
          file: 'contracts/sdk-generation-source.yaml',
          path: 'sdk_generation_source.forbidden_values',
          message:
            'Client SDKs contract `contracts/sdk-generation-source.yaml` must include `authorization_header` in `sdk_generation_source.forbidden_values`.'
        });
      }
    );
  });

  test('fails when libs export source handoff drifts', async () => {
    await withRepositoryRoot(
      {
        ...createValidClientSdkContractFiles(),
        'contracts/libs-export-source.yaml': `
libs_export_source:
  status: live
  source_repo: zdp-client-sdks
  source_package: zdp-client-sdks
  source_exports:
    - zdp-libs-ts/schema
  generation_targets:
    - typescript
  required_metadata:
    - schema_id
  must_not_own:
    - API contract source
  forbidden_values:
    - authorization_header
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
          file: 'contracts/libs-export-source.yaml',
          path: 'libs_export_source.status',
          message:
            'Client SDKs libs export source must stay skeleton until generated SDK packages exist.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CLIENT-SDKS-001',
          severity: 'error',
          file: 'contracts/libs-export-source.yaml',
          path: 'libs_export_source.source_repo',
          message:
            'Client SDKs libs export source must consume `zdp-libs-ts`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CLIENT-SDKS-001',
          severity: 'error',
          file: 'contracts/libs-export-source.yaml',
          path: 'libs_export_source.source_package',
          message:
            'Client SDKs libs export source package must be `zdp-libs-ts`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CLIENT-SDKS-001',
          severity: 'error',
          file: 'contracts/libs-export-source.yaml',
          path: 'libs_export_source.source_exports',
          message:
            'Client SDKs contract `contracts/libs-export-source.yaml` must include `zdp-libs-ts/error` in `libs_export_source.source_exports`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CLIENT-SDKS-001',
          severity: 'error',
          file: 'contracts/libs-export-source.yaml',
          path: 'libs_export_source.generation_targets',
          message:
            'Client SDKs contract `contracts/libs-export-source.yaml` must include `rust` in `libs_export_source.generation_targets`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CLIENT-SDKS-001',
          severity: 'error',
          file: 'contracts/libs-export-source.yaml',
          path: 'libs_export_source.required_metadata',
          message:
            'Client SDKs contract `contracts/libs-export-source.yaml` must include `trace_id` in `libs_export_source.required_metadata`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CLIENT-SDKS-001',
          severity: 'error',
          file: 'contracts/libs-export-source.yaml',
          path: 'libs_export_source.must_not_own',
          message:
            'Client SDKs contract `contracts/libs-export-source.yaml` must include `zdp-libs-ts package source` in `libs_export_source.must_not_own`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CLIENT-SDKS-001',
          severity: 'error',
          file: 'contracts/libs-export-source.yaml',
          path: 'libs_export_source.forbidden_values',
          message:
            'Client SDKs contract `contracts/libs-export-source.yaml` must include `provider_token` in `libs_export_source.forbidden_values`.'
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
`,
        'src/sdk-generation-plan/plan.ts': `
export function buildSdkGenerationPlan(): void {}
`,
        'src/sdk-generation-plan/api-input.ts': `
export function loadApiSdkGenerationInput(): void {}
`,
        'tests/sdk-generation-plan.test.ts': `
import { test } from 'bun:test';
test('SDK plan placeholder', () => {});
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
          file: 'package.json',
          path: 'scripts.generation:plan',
          message: 'Client SDKs package must declare `generation:plan` script.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CLIENT-SDKS-001',
          severity: 'error',
          file: 'src/client-sdk-contracts/validator.ts',
          path: 'source',
          message:
            'Client SDKs checker source must include `REQUIRED_SDK_GENERATION_SOURCE_REPO`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CLIENT-SDKS-001',
          severity: 'error',
          file: 'tests/client-sdk-contracts.test.ts',
          path: 'source',
          message:
            'Client SDKs checker source must include `fails when SDKs consume a different generation input source`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CLIENT-SDKS-001',
          severity: 'error',
          file: 'src/sdk-generation-plan/plan.ts',
          path: 'source',
          message:
            'Client SDKs checker source must include `validateClientSdkContracts`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CLIENT-SDKS-001',
          severity: 'error',
          file: 'src/sdk-generation-plan/api-input.ts',
          path: 'source',
          message:
            'Client SDKs checker source must include `sdk-generation-input.yaml`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CLIENT-SDKS-001',
          severity: 'error',
          file: 'src/sdk-generation-plan/api-input.ts',
          path: 'source',
          message:
            'Client SDKs checker source must include `loadApiExportPlanHandoff`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CLIENT-SDKS-001',
          severity: 'error',
          file: 'src/sdk-generation-plan/plan.ts',
          path: 'source',
          message:
            'Client SDKs checker source must include `CLIENT_SDK_API_EXPORT_PLAN_OUTPUT_MISSING`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CLIENT-SDKS-001',
          severity: 'error',
          file: 'tests/sdk-generation-plan.test.ts',
          path: 'source',
          message:
            'Client SDKs checker source must include `builds a deterministic SDK generation plan`.'
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
    'contracts/sdk-generation-source.yaml': `
sdk_generation_source:
  status: skeleton
  source_repo: zdp-api-contracts
  source_contract: contracts/sdk-generation-input.yaml
  generation_targets:
    - typescript
    - dart
    - rust
  required_route_metadata:
    - operation_id
    - resource
    - action
    - method
    - path
    - request_schema_ref
    - response_schema_ref
    - auth_required
    - permission_check
    - audit_event
    - idempotency
    - error_codes
  required_error_metadata:
    - code
    - message
    - request_id
    - trace_id
    - retry_after_seconds
    - documentation_url
  required_webhook_metadata:
    - event_id
    - event_type
    - schema_version
    - signature_verification
    - idempotency_key
    - replay_policy
    - dead_letter_policy
  must_not_own:
    - API contract source
    - generated SDK source truth
    - refresh token storage
    - final authorization decisions
    - provider credential storage
  forbidden_values:
    - raw_customer_payload
    - raw_provider_error
    - provider_secret
    - authorization_header
    - cookie_header
    - screen_component_payload
`,
    'contracts/libs-export-source.yaml': `
libs_export_source:
  status: skeleton
  source_repo: zdp-libs-ts
  source_package: zdp-libs-ts
  source_exports:
    - zdp-libs-ts/schema
    - zdp-libs-ts/env-contract
    - zdp-libs-ts/event-contracts
    - zdp-libs-ts/error
    - zdp-libs-ts/i18n-contract
  generation_targets:
    - typescript
    - dart
    - rust
  required_metadata:
    - schema_id
    - env_var
    - event_type
    - error_code
    - message_key
    - request_id
    - trace_id
    - idempotency
  must_not_own:
    - zdp-libs-ts package source
    - API contract source
    - runtime validation engine
    - product domain models
    - final authorization decisions
    - translation runtime
  forbidden_values:
    - authorization_header
    - cookie_header
    - raw_customer_payload
    - raw_provider_error
    - provider_secret
    - provider_token
    - secret_value
    - screen_component_payload
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
    "check": "tsc --noEmit && bun test && bun run contracts:check && bun run generation:plan -- --check",
    "test": "bun test",
    "contracts:check": "bun scripts/check-client-sdk-contracts.ts",
    "generation:plan": "bun scripts/plan-sdk-generation.ts --api-contracts-root ../zdp-api-contracts"
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
    'scripts/plan-sdk-generation.ts': `
import { runSdkGenerationPlanCli } from '../src/sdk-generation-plan/cli';
const exitCode = await runSdkGenerationPlanCli(process.argv.slice(2));
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
  'sdk-generation-source.yaml',
  'libs-export-source.yaml',
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
const REQUIRED_SDK_GENERATION_SOURCE_REPO = 'zdp-api-contracts';
const REQUIRED_SDK_GENERATION_SOURCE_CONTRACT = 'contracts/sdk-generation-input.yaml';
const REQUIRED_ROUTE_METADATA = [];
const REQUIRED_ERROR_METADATA = [];
const REQUIRED_WEBHOOK_METADATA = [];
const REQUIRED_SDK_GENERATION_FORBIDDEN_VALUES = [];
const REQUIRED_LIBS_EXPORT_SOURCE_REPO = 'zdp-libs-ts';
const REQUIRED_LIBS_SOURCE_EXPORTS = [];
const REQUIRED_LIBS_SOURCE_METADATA = [];
const REQUIRED_LIBS_SOURCE_FORBIDDEN_VALUES = [];
const REQUIRED_AUTH_HELPER_FORBIDDEN_OWNERSHIP = [];
const REQUIRED_UPLOAD_CLIENT_FORBIDDEN_OWNERSHIP = [];
const CLIENT_SDK_LANGUAGE_MISSING = 'CLIENT_SDK_LANGUAGE_MISSING';
const CLIENT_SDK_BEHAVIOR_MISSING = 'CLIENT_SDK_BEHAVIOR_MISSING';
const CLIENT_SDK_FORBIDDEN_OWNERSHIP_MISSING = 'CLIENT_SDK_FORBIDDEN_OWNERSHIP_MISSING';
const CLIENT_SDK_GENERATION_SOURCE_REPO_DRIFT = 'CLIENT_SDK_GENERATION_SOURCE_REPO_DRIFT';
const CLIENT_SDK_ROUTE_METADATA_MISSING = 'CLIENT_SDK_ROUTE_METADATA_MISSING';
const CLIENT_SDK_ERROR_METADATA_MISSING = 'CLIENT_SDK_ERROR_METADATA_MISSING';
const CLIENT_SDK_GENERATION_FORBIDDEN_VALUE_MISSING = 'CLIENT_SDK_GENERATION_FORBIDDEN_VALUE_MISSING';
const CLIENT_SDK_LIBS_EXPORT_SOURCE_REPO_DRIFT = 'CLIENT_SDK_LIBS_EXPORT_SOURCE_REPO_DRIFT';
const CLIENT_SDK_LIBS_EXPORT_MISSING = 'CLIENT_SDK_LIBS_EXPORT_MISSING';
const CLIENT_SDK_LIBS_METADATA_MISSING = 'CLIENT_SDK_LIBS_METADATA_MISSING';
const CLIENT_SDK_LIBS_FORBIDDEN_VALUE_MISSING = 'CLIENT_SDK_LIBS_FORBIDDEN_VALUE_MISSING';
const CLIENT_SDK_AUTH_HELPER_FORBIDDEN_OWNERSHIP_MISSING = 'CLIENT_SDK_AUTH_HELPER_FORBIDDEN_OWNERSHIP_MISSING';
const CLIENT_SDK_UPLOAD_CLIENT_FORBIDDEN_OWNERSHIP_MISSING = 'CLIENT_SDK_UPLOAD_CLIENT_FORBIDDEN_OWNERSHIP_MISSING';
export {
  REQUIRED_SDK_LANGUAGES,
  REQUIRED_SDK_BEHAVIORS,
  REQUIRED_SDK_FORBIDDEN_OWNERSHIP,
  REQUIRED_SDK_GENERATION_SOURCE_REPO,
  REQUIRED_SDK_GENERATION_SOURCE_CONTRACT,
  REQUIRED_ROUTE_METADATA,
  REQUIRED_ERROR_METADATA,
  REQUIRED_WEBHOOK_METADATA,
  REQUIRED_SDK_GENERATION_FORBIDDEN_VALUES,
  REQUIRED_LIBS_EXPORT_SOURCE_REPO,
  REQUIRED_LIBS_SOURCE_EXPORTS,
  REQUIRED_LIBS_SOURCE_METADATA,
  REQUIRED_LIBS_SOURCE_FORBIDDEN_VALUES,
  REQUIRED_AUTH_HELPER_FORBIDDEN_OWNERSHIP,
  REQUIRED_UPLOAD_CLIENT_FORBIDDEN_OWNERSHIP,
  CLIENT_SDK_LANGUAGE_MISSING,
  CLIENT_SDK_BEHAVIOR_MISSING,
  CLIENT_SDK_FORBIDDEN_OWNERSHIP_MISSING,
  CLIENT_SDK_GENERATION_SOURCE_REPO_DRIFT,
  CLIENT_SDK_ROUTE_METADATA_MISSING,
  CLIENT_SDK_ERROR_METADATA_MISSING,
  CLIENT_SDK_GENERATION_FORBIDDEN_VALUE_MISSING,
  CLIENT_SDK_LIBS_EXPORT_SOURCE_REPO_DRIFT,
  CLIENT_SDK_LIBS_EXPORT_MISSING,
  CLIENT_SDK_LIBS_METADATA_MISSING,
  CLIENT_SDK_LIBS_FORBIDDEN_VALUE_MISSING,
  CLIENT_SDK_AUTH_HELPER_FORBIDDEN_OWNERSHIP_MISSING,
  CLIENT_SDK_UPLOAD_CLIENT_FORBIDDEN_OWNERSHIP_MISSING
};
`,
    'tests/client-sdk-contracts.test.ts': `
const cases = [
  'fails when TypeScript SDK language support disappears',
  'fails when SDKs stop propagating request ids',
  'fails when SDKs become the API contract source',
  'fails when SDKs consume a different generation input source',
  'fails when SDKs consume a different libs export source',
  'fails when libs schema export disappears from SDK generation metadata',
  'fails when libs trace metadata disappears from SDK generation handoff',
  'fails when libs source allows provider tokens into SDK handoff',
  'fails when route idempotency metadata is dropped',
  'fails when error trace metadata is dropped',
  'fails when raw authorization headers become allowed SDK generation values',
  'fails when auth helpers store refresh tokens',
  'fails when upload clients expose raw provider URLs as public contracts'
];
export { cases };
`,
    'src/sdk-generation-plan/cli.ts': `
import { loadClientSdkContracts } from '../client-sdk-contracts/parser';
import { loadApiExportPlanHandoff, loadApiSdkGenerationInput } from './api-input';
import { buildSdkGenerationPlan } from './plan';
export async function runSdkGenerationPlanCli(argv: readonly string[]): Promise<number> {
  loadClientSdkContracts();
  loadApiSdkGenerationInput();
  loadApiExportPlanHandoff();
  buildSdkGenerationPlan;
  return argv.includes('--api-contracts-root') || argv.includes('--check') || argv.includes('--json') ? 0 : 0;
}
`,
    'src/sdk-generation-plan/api-input.ts': `
const file = 'sdk-generation-input.yaml';
const fields = [
  'source_contracts',
  'generation_targets',
  'required_route_metadata',
  'required_error_metadata',
  'required_webhook_metadata',
  'forbidden_values'
];
const apiExportPlan = [
  'package.json',
  'export:plan',
  'src/api-export-plan/plan.ts',
  'sdk_generation_input',
  'docs_contract',
  'writesArtifacts',
  'publishesSchemas'
];
export function loadApiSdkGenerationInput(): void {
  file;
  fields;
}
export function loadApiExportPlanHandoff(): void {
  apiExportPlan;
}
`,
    'src/sdk-generation-plan/plan.ts': `
import { validateClientSdkContracts } from '../client-sdk-contracts/validator';
const plannedPackages = ['@zdp/client-sdk', 'zdp_client_sdk', 'zdp-client-sdk'];
const codes = [
  'CLIENT_SDK_GENERATION_PLAN_LIBS_TARGET_MISSING',
  'CLIENT_SDK_GENERATION_PLAN_TARGET_UNSUPPORTED',
  'CLIENT_SDK_API_INPUT_TARGET_DRIFT',
  'CLIENT_SDK_API_INPUT_ROUTE_METADATA_DRIFT',
  'CLIENT_SDK_API_INPUT_ERROR_METADATA_DRIFT',
  'CLIENT_SDK_API_INPUT_WEBHOOK_METADATA_DRIFT',
  'CLIENT_SDK_API_EXPORT_PLAN_OUTPUT_MISSING',
  'CLIENT_SDK_API_EXPORT_PLAN_TRACE_FIELD_MISSING',
  'CLIENT_SDK_API_EXPORT_PLAN_WRITES_ARTIFACTS'
];
const apiInputSourceContracts = [];
const apiExportPlanOutputKinds = [];
const apiExportPlanTraceFields = [];
function validateApiGenerationInput(): void {}
function validateApiExportPlanHandoff(): void {}
export function buildSdkGenerationPlan(): void {
  validateClientSdkContracts;
  validateApiGenerationInput;
  validateApiExportPlanHandoff;
  apiInputSourceContracts;
  apiExportPlanOutputKinds;
  apiExportPlanTraceFields;
  plannedPackages;
  codes;
}
`,
    'src/sdk-generation-plan/types.ts': `
export interface ApiExportPlanHandoff {}
export interface SdkGenerationPlan {
  readonly writesArtifacts: false;
  readonly publishesPackages: false;
  readonly apiExportPlanOutputKinds: readonly string[];
  readonly apiExportPlanTraceFields: readonly string[];
}
`,
    'tests/sdk-generation-plan.test.ts': `
const cases = [
  'builds a deterministic SDK generation plan',
  'fails when contract validation fails before planning',
  'fails when libs source does not cover an SDK generation target',
  'fails when API SDK generation input drifts from client SDK source',
  'fails when API export plan no longer exposes SDK generation output',
  'fails when API export plan can write artifacts before SDK generation',
  'zdp-libs-ts/schema',
  'request_id',
  'trace_id'
];
export { cases };
`
  };
}
