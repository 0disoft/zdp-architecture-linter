import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { Diagnostic } from './diagnostics.ts';

const API_CONTRACTS_REPOSITORY_NAME = 'zdp-api-contracts';
const API_CONTRACTS_RULE_ID = 'ZDP-API-CONTRACTS-001';
const AUTH_ROUTE_RULE_ID = 'ZDP-AUTH-ROUTE-001';

const ROUTE_CONTRACT_FILE = 'contracts/route-contract.yaml';
const ERROR_ENVELOPE_FILE = 'contracts/error-envelope.yaml';
const WEBHOOK_CONTRACT_FILE = 'contracts/webhook-contract.yaml';
const SDK_GENERATION_INPUT_FILE = 'contracts/sdk-generation-input.yaml';
const API_CATALOG_FILE = 'contracts/apis/catalog.yaml';
const CORE_AUTH_SESSION_SCHEMA_FILE =
  'contracts/apis/core-api/auth-session.yaml';
const PACKAGE_FILE = 'package.json';
const BUN_LOCK_FILE = 'bun.lock';
const TSCONFIG_FILE = 'tsconfig.json';
const CHECKER_SCRIPT_FILE = 'scripts/check-api-contracts.ts';
const CHECKER_CLI_FILE = 'src/api-contracts/cli.ts';
const CHECKER_PARSER_FILE = 'src/api-contracts/parser.ts';
const CHECKER_TYPES_FILE = 'src/api-contracts/types.ts';
const CHECKER_VALIDATOR_FILE = 'src/api-contracts/validator.ts';
const CHECKER_TEST_FILE = 'tests/api-contracts.test.ts';
const EXPORT_PLAN_SCRIPT_FILE = 'scripts/plan-api-exports.ts';
const EXPORT_PLAN_CLI_FILE = 'src/api-export-plan/cli.ts';
const EXPORT_PLAN_SOURCE_FILE = 'src/api-export-plan/plan.ts';
const EXPORT_PLAN_TEST_FILE = 'tests/api-export-plan.test.ts';

const REQUIRED_API_CHECKER_FILES = [
  BUN_LOCK_FILE,
  TSCONFIG_FILE,
  CHECKER_SCRIPT_FILE,
  CHECKER_CLI_FILE,
  CHECKER_PARSER_FILE,
  CHECKER_TYPES_FILE,
  CHECKER_VALIDATOR_FILE,
  CHECKER_TEST_FILE,
  EXPORT_PLAN_SCRIPT_FILE,
  EXPORT_PLAN_CLI_FILE,
  EXPORT_PLAN_SOURCE_FILE,
  EXPORT_PLAN_TEST_FILE
] as const;

const REQUIRED_PACKAGE_SCRIPTS = [
  'check',
  'test',
  'contracts:check',
  'export:plan'
] as const;

const REQUIRED_ROUTE_FIELDS = [
  'resource',
  'action',
  'method',
  'path',
  'auth_required',
  'permission_check',
  'audit_event',
  'idempotency',
  'owner_boundary',
  'tenant_boundary',
  'request_id_required',
  'trace_id_required',
  'session_effect',
  'credential_policy',
  'error_codes'
] as const;

const REQUIRED_FORBIDDEN_ROUTE_SHAPES = [
  'screen_component_payload',
  'provider_specific_id_as_primary_id',
  'raw_storage_url',
  'authorization_header_payload',
  'cookie_header_payload',
  'refresh_token_plaintext'
] as const;

const REQUIRED_ERROR_FIELDS = [
  'code',
  'message',
  'request_id',
  'trace_id'
] as const;

const REQUIRED_FORBIDDEN_ERROR_FIELDS = [
  'stack_trace',
  'provider_secret',
  'raw_provider_error',
  'customer_private_payload'
] as const;

const REQUIRED_WEBHOOK_CONTROLS = [
  'event_id',
  'event_type',
  'schema_version',
  'signature_verification',
  'idempotency_key',
  'replay_policy',
  'dead_letter_policy'
] as const;

const REQUIRED_FORBIDDEN_WEBHOOK_CONTROLS = [
  'unversioned_payload',
  'provider_secret_in_schema',
  'ledger_mutation_without_money_contract'
] as const;

const REQUIRED_SDK_SOURCE_CONTRACTS = [
  ROUTE_CONTRACT_FILE,
  ERROR_ENVELOPE_FILE,
  WEBHOOK_CONTRACT_FILE
] as const;

const REQUIRED_SDK_GENERATION_TARGETS = [
  'typescript',
  'dart',
  'rust'
] as const;

const REQUIRED_SDK_ROUTE_METADATA = [
  'operation_id',
  'resource',
  'action',
  'method',
  'path',
  'success_statuses',
  'request_schema_ref',
  'response_schema_ref',
  'auth_required',
  'permission_check',
  'audit_event',
  'idempotency',
  'owner_boundary',
  'tenant_boundary',
  'request_id_required',
  'trace_id_required',
  'session_effect',
  'credential_policy',
  'error_codes'
] as const;

const REQUIRED_SDK_ERROR_METADATA = [
  'code',
  'message',
  'request_id',
  'trace_id',
  'retry_after_seconds',
  'documentation_url'
] as const;

const REQUIRED_SDK_WEBHOOK_METADATA = [
  'event_id',
  'event_type',
  'schema_version',
  'signature_verification',
  'idempotency_key',
  'replay_policy',
  'dead_letter_policy'
] as const;

const REQUIRED_FORBIDDEN_SDK_OWNERSHIP = [
  'generated_sdk_source',
  'sdk_runtime_implementation',
  'product_business_logic',
  'refresh_token_storage',
  'final_authorization_decision',
  'provider_credential_storage'
] as const;

const REQUIRED_FORBIDDEN_SDK_VALUES = [
  'raw_customer_payload',
  'raw_provider_error',
  'provider_secret',
  'authorization_header',
  'cookie_header',
  'screen_component_payload'
] as const;

const REQUIRED_API_CATALOG_ROUTE_FIELDS = [
  'operation_id',
  'service_id',
  'resource',
  'action',
  'method',
  'path',
  'success_statuses',
  'request_schema_ref',
  'response_schema_ref',
  'auth_required',
  'permission_check',
  'audit_event',
  'idempotency',
  'owner_boundary',
  'tenant_boundary',
  'request_id_required',
  'trace_id_required',
  'session_effect',
  'credential_policy',
  'error_codes'
] as const;

const REQUIRED_API_CATALOG_FORBIDDEN_VALUES = [
  'raw_customer_payload',
  'raw_provider_error',
  'provider_secret',
  'authorization_header',
  'cookie_header',
  'screen_component_payload'
] as const;

const REQUIRED_AUTH_CREDENTIAL_POLICY_FRAGMENTS = [
  'no_refresh_token_plaintext',
  'no_provider_secret',
  'no_authorization_or_cookie_header_payload'
] as const;

const REQUIRED_AUTH_SCHEMA_FORBIDDEN_PAYLOAD_VALUES = [
  'authorization_header',
  'cookie_header',
  'refresh_token_plaintext',
  'provider_secret',
  'raw_provider_error',
  'customer_private_payload'
] as const;

const REQUIRED_AUTH_SESSION_ROUTES = [
  {
    operationId: 'core.auth.registrations.create',
    sessionEffect: 'none'
  },
  {
    operationId: 'core.auth.sessions.create',
    sessionEffect: 'issue'
  },
  {
    operationId: 'core.auth.sessions.refresh',
    sessionEffect: 'refresh'
  },
  {
    operationId: 'core.auth.sessions.revoke_current',
    sessionEffect: 'revoke'
  },
  {
    operationId: 'core.auth.recovery_requests.create',
    sessionEffect: 'none'
  },
  {
    operationId: 'core.auth.passkey_challenges.create',
    sessionEffect: 'none'
  },
  {
    operationId: 'core.auth.passkey_assertions.verify',
    sessionEffect: 'issue'
  },
  {
    operationId: 'core.auth.oauth_callbacks.accept',
    sessionEffect: 'issue'
  }
] as const;

export async function validateRepositoryApiContractsContract(input: {
  readonly repositoryRoot: string | undefined;
  readonly repositoryServiceContract: unknown;
}): Promise<readonly Diagnostic[]> {
  if (
    input.repositoryRoot === undefined ||
    readRepositoryName(input.repositoryServiceContract) !==
      API_CONTRACTS_REPOSITORY_NAME
  ) {
    return [];
  }

  const [
    routeContract,
    errorEnvelope,
    webhookContract,
    sdkGenerationInput,
    apiCatalog,
    coreAuthSessionSchema,
    packageJson
  ] =
    await Promise.all([
      readRequiredYamlContract(input.repositoryRoot, ROUTE_CONTRACT_FILE),
      readRequiredYamlContract(input.repositoryRoot, ERROR_ENVELOPE_FILE),
      readRequiredYamlContract(input.repositoryRoot, WEBHOOK_CONTRACT_FILE),
      readRequiredYamlContract(input.repositoryRoot, SDK_GENERATION_INPUT_FILE),
      readRequiredYamlContract(input.repositoryRoot, API_CATALOG_FILE),
      readRequiredYamlContract(input.repositoryRoot, CORE_AUTH_SESSION_SCHEMA_FILE),
      readRequiredJsonContract(input.repositoryRoot, PACKAGE_FILE)
    ]);

  return [
    ...routeContract.diagnostics,
    ...errorEnvelope.diagnostics,
    ...webhookContract.diagnostics,
    ...sdkGenerationInput.diagnostics,
    ...apiCatalog.diagnostics,
    ...coreAuthSessionSchema.diagnostics,
    ...packageJson.diagnostics,
    ...(routeContract.value === null
      ? []
      : validateRouteContract(routeContract.value)),
    ...(errorEnvelope.value === null
      ? []
      : validateErrorEnvelopeContract(errorEnvelope.value)),
    ...(webhookContract.value === null
      ? []
      : validateWebhookContract(webhookContract.value)),
    ...(sdkGenerationInput.value === null
      ? []
      : validateSdkGenerationInputContract(sdkGenerationInput.value)),
    ...(apiCatalog.value === null
      ? []
      : validateAuthSessionRouteCatalog(apiCatalog.value)),
    ...(coreAuthSessionSchema.value === null
      ? []
      : validateAuthSessionSchemaBundle(coreAuthSessionSchema.value)),
    ...(packageJson.value === null ? [] : validatePackageScripts(packageJson.value)),
    ...(await validateCheckerSurface(input.repositoryRoot)),
    ...validateRequiredLinterRule(input.repositoryServiceContract)
  ];
}

async function readRequiredYamlContract(
  repositoryRoot: string,
  file: string
): Promise<{
  readonly value: unknown | null;
  readonly diagnostics: readonly Diagnostic[];
}> {
  let source: string;

  try {
    source = await readFile(join(repositoryRoot, file), 'utf8');
  } catch (error) {
    if (isMissingPathError(error)) {
      return {
        value: null,
        diagnostics: [
          createApiContractsDiagnostic(
            file,
            'repository.root',
            `API contracts repository must include \`${file}\`.`
          )
        ]
      };
    }

    throw error;
  }

  try {
    return {
      value: parse(source) as unknown,
      diagnostics: []
    };
  } catch (error) {
    return {
      value: null,
      diagnostics: [
        createApiContractsDiagnostic(
          file,
          'yaml',
          `API contract \`${file}\` must be valid YAML: ${formatError(error)}`
        )
      ]
    };
  }
}

async function readRequiredJsonContract(
  repositoryRoot: string,
  file: string
): Promise<{
  readonly value: unknown | null;
  readonly diagnostics: readonly Diagnostic[];
}> {
  let source: string;

  try {
    source = await readFile(join(repositoryRoot, file), 'utf8');
  } catch (error) {
    if (isMissingPathError(error)) {
      return {
        value: null,
        diagnostics: [
          createApiContractsDiagnostic(
            file,
            'repository.root',
            `API contracts repository must include \`${file}\`.`
          )
        ]
      };
    }

    throw error;
  }

  try {
    return {
      value: JSON.parse(source) as unknown,
      diagnostics: []
    };
  } catch (error) {
    return {
      value: null,
      diagnostics: [
        createApiContractsDiagnostic(
          file,
          'json',
          `API contract \`${file}\` must be valid JSON: ${formatError(error)}`
        )
      ]
    };
  }
}

async function readOptionalTextFile(
  repositoryRoot: string,
  file: string
): Promise<{
  readonly source: string | null;
  readonly diagnostics: readonly Diagnostic[];
}> {
  try {
    return {
      source: await readFile(join(repositoryRoot, file), 'utf8'),
      diagnostics: []
    };
  } catch (error) {
    if (isMissingPathError(error)) {
      return {
        source: null,
        diagnostics: [
          createApiContractsDiagnostic(
            file,
            'repository.root',
            `API contracts repository must include \`${file}\`.`
          )
        ]
      };
    }

    throw error;
  }
}

function validateRouteContract(value: unknown): readonly Diagnostic[] {
  return [
    ...validateExactValue({
      value,
      file: ROUTE_CONTRACT_FILE,
      path: 'route_contract.status',
      expected: 'skeleton',
      message:
        'API route contract must stay in skeleton status until real routes exist.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: ROUTE_CONTRACT_FILE,
      path: 'route_contract.required_per_route',
      field: 'route_contract.required_per_route',
      requiredEntries: REQUIRED_ROUTE_FIELDS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: ROUTE_CONTRACT_FILE,
      path: 'route_contract.forbidden_shapes',
      field: 'route_contract.forbidden_shapes',
      requiredEntries: REQUIRED_FORBIDDEN_ROUTE_SHAPES
    })
  ];
}

function validateErrorEnvelopeContract(value: unknown): readonly Diagnostic[] {
  return [
    ...validateExactValue({
      value,
      file: ERROR_ENVELOPE_FILE,
      path: 'error_envelope.schema_version',
      expected: 1,
      message:
        'API error envelope schema_version must remain 1 until a migration exists.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: ERROR_ENVELOPE_FILE,
      path: 'error_envelope.required_fields',
      field: 'error_envelope.required_fields',
      requiredEntries: REQUIRED_ERROR_FIELDS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: ERROR_ENVELOPE_FILE,
      path: 'error_envelope.forbidden_fields',
      field: 'error_envelope.forbidden_fields',
      requiredEntries: REQUIRED_FORBIDDEN_ERROR_FIELDS
    })
  ];
}

function validateWebhookContract(value: unknown): readonly Diagnostic[] {
  return [
    ...validateExactValue({
      value,
      file: WEBHOOK_CONTRACT_FILE,
      path: 'webhook_contract.status',
      expected: 'skeleton',
      message:
        'API webhook contract must stay in skeleton status until real webhooks exist.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: WEBHOOK_CONTRACT_FILE,
      path: 'webhook_contract.required_controls',
      field: 'webhook_contract.required_controls',
      requiredEntries: REQUIRED_WEBHOOK_CONTROLS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: WEBHOOK_CONTRACT_FILE,
      path: 'webhook_contract.forbidden_controls',
      field: 'webhook_contract.forbidden_controls',
      requiredEntries: REQUIRED_FORBIDDEN_WEBHOOK_CONTROLS
    })
  ];
}

function validateSdkGenerationInputContract(value: unknown): readonly Diagnostic[] {
  return [
    ...validateExactValue({
      value,
      file: SDK_GENERATION_INPUT_FILE,
      path: 'sdk_generation_input.status',
      expected: 'skeleton',
      message:
        'API SDK generation input must stay in skeleton status until real generators exist.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: SDK_GENERATION_INPUT_FILE,
      path: 'sdk_generation_input.source_contracts',
      field: 'sdk_generation_input.source_contracts',
      requiredEntries: REQUIRED_SDK_SOURCE_CONTRACTS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: SDK_GENERATION_INPUT_FILE,
      path: 'sdk_generation_input.generation_targets',
      field: 'sdk_generation_input.generation_targets',
      requiredEntries: REQUIRED_SDK_GENERATION_TARGETS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: SDK_GENERATION_INPUT_FILE,
      path: 'sdk_generation_input.required_route_metadata',
      field: 'sdk_generation_input.required_route_metadata',
      requiredEntries: REQUIRED_SDK_ROUTE_METADATA
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: SDK_GENERATION_INPUT_FILE,
      path: 'sdk_generation_input.required_error_metadata',
      field: 'sdk_generation_input.required_error_metadata',
      requiredEntries: REQUIRED_SDK_ERROR_METADATA
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: SDK_GENERATION_INPUT_FILE,
      path: 'sdk_generation_input.required_webhook_metadata',
      field: 'sdk_generation_input.required_webhook_metadata',
      requiredEntries: REQUIRED_SDK_WEBHOOK_METADATA
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: SDK_GENERATION_INPUT_FILE,
      path: 'sdk_generation_input.forbidden_ownership',
      field: 'sdk_generation_input.forbidden_ownership',
      requiredEntries: REQUIRED_FORBIDDEN_SDK_OWNERSHIP
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: SDK_GENERATION_INPUT_FILE,
      path: 'sdk_generation_input.forbidden_values',
      field: 'sdk_generation_input.forbidden_values',
      requiredEntries: REQUIRED_FORBIDDEN_SDK_VALUES
    })
  ];
}

function validateAuthSessionRouteCatalog(value: unknown): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [
    ...validateAuthExactValue({
      value,
      file: API_CATALOG_FILE,
      path: 'api_catalog.status',
      expected: 'route-catalog-active',
      message:
        'API catalog must stay active once core auth/session routes are declared.'
    }),
    ...validateAuthRequiredStringArrayEntries({
      value,
      file: API_CATALOG_FILE,
      path: 'api_catalog.route_definition_required_fields',
      field: 'api_catalog.route_definition_required_fields',
      requiredEntries: REQUIRED_API_CATALOG_ROUTE_FIELDS
    }),
    ...validateAuthRequiredStringArrayEntries({
      value,
      file: API_CATALOG_FILE,
      path: 'api_catalog.forbidden_values',
      field: 'api_catalog.forbidden_values',
      requiredEntries: REQUIRED_API_CATALOG_FORBIDDEN_VALUES
    })
  ];
  const routes = readRecordArrayPath(value, 'routes');
  const routesByOperationId = new Map<string, Record<string, unknown>>();

  for (const route of routes) {
    const operationId = readStringField(route, 'operation_id');

    if (operationId !== null) {
      routesByOperationId.set(operationId, route);
    }
  }

  for (const requiredRoute of REQUIRED_AUTH_SESSION_ROUTES) {
    const route = routesByOperationId.get(requiredRoute.operationId);

    if (route === undefined) {
      diagnostics.push(
        createAuthRouteDiagnostic(
          API_CATALOG_FILE,
          'routes',
          `Core auth/session route catalog must include \`${requiredRoute.operationId}\`.`
        )
      );
      continue;
    }

    diagnostics.push(
      ...validateAuthRouteMetadata({
        route,
        operationId: requiredRoute.operationId,
        sessionEffect: requiredRoute.sessionEffect
      })
    );
  }

  return diagnostics;
}

function validateAuthRouteMetadata(input: {
  readonly route: Record<string, unknown>;
  readonly operationId: string;
  readonly sessionEffect: string;
}): readonly Diagnostic[] {
  const path = `routes.${input.operationId}`;
  const diagnostics: Diagnostic[] = [];

  if (readStringField(input.route, 'service_id') !== 'core-api') {
    diagnostics.push(
      createAuthRouteDiagnostic(
        API_CATALOG_FILE,
        `${path}.service_id`,
        `Core auth/session route \`${input.operationId}\` must belong to \`core-api\`.`
      )
    );
  }

  if (readStringField(input.route, 'owner_boundary') !== 'identity') {
    diagnostics.push(
      createAuthRouteDiagnostic(
        API_CATALOG_FILE,
        `${path}.owner_boundary`,
        `Core auth/session route \`${input.operationId}\` must declare \`identity\` owner boundary.`
      )
    );
  }

  if (readStringField(input.route, 'tenant_boundary') === null) {
    diagnostics.push(
      createAuthRouteDiagnostic(
        API_CATALOG_FILE,
        `${path}.tenant_boundary`,
        `Core auth/session route \`${input.operationId}\` must declare tenant boundary.`
      )
    );
  }

  for (const field of ['request_id_required', 'trace_id_required'] as const) {
    if (input.route[field] === true) {
      continue;
    }

    diagnostics.push(
      createAuthRouteDiagnostic(
        API_CATALOG_FILE,
        `${path}.${field}`,
        `Core auth/session route \`${input.operationId}\` must require \`${field}\`.`
      )
    );
  }

  if (readStringField(input.route, 'session_effect') !== input.sessionEffect) {
    diagnostics.push(
      createAuthRouteDiagnostic(
        API_CATALOG_FILE,
        `${path}.session_effect`,
        `Core auth/session route \`${input.operationId}\` must declare \`${input.sessionEffect}\` session effect.`
      )
    );
  }

  const credentialPolicy = readStringField(input.route, 'credential_policy');
  for (const fragment of REQUIRED_AUTH_CREDENTIAL_POLICY_FRAGMENTS) {
    if (credentialPolicy?.includes(fragment) === true) {
      continue;
    }

    diagnostics.push(
      createAuthRouteDiagnostic(
        API_CATALOG_FILE,
        `${path}.credential_policy`,
        `Core auth/session route \`${input.operationId}\` credential policy must include \`${fragment}\`.`
      )
    );
  }

  for (const field of ['request_schema_ref', 'response_schema_ref'] as const) {
    const value = readStringField(input.route, field);

    if (value?.startsWith(`${CORE_AUTH_SESSION_SCHEMA_FILE}#`) === true) {
      continue;
    }

    diagnostics.push(
      createAuthRouteDiagnostic(
        API_CATALOG_FILE,
        `${path}.${field}`,
        `Core auth/session route \`${input.operationId}\` must reference \`${CORE_AUTH_SESSION_SCHEMA_FILE}\`.`
      )
    );
  }

  return diagnostics;
}

function validateAuthSessionSchemaBundle(value: unknown): readonly Diagnostic[] {
  return [
    ...validateAuthExactValue({
      value,
      file: CORE_AUTH_SESSION_SCHEMA_FILE,
      path: 'schema_bundle.service_id',
      expected: 'core-api',
      message: 'Auth/session schema bundle must belong to `core-api`.'
    }),
    ...validateAuthExactValue({
      value,
      file: CORE_AUTH_SESSION_SCHEMA_FILE,
      path: 'schema_bundle.owner_boundary',
      expected: 'identity',
      message: 'Auth/session schema bundle must keep `identity` owner boundary.'
    }),
    ...validateAuthExactValue({
      value,
      file: CORE_AUTH_SESSION_SCHEMA_FILE,
      path: 'schema_bundle.status',
      expected: 'contract-only',
      message:
        'Auth/session schema bundle must stay contract-only until live handlers exist.'
    }),
    ...validateAuthRequiredStringArrayEntries({
      value,
      file: CORE_AUTH_SESSION_SCHEMA_FILE,
      path: 'schema_bundle.common_envelope.required_request_metadata',
      field: 'schema_bundle.common_envelope.required_request_metadata',
      requiredEntries: ['request_id', 'trace_id', 'idempotency_key']
    }),
    ...validateAuthRequiredStringArrayEntries({
      value,
      file: CORE_AUTH_SESSION_SCHEMA_FILE,
      path: 'schema_bundle.common_envelope.required_response_metadata',
      field: 'schema_bundle.common_envelope.required_response_metadata',
      requiredEntries: ['request_id', 'trace_id']
    }),
    ...validateAuthRequiredStringArrayEntries({
      value,
      file: CORE_AUTH_SESSION_SCHEMA_FILE,
      path: 'schema_bundle.common_envelope.forbidden_payload_values',
      field: 'schema_bundle.common_envelope.forbidden_payload_values',
      requiredEntries: REQUIRED_AUTH_SCHEMA_FORBIDDEN_PAYLOAD_VALUES
    })
  ];
}

function validatePackageScripts(value: unknown): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const script of REQUIRED_PACKAGE_SCRIPTS) {
    const actual = readPath(value, `scripts.${script}`);

    if (typeof actual === 'string' && actual.trim().length > 0) {
      continue;
    }

    diagnostics.push(
      createApiContractsDiagnostic(
        PACKAGE_FILE,
        `scripts.${script}`,
        `API contracts package must declare \`${script}\` script.`
      )
    );
  }

  return diagnostics;
}

async function validateCheckerSurface(
  repositoryRoot: string
): Promise<readonly Diagnostic[]> {
  const [
    bunLock,
    tsconfig,
    script,
    cliSource,
    parserSource,
    typesSource,
    validatorSource,
    testSource,
    exportPlanScript,
    exportPlanCliSource,
    exportPlanSource,
    exportPlanTestSource
  ] = await Promise.all(
    REQUIRED_API_CHECKER_FILES.map((file) =>
      readOptionalTextFile(repositoryRoot, file)
    )
  );

  return [
    ...bunLock.diagnostics,
    ...tsconfig.diagnostics,
    ...script.diagnostics,
    ...cliSource.diagnostics,
    ...parserSource.diagnostics,
    ...typesSource.diagnostics,
    ...validatorSource.diagnostics,
    ...testSource.diagnostics,
    ...exportPlanScript.diagnostics,
    ...exportPlanCliSource.diagnostics,
    ...exportPlanSource.diagnostics,
    ...exportPlanTestSource.diagnostics,
    ...(script.source === null
      ? []
      : validateSourceIncludes({
          file: CHECKER_SCRIPT_FILE,
          source: script.source,
          requiredFragments: ['runApiContractCheckCli']
        })),
    ...(parserSource.source === null
      ? []
      : validateSourceIncludes({
          file: CHECKER_PARSER_FILE,
          source: parserSource.source,
          requiredFragments: [
            ROUTE_CONTRACT_FILE,
            ERROR_ENVELOPE_FILE,
            WEBHOOK_CONTRACT_FILE,
            SDK_GENERATION_INPUT_FILE,
            API_CATALOG_FILE
          ]
        })),
    ...(validatorSource.source === null
      ? []
      : validateSourceIncludes({
          file: CHECKER_VALIDATOR_FILE,
          source: validatorSource.source,
          requiredFragments: [
            'REQUIRED_ROUTE_FIELDS',
            'FORBIDDEN_ROUTE_SHAPES',
            'ALLOWED_SESSION_EFFECTS',
            'REQUIRED_ERROR_FIELDS',
            'FORBIDDEN_ERROR_FIELDS',
            'REQUIRED_WEBHOOK_CONTROLS',
            'FORBIDDEN_WEBHOOK_CONTROLS',
            'REQUIRED_SDK_GENERATION_TARGETS',
            'REQUIRED_SDK_ROUTE_METADATA',
            'API_CATALOG_REQUIRED_ROUTE_FIELDS',
            'REQUIRED_CREDENTIAL_POLICY_PARTS',
            'REQUIRED_SDK_ERROR_METADATA',
            'REQUIRED_SDK_WEBHOOK_METADATA',
            'FORBIDDEN_SDK_OWNERSHIP',
            'FORBIDDEN_SDK_VALUES',
            'API_ROUTE_REQUIRED_FIELD_MISSING',
            'API_ROUTE_ALLOWED_SESSION_EFFECT_MISSING',
            'API_CATALOG_ROUTE_FIELD_MISSING',
            'API_CATALOG_ROUTE_CREDENTIAL_POLICY_INCOMPLETE',
            'API_ERROR_FORBIDDEN_FIELD_MISSING',
            'API_WEBHOOK_REQUIRED_CONTROL_MISSING',
            'API_SDK_GENERATION_TARGET_MISSING',
            'API_SDK_FORBIDDEN_OWNERSHIP_MISSING',
            'API_SDK_FORBIDDEN_VALUE_MISSING'
          ]
        })),
    ...(testSource.source === null
      ? []
      : validateSourceIncludes({
          file: CHECKER_TEST_FILE,
          source: testSource.source,
          requiredFragments: [
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
          ]
        })),
    ...(exportPlanScript.source === null
      ? []
      : validateSourceIncludes({
          file: EXPORT_PLAN_SCRIPT_FILE,
          source: exportPlanScript.source,
          requiredFragments: ['runApiExportPlanCli']
        })),
    ...(exportPlanCliSource.source === null
      ? []
      : validateSourceIncludes({
          file: EXPORT_PLAN_CLI_FILE,
          source: exportPlanCliSource.source,
          requiredFragments: [
            'runApiExportPlanCli',
            '--json',
            '--root',
            'buildApiExportPlan'
          ]
        })),
    ...(exportPlanSource.source === null
      ? []
      : validateSourceIncludes({
          file: EXPORT_PLAN_SOURCE_FILE,
          source: exportPlanSource.source,
          requiredFragments: [
            'buildApiExportPlan',
            'writesArtifacts',
            'publishesSchemas',
            'openapi',
            'sdk_generation_input',
            'webhook_schema',
            'docs_contract',
            'API_EXPORT_PLAN_ROUTE_METADATA_DRIFT',
            'API_EXPORT_PLAN_ERROR_METADATA_DRIFT',
            'API_EXPORT_PLAN_FORBIDDEN_VALUE_MISSING'
          ]
        })),
    ...(exportPlanTestSource.source === null
      ? []
      : validateSourceIncludes({
          file: EXPORT_PLAN_TEST_FILE,
          source: exportPlanTestSource.source,
          requiredFragments: [
            'api export plan',
            'builds a dry-run plan without writing generated artifacts',
            'fails when SDK input no longer mirrors route metadata',
            'fails when SDK input drops traceable error metadata'
          ]
        }))
  ];
}

function validateRequiredLinterRule(
  repositoryServiceContract: unknown
): readonly Diagnostic[] {
  const requiredRules = readStringArrayPath(
    repositoryServiceContract,
    'policy_gates.required_linter_rules'
  );
  const diagnostics: Diagnostic[] = [];

  if (!requiredRules.includes(API_CONTRACTS_RULE_ID)) {
    diagnostics.push(
      createApiContractsDiagnostic(
        'service.yaml',
        'policy_gates.required_linter_rules',
        `API contracts service contract must require \`${API_CONTRACTS_RULE_ID}\`.`
      )
    );
  }

  if (!requiredRules.includes(AUTH_ROUTE_RULE_ID)) {
    diagnostics.push(
      createAuthRouteDiagnostic(
        'service.yaml',
        'policy_gates.required_linter_rules',
        `API contracts service contract must require \`${AUTH_ROUTE_RULE_ID}\`.`
      )
    );
  }

  return diagnostics;
}

function validateSourceIncludes(input: {
  readonly file: string;
  readonly source: string;
  readonly requiredFragments: readonly string[];
}): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const fragment of input.requiredFragments) {
    if (input.source.includes(fragment)) {
      continue;
    }

    diagnostics.push(
      createApiContractsDiagnostic(
        input.file,
        'source',
        `API contracts checker source must include \`${fragment}\`.`
      )
    );
  }

  return diagnostics;
}

function validateRequiredStringArrayEntries(input: {
  readonly value: unknown;
  readonly file: string;
  readonly path: string;
  readonly field: string;
  readonly requiredEntries: readonly string[];
}): readonly Diagnostic[] {
  const entries = readStringArrayPath(input.value, input.field);
  const diagnostics: Diagnostic[] = [];

  for (const requiredEntry of input.requiredEntries) {
    if (entries.includes(requiredEntry)) {
      continue;
    }

    diagnostics.push(
      createApiContractsDiagnostic(
        input.file,
        input.path,
        `API contract \`${input.file}\` must include \`${requiredEntry}\` in \`${input.field}\`.`
      )
    );
  }

  return diagnostics;
}

function validateAuthRequiredStringArrayEntries(input: {
  readonly value: unknown;
  readonly file: string;
  readonly path: string;
  readonly field: string;
  readonly requiredEntries: readonly string[];
}): readonly Diagnostic[] {
  const entries = readStringArrayPath(input.value, input.field);
  const diagnostics: Diagnostic[] = [];

  for (const requiredEntry of input.requiredEntries) {
    if (entries.includes(requiredEntry)) {
      continue;
    }

    diagnostics.push(
      createAuthRouteDiagnostic(
        input.file,
        input.path,
        `API auth route contract \`${input.file}\` must include \`${requiredEntry}\` in \`${input.field}\`.`
      )
    );
  }

  return diagnostics;
}

function validateExactValue(input: {
  readonly value: unknown;
  readonly file: string;
  readonly path: string;
  readonly expected: unknown;
  readonly message: string;
}): readonly Diagnostic[] {
  const actual = readPath(input.value, input.path);

  if (actual === input.expected) {
    return [];
  }

  return [
    createApiContractsDiagnostic(input.file, input.path, input.message)
  ];
}

function validateAuthExactValue(input: {
  readonly value: unknown;
  readonly file: string;
  readonly path: string;
  readonly expected: unknown;
  readonly message: string;
}): readonly Diagnostic[] {
  const actual = readPath(input.value, input.path);

  if (actual === input.expected) {
    return [];
  }

  return [createAuthRouteDiagnostic(input.file, input.path, input.message)];
}

function readRepositoryName(value: unknown): string | null {
  if (!isRecord(value) || !isRecord(value.service)) {
    return null;
  }

  return readStringField(value.service, 'repo');
}

function readStringArrayPath(value: unknown, path: string): readonly string[] {
  const candidate = readPath(value, path);

  if (!Array.isArray(candidate)) {
    return [];
  }

  return candidate.flatMap((entry) =>
    typeof entry === 'string' && entry.trim().length > 0 ? [entry.trim()] : []
  );
}

function readRecordArrayPath(
  value: unknown,
  path: string
): readonly Record<string, unknown>[] {
  const candidate = readPath(value, path);

  if (!Array.isArray(candidate)) {
    return [];
  }

  return candidate.filter(isRecord);
}

function readPath(value: unknown, path: string): unknown {
  let current = value;

  for (const segment of path.split('.')) {
    if (!isRecord(current)) {
      return undefined;
    }

    current = current[segment];
  }

  return current;
}

function readStringField(
  value: Record<string, unknown>,
  field: string
): string | null {
  const candidate = value[field];

  return typeof candidate === 'string' && candidate.trim().length > 0
    ? candidate.trim()
    : null;
}

function createApiContractsDiagnostic(
  file: string,
  path: string,
  message: string
): Diagnostic {
  return {
    ruleId: API_CONTRACTS_RULE_ID,
    severity: 'error',
    file,
    path,
    message
  };
}

function createAuthRouteDiagnostic(
  file: string,
  path: string,
  message: string
): Diagnostic {
  return {
    ruleId: AUTH_ROUTE_RULE_ID,
    severity: 'error',
    file,
    path,
    message
  };
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isMissingPathError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
