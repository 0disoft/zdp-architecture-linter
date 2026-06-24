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
      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-API-CONTRACTS-001',
        severity: 'error',
        file: 'contracts/sdk-generation-input.yaml',
        path: 'repository.root',
        message:
          'API contracts repository must include `contracts/sdk-generation-input.yaml`.'
      });
      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-API-CONTRACTS-001',
        severity: 'error',
        file: 'contracts/apis/catalog.yaml',
        path: 'repository.root',
        message:
          'API contracts repository must include `contracts/apis/catalog.yaml`.'
      });
      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-API-CONTRACTS-001',
        severity: 'error',
        file: 'contracts/apis/core-api/auth-session.yaml',
        path: 'repository.root',
        message:
          'API contracts repository must include `contracts/apis/core-api/auth-session.yaml`.'
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
          path: 'route_contract.required_per_route',
          message:
            'API contract `contracts/route-contract.yaml` must include `session_effect` in `route_contract.required_per_route`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-API-CONTRACTS-001',
          severity: 'error',
          file: 'contracts/route-contract.yaml',
          path: 'route_contract.forbidden_shapes',
          message:
            'API contract `contracts/route-contract.yaml` must include `screen_component_payload` in `route_contract.forbidden_shapes`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-API-CONTRACTS-001',
          severity: 'error',
          file: 'contracts/route-contract.yaml',
          path: 'route_contract.forbidden_shapes',
          message:
            'API contract `contracts/route-contract.yaml` must include `refresh_token_plaintext` in `route_contract.forbidden_shapes`.'
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

  test('fails when SDK generation input loses handoff boundaries', async () => {
    await withRepositoryRoot(
      {
        ...createValidApiContractFiles(),
        'contracts/sdk-generation-input.yaml': `
sdk_generation_input:
  status: live
  source_contracts:
    - contracts/route-contract.yaml
  generation_targets:
    - typescript
  required_route_metadata:
    - operation_id
  required_error_metadata:
    - code
  required_webhook_metadata:
    - event_id
  forbidden_ownership:
    - product_business_logic
  forbidden_values:
    - raw_customer_payload
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
          file: 'contracts/sdk-generation-input.yaml',
          path: 'sdk_generation_input.status',
          message:
            'API SDK generation input must stay in skeleton status until real generators exist.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-API-CONTRACTS-001',
          severity: 'error',
          file: 'contracts/sdk-generation-input.yaml',
          path: 'sdk_generation_input.source_contracts',
          message:
            'API contract `contracts/sdk-generation-input.yaml` must include `contracts/error-envelope.yaml` in `sdk_generation_input.source_contracts`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-API-CONTRACTS-001',
          severity: 'error',
          file: 'contracts/sdk-generation-input.yaml',
          path: 'sdk_generation_input.generation_targets',
          message:
            'API contract `contracts/sdk-generation-input.yaml` must include `rust` in `sdk_generation_input.generation_targets`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-API-CONTRACTS-001',
          severity: 'error',
          file: 'contracts/sdk-generation-input.yaml',
          path: 'sdk_generation_input.required_route_metadata',
          message:
            'API contract `contracts/sdk-generation-input.yaml` must include `idempotency` in `sdk_generation_input.required_route_metadata`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-API-CONTRACTS-001',
          severity: 'error',
          file: 'contracts/sdk-generation-input.yaml',
          path: 'sdk_generation_input.required_error_metadata',
          message:
            'API contract `contracts/sdk-generation-input.yaml` must include `trace_id` in `sdk_generation_input.required_error_metadata`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-API-CONTRACTS-001',
          severity: 'error',
          file: 'contracts/sdk-generation-input.yaml',
          path: 'sdk_generation_input.required_webhook_metadata',
          message:
            'API contract `contracts/sdk-generation-input.yaml` must include `dead_letter_policy` in `sdk_generation_input.required_webhook_metadata`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-API-CONTRACTS-001',
          severity: 'error',
          file: 'contracts/sdk-generation-input.yaml',
          path: 'sdk_generation_input.forbidden_ownership',
          message:
            'API contract `contracts/sdk-generation-input.yaml` must include `final_authorization_decision` in `sdk_generation_input.forbidden_ownership`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-API-CONTRACTS-001',
          severity: 'error',
          file: 'contracts/sdk-generation-input.yaml',
          path: 'sdk_generation_input.forbidden_values',
          message:
            'API contract `contracts/sdk-generation-input.yaml` must include `authorization_header` in `sdk_generation_input.forbidden_values`.'
        });
      }
    );
  });

  test('fails when core auth session route catalog loses safety metadata', async () => {
    await withRepositoryRoot(
      {
        ...createValidApiContractFiles(),
        'contracts/apis/catalog.yaml': `
api_catalog:
  status: empty-until-service-routes-exist
  route_definition_required_fields:
    - operation_id
  forbidden_values:
    - raw_customer_payload
routes:
  - operation_id: core.auth.sessions.create
    service_id: app-console
    request_schema_ref: contracts/apis/app-console/auth.yaml#BadRequest
    response_schema_ref: contracts/apis/app-console/auth.yaml#BadResponse
    owner_boundary: app
    session_effect: none
    credential_policy: no_provider_secret
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryApiContractsContract({
          repositoryRoot,
          repositoryServiceContract: createApiContractsServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-AUTH-ROUTE-001',
          severity: 'error',
          file: 'contracts/apis/catalog.yaml',
          path: 'api_catalog.status',
          message:
            'API catalog must stay contract-only until live core auth/session handlers exist.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-AUTH-ROUTE-001',
          severity: 'error',
          file: 'contracts/apis/catalog.yaml',
          path: 'routes',
          message:
            'Core auth/session route catalog must include `core.auth.sessions.refresh`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-AUTH-ROUTE-001',
          severity: 'error',
          file: 'contracts/apis/catalog.yaml',
          path: 'routes.core.auth.sessions.create.service_id',
          message:
            'Core auth/session route `core.auth.sessions.create` must belong to `core-api`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-AUTH-ROUTE-001',
          severity: 'error',
          file: 'contracts/apis/catalog.yaml',
          path: 'routes.core.auth.sessions.create.session_effect',
          message:
            'Core auth/session route `core.auth.sessions.create` must declare `issue` session effect.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-AUTH-ROUTE-001',
          severity: 'error',
          file: 'contracts/apis/catalog.yaml',
          path: 'routes.core.auth.sessions.create.credential_policy',
          message:
            'Core auth/session route `core.auth.sessions.create` credential policy must include `no_refresh_token_plaintext`.'
        });
      }
    );
  });

  test('fails when core auth session schema bundle allows sensitive payload values', async () => {
    await withRepositoryRoot(
      {
        ...createValidApiContractFiles(),
        'contracts/apis/core-api/auth-session.yaml': `
schema_bundle:
  service_id: core-api
  owner_boundary: app
  status: live
  common_envelope:
    required_request_metadata:
      - request_id
    required_response_metadata:
      - request_id
    forbidden_payload_values:
      - authorization_header
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryApiContractsContract({
          repositoryRoot,
          repositoryServiceContract: createApiContractsServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-AUTH-ROUTE-001',
          severity: 'error',
          file: 'contracts/apis/core-api/auth-session.yaml',
          path: 'schema_bundle.owner_boundary',
          message: 'Auth/session schema bundle must keep `identity` owner boundary.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-AUTH-ROUTE-001',
          severity: 'error',
          file: 'contracts/apis/core-api/auth-session.yaml',
          path: 'schema_bundle.common_envelope.forbidden_payload_values',
          message:
            'API auth route contract `contracts/apis/core-api/auth-session.yaml` must include `provider_secret` in `schema_bundle.common_envelope.forbidden_payload_values`.'
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
        'src/api-export-plan/plan.ts': `
export function planPlaceholder(): void {}
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
          file: 'package.json',
          path: 'scripts.export:plan',
          message: 'API contracts package must declare `export:plan` script.'
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
          file: 'src/api-contracts/validator.ts',
          path: 'source',
          message:
            'API contracts checker source must include `API_SDK_GENERATION_TARGET_MISSING`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-API-CONTRACTS-001',
          severity: 'error',
          file: 'src/api-contracts/validator.ts',
          path: 'source',
          message:
            'API contracts checker source must include `API_CATALOG_ROUTE_FIELD_MISSING`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-API-CONTRACTS-001',
          severity: 'error',
          file: 'tests/api-contracts.test.ts',
          path: 'source',
          message:
            'API contracts checker source must include `fails when webhook contracts stop requiring idempotency`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-API-CONTRACTS-001',
          severity: 'error',
          file: 'tests/api-contracts.test.ts',
          path: 'source',
          message:
            'API contracts checker source must include `fails when SDK generation input drops a language target`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-API-CONTRACTS-001',
          severity: 'error',
          file: 'src/api-export-plan/plan.ts',
          path: 'source',
          message:
            'API contracts checker source must include `buildApiExportPlan`.'
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
      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-AUTH-ROUTE-001',
        severity: 'error',
        file: 'service.yaml',
        path: 'policy_gates.required_linter_rules',
        message:
          'API contracts service contract must require `ZDP-AUTH-ROUTE-001`.'
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
        'ZDP-API-CONTRACTS-001',
        'ZDP-AUTH-ROUTE-001'
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
    - owner_boundary
    - tenant_boundary
    - request_id_required
    - trace_id_required
    - session_effect
    - credential_policy
    - error_codes
  forbidden_shapes:
    - raw_customer_payload
    - raw_provider_error
    - provider_secret
    - authorization_header
    - cookie_header
    - refresh_token_plaintext
    - stack_trace
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
    - raw_customer_payload
    - raw_provider_error
    - provider_secret
    - authorization_header
    - cookie_header
    - refresh_token_plaintext
    - stack_trace
    - screen_component_payload
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
`,
    'contracts/sdk-generation-input.yaml': `
sdk_generation_input:
  status: skeleton
  source_contracts:
    - contracts/route-contract.yaml
    - contracts/error-envelope.yaml
    - contracts/webhook-contract.yaml
    - contracts/sdk-generation-input.yaml
    - contracts/apis/catalog.yaml
    - contracts/apis/core-api/auth-session.yaml
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
    - success_statuses
    - request_schema_ref
    - response_schema_ref
    - auth_required
    - permission_check
    - audit_event
    - idempotency
    - owner_boundary
    - tenant_boundary
    - request_id_required
    - trace_id_required
    - session_effect
    - credential_policy
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
  forbidden_ownership:
    - generated_sdk_source
    - sdk_runtime_implementation
    - product_business_logic
    - refresh_token_storage
    - final_authorization_decision
    - provider_credential_storage
  forbidden_values:
    - raw_customer_payload
    - raw_provider_error
    - provider_secret
    - authorization_header
    - cookie_header
    - refresh_token_plaintext
    - stack_trace
    - screen_component_payload
`,
    'contracts/apis/catalog.yaml': `
api_catalog:
  status: route-catalog-contract-only
  route_definition_required_fields:
    - operation_id
    - service_id
    - resource
    - action
    - method
    - path
    - success_statuses
    - request_schema_ref
    - response_schema_ref
    - auth_required
    - permission_check
    - audit_event
    - idempotency
    - owner_boundary
    - tenant_boundary
    - request_id_required
    - trace_id_required
    - session_effect
    - credential_policy
    - error_codes
  forbidden_values:
    - raw_customer_payload
    - raw_provider_error
    - provider_secret
    - authorization_header
    - cookie_header
    - refresh_token_plaintext
    - stack_trace
    - screen_component_payload
routes:
${createAuthSessionRouteCatalogFixture()}
`,
    'contracts/apis/core-api/auth-session.yaml': `
schema_bundle:
  service_id: core-api
  owner_boundary: identity
  status: contract-only
  common_envelope:
    required_request_metadata:
      - request_id
      - trace_id
      - idempotency_key
    required_response_metadata:
      - request_id
      - trace_id
    forbidden_payload_values:
      - authorization_header
      - cookie_header
      - refresh_token_plaintext
      - provider_secret
      - raw_provider_error
      - raw_customer_payload
      - stack_trace
      - screen_component_payload
`
  };
}

function createAuthSessionRouteCatalogFixture(): string {
  return [
    ['core.auth.registrations.create', 'none'],
    ['core.auth.sessions.create', 'issue'],
    ['core.auth.sessions.refresh', 'refresh'],
    ['core.auth.sessions.revoke_current', 'revoke'],
    ['core.auth.recovery_requests.create', 'none'],
    ['core.auth.passkey_challenges.create', 'none'],
    ['core.auth.passkey_assertions.verify', 'issue'],
    ['core.auth.oauth_callbacks.accept', 'issue']
  ]
    .map(
      ([operationId, sessionEffect]) => `  - operation_id: ${operationId}
    service_id: core-api
    resource: auth_session
    action: create
    method: POST
    path: /v1/auth/session-fixture
    success_statuses:
      - 201
    request_schema_ref: contracts/apis/core-api/auth-session.yaml#AuthSessionFixtureRequest
    response_schema_ref: contracts/apis/core-api/auth-session.yaml#AuthSessionFixtureResponse
    auth_required: false
    permission_check: core.identity.public_auth_entrypoint
    audit_event: core.identity.fixture
    idempotency: required_idempotency_key
    owner_boundary: identity
    tenant_boundary: organization
    request_id_required: true
    trace_id_required: true
    session_effect: ${sessionEffect}
    credential_policy: no_refresh_token_plaintext_no_provider_secret_no_authorization_or_cookie_header_payload
    error_codes:
      - validation_failed`
    )
    .join('\n');
}

function createValidApiCheckerFiles(): Record<string, string> {
  return {
    'package.json': `
{
  "scripts": {
    "check": "tsc --noEmit && bun test && bun run contracts:check",
    "test": "bun test",
    "contracts:check": "bun scripts/check-api-contracts.ts",
    "export:plan": "bun scripts/plan-api-exports.ts"
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
    'scripts/plan-api-exports.ts': `
import { runApiExportPlanCli } from '../src/api-export-plan/cli';
const exitCode = await runApiExportPlanCli(process.argv.slice(2));
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
  'contracts/webhook-contract.yaml',
  'contracts/sdk-generation-input.yaml',
  'contracts/apis/catalog.yaml',
  'contracts/apis/core-api/auth-session.yaml'
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
const ALLOWED_SESSION_EFFECTS = [];
const REQUIRED_ERROR_FIELDS = [];
const FORBIDDEN_ERROR_FIELDS = [];
const REQUIRED_WEBHOOK_CONTROLS = [];
const FORBIDDEN_WEBHOOK_CONTROLS = [];
const REQUIRED_SDK_GENERATION_TARGETS = [];
const REQUIRED_SDK_ROUTE_METADATA = [];
const API_CATALOG_REQUIRED_ROUTE_FIELDS = [];
const REQUIRED_CREDENTIAL_POLICY_PARTS = [];
const REQUIRED_SDK_ERROR_METADATA = [];
const REQUIRED_SDK_WEBHOOK_METADATA = [];
const FORBIDDEN_SDK_OWNERSHIP = [];
const FORBIDDEN_SDK_VALUES = [];
const API_ROUTE_REQUIRED_FIELD_MISSING = 'API_ROUTE_REQUIRED_FIELD_MISSING';
const API_ROUTE_ALLOWED_SESSION_EFFECT_MISSING = 'API_ROUTE_ALLOWED_SESSION_EFFECT_MISSING';
const API_CATALOG_ROUTE_FIELD_MISSING = 'API_CATALOG_ROUTE_FIELD_MISSING';
const API_CATALOG_ROUTE_CREDENTIAL_POLICY_INCOMPLETE = 'API_CATALOG_ROUTE_CREDENTIAL_POLICY_INCOMPLETE';
const API_ERROR_FORBIDDEN_FIELD_MISSING = 'API_ERROR_FORBIDDEN_FIELD_MISSING';
const API_WEBHOOK_REQUIRED_CONTROL_MISSING = 'API_WEBHOOK_REQUIRED_CONTROL_MISSING';
const API_SDK_GENERATION_SOURCE_CONTRACT_MISSING = 'API_SDK_GENERATION_SOURCE_CONTRACT_MISSING';
const API_SDK_GENERATION_SCHEMA_BUNDLE_SOURCE_MISSING = 'API_SDK_GENERATION_SCHEMA_BUNDLE_SOURCE_MISSING';
const API_SDK_GENERATION_TARGET_MISSING = 'API_SDK_GENERATION_TARGET_MISSING';
const API_SDK_FORBIDDEN_OWNERSHIP_MISSING = 'API_SDK_FORBIDDEN_OWNERSHIP_MISSING';
const API_SDK_FORBIDDEN_VALUE_MISSING = 'API_SDK_FORBIDDEN_VALUE_MISSING';
export {
  REQUIRED_ROUTE_FIELDS,
  FORBIDDEN_ROUTE_SHAPES,
  ALLOWED_SESSION_EFFECTS,
  REQUIRED_ERROR_FIELDS,
  FORBIDDEN_ERROR_FIELDS,
  REQUIRED_WEBHOOK_CONTROLS,
  FORBIDDEN_WEBHOOK_CONTROLS,
  REQUIRED_SDK_GENERATION_TARGETS,
  REQUIRED_SDK_ROUTE_METADATA,
  API_CATALOG_REQUIRED_ROUTE_FIELDS,
  REQUIRED_CREDENTIAL_POLICY_PARTS,
  REQUIRED_SDK_ERROR_METADATA,
  REQUIRED_SDK_WEBHOOK_METADATA,
  FORBIDDEN_SDK_OWNERSHIP,
  FORBIDDEN_SDK_VALUES,
  API_ROUTE_REQUIRED_FIELD_MISSING,
  API_ROUTE_ALLOWED_SESSION_EFFECT_MISSING,
  API_CATALOG_ROUTE_FIELD_MISSING,
  API_CATALOG_ROUTE_CREDENTIAL_POLICY_INCOMPLETE,
  API_ERROR_FORBIDDEN_FIELD_MISSING,
  API_WEBHOOK_REQUIRED_CONTROL_MISSING,
  API_SDK_GENERATION_SOURCE_CONTRACT_MISSING,
  API_SDK_GENERATION_SCHEMA_BUNDLE_SOURCE_MISSING,
  API_SDK_GENERATION_TARGET_MISSING,
  API_SDK_FORBIDDEN_OWNERSHIP_MISSING,
  API_SDK_FORBIDDEN_VALUE_MISSING
};
`,
    'tests/api-contracts.test.ts': `
const cases = [
  'fails when route contracts stop requiring authorization hooks',
  'fails when route contracts allow screen-shaped payloads',
  'keeps core auth session routes explicit in the API catalog',
  'fails when error envelopes stop carrying trace identifiers',
  'fails when error envelopes stop forbidding provider secrets',
  'fails when webhook contracts stop requiring idempotency',
  'fails when webhook contracts allow ledger mutation bypasses',
  'fails when SDK generation input drops a language target',
  'fails when SDK generation input drops route idempotency metadata',
  'fails when SDK generation input owns generated SDK source',
  'fails when SDK generation input can carry authorization headers'
];
export { cases };
`,
    'src/api-export-plan/cli.ts': `
import { buildApiExportPlan } from './plan';
export async function runApiExportPlanCli(argv: readonly string[]): Promise<number> {
  return argv.includes('--json') || argv.includes('--root') || buildApiExportPlan({ root: '.' }) ? 0 : 1;
}
`,
    'src/api-export-plan/plan.ts': `
export function buildApiExportPlan(_input?: unknown): unknown {
  return {
    writesArtifacts: false,
    publishesSchemas: false,
    outputs: ['openapi', 'sdk_generation_input', 'webhook_schema', 'docs_contract'],
    diagnostics: [
      'API_EXPORT_PLAN_ROUTE_METADATA_DRIFT',
      'API_EXPORT_PLAN_ERROR_METADATA_DRIFT',
      'API_EXPORT_PLAN_FORBIDDEN_VALUE_MISSING'
    ]
  };
}
`,
    'tests/api-export-plan.test.ts': `
const cases = [
  'api export plan',
  'builds a dry-run plan without writing generated artifacts',
  'fails when SDK input no longer mirrors route metadata',
  'fails when SDK input drops traceable error metadata'
];
export { cases };
`
  };
}
