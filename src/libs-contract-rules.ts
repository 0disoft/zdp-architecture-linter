import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { Diagnostic } from './diagnostics.ts';

const LIBS_REPOSITORY_NAME = 'zdp-libs-ts';
const LIBS_CONTRACT_RULE_ID = 'ZDP-LIBS-001';

const PACKAGE_BOUNDARIES_FILE = 'contracts/package-boundaries.yaml';
const API_CONTRACT_SOURCE_FILE = 'contracts/api-contract-source.yaml';
const SCHEMA_CONTRACT_FILE = 'contracts/schema-contract.yaml';
const ENV_CONTRACT_FILE = 'contracts/env-contract.yaml';
const EVENT_CONTRACT_FILE = 'contracts/event-contract.yaml';
const ERROR_CONTRACT_FILE = 'contracts/error-contract.yaml';
const I18N_CONTRACT_FILE = 'contracts/i18n-contract.yaml';
const PACKAGE_FILE = 'package.json';
const BUN_LOCK_FILE = 'bun.lock';
const TSCONFIG_FILE = 'tsconfig.json';
const CHECKER_SCRIPT_FILE = 'scripts/check-libs-contracts.ts';
const CHECKER_API_SOURCE_FILE = 'src/libs-contracts/api-source.ts';
const CHECKER_CLI_FILE = 'src/libs-contracts/cli.ts';
const CHECKER_PARSER_FILE = 'src/libs-contracts/parser.ts';
const CHECKER_TYPES_FILE = 'src/libs-contracts/types.ts';
const CHECKER_VALIDATOR_FILE = 'src/libs-contracts/validator.ts';
const CHECKER_VALIDATOR_BASE_FILE = 'src/libs-contracts/validator-base.ts';
const CHECKER_TEST_FILE = 'tests/libs-contracts.test.ts';
const PUBLIC_ROOT_EXPORT_FILE = 'src/index.ts';
const PUBLIC_SCHEMA_EXPORT_FILE = 'src/schema/index.ts';
const PUBLIC_ENV_EXPORT_FILE = 'src/env-contract/index.ts';
const PUBLIC_EVENT_EXPORT_FILE = 'src/event-contracts/index.ts';
const PUBLIC_ERROR_EXPORT_FILE = 'src/error/index.ts';
const PUBLIC_I18N_EXPORT_FILE = 'src/i18n-contract/index.ts';
const PUBLIC_EXPORT_TEST_FILE = 'tests/public-exports.test.ts';

const REQUIRED_LIBS_CHECKER_FILES = [
  BUN_LOCK_FILE,
  TSCONFIG_FILE,
  CHECKER_SCRIPT_FILE,
  CHECKER_API_SOURCE_FILE,
  CHECKER_CLI_FILE,
  CHECKER_PARSER_FILE,
  CHECKER_TYPES_FILE,
  CHECKER_VALIDATOR_FILE,
  CHECKER_TEST_FILE,
  PUBLIC_ROOT_EXPORT_FILE,
  PUBLIC_SCHEMA_EXPORT_FILE,
  PUBLIC_ENV_EXPORT_FILE,
  PUBLIC_EVENT_EXPORT_FILE,
  PUBLIC_ERROR_EXPORT_FILE,
  PUBLIC_I18N_EXPORT_FILE,
  PUBLIC_EXPORT_TEST_FILE
] as const;

const REQUIRED_PACKAGE_SCRIPTS = [
  'check',
  'check:integration',
  'test',
  'test:integration',
  'contracts:check',
  'contracts:check:integration'
] as const;

const REQUIRED_PACKAGE_EXPORTS = {
  '.': { import: './dist/index.js', types: './dist/index.d.ts' },
  './schema': { import: './dist/schema/index.js', types: './dist/schema/index.d.ts' },
  './env-contract': {
    import: './dist/env-contract/index.js',
    types: './dist/env-contract/index.d.ts'
  },
  './event-contracts': {
    import: './dist/event-contracts/index.js',
    types: './dist/event-contracts/index.d.ts'
  },
  './error': { import: './dist/error/index.js', types: './dist/error/index.d.ts' },
  './i18n-contract': {
    import: './dist/i18n-contract/index.js',
    types: './dist/i18n-contract/index.d.ts'
  }
} as const;

const REQUIRED_PACKAGES = [
  '@zdp/schema',
  '@zdp/env-contract',
  '@zdp/event-contracts',
  '@zdp/error',
  '@zdp/i18n-contract'
] as const;

const REQUIRED_PACKAGE_FORBIDDEN_BOUNDARIES = [
  'product domain models',
  'secret values',
  'queue provider implementation',
  'provider raw errors',
  'translation runtime'
] as const;

const REQUIRED_API_CONTRACT_SOURCE_REPO = 'zdp-api-contracts';

const REQUIRED_API_SOURCE_CONTRACTS = [
  'contracts/route-contract.yaml',
  'contracts/error-envelope.yaml',
  'contracts/webhook-contract.yaml',
  'contracts/sdk-generation-input.yaml'
] as const;

const REQUIRED_API_SOURCE_PACKAGES = [
  '@zdp/schema',
  '@zdp/event-contracts',
  '@zdp/error'
] as const;

const REQUIRED_API_SOURCE_HANDOFF_METADATA = [
  'schema_id',
  'operation_id',
  'error_code',
  'event_type',
  'request_id',
  'trace_id',
  'idempotency',
  'sdk_generation_targets'
] as const;

const REQUIRED_API_SOURCE_FORBIDDEN_OWNERSHIP = [
  'API contract source',
  'generated SDK source truth',
  'product domain models',
  'runtime validator competitor',
  'final authorization decisions'
] as const;

const REQUIRED_API_SOURCE_FORBIDDEN_VALUES = [
  'raw_customer_payload',
  'raw_provider_error',
  'provider_secret',
  'authorization_header',
  'cookie_header',
  'screen_component_payload'
] as const;

const REQUIRED_SCHEMA_METADATA = [
  'schema_id',
  'version',
  'owner',
  'json_schema_ref',
  'openapi_ref',
  'sdk_generation_targets'
] as const;

const REQUIRED_SCHEMA_TARGETS = [
  'json_schema',
  'openapi',
  'typescript',
  'rust',
  'dart'
] as const;

const REQUIRED_SCHEMA_FORBIDDEN_OWNERSHIP = [
  'product_domain_model',
  'runtime_validator_competitor',
  'provider_payload_raw',
  'database_row_shape'
] as const;

const REQUIRED_ENV_METADATA = [
  'name',
  'owner',
  'environment',
  'secret',
  'required',
  'description'
] as const;

const REQUIRED_ENV_FORBIDDEN_VALUES = [
  'actual secret values',
  'account ids',
  'server ips',
  'provider tokens'
] as const;

const REQUIRED_EVENT_METADATA = [
  'event_id',
  'schema_ref',
  'source',
  'privacy_class',
  'replay_safe'
] as const;

const REQUIRED_EVENT_TRACE_FIELDS = ['request_id', 'trace_id'] as const;

const REQUIRED_EVENT_FORBIDDEN_VALUES = [
  'raw_customer_payload',
  'provider_secret',
  'authorization_header',
  'cookie',
  'payment_payload',
  'ai_prompt_body'
] as const;

const REQUIRED_ERROR_FIELDS = [
  'code',
  'category',
  'retryable',
  'public_message_key',
  'request_id',
  'trace_id'
] as const;

const REQUIRED_ERROR_FORBIDDEN_FIELDS = [
  'stack_trace',
  'raw_provider_error',
  'secret_value',
  'customer_payload'
] as const;

const REQUIRED_I18N_METADATA = [
  'key',
  'default_locale',
  'arguments',
  'owner',
  'fallback_policy'
] as const;

const REQUIRED_I18N_FORBIDDEN_OWNERSHIP = [
  'translation_runtime',
  'provider_i18n_sdk',
  'product_copy_final_approval'
] as const;

export async function validateRepositoryLibsContract(input: {
  readonly repositoryRoot: string | undefined;
  readonly repositoryServiceContract: unknown;
}): Promise<readonly Diagnostic[]> {
  if (
    input.repositoryRoot === undefined ||
    readRepositoryName(input.repositoryServiceContract) !== LIBS_REPOSITORY_NAME
  ) {
    return [];
  }

  const [
    packageBoundaries,
    apiContractSource,
    schemaContract,
    envContract,
    eventContract,
    errorContract,
    i18nContract,
    packageJson
  ] = await Promise.all([
    readRequiredYamlContract(input.repositoryRoot, PACKAGE_BOUNDARIES_FILE),
    readRequiredYamlContract(input.repositoryRoot, API_CONTRACT_SOURCE_FILE),
    readRequiredYamlContract(input.repositoryRoot, SCHEMA_CONTRACT_FILE),
    readRequiredYamlContract(input.repositoryRoot, ENV_CONTRACT_FILE),
    readRequiredYamlContract(input.repositoryRoot, EVENT_CONTRACT_FILE),
    readRequiredYamlContract(input.repositoryRoot, ERROR_CONTRACT_FILE),
    readRequiredYamlContract(input.repositoryRoot, I18N_CONTRACT_FILE),
    readRequiredJsonContract(input.repositoryRoot, PACKAGE_FILE)
  ]);

  return [
    ...packageBoundaries.diagnostics,
    ...apiContractSource.diagnostics,
    ...schemaContract.diagnostics,
    ...envContract.diagnostics,
    ...eventContract.diagnostics,
    ...errorContract.diagnostics,
    ...i18nContract.diagnostics,
    ...packageJson.diagnostics,
    ...(packageBoundaries.value === null
      ? []
      : validatePackageBoundariesContract(packageBoundaries.value)),
    ...(apiContractSource.value === null
      ? []
      : validateApiContractSourceContract(apiContractSource.value)),
    ...(schemaContract.value === null
      ? []
      : validateSchemaContract(schemaContract.value)),
    ...(envContract.value === null ? [] : validateEnvContract(envContract.value)),
    ...(eventContract.value === null
      ? []
      : validateEventContract(eventContract.value)),
    ...(errorContract.value === null
      ? []
      : validateErrorContract(errorContract.value)),
    ...(i18nContract.value === null
      ? []
      : validateI18nContract(i18nContract.value)),
    ...(packageJson.value === null ? [] : validatePackageScripts(packageJson.value)),
    ...(packageJson.value === null ? [] : validatePackageExports(packageJson.value)),
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
          createLibsDiagnostic(
            file,
            'repository.root',
            `Libs repository must include \`${file}\`.`
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
        createLibsDiagnostic(
          file,
          'yaml',
          `Libs contract \`${file}\` must be valid YAML: ${formatError(error)}`
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
          createLibsDiagnostic(
            file,
            'repository.root',
            `Libs repository must include \`${file}\`.`
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
        createLibsDiagnostic(
          file,
          'json',
          `Libs contract \`${file}\` must be valid JSON: ${formatError(error)}`
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
          createLibsDiagnostic(
            file,
            'repository.root',
            `Libs repository must include \`${file}\`.`
          )
        ]
      };
    }

    throw error;
  }
}

function validatePackageBoundariesContract(value: unknown): readonly Diagnostic[] {
  return [
    ...validateRequiredIdEntries({
      value,
      file: PACKAGE_BOUNDARIES_FILE,
      path: 'packages',
      field: 'packages',
      requiredEntries: REQUIRED_PACKAGES
    }),
    ...validateRequiredNestedStringArrayEntries({
      value,
      file: PACKAGE_BOUNDARIES_FILE,
      path: 'packages[].must_not_own',
      field: 'packages',
      nestedField: 'must_not_own',
      requiredEntries: REQUIRED_PACKAGE_FORBIDDEN_BOUNDARIES
    })
  ];
}

function validateApiContractSourceContract(value: unknown): readonly Diagnostic[] {
  return [
    ...validateExactValue({
      value,
      file: API_CONTRACT_SOURCE_FILE,
      path: 'api_contract_source.status',
      expected: 'skeleton',
      message:
        'Libs API contract source handoff must stay skeleton until real package exports exist.'
    }),
    ...validateExactValue({
      value,
      file: API_CONTRACT_SOURCE_FILE,
      path: 'api_contract_source.source_repo',
      expected: REQUIRED_API_CONTRACT_SOURCE_REPO,
      message:
        'Libs API contract source handoff must consume `zdp-api-contracts`.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: API_CONTRACT_SOURCE_FILE,
      path: 'api_contract_source.source_contracts',
      field: 'api_contract_source.source_contracts',
      requiredEntries: REQUIRED_API_SOURCE_CONTRACTS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: API_CONTRACT_SOURCE_FILE,
      path: 'api_contract_source.consumed_by_packages',
      field: 'api_contract_source.consumed_by_packages',
      requiredEntries: REQUIRED_API_SOURCE_PACKAGES
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: API_CONTRACT_SOURCE_FILE,
      path: 'api_contract_source.required_handoff_metadata',
      field: 'api_contract_source.required_handoff_metadata',
      requiredEntries: REQUIRED_API_SOURCE_HANDOFF_METADATA
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: API_CONTRACT_SOURCE_FILE,
      path: 'api_contract_source.must_not_own',
      field: 'api_contract_source.must_not_own',
      requiredEntries: REQUIRED_API_SOURCE_FORBIDDEN_OWNERSHIP
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: API_CONTRACT_SOURCE_FILE,
      path: 'api_contract_source.forbidden_values',
      field: 'api_contract_source.forbidden_values',
      requiredEntries: REQUIRED_API_SOURCE_FORBIDDEN_VALUES
    })
  ];
}

function validateSchemaContract(value: unknown): readonly Diagnostic[] {
  return [
    ...validateExactValue({
      value,
      file: SCHEMA_CONTRACT_FILE,
      path: 'schema_contract.status',
      expected: 'skeleton',
      message:
        'Libs schema contract must stay skeleton until real package exports exist.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: SCHEMA_CONTRACT_FILE,
      path: 'schema_contract.required_metadata',
      field: 'schema_contract.required_metadata',
      requiredEntries: REQUIRED_SCHEMA_METADATA
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: SCHEMA_CONTRACT_FILE,
      path: 'schema_contract.generation_targets',
      field: 'schema_contract.generation_targets',
      requiredEntries: REQUIRED_SCHEMA_TARGETS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: SCHEMA_CONTRACT_FILE,
      path: 'schema_contract.forbidden_ownership',
      field: 'schema_contract.forbidden_ownership',
      requiredEntries: REQUIRED_SCHEMA_FORBIDDEN_OWNERSHIP
    })
  ];
}

function validateEnvContract(value: unknown): readonly Diagnostic[] {
  return [
    ...validateRequiredStringArrayEntries({
      value,
      file: ENV_CONTRACT_FILE,
      path: 'env_contract.required_metadata',
      field: 'env_contract.required_metadata',
      requiredEntries: REQUIRED_ENV_METADATA
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: ENV_CONTRACT_FILE,
      path: 'env_contract.forbidden_values',
      field: 'env_contract.forbidden_values',
      requiredEntries: REQUIRED_ENV_FORBIDDEN_VALUES
    })
  ];
}

function validateEventContract(value: unknown): readonly Diagnostic[] {
  return [
    ...validateExactValue({
      value,
      file: EVENT_CONTRACT_FILE,
      path: 'event_contract.status',
      expected: 'skeleton',
      message:
        'Libs event contract must stay skeleton until event package exports exist.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: EVENT_CONTRACT_FILE,
      path: 'event_contract.required_metadata',
      field: 'event_contract.required_metadata',
      requiredEntries: REQUIRED_EVENT_METADATA
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: EVENT_CONTRACT_FILE,
      path: 'event_contract.required_trace_fields',
      field: 'event_contract.required_trace_fields',
      requiredEntries: REQUIRED_EVENT_TRACE_FIELDS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: EVENT_CONTRACT_FILE,
      path: 'event_contract.forbidden_values',
      field: 'event_contract.forbidden_values',
      requiredEntries: REQUIRED_EVENT_FORBIDDEN_VALUES
    })
  ];
}

function validateErrorContract(value: unknown): readonly Diagnostic[] {
  return [
    ...validateRequiredStringArrayEntries({
      value,
      file: ERROR_CONTRACT_FILE,
      path: 'error_contract.required_fields',
      field: 'error_contract.required_fields',
      requiredEntries: REQUIRED_ERROR_FIELDS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: ERROR_CONTRACT_FILE,
      path: 'error_contract.forbidden_fields',
      field: 'error_contract.forbidden_fields',
      requiredEntries: REQUIRED_ERROR_FORBIDDEN_FIELDS
    })
  ];
}

function validateI18nContract(value: unknown): readonly Diagnostic[] {
  return [
    ...validateExactValue({
      value,
      file: I18N_CONTRACT_FILE,
      path: 'i18n_contract.status',
      expected: 'skeleton',
      message:
        'Libs i18n contract must stay skeleton until message package exports exist.'
    }),
    ...validateExactValue({
      value,
      file: I18N_CONTRACT_FILE,
      path: 'i18n_contract.message_key_pattern',
      expected: 'domain.message_name',
      message:
        'Libs i18n contract must keep message keys on the domain.message_name pattern.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: I18N_CONTRACT_FILE,
      path: 'i18n_contract.required_metadata',
      field: 'i18n_contract.required_metadata',
      requiredEntries: REQUIRED_I18N_METADATA
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: I18N_CONTRACT_FILE,
      path: 'i18n_contract.forbidden_ownership',
      field: 'i18n_contract.forbidden_ownership',
      requiredEntries: REQUIRED_I18N_FORBIDDEN_OWNERSHIP
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
      createLibsDiagnostic(
        PACKAGE_FILE,
        `scripts.${script}`,
        `Libs package must declare \`${script}\` script.`
      )
    );
  }

  const contractsCheck = readPath(value, 'scripts.contracts:check');
  if (
    typeof contractsCheck === 'string' &&
    contractsCheck.includes('--api-contracts-root')
  ) {
    diagnostics.push(
      createLibsDiagnostic(
        PACKAGE_FILE,
        'scripts.contracts:check',
        'Libs package `contracts:check` must remain standalone without requiring a sibling API contracts checkout.'
      )
    );
  }

  const requiredIntegrationFragments = [
    {
      script: 'check:integration',
      fragments: ['bun run contracts:check:integration', 'bun run test:integration']
    },
    {
      script: 'test:integration',
      fragments: [
        'scripts/test-api-contract-integration.ts',
        '--api-contracts-root ../zdp-api-contracts'
      ]
    },
    {
      script: 'contracts:check:integration',
      fragments: [
        'scripts/check-libs-contracts.ts',
        '--api-contracts-root ../zdp-api-contracts'
      ]
    }
  ] as const;

  for (const requirement of requiredIntegrationFragments) {
    const actual = readPath(value, `scripts.${requirement.script}`);
    if (
      typeof actual !== 'string' ||
      requirement.fragments.every((fragment) => actual.includes(fragment))
    ) {
      continue;
    }

    diagnostics.push(
      createLibsDiagnostic(
        PACKAGE_FILE,
        `scripts.${requirement.script}`,
        `Libs package \`${requirement.script}\` must include ${requirement.fragments
          .map((fragment) => `\`${fragment}\``)
          .join(' and ')}.`
      )
    );
  }

  return diagnostics;
}

function validatePackageExports(value: unknown): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const [exportPath, expectedTargets] of Object.entries(REQUIRED_PACKAGE_EXPORTS)) {
    for (const condition of ['import', 'types'] as const) {
      const actual = readPackageExportCondition(value, exportPath, condition);
      const expectedTarget = expectedTargets[condition];

      if (actual === expectedTarget) {
        continue;
      }

      diagnostics.push(
        createLibsDiagnostic(
          PACKAGE_FILE,
          `exports["${exportPath}"].${condition}`,
          `Libs package must export \`${exportPath}\` ${condition} from \`${expectedTarget}\`.`
        )
      );
    }
  }

  const typesTarget = readPath(value, 'types');
  if (typesTarget !== './dist/index.d.ts') {
    diagnostics.push(
      createLibsDiagnostic(
        PACKAGE_FILE,
        'types',
        'Libs package must point `types` at `./dist/index.d.ts`.'
      )
    );
  }

  return diagnostics;
}

async function validateCheckerSurface(
  repositoryRoot: string
): Promise<readonly Diagnostic[]> {
  const validatorBaseSource = await readOptionalTextFile(
    repositoryRoot,
    CHECKER_VALIDATOR_BASE_FILE
  );
  const [
    bunLock,
    tsconfig,
    script,
    apiSourceSource,
    cliSource,
    parserSource,
    typesSource,
    validatorSource,
    testSource,
    publicRootSource,
    publicSchemaSource,
    publicEnvSource,
    publicEventSource,
    publicErrorSource,
    publicI18nSource,
    publicExportTestSource
  ] = await Promise.all(
    REQUIRED_LIBS_CHECKER_FILES.map((file) =>
      readOptionalTextFile(repositoryRoot, file)
    )
  );

  const validatorContractSource =
    validatorBaseSource.source ?? validatorSource.source;
  const validatorContractFile =
    validatorBaseSource.source === null
      ? CHECKER_VALIDATOR_FILE
      : CHECKER_VALIDATOR_BASE_FILE;

  return [
    ...bunLock.diagnostics,
    ...tsconfig.diagnostics,
    ...script.diagnostics,
    ...apiSourceSource.diagnostics,
    ...cliSource.diagnostics,
    ...parserSource.diagnostics,
    ...typesSource.diagnostics,
    ...validatorSource.diagnostics,
    ...testSource.diagnostics,
    ...publicRootSource.diagnostics,
    ...publicSchemaSource.diagnostics,
    ...publicEnvSource.diagnostics,
    ...publicEventSource.diagnostics,
    ...publicErrorSource.diagnostics,
    ...publicI18nSource.diagnostics,
    ...publicExportTestSource.diagnostics,
    ...(script.source === null
      ? []
      : validateSourceIncludes({
          file: CHECKER_SCRIPT_FILE,
          source: script.source,
          requiredFragments: ['runLibsContractCheckCli']
        })),
    ...(apiSourceSource.source === null
      ? []
      : validateSourceIncludes({
          file: CHECKER_API_SOURCE_FILE,
          source: apiSourceSource.source,
          requiredFragments: [
            'loadApiContractsInput',
            'contracts/route-contract.yaml',
            'contracts/error-envelope.yaml',
            'contracts/webhook-contract.yaml',
            'contracts/sdk-generation-input.yaml',
            'required_per_route',
            'required_fields',
            'required_controls',
            'generation_targets',
            'forbidden_values'
          ]
        })),
    ...(cliSource.source === null
      ? []
      : validateSourceIncludes({
          file: CHECKER_CLI_FILE,
          source: cliSource.source,
          requiredFragments: [
            'loadApiContractsInput',
            '--api-contracts-root',
            'zdp-api-contracts'
          ]
        })),
    ...(parserSource.source === null
      ? []
      : validateSourceIncludes({
          file: CHECKER_PARSER_FILE,
          source: parserSource.source,
          requiredFragments: [
            PACKAGE_BOUNDARIES_FILE,
            API_CONTRACT_SOURCE_FILE,
            SCHEMA_CONTRACT_FILE,
            ENV_CONTRACT_FILE,
            EVENT_CONTRACT_FILE,
            ERROR_CONTRACT_FILE,
            I18N_CONTRACT_FILE
          ]
        })),
    ...(validatorContractSource === null
      ? []
      : validateSourceIncludes({
          file: validatorContractFile,
          source: validatorContractSource,
          requiredFragments: [
            'REQUIRED_PACKAGE_NAMES',
            'REQUIRED_API_SOURCE_CONTRACTS',
            'REQUIRED_API_SOURCE_HANDOFF_METADATA',
            'validateApiContractInputHandoff',
            'LIBS_API_INPUT_SDK_ERROR_METADATA_MISSING',
            'LIBS_API_INPUT_FORBIDDEN_VALUE_MISSING',
            'REQUIRED_SCHEMA_METADATA',
            'REQUIRED_ENV_METADATA',
            'REQUIRED_EVENT_TRACE_FIELDS',
            'REQUIRED_ERROR_FIELDS',
            'REQUIRED_I18N_METADATA',
            'LIBS_PACKAGE_MISSING',
            'LIBS_API_SOURCE_REPO_INVALID',
            'LIBS_API_SOURCE_CONTRACT_MISSING',
            'LIBS_API_SOURCE_METADATA_MISSING',
            'LIBS_API_SOURCE_FORBIDDEN_VALUE_MISSING',
            'LIBS_ENV_FORBIDDEN_VALUE_MISSING',
            'LIBS_EVENT_TRACE_FIELD_MISSING',
            'LIBS_ERROR_FORBIDDEN_FIELD_MISSING',
            'LIBS_I18N_FORBIDDEN_OWNERSHIP_MISSING'
          ]
        })),
    ...(validatorBaseSource.source === null || validatorSource.source === null
      ? []
      : validateSourceIncludes({
          file: CHECKER_VALIDATOR_FILE,
          source: validatorSource.source,
          requiredFragments: [
            'validateBaseLibsContracts',
            'validateGeneratedCalculatorCatalog',
            'CALCULATORS',
            'CALCULATOR_IDS'
          ]
        })),
    ...(testSource.source === null
      ? []
      : validateSourceIncludes({
          file: CHECKER_TEST_FILE,
          source: testSource.source,
          requiredFragments: [
            'fails when a required package boundary disappears',
            'fails when API contract source handoff drifts',
            'fails when API source input no longer carries handoff metadata',
            'fails when schema contracts stop targeting Rust generation',
            'fails when env contracts allow provider tokens as values',
            'fails when event contracts drop trace fields',
            'fails when error contracts allow raw provider errors',
            'fails when i18n contracts become a translation runtime'
          ]
        })),
    ...(publicRootSource.source === null
      ? []
      : validateSourceIncludes({
          file: PUBLIC_ROOT_EXPORT_FILE,
          source: publicRootSource.source,
          requiredFragments: [
            "from './schema/index.js'",
            "from './env-contract/index.js'",
            "from './event-contracts/index.js'",
            "from './error/index.js'",
            "from './i18n-contract/index.js'"
          ]
        })),
    ...(publicSchemaSource.source === null
      ? []
      : validateSourceIncludes({
          file: PUBLIC_SCHEMA_EXPORT_FILE,
          source: publicSchemaSource.source,
          requiredFragments: [
            'SCHEMA_GENERATION_TARGETS',
            'SchemaMetadata',
            'defineSchemaMetadata'
          ]
        })),
    ...(publicEnvSource.source === null
      ? []
      : validateSourceIncludes({
          file: PUBLIC_ENV_EXPORT_FILE,
          source: publicEnvSource.source,
          requiredFragments: [
            'EnvContractMetadata',
            'defineEnvContractMetadata'
          ]
        })),
    ...(publicEventSource.source === null
      ? []
      : validateSourceIncludes({
          file: PUBLIC_EVENT_EXPORT_FILE,
          source: publicEventSource.source,
          requiredFragments: [
            'EventTraceContext',
            'EventContractMetadata',
            'defineEventContractMetadata'
          ]
        })),
    ...(publicErrorSource.source === null
      ? []
      : validateSourceIncludes({
          file: PUBLIC_ERROR_EXPORT_FILE,
          source: publicErrorSource.source,
          requiredFragments: [
            'ZdpErrorCategory',
            'ZdpErrorContract',
            'defineZdpErrorContract'
          ]
        })),
    ...(publicI18nSource.source === null
      ? []
      : validateSourceIncludes({
          file: PUBLIC_I18N_EXPORT_FILE,
          source: publicI18nSource.source,
          requiredFragments: [
            'I18nMessageArgument',
            'I18nMessageContract',
            'defineI18nMessageContract'
          ]
        })),
    ...(publicExportTestSource.source === null
      ? []
      : validateSourceIncludes({
          file: PUBLIC_EXPORT_TEST_FILE,
          source: publicExportTestSource.source,
          requiredFragments: [
            'public contract package exports',
            'defineSchemaMetadataFromSubpath',
            'defineZdpErrorContract'
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

  if (requiredRules.includes(LIBS_CONTRACT_RULE_ID)) {
    return [];
  }

  return [
    createLibsDiagnostic(
      'service.yaml',
      'policy_gates.required_linter_rules',
      `Libs service contract must require \`${LIBS_CONTRACT_RULE_ID}\`.`
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
      createLibsDiagnostic(
        input.file,
        'source',
        `Libs checker source must include \`${fragment}\`.`
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
      createLibsDiagnostic(
        input.file,
        input.path,
        `Libs contract \`${input.file}\` must include \`${requiredEntry}\` in \`${input.field}\`.`
      )
    );
  }

  return diagnostics;
}

function validateRequiredNestedStringArrayEntries(input: {
  readonly value: unknown;
  readonly file: string;
  readonly path: string;
  readonly field: string;
  readonly nestedField: string;
  readonly requiredEntries: readonly string[];
}): readonly Diagnostic[] {
  const entries = readNestedStringArrayPath(
    input.value,
    input.field,
    input.nestedField
  );
  const diagnostics: Diagnostic[] = [];

  for (const requiredEntry of input.requiredEntries) {
    if (entries.includes(requiredEntry)) {
      continue;
    }

    diagnostics.push(
      createLibsDiagnostic(
        input.file,
        input.path,
        `Libs contract \`${input.file}\` must include \`${requiredEntry}\` in \`${input.path}\`.`
      )
    );
  }

  return diagnostics;
}

function validateRequiredIdEntries(input: {
  readonly value: unknown;
  readonly file: string;
  readonly path: string;
  readonly field: string;
  readonly requiredEntries: readonly string[];
}): readonly Diagnostic[] {
  const entries = readIdArrayPath(input.value, input.field);
  const diagnostics: Diagnostic[] = [];

  for (const requiredEntry of input.requiredEntries) {
    if (entries.includes(requiredEntry)) {
      continue;
    }

    diagnostics.push(
      createLibsDiagnostic(
        input.file,
        input.path,
        `Libs contract \`${input.file}\` must declare \`${requiredEntry}\` in \`${input.field}\`.`
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

  return [createLibsDiagnostic(input.file, input.path, input.message)];
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

function readNestedStringArrayPath(
  value: unknown,
  path: string,
  nestedField: string
): readonly string[] {
  const candidate = readPath(value, path);

  if (!Array.isArray(candidate)) {
    return [];
  }

  return candidate.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    return readStringArrayPath(entry, nestedField);
  });
}

function readIdArrayPath(value: unknown, path: string): readonly string[] {
  const candidate = readPath(value, path);

  if (!Array.isArray(candidate)) {
    return [];
  }

  return candidate.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    return readStringField(entry, 'name') ?? [];
  });
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

function readPackageExportCondition(
  value: unknown,
  exportPath: string,
  condition: 'import' | 'types'
): string | null {
  if (!isRecord(value) || !isRecord(value.exports)) {
    return null;
  }

  const candidate = value.exports[exportPath];

  if (!isRecord(candidate)) {
    return null;
  }

  const target = candidate[condition];

  return typeof target === 'string' && target.trim().length > 0
    ? target.trim()
    : null;
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

function createLibsDiagnostic(
  file: string,
  path: string,
  message: string
): Diagnostic {
  return {
    ruleId: LIBS_CONTRACT_RULE_ID,
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
