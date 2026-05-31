import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { Diagnostic } from './diagnostics.ts';

const CLIENT_SDKS_REPOSITORY_NAME = 'zdp-client-sdks';
const CLIENT_SDKS_CONTRACT_RULE_ID = 'ZDP-CLIENT-SDKS-001';

const SDK_SURFACE_FILE = 'contracts/sdk-surface.yaml';
const SDK_GENERATION_SOURCE_FILE = 'contracts/sdk-generation-source.yaml';
const LIBS_EXPORT_SOURCE_FILE = 'contracts/libs-export-source.yaml';
const AUTH_HELPER_FILE = 'contracts/auth-helper.yaml';
const UPLOAD_CLIENT_FILE = 'contracts/upload-client.yaml';
const PACKAGE_FILE = 'package.json';
const BUN_LOCK_FILE = 'bun.lock';
const TSCONFIG_FILE = 'tsconfig.json';
const CHECKER_SCRIPT_FILE = 'scripts/check-client-sdk-contracts.ts';
const CHECKER_CLI_FILE = 'src/client-sdk-contracts/cli.ts';
const CHECKER_PARSER_FILE = 'src/client-sdk-contracts/parser.ts';
const CHECKER_TYPES_FILE = 'src/client-sdk-contracts/types.ts';
const CHECKER_VALIDATOR_FILE = 'src/client-sdk-contracts/validator.ts';
const CHECKER_TEST_FILE = 'tests/client-sdk-contracts.test.ts';
const GENERATION_PLAN_SCRIPT_FILE = 'scripts/plan-sdk-generation.ts';
const GENERATION_PLAN_API_INPUT_FILE = 'src/sdk-generation-plan/api-input.ts';
const GENERATION_PLAN_CLI_FILE = 'src/sdk-generation-plan/cli.ts';
const GENERATION_PLAN_SOURCE_FILE = 'src/sdk-generation-plan/plan.ts';
const GENERATION_PLAN_TYPES_FILE = 'src/sdk-generation-plan/types.ts';
const GENERATION_PLAN_TEST_FILE = 'tests/sdk-generation-plan.test.ts';

const REQUIRED_CLIENT_SDK_CHECKER_FILES = [
  BUN_LOCK_FILE,
  TSCONFIG_FILE,
  CHECKER_SCRIPT_FILE,
  CHECKER_CLI_FILE,
  CHECKER_PARSER_FILE,
  CHECKER_TYPES_FILE,
  CHECKER_VALIDATOR_FILE,
  CHECKER_TEST_FILE,
  GENERATION_PLAN_SCRIPT_FILE,
  GENERATION_PLAN_API_INPUT_FILE,
  GENERATION_PLAN_CLI_FILE,
  GENERATION_PLAN_SOURCE_FILE,
  GENERATION_PLAN_TYPES_FILE,
  GENERATION_PLAN_TEST_FILE
] as const;

const REQUIRED_PACKAGE_SCRIPTS = [
  'check',
  'test',
  'contracts:check',
  'generation:plan'
] as const;

const REQUIRED_SDK_LANGUAGES = ['typescript', 'dart', 'rust'] as const;
const REQUIRED_SDK_BEHAVIORS = [
  'request_id propagation',
  'standard error envelope handling',
  'pagination handling',
  'upload handoff'
] as const;
const REQUIRED_SDK_FORBIDDEN_OWNERSHIP = [
  'API contract source',
  'refresh token storage',
  'final authorization decisions',
  'product-specific business rules'
] as const;

const REQUIRED_SDK_GENERATION_SOURCE_REPO = 'zdp-api-contracts';
const REQUIRED_SDK_GENERATION_SOURCE_CONTRACT =
  'contracts/sdk-generation-input.yaml';
const REQUIRED_SDK_GENERATION_TARGETS = ['typescript', 'dart', 'rust'] as const;
const REQUIRED_ROUTE_METADATA = [
  'operation_id',
  'resource',
  'action',
  'method',
  'path',
  'request_schema_ref',
  'response_schema_ref',
  'auth_required',
  'permission_check',
  'audit_event',
  'idempotency',
  'error_codes'
] as const;
const REQUIRED_ERROR_METADATA = [
  'code',
  'message',
  'request_id',
  'trace_id',
  'retry_after_seconds',
  'documentation_url'
] as const;
const REQUIRED_WEBHOOK_METADATA = [
  'event_id',
  'event_type',
  'schema_version',
  'signature_verification',
  'idempotency_key',
  'replay_policy',
  'dead_letter_policy'
] as const;
const REQUIRED_SDK_GENERATION_FORBIDDEN_OWNERSHIP = [
  'API contract source',
  'generated SDK source truth',
  'refresh token storage',
  'final authorization decisions',
  'provider credential storage'
] as const;
const REQUIRED_SDK_GENERATION_FORBIDDEN_VALUES = [
  'raw_customer_payload',
  'raw_provider_error',
  'provider_secret',
  'authorization_header',
  'cookie_header',
  'screen_component_payload'
] as const;

const REQUIRED_LIBS_EXPORT_SOURCE_REPO = 'zdp-libs-ts';
const REQUIRED_LIBS_EXPORT_SOURCE_PACKAGE = 'zdp-libs-ts';
const REQUIRED_LIBS_SOURCE_EXPORTS = [
  'zdp-libs-ts/schema',
  'zdp-libs-ts/env-contract',
  'zdp-libs-ts/event-contracts',
  'zdp-libs-ts/error',
  'zdp-libs-ts/i18n-contract'
] as const;
const REQUIRED_LIBS_SOURCE_TARGETS = ['typescript', 'dart', 'rust'] as const;
const REQUIRED_LIBS_SOURCE_METADATA = [
  'schema_id',
  'env_var',
  'event_type',
  'error_code',
  'message_key',
  'request_id',
  'trace_id',
  'idempotency'
] as const;
const REQUIRED_LIBS_SOURCE_FORBIDDEN_OWNERSHIP = [
  'zdp-libs-ts package source',
  'API contract source',
  'runtime validation engine',
  'product domain models',
  'final authorization decisions',
  'translation runtime'
] as const;
const REQUIRED_LIBS_SOURCE_FORBIDDEN_VALUES = [
  'authorization_header',
  'cookie_header',
  'raw_customer_payload',
  'raw_provider_error',
  'provider_secret',
  'provider_token',
  'secret_value',
  'screen_component_payload'
] as const;

const REQUIRED_AUTH_HELPER_OWNERSHIP = [
  'access token attachment boundary',
  'current user context normalization input'
] as const;
const REQUIRED_AUTH_HELPER_FORBIDDEN_OWNERSHIP = [
  'refresh token storage',
  'membership authority',
  'entitlement authority',
  'provider identity mapping source'
] as const;

const REQUIRED_UPLOAD_CLIENT_OWNERSHIP = [
  'signed upload request shape',
  'upload error mapping',
  'request_id propagation'
] as const;
const REQUIRED_UPLOAD_CLIENT_FORBIDDEN_OWNERSHIP = [
  'object storage bucket names',
  'raw provider URLs as public contract',
  'file ownership decisions'
] as const;

export async function validateRepositoryClientSdksContract(input: {
  readonly repositoryRoot: string | undefined;
  readonly repositoryServiceContract: unknown;
}): Promise<readonly Diagnostic[]> {
  if (
    input.repositoryRoot === undefined ||
    readRepositoryName(input.repositoryServiceContract) !==
      CLIENT_SDKS_REPOSITORY_NAME
  ) {
    return [];
  }

  const [
    sdkSurface,
    sdkGenerationSource,
    libsExportSource,
    authHelper,
    uploadClient,
    packageJson
  ] = await Promise.all([
    readRequiredYamlContract(input.repositoryRoot, SDK_SURFACE_FILE),
    readRequiredYamlContract(input.repositoryRoot, SDK_GENERATION_SOURCE_FILE),
    readRequiredYamlContract(input.repositoryRoot, LIBS_EXPORT_SOURCE_FILE),
    readRequiredYamlContract(input.repositoryRoot, AUTH_HELPER_FILE),
    readRequiredYamlContract(input.repositoryRoot, UPLOAD_CLIENT_FILE),
    readRequiredJsonContract(input.repositoryRoot, PACKAGE_FILE)
  ]);

  return [
    ...sdkSurface.diagnostics,
    ...sdkGenerationSource.diagnostics,
    ...libsExportSource.diagnostics,
    ...authHelper.diagnostics,
    ...uploadClient.diagnostics,
    ...packageJson.diagnostics,
    ...(sdkSurface.value === null ? [] : validateSdkSurfaceContract(sdkSurface.value)),
    ...(sdkGenerationSource.value === null
      ? []
      : validateSdkGenerationSourceContract(sdkGenerationSource.value)),
    ...(libsExportSource.value === null
      ? []
      : validateLibsExportSourceContract(libsExportSource.value)),
    ...(authHelper.value === null ? [] : validateAuthHelperContract(authHelper.value)),
    ...(uploadClient.value === null
      ? []
      : validateUploadClientContract(uploadClient.value)),
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
          createClientSdksDiagnostic(
            file,
            'repository.root',
            `Client SDKs repository must include \`${file}\`.`
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
        createClientSdksDiagnostic(
          file,
          'yaml',
          `Client SDKs contract \`${file}\` must be valid YAML: ${formatError(error)}`
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
          createClientSdksDiagnostic(
            file,
            'repository.root',
            `Client SDKs repository must include \`${file}\`.`
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
        createClientSdksDiagnostic(
          file,
          'json',
          `Client SDKs contract \`${file}\` must be valid JSON: ${formatError(error)}`
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
          createClientSdksDiagnostic(
            file,
            'repository.root',
            `Client SDKs repository must include \`${file}\`.`
          )
        ]
      };
    }

    throw error;
  }
}

function validateSdkSurfaceContract(value: unknown): readonly Diagnostic[] {
  return [
    ...validateRequiredStringArrayEntries({
      value,
      file: SDK_SURFACE_FILE,
      path: 'sdk_surface.languages',
      field: 'sdk_surface.languages',
      requiredEntries: REQUIRED_SDK_LANGUAGES
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: SDK_SURFACE_FILE,
      path: 'sdk_surface.required_behaviors',
      field: 'sdk_surface.required_behaviors',
      requiredEntries: REQUIRED_SDK_BEHAVIORS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: SDK_SURFACE_FILE,
      path: 'sdk_surface.must_not_own',
      field: 'sdk_surface.must_not_own',
      requiredEntries: REQUIRED_SDK_FORBIDDEN_OWNERSHIP
    })
  ];
}

function validateSdkGenerationSourceContract(
  value: unknown
): readonly Diagnostic[] {
  return [
    ...validateExactValue({
      value,
      file: SDK_GENERATION_SOURCE_FILE,
      path: 'sdk_generation_source.status',
      expected: 'skeleton',
      message:
        'Client SDKs generation source must stay skeleton until generated SDK packages exist.'
    }),
    ...validateExactValue({
      value,
      file: SDK_GENERATION_SOURCE_FILE,
      path: 'sdk_generation_source.source_repo',
      expected: REQUIRED_SDK_GENERATION_SOURCE_REPO,
      message:
        'Client SDKs generation source must consume `zdp-api-contracts`.'
    }),
    ...validateExactValue({
      value,
      file: SDK_GENERATION_SOURCE_FILE,
      path: 'sdk_generation_source.source_contract',
      expected: REQUIRED_SDK_GENERATION_SOURCE_CONTRACT,
      message:
        'Client SDKs generation source must consume `contracts/sdk-generation-input.yaml`.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: SDK_GENERATION_SOURCE_FILE,
      path: 'sdk_generation_source.generation_targets',
      field: 'sdk_generation_source.generation_targets',
      requiredEntries: REQUIRED_SDK_GENERATION_TARGETS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: SDK_GENERATION_SOURCE_FILE,
      path: 'sdk_generation_source.required_route_metadata',
      field: 'sdk_generation_source.required_route_metadata',
      requiredEntries: REQUIRED_ROUTE_METADATA
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: SDK_GENERATION_SOURCE_FILE,
      path: 'sdk_generation_source.required_error_metadata',
      field: 'sdk_generation_source.required_error_metadata',
      requiredEntries: REQUIRED_ERROR_METADATA
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: SDK_GENERATION_SOURCE_FILE,
      path: 'sdk_generation_source.required_webhook_metadata',
      field: 'sdk_generation_source.required_webhook_metadata',
      requiredEntries: REQUIRED_WEBHOOK_METADATA
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: SDK_GENERATION_SOURCE_FILE,
      path: 'sdk_generation_source.must_not_own',
      field: 'sdk_generation_source.must_not_own',
      requiredEntries: REQUIRED_SDK_GENERATION_FORBIDDEN_OWNERSHIP
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: SDK_GENERATION_SOURCE_FILE,
      path: 'sdk_generation_source.forbidden_values',
      field: 'sdk_generation_source.forbidden_values',
      requiredEntries: REQUIRED_SDK_GENERATION_FORBIDDEN_VALUES
    })
  ];
}

function validateLibsExportSourceContract(value: unknown): readonly Diagnostic[] {
  return [
    ...validateExactValue({
      value,
      file: LIBS_EXPORT_SOURCE_FILE,
      path: 'libs_export_source.status',
      expected: 'skeleton',
      message:
        'Client SDKs libs export source must stay skeleton until generated SDK packages exist.'
    }),
    ...validateExactValue({
      value,
      file: LIBS_EXPORT_SOURCE_FILE,
      path: 'libs_export_source.source_repo',
      expected: REQUIRED_LIBS_EXPORT_SOURCE_REPO,
      message:
        'Client SDKs libs export source must consume `zdp-libs-ts`.'
    }),
    ...validateExactValue({
      value,
      file: LIBS_EXPORT_SOURCE_FILE,
      path: 'libs_export_source.source_package',
      expected: REQUIRED_LIBS_EXPORT_SOURCE_PACKAGE,
      message:
        'Client SDKs libs export source package must be `zdp-libs-ts`.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: LIBS_EXPORT_SOURCE_FILE,
      path: 'libs_export_source.source_exports',
      field: 'libs_export_source.source_exports',
      requiredEntries: REQUIRED_LIBS_SOURCE_EXPORTS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: LIBS_EXPORT_SOURCE_FILE,
      path: 'libs_export_source.generation_targets',
      field: 'libs_export_source.generation_targets',
      requiredEntries: REQUIRED_LIBS_SOURCE_TARGETS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: LIBS_EXPORT_SOURCE_FILE,
      path: 'libs_export_source.required_metadata',
      field: 'libs_export_source.required_metadata',
      requiredEntries: REQUIRED_LIBS_SOURCE_METADATA
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: LIBS_EXPORT_SOURCE_FILE,
      path: 'libs_export_source.must_not_own',
      field: 'libs_export_source.must_not_own',
      requiredEntries: REQUIRED_LIBS_SOURCE_FORBIDDEN_OWNERSHIP
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: LIBS_EXPORT_SOURCE_FILE,
      path: 'libs_export_source.forbidden_values',
      field: 'libs_export_source.forbidden_values',
      requiredEntries: REQUIRED_LIBS_SOURCE_FORBIDDEN_VALUES
    })
  ];
}

function validateAuthHelperContract(value: unknown): readonly Diagnostic[] {
  return [
    ...validateExactValue({
      value,
      file: AUTH_HELPER_FILE,
      path: 'auth_helper.status',
      expected: 'skeleton',
      message:
        'Client SDKs auth helper must stay skeleton until generated SDK packages exist.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_HELPER_FILE,
      path: 'auth_helper.owns',
      field: 'auth_helper.owns',
      requiredEntries: REQUIRED_AUTH_HELPER_OWNERSHIP
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_HELPER_FILE,
      path: 'auth_helper.must_not_own',
      field: 'auth_helper.must_not_own',
      requiredEntries: REQUIRED_AUTH_HELPER_FORBIDDEN_OWNERSHIP
    })
  ];
}

function validateUploadClientContract(value: unknown): readonly Diagnostic[] {
  return [
    ...validateExactValue({
      value,
      file: UPLOAD_CLIENT_FILE,
      path: 'upload_client.status',
      expected: 'skeleton',
      message:
        'Client SDKs upload client must stay skeleton until generated SDK packages exist.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: UPLOAD_CLIENT_FILE,
      path: 'upload_client.owns',
      field: 'upload_client.owns',
      requiredEntries: REQUIRED_UPLOAD_CLIENT_OWNERSHIP
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: UPLOAD_CLIENT_FILE,
      path: 'upload_client.must_not_own',
      field: 'upload_client.must_not_own',
      requiredEntries: REQUIRED_UPLOAD_CLIENT_FORBIDDEN_OWNERSHIP
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
      createClientSdksDiagnostic(
        PACKAGE_FILE,
        `scripts.${script}`,
        `Client SDKs package must declare \`${script}\` script.`
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
    generationPlanScript,
    generationPlanApiInputSource,
    generationPlanCliSource,
    generationPlanSource,
    generationPlanTypesSource,
    generationPlanTestSource
  ] = await Promise.all(
    REQUIRED_CLIENT_SDK_CHECKER_FILES.map((file) =>
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
    ...generationPlanScript.diagnostics,
    ...generationPlanApiInputSource.diagnostics,
    ...generationPlanCliSource.diagnostics,
    ...generationPlanSource.diagnostics,
    ...generationPlanTypesSource.diagnostics,
    ...generationPlanTestSource.diagnostics,
    ...(script.source === null
      ? []
      : validateSourceIncludes({
          file: CHECKER_SCRIPT_FILE,
          source: script.source,
          requiredFragments: ['runClientSdkContractCheckCli']
        })),
    ...(parserSource.source === null
      ? []
      : validateSourceIncludes({
          file: CHECKER_PARSER_FILE,
          source: parserSource.source,
          requiredFragments: [
            'sdk-surface.yaml',
            'sdk-generation-source.yaml',
            'libs-export-source.yaml',
            'auth-helper.yaml',
            'upload-client.yaml',
            "join(root, 'contracts', fileName)"
          ]
        })),
    ...(validatorSource.source === null
      ? []
      : validateSourceIncludes({
          file: CHECKER_VALIDATOR_FILE,
          source: validatorSource.source,
          requiredFragments: [
            'REQUIRED_SDK_LANGUAGES',
            'REQUIRED_SDK_BEHAVIORS',
            'REQUIRED_SDK_FORBIDDEN_OWNERSHIP',
            'REQUIRED_SDK_GENERATION_SOURCE_REPO',
            'REQUIRED_SDK_GENERATION_SOURCE_CONTRACT',
            'REQUIRED_ROUTE_METADATA',
            'REQUIRED_ERROR_METADATA',
            'REQUIRED_WEBHOOK_METADATA',
            'REQUIRED_SDK_GENERATION_FORBIDDEN_VALUES',
            'REQUIRED_LIBS_EXPORT_SOURCE_REPO',
            'REQUIRED_LIBS_SOURCE_EXPORTS',
            'REQUIRED_LIBS_SOURCE_METADATA',
            'REQUIRED_LIBS_SOURCE_FORBIDDEN_VALUES',
            'REQUIRED_AUTH_HELPER_FORBIDDEN_OWNERSHIP',
            'REQUIRED_UPLOAD_CLIENT_FORBIDDEN_OWNERSHIP',
            'CLIENT_SDK_LANGUAGE_MISSING',
            'CLIENT_SDK_BEHAVIOR_MISSING',
            'CLIENT_SDK_FORBIDDEN_OWNERSHIP_MISSING',
            'CLIENT_SDK_GENERATION_SOURCE_REPO_DRIFT',
            'CLIENT_SDK_ROUTE_METADATA_MISSING',
            'CLIENT_SDK_ERROR_METADATA_MISSING',
            'CLIENT_SDK_GENERATION_FORBIDDEN_VALUE_MISSING',
            'CLIENT_SDK_LIBS_EXPORT_SOURCE_REPO_DRIFT',
            'CLIENT_SDK_LIBS_EXPORT_MISSING',
            'CLIENT_SDK_LIBS_METADATA_MISSING',
            'CLIENT_SDK_LIBS_FORBIDDEN_VALUE_MISSING',
            'CLIENT_SDK_AUTH_HELPER_FORBIDDEN_OWNERSHIP_MISSING',
            'CLIENT_SDK_UPLOAD_CLIENT_FORBIDDEN_OWNERSHIP_MISSING'
          ]
        })),
    ...(testSource.source === null
      ? []
      : validateSourceIncludes({
          file: CHECKER_TEST_FILE,
          source: testSource.source,
          requiredFragments: [
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
          ]
        })),
    ...(generationPlanScript.source === null
      ? []
      : validateSourceIncludes({
          file: GENERATION_PLAN_SCRIPT_FILE,
          source: generationPlanScript.source,
          requiredFragments: ['runSdkGenerationPlanCli']
        })),
    ...(generationPlanCliSource.source === null
      ? []
      : validateSourceIncludes({
          file: GENERATION_PLAN_CLI_FILE,
          source: generationPlanCliSource.source,
          requiredFragments: [
            'buildSdkGenerationPlan',
            'loadApiSdkGenerationInput',
            'loadClientSdkContracts',
            '--api-contracts-root',
            '--check',
            '--json'
          ]
        })),
    ...(generationPlanApiInputSource.source === null
      ? []
      : validateSourceIncludes({
          file: GENERATION_PLAN_API_INPUT_FILE,
          source: generationPlanApiInputSource.source,
          requiredFragments: [
            'loadApiSdkGenerationInput',
            'sdk-generation-input.yaml',
            'source_contracts',
            'generation_targets',
            'required_route_metadata',
            'required_error_metadata',
            'required_webhook_metadata',
            'forbidden_values'
          ]
        })),
    ...(generationPlanSource.source === null
      ? []
      : validateSourceIncludes({
          file: GENERATION_PLAN_SOURCE_FILE,
          source: generationPlanSource.source,
          requiredFragments: [
            'buildSdkGenerationPlan',
            'validateClientSdkContracts',
            '@zdp/client-sdk',
            'zdp_client_sdk',
            'zdp-client-sdk',
            'validateApiGenerationInput',
            'apiInputSourceContracts',
            'CLIENT_SDK_API_INPUT_TARGET_DRIFT',
            'CLIENT_SDK_API_INPUT_ROUTE_METADATA_DRIFT',
            'CLIENT_SDK_API_INPUT_ERROR_METADATA_DRIFT',
            'CLIENT_SDK_API_INPUT_WEBHOOK_METADATA_DRIFT',
            'CLIENT_SDK_GENERATION_PLAN_LIBS_TARGET_MISSING',
            'CLIENT_SDK_GENERATION_PLAN_TARGET_UNSUPPORTED'
          ]
        })),
    ...(generationPlanTypesSource.source === null
      ? []
      : validateSourceIncludes({
          file: GENERATION_PLAN_TYPES_FILE,
          source: generationPlanTypesSource.source,
          requiredFragments: [
            'SdkGenerationPlan',
            'writesArtifacts: false',
            'publishesPackages: false'
          ]
        })),
    ...(generationPlanTestSource.source === null
      ? []
      : validateSourceIncludes({
          file: GENERATION_PLAN_TEST_FILE,
          source: generationPlanTestSource.source,
          requiredFragments: [
            'builds a deterministic SDK generation plan',
            'fails when contract validation fails before planning',
            'fails when libs source does not cover an SDK generation target',
            'fails when API SDK generation input drifts from client SDK source',
            'zdp-libs-ts/schema',
            'request_id',
            'trace_id'
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

  if (requiredRules.includes(CLIENT_SDKS_CONTRACT_RULE_ID)) {
    return [];
  }

  return [
    createClientSdksDiagnostic(
      'service.yaml',
      'policy_gates.required_linter_rules',
      `Client SDKs service contract must require \`${CLIENT_SDKS_CONTRACT_RULE_ID}\`.`
    )
  ];
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
      createClientSdksDiagnostic(
        input.file,
        'source',
        `Client SDKs checker source must include \`${fragment}\`.`
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
      createClientSdksDiagnostic(
        input.file,
        input.path,
        `Client SDKs contract \`${input.file}\` must include \`${requiredEntry}\` in \`${input.field}\`.`
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
  if (readPath(input.value, input.path) === input.expected) {
    return [];
  }

  return [
    createClientSdksDiagnostic(input.file, input.path, input.message)
  ];
}

function readRepositoryName(value: unknown): string | null {
  const repo = readPath(value, 'service.repo');

  return typeof repo === 'string' ? repo : null;
}

function readStringArrayPath(value: unknown, path: string): readonly string[] {
  const candidate = readPath(value, path);

  if (!Array.isArray(candidate)) {
    return [];
  }

  return candidate.filter((item): item is string => typeof item === 'string');
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

function createClientSdksDiagnostic(
  file: string,
  path: string,
  message: string
): Diagnostic {
  return {
    ruleId: CLIENT_SDKS_CONTRACT_RULE_ID,
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
