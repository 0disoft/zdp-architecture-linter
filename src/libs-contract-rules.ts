import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { Diagnostic } from './diagnostics.ts';

const LIBS_REPOSITORY_NAME = 'zdp-libs-ts';
const LIBS_CONTRACT_RULE_ID = 'ZDP-LIBS-001';

const PACKAGE_BOUNDARIES_FILE = 'contracts/package-boundaries.yaml';
const SCHEMA_CONTRACT_FILE = 'contracts/schema-contract.yaml';
const ENV_CONTRACT_FILE = 'contracts/env-contract.yaml';
const EVENT_CONTRACT_FILE = 'contracts/event-contract.yaml';
const ERROR_CONTRACT_FILE = 'contracts/error-contract.yaml';
const I18N_CONTRACT_FILE = 'contracts/i18n-contract.yaml';
const PACKAGE_FILE = 'package.json';
const BUN_LOCK_FILE = 'bun.lock';
const TSCONFIG_FILE = 'tsconfig.json';
const CHECKER_SCRIPT_FILE = 'scripts/check-libs-contracts.ts';
const CHECKER_CLI_FILE = 'src/libs-contracts/cli.ts';
const CHECKER_PARSER_FILE = 'src/libs-contracts/parser.ts';
const CHECKER_TYPES_FILE = 'src/libs-contracts/types.ts';
const CHECKER_VALIDATOR_FILE = 'src/libs-contracts/validator.ts';
const CHECKER_TEST_FILE = 'tests/libs-contracts.test.ts';

const REQUIRED_LIBS_CHECKER_FILES = [
  BUN_LOCK_FILE,
  TSCONFIG_FILE,
  CHECKER_SCRIPT_FILE,
  CHECKER_CLI_FILE,
  CHECKER_PARSER_FILE,
  CHECKER_TYPES_FILE,
  CHECKER_VALIDATOR_FILE,
  CHECKER_TEST_FILE
] as const;

const REQUIRED_PACKAGE_SCRIPTS = ['check', 'test', 'contracts:check'] as const;

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
    schemaContract,
    envContract,
    eventContract,
    errorContract,
    i18nContract,
    packageJson
  ] = await Promise.all([
    readRequiredYamlContract(input.repositoryRoot, PACKAGE_BOUNDARIES_FILE),
    readRequiredYamlContract(input.repositoryRoot, SCHEMA_CONTRACT_FILE),
    readRequiredYamlContract(input.repositoryRoot, ENV_CONTRACT_FILE),
    readRequiredYamlContract(input.repositoryRoot, EVENT_CONTRACT_FILE),
    readRequiredYamlContract(input.repositoryRoot, ERROR_CONTRACT_FILE),
    readRequiredYamlContract(input.repositoryRoot, I18N_CONTRACT_FILE),
    readRequiredJsonContract(input.repositoryRoot, PACKAGE_FILE)
  ]);

  return [
    ...packageBoundaries.diagnostics,
    ...schemaContract.diagnostics,
    ...envContract.diagnostics,
    ...eventContract.diagnostics,
    ...errorContract.diagnostics,
    ...i18nContract.diagnostics,
    ...packageJson.diagnostics,
    ...(packageBoundaries.value === null
      ? []
      : validatePackageBoundariesContract(packageBoundaries.value)),
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
    testSource
  ] = await Promise.all(
    REQUIRED_LIBS_CHECKER_FILES.map((file) =>
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
    ...(script.source === null
      ? []
      : validateSourceIncludes({
          file: CHECKER_SCRIPT_FILE,
          source: script.source,
          requiredFragments: ['runLibsContractCheckCli']
        })),
    ...(parserSource.source === null
      ? []
      : validateSourceIncludes({
          file: CHECKER_PARSER_FILE,
          source: parserSource.source,
          requiredFragments: [
            PACKAGE_BOUNDARIES_FILE,
            SCHEMA_CONTRACT_FILE,
            ENV_CONTRACT_FILE,
            EVENT_CONTRACT_FILE,
            ERROR_CONTRACT_FILE,
            I18N_CONTRACT_FILE
          ]
        })),
    ...(validatorSource.source === null
      ? []
      : validateSourceIncludes({
          file: CHECKER_VALIDATOR_FILE,
          source: validatorSource.source,
          requiredFragments: [
            'REQUIRED_PACKAGE_NAMES',
            'REQUIRED_SCHEMA_METADATA',
            'REQUIRED_ENV_METADATA',
            'REQUIRED_EVENT_TRACE_FIELDS',
            'REQUIRED_ERROR_FIELDS',
            'REQUIRED_I18N_METADATA',
            'LIBS_PACKAGE_MISSING',
            'LIBS_ENV_FORBIDDEN_VALUE_MISSING',
            'LIBS_EVENT_TRACE_FIELD_MISSING',
            'LIBS_ERROR_FORBIDDEN_FIELD_MISSING',
            'LIBS_I18N_FORBIDDEN_OWNERSHIP_MISSING'
          ]
        })),
    ...(testSource.source === null
      ? []
      : validateSourceIncludes({
          file: CHECKER_TEST_FILE,
          source: testSource.source,
          requiredFragments: [
            'fails when a required package boundary disappears',
            'fails when schema contracts stop targeting Rust generation',
            'fails when env contracts allow provider tokens as values',
            'fails when event contracts drop trace fields',
            'fails when error contracts allow raw provider errors',
            'fails when i18n contracts become a translation runtime'
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
