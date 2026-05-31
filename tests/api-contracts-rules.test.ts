import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { validateRepositoryApiContractsContract } from '../src/api-contracts-rules.ts';

describe('api contracts repository rules', () => {
  test('passes when the API contracts repository declares checker contracts', async () => {
    await withRepositoryRoot(createValidApiContractFiles(), async (repositoryRoot) => {
      const diagnostics = await validateRepositoryApiContractsContract({
        repositoryRoot,
        repositoryServiceContract: createApiContractsServiceContract()
      });

      expect(diagnostics).toEqual([]);
    });
  });

  test('skips repositories that are not zdp-api-contracts', async () => {
    await withRepositoryRoot({}, async (repositoryRoot) => {
      const diagnostics = await validateRepositoryApiContractsContract({
        repositoryRoot,
        repositoryServiceContract: {
          service: {
            repo: 'zdp-libs-ts'
          }
        }
      });

      expect(diagnostics).toEqual([]);
    });
  });

  test('fails when required API contract files are missing', async () => {
    await withRepositoryRoot({}, async (repositoryRoot) => {
      const diagnostics = await validateRepositoryApiContractsContract({
        repositoryRoot,
        repositoryServiceContract: createApiContractsServiceContract()
      });

      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-API-CONTRACTS-001',
        severity: 'error',
        file: 'contracts/route-contract.yaml',
        path: 'repository.root',
        message:
          'API contracts repository must include `contracts/route-contract.yaml`.'
      });
      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-API-CONTRACTS-001',
        severity: 'error',
        file: 'contracts/error-envelope.yaml',
        path: 'repository.root',
        message:
          'API contracts repository must include `contracts/error-envelope.yaml`.'
      });
      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-API-CONTRACTS-001',
        severity: 'error',
        file: 'contracts/webhook-contract.yaml',
        path: 'repository.root',
        message:
          'API contracts repository must include `contracts/webhook-contract.yaml`.'
      });
    });
  });

  test('fails when an API contract file is not valid YAML', async () => {
    await withRepositoryRoot(
      {
        ...createValidApiContractFiles(),
        'contracts/route-contract.yaml': 'route_contract: [broken'
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryApiContractsContract({
          repositoryRoot,
          repositoryServiceContract: createApiContractsServiceContract()
        });

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]).toMatchObject({
          ruleId: 'ZDP-API-CONTRACTS-001',
          severity: 'error',
          file: 'contracts/route-contract.yaml',
          path: 'yaml'
        });
      }
    );
  });

  test('fails when route contracts lose route hook boundaries', async () => {
    await withRepositoryRoot(
      {
        ...createValidApiContractFiles(),
        'contracts/route-contract.yaml': `
route_contract:
  status: live
  required_per_route:
    - resource
    - action
  forbidden_shapes:
    - raw_storage_url
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryApiContractsContract({
          repositoryRoot,
          repositoryServiceContract: createApiContractsServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-API-CONTRACTS-001',
          severity: 'error',
          file: 'contracts/route-contract.yaml',
          path: 'route_contract.status',
          message:
            'API route contract must stay in skeleton status until real routes exist.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-API-CONTRACTS-001',
          severity: 'error',
          file: 'contracts/route-contract.yaml',
          path: 'route_contract.required_per_route',
          message:
            'API contract `contracts/route-contract.yaml` must include `permission_check` in `route_contract.required_per_route`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-API-CONTRACTS-001',
          severity: 'error',
          file: 'contracts/route-contract.yaml',
          path: 'route_contract.forbidden_shapes',
          message:
            'API contract `contracts/route-contract.yaml` must include `screen_component_payload` in `route_contract.forbidden_shapes`.'
        });
      }
    );
  });

  test('fails when error envelope contracts leak sensitive internals', async () => {
    await withRepositoryRoot(
      {
        ...createValidApiContractFiles(),
        'contracts/error-envelope.yaml': `
error_envelope:
  schema_version: 2
  required_fields:
    - code
    - message
  optional_fields:
    - details
  forbidden_fields:
    - stack_trace
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryApiContractsContract({
          repositoryRoot,
          repositoryServiceContract: createApiContractsServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-API-CONTRACTS-001',
          severity: 'error',
          file: 'contracts/error-envelope.yaml',
          path: 'error_envelope.schema_version',
          message:
            'API error envelope schema_version must remain 1 until a migration exists.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-API-CONTRACTS-001',
          severity: 'error',
          file: 'contracts/error-envelope.yaml',
          path: 'error_envelope.required_fields',
          message:
            'API contract `contracts/error-envelope.yaml` must include `trace_id` in `error_envelope.required_fields`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-API-CONTRACTS-001',
          severity: 'error',
          file: 'contracts/error-envelope.yaml',
          path: 'error_envelope.forbidden_fields',
          message:
            'API contract `contracts/error-envelope.yaml` must include `provider_secret` in `error_envelope.forbidden_fields`.'
        });
      }
    );
  });

  test('fails when webhook contracts lose replay-safe controls', async () => {
    await withRepositoryRoot(
      {
        ...createValidApiContractFiles(),
        'contracts/webhook-contract.yaml': `
webhook_contract:
  status: live
  required_controls:
    - event_id
  forbidden_controls:
    - unversioned_payload
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryApiContractsContract({
          repositoryRoot,
          repositoryServiceContract: createApiContractsServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-API-CONTRACTS-001',
          severity: 'error',
          file: 'contracts/webhook-contract.yaml',
          path: 'webhook_contract.status',
          message:
            'API webhook contract must stay in skeleton status until real webhooks exist.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-API-CONTRACTS-001',
          severity: 'error',
          file: 'contracts/webhook-contract.yaml',
          path: 'webhook_contract.required_controls',
          message:
            'API contract `contracts/webhook-contract.yaml` must include `idempotency_key` in `webhook_contract.required_controls`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-API-CONTRACTS-001',
          severity: 'error',
          file: 'contracts/webhook-contract.yaml',
          path: 'webhook_contract.forbidden_controls',
          message:
            'API contract `contracts/webhook-contract.yaml` must include `ledger_mutation_without_money_contract` in `webhook_contract.forbidden_controls`.'
        });
      }
    );
  });

  test('fails when API checker files and scripts drift', async () => {
    await withRepositoryRoot(
      {
        ...createValidApiContractFiles(),
        'package.json': `
{
  "scripts": {
    "check": "bun test"
  }
}
`,
        'src/api-contracts/validator.ts': `
export function validateApiContracts(): void {}
`,
        'tests/api-contracts.test.ts': `
import { test } from 'bun:test';
test('api placeholder', () => {});
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryApiContractsContract({
          repositoryRoot,
          repositoryServiceContract: createApiContractsServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-API-CONTRACTS-001',
          severity: 'error',
          file: 'package.json',
          path: 'scripts.test',
          message: 'API contracts package must declare `test` script.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-API-CONTRACTS-001',
          severity: 'error',
          file: 'package.json',
          path: 'scripts.contracts:check',
          message: 'API contracts package must declare `contracts:check` script.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-API-CONTRACTS-001',
          severity: 'error',
          file: 'src/api-contracts/validator.ts',
          path: 'source',
          message:
            'API contracts checker source must include `REQUIRED_ROUTE_FIELDS`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-API-CONTRACTS-001',
          severity: 'error',
          file: 'tests/api-contracts.test.ts',
          path: 'source',
          message:
            'API contracts checker source must include `fails when webhook contracts stop requiring idempotency`.'
        });
      }
    );
  });

  test('fails when service contract does not require the API contracts gate', async () => {
    await withRepositoryRoot(createValidApiContractFiles(), async (repositoryRoot) => {
      const diagnostics = await validateRepositoryApiContractsContract({
        repositoryRoot,
        repositoryServiceContract: {
          service: {
            repo: 'zdp-api-contracts'
          },
          policy_gates: {
            required_linter_rules: ['ZDP-REPO-BASELINE-001']
          }
        }
      });

      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-API-CONTRACTS-001',
        severity: 'error',
        file: 'service.yaml',
        path: 'policy_gates.required_linter_rules',
        message:
          'API contracts service contract must require `ZDP-API-CONTRACTS-001`.'
      });
    });
  });
});

async function withRepositoryRoot(
  files: Record<string, string>,
  callback: (repositoryRoot: string) => Promise<void>
): Promise<void> {
  const repositoryRoot = await mkdtemp(join(tmpdir(), 'zdp-api-contracts-'));

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

function createApiContractsServiceContract(): unknown {
  return {
    service: {
      repo: 'zdp-api-contracts'
    },
    policy_gates: {
      required_linter_rules: [
        'ZDP-REPO-BASELINE-001',
        'ZDP-REPO-MARKDOWN-002',
        'ZDP-API-CONTRACTS-001'
      ]
    }
  };
}

function createValidApiContractFiles(): Record<string, string> {
  return {
    ...createValidApiCheckerFiles(),
    'contracts/route-contract.yaml': `
route_contract:
  status: skeleton
  required_per_route:
    - resource
    - action
    - method
    - path
    - auth_required
    - permission_check
    - audit_event
    - idempotency
    - error_codes
  forbidden_shapes:
    - screen_component_payload
    - provider_specific_id_as_primary_id
    - raw_storage_url
`,
    'contracts/error-envelope.yaml': `
error_envelope:
  schema_version: 1
  required_fields:
    - code
    - message
    - request_id
    - trace_id
  optional_fields:
    - details
    - retry_after_seconds
    - documentation_url
  forbidden_fields:
    - stack_trace
    - provider_secret
    - raw_provider_error
    - customer_private_payload
`,
    'contracts/webhook-contract.yaml': `
webhook_contract:
  status: skeleton
  required_controls:
    - event_id
    - event_type
    - schema_version
    - signature_verification
    - idempotency_key
    - replay_policy
    - dead_letter_policy
  forbidden_controls:
    - unversioned_payload
    - provider_secret_in_schema
    - ledger_mutation_without_money_contract
`
  };
}

function createValidApiCheckerFiles(): Record<string, string> {
  return {
    'package.json': `
{
  "scripts": {
    "check": "tsc --noEmit && bun test && bun run contracts:check",
    "test": "bun test",
    "contracts:check": "bun scripts/check-api-contracts.ts"
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
    'scripts/check-api-contracts.ts': `
import { runApiContractCheckCli } from '../src/api-contracts/cli';
const exitCode = await runApiContractCheckCli(process.argv.slice(2));
process.exit(exitCode);
`,
    'src/api-contracts/cli.ts': `
export async function runApiContractCheckCli(): Promise<number> {
  return 0;
}
`,
    'src/api-contracts/parser.ts': `
const files = [
  'contracts/route-contract.yaml',
  'contracts/error-envelope.yaml',
  'contracts/webhook-contract.yaml'
];
export { files };
`,
    'src/api-contracts/types.ts': `
export interface ApiContractDiagnostic {
  readonly code: string;
}
`,
    'src/api-contracts/validator.ts': `
const REQUIRED_ROUTE_FIELDS = [];
const FORBIDDEN_ROUTE_SHAPES = [];
const REQUIRED_ERROR_FIELDS = [];
const FORBIDDEN_ERROR_FIELDS = [];
const REQUIRED_WEBHOOK_CONTROLS = [];
const FORBIDDEN_WEBHOOK_CONTROLS = [];
const API_ROUTE_REQUIRED_FIELD_MISSING = 'API_ROUTE_REQUIRED_FIELD_MISSING';
const API_ERROR_FORBIDDEN_FIELD_MISSING = 'API_ERROR_FORBIDDEN_FIELD_MISSING';
const API_WEBHOOK_REQUIRED_CONTROL_MISSING = 'API_WEBHOOK_REQUIRED_CONTROL_MISSING';
export {
  REQUIRED_ROUTE_FIELDS,
  FORBIDDEN_ROUTE_SHAPES,
  REQUIRED_ERROR_FIELDS,
  FORBIDDEN_ERROR_FIELDS,
  REQUIRED_WEBHOOK_CONTROLS,
  FORBIDDEN_WEBHOOK_CONTROLS,
  API_ROUTE_REQUIRED_FIELD_MISSING,
  API_ERROR_FORBIDDEN_FIELD_MISSING,
  API_WEBHOOK_REQUIRED_CONTROL_MISSING
};
`,
    'tests/api-contracts.test.ts': `
const cases = [
  'fails when route contracts stop requiring authorization hooks',
  'fails when route contracts allow screen-shaped payloads',
  'fails when error envelopes stop carrying trace identifiers',
  'fails when error envelopes stop forbidding provider secrets',
  'fails when webhook contracts stop requiring idempotency',
  'fails when webhook contracts allow ledger mutation bypasses'
];
export { cases };
`
  };
}
