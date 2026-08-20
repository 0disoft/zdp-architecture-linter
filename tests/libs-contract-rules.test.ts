import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { validateRepositoryLibsContract } from '../src/libs-contract-rules.ts';

describe('libs repository rules', () => {
  test('passes when the libs repository declares package contracts and checker surface', async () => {
    await withRepositoryRoot(createValidLibsContractFiles(), async (repositoryRoot) => {
      const diagnostics = await validateRepositoryLibsContract({
        repositoryRoot,
        repositoryServiceContract: createLibsServiceContract()
      });

      expect(diagnostics).toEqual([]);
    });
  });

  test('skips repositories that are not zdp-libs-ts', async () => {
    await withRepositoryRoot({}, async (repositoryRoot) => {
      const diagnostics = await validateRepositoryLibsContract({
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

  test('fails when required libs contract files are missing', async () => {
    await withRepositoryRoot({}, async (repositoryRoot) => {
      const diagnostics = await validateRepositoryLibsContract({
        repositoryRoot,
        repositoryServiceContract: createLibsServiceContract()
      });

      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-LIBS-001',
        severity: 'error',
        file: 'contracts/package-boundaries.yaml',
        path: 'repository.root',
        message:
          'Libs repository must include `contracts/package-boundaries.yaml`.'
      });
      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-LIBS-001',
        severity: 'error',
        file: 'contracts/api-contract-source.yaml',
        path: 'repository.root',
        message:
          'Libs repository must include `contracts/api-contract-source.yaml`.'
      });
      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-LIBS-001',
        severity: 'error',
        file: 'contracts/schema-contract.yaml',
        path: 'repository.root',
        message: 'Libs repository must include `contracts/schema-contract.yaml`.'
      });
      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-LIBS-001',
        severity: 'error',
        file: 'contracts/i18n-contract.yaml',
        path: 'repository.root',
        message: 'Libs repository must include `contracts/i18n-contract.yaml`.'
      });
    });
  });

  test('fails when a libs contract file is not valid YAML', async () => {
    await withRepositoryRoot(
      {
        ...createValidLibsContractFiles(),
        'contracts/schema-contract.yaml': 'schema_contract: [broken'
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryLibsContract({
          repositoryRoot,
          repositoryServiceContract: createLibsServiceContract()
        });

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]).toMatchObject({
          ruleId: 'ZDP-LIBS-001',
          severity: 'error',
          file: 'contracts/schema-contract.yaml',
          path: 'yaml'
        });
      }
    );
  });

  test('fails when package boundaries lose required packages and forbidden ownership', async () => {
    await withRepositoryRoot(
      {
        ...createValidLibsContractFiles(),
        'contracts/package-boundaries.yaml': `
packages:
  - name: "@zdp/schema"
    status: planned
    owns:
      - schema metadata helpers
    must_not_own:
      - product domain models
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryLibsContract({
          repositoryRoot,
          repositoryServiceContract: createLibsServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-LIBS-001',
          severity: 'error',
          file: 'contracts/package-boundaries.yaml',
          path: 'packages',
          message:
            'Libs contract `contracts/package-boundaries.yaml` must declare `@zdp/event-contracts` in `packages`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-LIBS-001',
          severity: 'error',
          file: 'contracts/package-boundaries.yaml',
          path: 'packages[].must_not_own',
          message:
            'Libs contract `contracts/package-boundaries.yaml` must include `secret values` in `packages[].must_not_own`.'
        });
      }
    );
  });

  test('fails when API contract source handoff drifts', async () => {
    await withRepositoryRoot(
      {
        ...createValidLibsContractFiles(),
        'contracts/api-contract-source.yaml': `
api_contract_source:
  status: live
  source_repo: zdp-libs-ts
  source_contracts:
    - contracts/route-contract.yaml
  consumed_by_packages:
    - "@zdp/schema"
  required_handoff_metadata:
    - schema_id
  must_not_own:
    - product domain models
  forbidden_values:
    - raw_provider_error
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryLibsContract({
          repositoryRoot,
          repositoryServiceContract: createLibsServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-LIBS-001',
          severity: 'error',
          file: 'contracts/api-contract-source.yaml',
          path: 'api_contract_source.status',
          message:
            'Libs API contract source handoff must stay skeleton until real package exports exist.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-LIBS-001',
          severity: 'error',
          file: 'contracts/api-contract-source.yaml',
          path: 'api_contract_source.source_repo',
          message:
            'Libs API contract source handoff must consume `zdp-api-contracts`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-LIBS-001',
          severity: 'error',
          file: 'contracts/api-contract-source.yaml',
          path: 'api_contract_source.source_contracts',
          message:
            'Libs contract `contracts/api-contract-source.yaml` must include `contracts/sdk-generation-input.yaml` in `api_contract_source.source_contracts`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-LIBS-001',
          severity: 'error',
          file: 'contracts/api-contract-source.yaml',
          path: 'api_contract_source.required_handoff_metadata',
          message:
            'Libs contract `contracts/api-contract-source.yaml` must include `idempotency` in `api_contract_source.required_handoff_metadata`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-LIBS-001',
          severity: 'error',
          file: 'contracts/api-contract-source.yaml',
          path: 'api_contract_source.forbidden_values',
          message:
            'Libs contract `contracts/api-contract-source.yaml` must include `authorization_header` in `api_contract_source.forbidden_values`.'
        });
      }
    );
  });

  test('fails when schema contracts lose generation and ownership boundaries', async () => {
    await withRepositoryRoot(
      {
        ...createValidLibsContractFiles(),
        'contracts/schema-contract.yaml': `
schema_contract:
  status: live
  required_metadata:
    - schema_id
  generation_targets:
    - json_schema
  forbidden_ownership:
    - product_domain_model
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryLibsContract({
          repositoryRoot,
          repositoryServiceContract: createLibsServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-LIBS-001',
          severity: 'error',
          file: 'contracts/schema-contract.yaml',
          path: 'schema_contract.status',
          message:
            'Libs schema contract must stay skeleton until real package exports exist.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-LIBS-001',
          severity: 'error',
          file: 'contracts/schema-contract.yaml',
          path: 'schema_contract.generation_targets',
          message:
            'Libs contract `contracts/schema-contract.yaml` must include `rust` in `schema_contract.generation_targets`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-LIBS-001',
          severity: 'error',
          file: 'contracts/schema-contract.yaml',
          path: 'schema_contract.forbidden_ownership',
          message:
            'Libs contract `contracts/schema-contract.yaml` must include `database_row_shape` in `schema_contract.forbidden_ownership`.'
        });
      }
    );
  });

  test('fails when env and event contracts allow sensitive payload drift', async () => {
    await withRepositoryRoot(
      {
        ...createValidLibsContractFiles(),
        'contracts/env-contract.yaml': `
env_contract:
  required_metadata:
    - name
  forbidden_values:
    - actual secret values
`,
        'contracts/event-contract.yaml': `
event_contract:
  status: live
  required_metadata:
    - event_id
  required_trace_fields:
    - request_id
  forbidden_values:
    - provider_secret
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryLibsContract({
          repositoryRoot,
          repositoryServiceContract: createLibsServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-LIBS-001',
          severity: 'error',
          file: 'contracts/env-contract.yaml',
          path: 'env_contract.forbidden_values',
          message:
            'Libs contract `contracts/env-contract.yaml` must include `provider tokens` in `env_contract.forbidden_values`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-LIBS-001',
          severity: 'error',
          file: 'contracts/event-contract.yaml',
          path: 'event_contract.required_trace_fields',
          message:
            'Libs contract `contracts/event-contract.yaml` must include `trace_id` in `event_contract.required_trace_fields`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-LIBS-001',
          severity: 'error',
          file: 'contracts/event-contract.yaml',
          path: 'event_contract.forbidden_values',
          message:
            'Libs contract `contracts/event-contract.yaml` must include `raw_customer_payload` in `event_contract.forbidden_values`.'
        });
      }
    );
  });

  test('fails when error and i18n contracts leak runtime responsibilities', async () => {
    await withRepositoryRoot(
      {
        ...createValidLibsContractFiles(),
        'contracts/error-contract.yaml': `
error_contract:
  required_fields:
    - code
  forbidden_fields:
    - stack_trace
`,
        'contracts/i18n-contract.yaml': `
i18n_contract:
  status: live
  message_key_pattern: freeform
  required_metadata:
    - key
  forbidden_ownership:
    - provider_i18n_sdk
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryLibsContract({
          repositoryRoot,
          repositoryServiceContract: createLibsServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-LIBS-001',
          severity: 'error',
          file: 'contracts/error-contract.yaml',
          path: 'error_contract.required_fields',
          message:
            'Libs contract `contracts/error-contract.yaml` must include `trace_id` in `error_contract.required_fields`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-LIBS-001',
          severity: 'error',
          file: 'contracts/error-contract.yaml',
          path: 'error_contract.forbidden_fields',
          message:
            'Libs contract `contracts/error-contract.yaml` must include `raw_provider_error` in `error_contract.forbidden_fields`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-LIBS-001',
          severity: 'error',
          file: 'contracts/i18n-contract.yaml',
          path: 'i18n_contract.message_key_pattern',
          message:
            'Libs i18n contract must keep message keys on the domain.message_name pattern.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-LIBS-001',
          severity: 'error',
          file: 'contracts/i18n-contract.yaml',
          path: 'i18n_contract.forbidden_ownership',
          message:
            'Libs contract `contracts/i18n-contract.yaml` must include `translation_runtime` in `i18n_contract.forbidden_ownership`.'
        });
      }
    );
  });

  test('fails when libs checker files and scripts drift', async () => {
    await withRepositoryRoot(
      {
        ...createValidLibsContractFiles(),
        'package.json': `
{
  "scripts": {
    "check": "bun test"
  }
}
`,
        'src/libs-contracts/validator.ts': `
export function validateLibsContracts(): void {}
`,
        'tests/libs-contracts.test.ts': `
import { test } from 'bun:test';
test('libs placeholder', () => {});
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryLibsContract({
          repositoryRoot,
          repositoryServiceContract: createLibsServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-LIBS-001',
          severity: 'error',
          file: 'package.json',
          path: 'scripts.test',
          message: 'Libs package must declare `test` script.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-LIBS-001',
          severity: 'error',
          file: 'package.json',
          path: 'scripts.check:integration',
          message: 'Libs package must declare `check:integration` script.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-LIBS-001',
          severity: 'error',
          file: 'src/libs-contracts/validator.ts',
          path: 'source',
          message:
            'Libs checker source must include `REQUIRED_API_SOURCE_CONTRACTS`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-LIBS-001',
          severity: 'error',
          file: 'tests/libs-contracts.test.ts',
          path: 'source',
          message:
            'Libs checker source must include `fails when API contract source handoff drifts`.'
        });
      }
    );
  });

  test('separates standalone and API integration scripts', async () => {
    await withRepositoryRoot(
      {
        ...createValidLibsContractFiles(),
        'package.json': `
{
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
    "./schema": { "types": "./dist/schema/index.d.ts", "import": "./dist/schema/index.js" },
    "./env-contract": { "types": "./dist/env-contract/index.d.ts", "import": "./dist/env-contract/index.js" },
    "./event-contracts": { "types": "./dist/event-contracts/index.d.ts", "import": "./dist/event-contracts/index.js" },
    "./error": { "types": "./dist/error/index.d.ts", "import": "./dist/error/index.js" },
    "./i18n-contract": { "types": "./dist/i18n-contract/index.d.ts", "import": "./dist/i18n-contract/index.js" }
  },
  "types": "./dist/index.d.ts",
  "scripts": {
    "check": "tsc --noEmit && bun test && bun run contracts:check",
    "check:integration": "bun run contracts:check:integration",
    "test": "bun test",
    "test:integration": "bun test",
    "contracts:check": "bun scripts/check-libs-contracts.ts --api-contracts-root ../zdp-api-contracts",
    "contracts:check:integration": "bun scripts/check-libs-contracts.ts"
  }
}
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryLibsContract({
          repositoryRoot,
          repositoryServiceContract: createLibsServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-LIBS-001',
          severity: 'error',
          file: 'package.json',
          path: 'scripts.contracts:check',
          message:
            'Libs package `contracts:check` must remain standalone without requiring a sibling API contracts checkout.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-LIBS-001',
          severity: 'error',
          file: 'package.json',
          path: 'scripts.check:integration',
          message:
            'Libs package `check:integration` must include `bun run contracts:check:integration` and `bun run test:integration`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-LIBS-001',
          severity: 'error',
          file: 'package.json',
          path: 'scripts.test:integration',
          message:
            'Libs package `test:integration` must include `scripts/test-api-contract-integration.ts` and `--api-contracts-root ../zdp-api-contracts`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-LIBS-001',
          severity: 'error',
          file: 'package.json',
          path: 'scripts.contracts:check:integration',
          message:
            'Libs package `contracts:check:integration` must include `scripts/check-libs-contracts.ts` and `--api-contracts-root ../zdp-api-contracts`.'
        });
      }
    );
  });

  test('fails when libs public export skeleton drifts', async () => {
    await withRepositoryRoot(
      {
        ...createValidLibsContractFiles(),
        'package.json': `
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./schema": {
      "types": "./dist/schema/index.d.ts",
      "import": "./dist/schema/index.js"
    }
  },
  "types": "./dist/not-index.d.ts",
  "scripts": {
    "check": "tsc --noEmit && bun test && bun run contracts:check",
    "test": "bun test",
    "contracts:check": "bun scripts/check-libs-contracts.ts"
  }
}
`,
        'src/index.ts': `
export { defineSchemaMetadata } from './schema/index';
`,
        'src/schema/index.ts': `
export const SCHEMA_GENERATION_TARGETS = [];
`,
        'tests/public-exports.test.ts': `
import { test } from 'bun:test';
test('placeholder', () => {});
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryLibsContract({
          repositoryRoot,
          repositoryServiceContract: createLibsServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-LIBS-001',
          severity: 'error',
          file: 'package.json',
          path: 'exports["./env-contract"].import',
          message:
            'Libs package must export `./env-contract` import from `./dist/env-contract/index.js`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-LIBS-001',
          severity: 'error',
          file: 'package.json',
          path: 'types',
          message: 'Libs package must point `types` at `./dist/index.d.ts`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-LIBS-001',
          severity: 'error',
          file: 'src/index.ts',
          path: 'source',
          message:
            "Libs checker source must include `from './env-contract/index.js'`."
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-LIBS-001',
          severity: 'error',
          file: 'src/schema/index.ts',
          path: 'source',
          message: 'Libs checker source must include `SchemaMetadata`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-LIBS-001',
          severity: 'error',
          file: 'tests/public-exports.test.ts',
          path: 'source',
          message:
            'Libs checker source must include `public contract package exports`.'
        });
      }
    );
  });

  test('fails when service contract does not require the libs gate', async () => {
    await withRepositoryRoot(createValidLibsContractFiles(), async (repositoryRoot) => {
      const diagnostics = await validateRepositoryLibsContract({
        repositoryRoot,
        repositoryServiceContract: {
          service: {
            repo: 'zdp-libs-ts'
          },
          policy_gates: {
            required_linter_rules: ['ZDP-REPO-BASELINE-001']
          }
        }
      });

      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-LIBS-001',
        severity: 'error',
        file: 'service.yaml',
        path: 'policy_gates.required_linter_rules',
        message: 'Libs service contract must require `ZDP-LIBS-001`.'
      });
    });
  });
});

async function withRepositoryRoot(
  files: Record<string, string>,
  callback: (repositoryRoot: string) => Promise<void>
): Promise<void> {
  const repositoryRoot = await mkdtemp(join(tmpdir(), 'zdp-libs-contracts-'));

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

function createLibsServiceContract(): unknown {
  return {
    service: {
      repo: 'zdp-libs-ts'
    },
    policy_gates: {
      required_linter_rules: [
        'ZDP-REPO-BASELINE-001',
        'ZDP-REPO-MARKDOWN-002',
        'ZDP-LIBS-001'
      ]
    }
  };
}

function createValidLibsContractFiles(): Record<string, string> {
  return {
    ...createValidLibsCheckerFiles(),
    'contracts/package-boundaries.yaml': `
packages:
  - name: "@zdp/schema"
    status: planned
    owns:
      - schema metadata helpers
    must_not_own:
      - product domain models
  - name: "@zdp/env-contract"
    status: planned
    owns:
      - environment variable contract metadata
    must_not_own:
      - secret values
  - name: "@zdp/event-contracts"
    status: planned
    owns:
      - event envelope metadata
    must_not_own:
      - queue provider implementation
  - name: "@zdp/error"
    status: planned
    owns:
      - standard error code metadata
    must_not_own:
      - provider raw errors
  - name: "@zdp/i18n-contract"
    status: planned
    owns:
      - message key and argument contracts
    must_not_own:
      - translation runtime
`,
    'contracts/api-contract-source.yaml': `
api_contract_source:
  status: skeleton
  source_repo: zdp-api-contracts
  source_contracts:
    - contracts/route-contract.yaml
    - contracts/error-envelope.yaml
    - contracts/webhook-contract.yaml
    - contracts/sdk-generation-input.yaml
  consumed_by_packages:
    - "@zdp/schema"
    - "@zdp/event-contracts"
    - "@zdp/error"
  required_handoff_metadata:
    - schema_id
    - operation_id
    - error_code
    - event_type
    - request_id
    - trace_id
    - idempotency
    - sdk_generation_targets
  must_not_own:
    - API contract source
    - generated SDK source truth
    - product domain models
    - runtime validator competitor
    - final authorization decisions
  forbidden_values:
    - raw_customer_payload
    - raw_provider_error
    - provider_secret
    - authorization_header
    - cookie_header
    - screen_component_payload
`,
    'contracts/schema-contract.yaml': `
schema_contract:
  status: skeleton
  required_metadata:
    - schema_id
    - version
    - owner
    - json_schema_ref
    - openapi_ref
    - sdk_generation_targets
  generation_targets:
    - json_schema
    - openapi
    - typescript
    - rust
    - dart
  forbidden_ownership:
    - product_domain_model
    - runtime_validator_competitor
    - provider_payload_raw
    - database_row_shape
`,
    'contracts/env-contract.yaml': `
env_contract:
  required_metadata:
    - name
    - owner
    - environment
    - secret
    - required
    - description
  forbidden_values:
    - actual secret values
    - account ids
    - server ips
    - provider tokens
`,
    'contracts/event-contract.yaml': `
event_contract:
  status: skeleton
  required_metadata:
    - event_id
    - schema_ref
    - source
    - privacy_class
    - replay_safe
  required_trace_fields:
    - request_id
    - trace_id
  forbidden_values:
    - raw_customer_payload
    - provider_secret
    - authorization_header
    - cookie
    - payment_payload
    - ai_prompt_body
`,
    'contracts/error-contract.yaml': `
error_contract:
  required_fields:
    - code
    - category
    - retryable
    - public_message_key
    - request_id
    - trace_id
  forbidden_fields:
    - stack_trace
    - raw_provider_error
    - secret_value
    - customer_payload
`,
    'contracts/i18n-contract.yaml': `
i18n_contract:
  status: skeleton
  message_key_pattern: domain.message_name
  required_metadata:
    - key
    - default_locale
    - arguments
    - owner
    - fallback_policy
  forbidden_ownership:
    - translation_runtime
    - provider_i18n_sdk
    - product_copy_final_approval
`
  };
}

function createValidLibsCheckerFiles(): Record<string, string> {
  return {
    'package.json': `
{
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
    "./schema": { "types": "./dist/schema/index.d.ts", "import": "./dist/schema/index.js" },
    "./env-contract": { "types": "./dist/env-contract/index.d.ts", "import": "./dist/env-contract/index.js" },
    "./event-contracts": { "types": "./dist/event-contracts/index.d.ts", "import": "./dist/event-contracts/index.js" },
    "./error": { "types": "./dist/error/index.d.ts", "import": "./dist/error/index.js" },
    "./i18n-contract": { "types": "./dist/i18n-contract/index.d.ts", "import": "./dist/i18n-contract/index.js" }
  },
  "types": "./dist/index.d.ts",
  "scripts": {
    "check": "tsc --noEmit && bun test && bun run contracts:check",
    "check:integration": "bun run contracts:check:integration && bun run test:integration",
    "test": "bun test",
    "test:integration": "bun scripts/test-api-contract-integration.ts --api-contracts-root ../zdp-api-contracts",
    "contracts:check": "bun scripts/check-libs-contracts.ts",
    "contracts:check:integration": "bun scripts/check-libs-contracts.ts --api-contracts-root ../zdp-api-contracts"
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
    'scripts/check-libs-contracts.ts': `
import { runLibsContractCheckCli } from '../src/libs-contracts/cli';
const exitCode = await runLibsContractCheckCli(process.argv.slice(2));
process.exit(exitCode);
`,
    'src/libs-contracts/api-source.ts': `
const files = [
  'contracts/route-contract.yaml',
  'contracts/error-envelope.yaml',
  'contracts/webhook-contract.yaml',
  'contracts/sdk-generation-input.yaml'
];
const fields = [
  'required_per_route',
  'required_fields',
  'required_controls',
  'generation_targets',
  'forbidden_values'
];
function loadApiContractsInput() {
  return { files, fields };
}
export { loadApiContractsInput };
`,
    'src/libs-contracts/cli.ts': `
import { loadApiContractsInput } from './api-source';
export async function runLibsContractCheckCli(): Promise<number> {
  const root = '--api-contracts-root';
  const defaultRoot = '../zdp-api-contracts';
  loadApiContractsInput();
  return 0;
}
`,
    'src/libs-contracts/parser.ts': `
const files = [
  'contracts/package-boundaries.yaml',
  'contracts/api-contract-source.yaml',
  'contracts/schema-contract.yaml',
  'contracts/env-contract.yaml',
  'contracts/event-contract.yaml',
  'contracts/error-contract.yaml',
  'contracts/i18n-contract.yaml'
];
export { files };
`,
    'src/libs-contracts/types.ts': `
export interface LibsContractDiagnostic {
  readonly code: string;
}
`,
    'src/libs-contracts/validator.ts': `
const REQUIRED_PACKAGE_NAMES = [];
const REQUIRED_API_SOURCE_CONTRACTS = [];
const REQUIRED_API_SOURCE_HANDOFF_METADATA = [];
const validateApiContractInputHandoff = () => {};
const LIBS_API_INPUT_SDK_ERROR_METADATA_MISSING = 'LIBS_API_INPUT_SDK_ERROR_METADATA_MISSING';
const LIBS_API_INPUT_FORBIDDEN_VALUE_MISSING = 'LIBS_API_INPUT_FORBIDDEN_VALUE_MISSING';
const REQUIRED_SCHEMA_METADATA = [];
const REQUIRED_ENV_METADATA = [];
const REQUIRED_EVENT_TRACE_FIELDS = [];
const REQUIRED_ERROR_FIELDS = [];
const REQUIRED_I18N_METADATA = [];
const LIBS_PACKAGE_MISSING = 'LIBS_PACKAGE_MISSING';
const LIBS_API_SOURCE_REPO_INVALID = 'LIBS_API_SOURCE_REPO_INVALID';
const LIBS_API_SOURCE_CONTRACT_MISSING = 'LIBS_API_SOURCE_CONTRACT_MISSING';
const LIBS_API_SOURCE_METADATA_MISSING = 'LIBS_API_SOURCE_METADATA_MISSING';
const LIBS_API_SOURCE_FORBIDDEN_VALUE_MISSING = 'LIBS_API_SOURCE_FORBIDDEN_VALUE_MISSING';
const LIBS_ENV_FORBIDDEN_VALUE_MISSING = 'LIBS_ENV_FORBIDDEN_VALUE_MISSING';
const LIBS_EVENT_TRACE_FIELD_MISSING = 'LIBS_EVENT_TRACE_FIELD_MISSING';
const LIBS_ERROR_FORBIDDEN_FIELD_MISSING = 'LIBS_ERROR_FORBIDDEN_FIELD_MISSING';
const LIBS_I18N_FORBIDDEN_OWNERSHIP_MISSING = 'LIBS_I18N_FORBIDDEN_OWNERSHIP_MISSING';
export {
  REQUIRED_PACKAGE_NAMES,
  REQUIRED_API_SOURCE_CONTRACTS,
  REQUIRED_API_SOURCE_HANDOFF_METADATA,
  validateApiContractInputHandoff,
  LIBS_API_INPUT_SDK_ERROR_METADATA_MISSING,
  LIBS_API_INPUT_FORBIDDEN_VALUE_MISSING,
  REQUIRED_SCHEMA_METADATA,
  REQUIRED_ENV_METADATA,
  REQUIRED_EVENT_TRACE_FIELDS,
  REQUIRED_ERROR_FIELDS,
  REQUIRED_I18N_METADATA,
  LIBS_PACKAGE_MISSING,
  LIBS_API_SOURCE_REPO_INVALID,
  LIBS_API_SOURCE_CONTRACT_MISSING,
  LIBS_API_SOURCE_METADATA_MISSING,
  LIBS_API_SOURCE_FORBIDDEN_VALUE_MISSING,
  LIBS_ENV_FORBIDDEN_VALUE_MISSING,
  LIBS_EVENT_TRACE_FIELD_MISSING,
  LIBS_ERROR_FORBIDDEN_FIELD_MISSING,
  LIBS_I18N_FORBIDDEN_OWNERSHIP_MISSING
};
`,
    'tests/libs-contracts.test.ts': `
const cases = [
  'fails when a required package boundary disappears',
  'fails when API contract source handoff drifts',
  'fails when API source input no longer carries handoff metadata',
  'fails when schema contracts stop targeting Rust generation',
  'fails when env contracts allow provider tokens as values',
  'fails when event contracts drop trace fields',
  'fails when error contracts allow raw provider errors',
  'fails when i18n contracts become a translation runtime'
];
export { cases };
`,
    'src/index.ts': `
export { defineSchemaMetadata } from './schema/index.js';
export { defineEnvContractMetadata } from './env-contract/index.js';
export { defineEventContractMetadata } from './event-contracts/index.js';
export { defineZdpErrorContract } from './error/index.js';
export { defineI18nMessageContract } from './i18n-contract/index.js';
`,
    'src/schema/index.ts': `
const SCHEMA_GENERATION_TARGETS = [];
interface SchemaMetadata {
  readonly schemaId: string;
}
function defineSchemaMetadata(metadata: SchemaMetadata): SchemaMetadata {
  return metadata;
}
export { SCHEMA_GENERATION_TARGETS, defineSchemaMetadata };
export type { SchemaMetadata };
`,
    'src/env-contract/index.ts': `
interface EnvContractMetadata {
  readonly name: string;
}
function defineEnvContractMetadata(metadata: EnvContractMetadata): EnvContractMetadata {
  return metadata;
}
export { defineEnvContractMetadata };
export type { EnvContractMetadata };
`,
    'src/event-contracts/index.ts': `
interface EventTraceContext {
  readonly traceId: string;
}
interface EventContractMetadata {
  readonly trace: EventTraceContext;
}
function defineEventContractMetadata(metadata: EventContractMetadata): EventContractMetadata {
  return metadata;
}
export { defineEventContractMetadata };
export type { EventTraceContext, EventContractMetadata };
`,
    'src/error/index.ts': `
type ZdpErrorCategory = 'internal';
interface ZdpErrorContract {
  readonly code: string;
}
function defineZdpErrorContract(contract: ZdpErrorContract): ZdpErrorContract {
  return contract;
}
export { defineZdpErrorContract };
export type { ZdpErrorCategory, ZdpErrorContract };
`,
    'src/i18n-contract/index.ts': `
interface I18nMessageArgument {
  readonly name: string;
}
interface I18nMessageContract {
  readonly key: string;
}
function defineI18nMessageContract(contract: I18nMessageContract): I18nMessageContract {
  return contract;
}
export { defineI18nMessageContract };
export type { I18nMessageArgument, I18nMessageContract };
`,
    'tests/public-exports.test.ts': `
const cases = [
  'public contract package exports',
  'defineSchemaMetadataFromSubpath',
  'defineZdpErrorContract'
];
export { cases };
`
  };
}
