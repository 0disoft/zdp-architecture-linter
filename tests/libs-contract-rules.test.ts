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
          file: 'src/libs-contracts/validator.ts',
          path: 'source',
          message:
            'Libs checker source must include `REQUIRED_PACKAGE_NAMES`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-LIBS-001',
          severity: 'error',
          file: 'tests/libs-contracts.test.ts',
          path: 'source',
          message:
            'Libs checker source must include `fails when env contracts allow provider tokens as values`.'
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
  "scripts": {
    "check": "tsc --noEmit && bun test && bun run contracts:check",
    "test": "bun test",
    "contracts:check": "bun scripts/check-libs-contracts.ts"
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
    'src/libs-contracts/cli.ts': `
export async function runLibsContractCheckCli(): Promise<number> {
  return 0;
}
`,
    'src/libs-contracts/parser.ts': `
const files = [
  'contracts/package-boundaries.yaml',
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
const REQUIRED_SCHEMA_METADATA = [];
const REQUIRED_ENV_METADATA = [];
const REQUIRED_EVENT_TRACE_FIELDS = [];
const REQUIRED_ERROR_FIELDS = [];
const REQUIRED_I18N_METADATA = [];
const LIBS_PACKAGE_MISSING = 'LIBS_PACKAGE_MISSING';
const LIBS_ENV_FORBIDDEN_VALUE_MISSING = 'LIBS_ENV_FORBIDDEN_VALUE_MISSING';
const LIBS_EVENT_TRACE_FIELD_MISSING = 'LIBS_EVENT_TRACE_FIELD_MISSING';
const LIBS_ERROR_FORBIDDEN_FIELD_MISSING = 'LIBS_ERROR_FORBIDDEN_FIELD_MISSING';
const LIBS_I18N_FORBIDDEN_OWNERSHIP_MISSING = 'LIBS_I18N_FORBIDDEN_OWNERSHIP_MISSING';
export {
  REQUIRED_PACKAGE_NAMES,
  REQUIRED_SCHEMA_METADATA,
  REQUIRED_ENV_METADATA,
  REQUIRED_EVENT_TRACE_FIELDS,
  REQUIRED_ERROR_FIELDS,
  REQUIRED_I18N_METADATA,
  LIBS_PACKAGE_MISSING,
  LIBS_ENV_FORBIDDEN_VALUE_MISSING,
  LIBS_EVENT_TRACE_FIELD_MISSING,
  LIBS_ERROR_FORBIDDEN_FIELD_MISSING,
  LIBS_I18N_FORBIDDEN_OWNERSHIP_MISSING
};
`,
    'tests/libs-contracts.test.ts': `
const cases = [
  'fails when a required package boundary disappears',
  'fails when schema contracts stop targeting Rust generation',
  'fails when env contracts allow provider tokens as values',
  'fails when event contracts drop trace fields',
  'fails when error contracts allow raw provider errors',
  'fails when i18n contracts become a translation runtime'
];
export { cases };
`
  };
}
