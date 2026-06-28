import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { Diagnostic } from './diagnostics.ts';
import {
  extractTestCallNames,
  stripCommentsAndStringLiterals
} from './source-proof.ts';
import {
  PRIVACY_CONTRACT_RULE_ID,
  PRIVACY_REPOSITORY_NAME,
  createPrivacyDiagnostic,
  formatError,
  isMissingPathError,
  readPath,
  readRepositoryName,
  readStringArrayPath,
  validateExactValue,
  validateRequiredStringArrayEntries
} from './rules/privacy/contract-helpers.ts';
import {
  ACCESS_CAPABILITY_FILE,
  CAPABILITY_GRANTS_FILE,
  DATA_MINIMIZATION_FILE,
  PRIVACY_ACCESS_POLICY_FILE,
  validateAccessCapabilityContract,
  validateAccessPolicyContract,
  validateCapabilityGrantsContract,
  validateDataMinimizationContract
} from './rules/privacy/boundary-contracts.ts';

const PACKAGE_FILE = 'package.json';
const BUN_LOCK_FILE = 'bun.lock';
const TSCONFIG_FILE = 'tsconfig.json';
const CHECKER_SCRIPT_FILE = 'scripts/check-privacy-contracts.ts';
const CHECKER_CLI_FILE = 'src/privacy-contracts/cli.ts';
const CHECKER_PARSER_FILE = 'src/privacy-contracts/parser.ts';
const CHECKER_TYPES_FILE = 'src/privacy-contracts/types.ts';
const CHECKER_VALIDATOR_FILE = 'src/privacy-contracts/validator.ts';
const CHECKER_TEST_FILE = 'tests/privacy-contracts.test.ts';
const CARGO_FILE = 'Cargo.toml';
const CARGO_LOCK_FILE = 'Cargo.lock';
const RUNTIME_LIB_FILE = 'src/lib.rs';
const RUNTIME_MAIN_FILE = 'src/main.rs';
const RUNTIME_BOUNDARY_MOD_FILE = 'src/boundaries/mod.rs';
const RUNTIME_ACCESS_POLICY_FILE = 'src/boundaries/access_policy.rs';
const RUNTIME_CAPABILITY_GRANTS_FILE = 'src/boundaries/capability_grants.rs';
const RUNTIME_DATA_MINIMIZATION_FILE = 'src/boundaries/data_minimization.rs';
const RUNTIME_AUDIT_FILE = 'src/boundaries/audit.rs';

const REQUIRED_PRIVACY_CHECKER_FILES = [
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
const REQUIRED_CHECK_SCRIPT_FRAGMENTS = [
  'tsc --noEmit',
  'bun test',
  'bun run contracts:check',
  'cargo fmt --check',
  'cargo check',
  'cargo test'
] as const;

const REQUIRED_PRIVACY_RUNTIME_FILES = [
  CARGO_FILE,
  CARGO_LOCK_FILE,
  RUNTIME_LIB_FILE,
  RUNTIME_MAIN_FILE,
  RUNTIME_BOUNDARY_MOD_FILE,
  RUNTIME_ACCESS_POLICY_FILE,
  RUNTIME_CAPABILITY_GRANTS_FILE,
  RUNTIME_DATA_MINIMIZATION_FILE,
  RUNTIME_AUDIT_FILE
] as const;

export async function validateRepositoryPrivacyContract(input: {
  readonly repositoryRoot: string | undefined;
  readonly repositoryServiceContract: unknown;
}): Promise<readonly Diagnostic[]> {
  if (
    input.repositoryRoot === undefined ||
    readRepositoryName(input.repositoryServiceContract) !== PRIVACY_REPOSITORY_NAME
  ) {
    return [];
  }

  const [
    accessPolicy,
    capabilityGrants,
    dataMinimization,
    accessCapability
  ] = await Promise.all([
    readRequiredYamlContract(input.repositoryRoot, PRIVACY_ACCESS_POLICY_FILE),
    readRequiredYamlContract(input.repositoryRoot, CAPABILITY_GRANTS_FILE),
    readRequiredYamlContract(input.repositoryRoot, DATA_MINIMIZATION_FILE),
    readRequiredYamlContract(input.repositoryRoot, ACCESS_CAPABILITY_FILE)
  ]);
  const packageJson = await readRequiredJsonContract(input.repositoryRoot, PACKAGE_FILE);

  return [
    ...accessPolicy.diagnostics,
    ...capabilityGrants.diagnostics,
    ...dataMinimization.diagnostics,
    ...accessCapability.diagnostics,
    ...packageJson.diagnostics,
    ...(accessPolicy.value === null
      ? []
      : validateAccessPolicyContract(accessPolicy.value)),
    ...(capabilityGrants.value === null
      ? []
      : validateCapabilityGrantsContract(capabilityGrants.value)),
    ...(dataMinimization.value === null
      ? []
      : validateDataMinimizationContract(dataMinimization.value)),
    ...(accessCapability.value === null
      ? []
      : validateAccessCapabilityContract(accessCapability.value)),
    ...(packageJson.value === null ? [] : validatePackageScripts(packageJson.value)),
    ...validateServiceContract(input.repositoryServiceContract),
    ...validateRequiredLinterRule(input.repositoryServiceContract),
    ...(await validateCheckerSurface(input.repositoryRoot)),
    ...(await validateRuntimeSurface(input.repositoryRoot))
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
          createPrivacyDiagnostic(
            file,
            'repository.root',
            `Privacy broker repository must include \`${file}\`.`
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
        createPrivacyDiagnostic(
          file,
          'yaml',
          `Privacy broker contract \`${file}\` must be valid YAML: ${formatError(
            error
          )}`
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
          createPrivacyDiagnostic(
            file,
            'repository.root',
            `Privacy broker repository must include \`${file}\`.`
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
        createPrivacyDiagnostic(
          file,
          'json',
          `Privacy broker contract \`${file}\` must be valid JSON: ${formatError(
            error
          )}`
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
          createPrivacyDiagnostic(
            file,
            'repository.root',
            `Privacy broker repository must include \`${file}\`.`
          )
        ]
      };
    }

    throw error;
  }
}

function validateServiceContract(value: unknown): readonly Diagnostic[] {
  return [
    ...validateExactValue({
      value,
      file: 'service.yaml',
      path: 'service.status',
      expected: 'experiment',
      message: 'Privacy broker service must remain in `experiment` status.'
    }),
    ...validateExactValue({
      value,
      file: 'service.yaml',
      path: 'domain.regulated',
      expected: true,
      message: 'Privacy broker service must remain regulated.'
    }),
    ...validateExactValue({
      value,
      file: 'service.yaml',
      path: 'data.owner_domain',
      expected: 'privacy',
      message: 'Privacy broker service must keep `privacy` as data owner domain.'
    }),
    ...validateExactValue({
      value,
      file: 'service.yaml',
      path: 'data.pii_level',
      expected: 'high',
      message: 'Privacy broker service must declare high PII sensitivity.'
    }),
    ...validateExactValue({
      value,
      file: 'service.yaml',
      path: 'access.object_level_auth_required',
      expected: true,
      message: 'Privacy broker service must require object-level authorization.'
    }),
    ...validateExactValue({
      value,
      file: 'service.yaml',
      path: 'audit.required',
      expected: true,
      message: 'Privacy broker service must require audit.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: 'service.yaml',
      path: 'dependencies.services',
      field: 'dependencies.services',
      requiredEntries: ['core-api', 'core-audit', 'platform-observability']
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: 'service.yaml',
      path: 'human_review_required',
      field: 'human_review_required',
      requiredEntries: [
        'data access policy changes',
        'masking and consent withdrawal changes',
        'break-glass access',
        'new capability output shape'
      ]
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: 'service.yaml',
      path: 'exit.kill_criteria',
      field: 'exit.kill_criteria',
      requiredEntries: [
        'AI, connectors, or products read source user data without broker mediation',
        'privacy broker returns OAuth tokens, raw credentials, or unbounded source exports',
        'growth or analytics consumers receive subject-level raw event streams'
      ]
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
      createPrivacyDiagnostic(
        PACKAGE_FILE,
        `scripts.${script}`,
        `Privacy broker package must declare \`${script}\` script.`
      )
    );
  }

  const checkScript = readPath(value, 'scripts.check');
  if (typeof checkScript !== 'string') {
    return diagnostics;
  }

  for (const fragment of REQUIRED_CHECK_SCRIPT_FRAGMENTS) {
    if (checkScript.includes(fragment)) {
      continue;
    }

    diagnostics.push(
      createPrivacyDiagnostic(
        PACKAGE_FILE,
        'scripts.check',
        `Privacy broker package \`check\` script must include \`${fragment}\`.`
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
    REQUIRED_PRIVACY_CHECKER_FILES.map((file) =>
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
          requiredFragments: ['runPrivacyContractCheckCli']
        })),
    ...(parserSource.source === null
      ? []
      : validateSourceIncludes({
          file: CHECKER_PARSER_FILE,
          source: parserSource.source,
          requiredFragments: [
            'service.yaml',
            PRIVACY_ACCESS_POLICY_FILE,
            CAPABILITY_GRANTS_FILE,
            DATA_MINIMIZATION_FILE,
            ACCESS_CAPABILITY_FILE,
            'allowed_callers',
            'derived_decision_retention_days',
            'audit_retention_policy',
            'required_identifiers',
            'implementation_guards'
          ]
        })),
    ...(typesSource.source === null
      ? []
      : validateSourceIncludes({
          file: CHECKER_TYPES_FILE,
          source: typesSource.source,
          requiredFragments: [
            'allowedCallers',
            'derivedDecisionRetentionDays',
            'auditRetentionPolicy',
            'requiredIdentifiers',
            'implementationGuards'
          ]
        })),
    ...(validatorSource.source === null
      ? []
      : validateSourceIncludes({
          file: CHECKER_VALIDATOR_FILE,
          source: validatorSource.source,
          requiredFragments: [
            'MAX_CAPABILITY_TTL_SECONDS',
            'PRIV_POLICY_DEFAULT_NOT_DENY',
            'PRIV_POLICY_ALLOWED_CALLER_DRIFT',
            'PRIV_BREAK_GLASS_NOT_DECLARED',
            'PRIV_CAPABILITY_TTL_NOT_POSITIVE_INTEGER',
            'PRIV_CAPABILITY_TTL_TOO_HIGH',
            'PRIV_CAPABILITY_POLICY_RECHECK_DISABLED',
            'PRIV_CAPABILITY_POLICY_CONSENT_CACHE_TTL_NOT_POSITIVE_INTEGER',
            'PRIV_CAPABILITY_ALLOWED_OPERATION_DRIFT',
            'PRIV_CAPABILITY_STATELESS_CONSENT_TOKEN_DEFAULT_ALLOWED',
            'PRIV_LEGACY_CAPABILITY_TTL_NOT_POSITIVE_INTEGER',
            'PRIV_MINIMIZATION_RAW_RETENTION_ALLOWED',
            'PRIV_MINIMIZATION_DERIVED_RETENTION_NOT_POSITIVE_INTEGER',
            'PRIV_MINIMIZATION_DERIVED_RETENTION_TOO_LONG',
            'PRIV_MINIMIZATION_AUDIT_RETENTION_POLICY_INVALID',
            'PRIV_MINIMIZATION_ALLOWED_SHAPE_DRIFT',
            'PRIV_MINIMIZATION_AI_RAW_OUTPUT_ALLOWED',
            'PRIV_MINIMIZATION_CONNECTOR_RAW_OUTPUT_ALLOWED',
            'PRIV_MINIMIZATION_ANALYTICS_ALLOWED_SHAPE_DRIFT',
            'PRIV_MINIMIZATION_ANALYTICS_RAW_STREAM_ALLOWED',
            'PRIV_MINIMIZATION_POLICY_INPUT_LOGGING_INVALID',
            'PRIV_MINIMIZATION_LOG_IDENTIFIER_MISSING',
            'PRIV_MINIMIZATION_MASKING_GUARD_NOT_REQUIRED',
            'PRIV_MINIMIZATION_RAW_SOURCE_RESPONSE_ALLOWED',
            'PRIV_MINIMIZATION_REDACTION_EVIDENCE_NOT_REQUIRED',
            'PRIV_MINIMIZATION_SOURCE_PROXY_REVIEW_NOT_REQUIRED',
            'findDuplicateStrings',
            'PRIV_RUST_ALLOWED_OUTPUT_SHAPE_DRIFT',
            'PRIV_RUST_SECRET_OR_PII_LOGGING_PATTERN',
            'PRIV_RUST_SOURCE_PROXY_ROUTE_REQUIRES_MASKING_REVIEW',
            'RUST_MARKER_EXPECTATIONS'
          ]
        })),
    ...(validatorSource.source === null
      ? []
      : validateSourceCodeIncludes({
          file: CHECKER_VALIDATOR_FILE,
          source: validatorSource.source,
          requiredFragments: [
            'export function validatePrivacyContracts',
            'function validateAccessPolicy',
            'function validateCapabilityGrants',
            'function validateDataMinimization',
            'function validateAccessCapability',
            'function validateRustBoundaryMarkers',
            'function validateRustPrivacyPatterns'
          ]
        })),
    ...(testSource.source === null
      ? []
      : validateSourceCodeIncludes({
          file: CHECKER_TEST_FILE,
          source: testSource.source,
          requiredFragments: [
            'validatePrivacyContracts',
            'loadCommittedContracts',
            'expect('
          ]
        })),
    ...(testSource.source === null
      ? []
      : validateSourceTestNames({
          file: CHECKER_TEST_FILE,
          source: testSource.source,
          requiredNames: [
            'validates the committed privacy broker contracts',
            'fails when access policy does not default deny',
            'fails when capability ttl is longer than five minutes',
            'fails when capability and policy cache ttl values are not positive integers',
            'fails when capability can skip policy recheck',
            'fails when capability operations add an unapproved raw surface',
            'fails when exact contract lists duplicate approved entries',
            'fails when privacy access policy allows unapproved callers',
            'fails when stateless consent tokens are allowed by default',
            'fails when data minimization can retain raw source data',
            'fails when data minimization retention, logging, and guards drift open',
            'fails when data minimization allowed output shapes add raw payloads',
            'fails when AI draft or connector sync purpose limits allow raw outputs',
            'fails when growth or analytics can receive subject-level raw streams',
            'fails when growth or analytics allowed shapes add subject-level outputs',
            'fails when Rust boundary markers drift from YAML contracts',
            'fails when Rust source logs PII or adds raw source proxy routes'
          ]
        }))
  ];
}

async function validateRuntimeSurface(
  repositoryRoot: string
): Promise<readonly Diagnostic[]> {
  const [
    cargo,
    cargoLock,
    libSource,
    mainSource,
    boundaryModSource,
    accessPolicySource,
    capabilityGrantsSource,
    dataMinimizationSource,
    auditSource
  ] = await Promise.all(
    REQUIRED_PRIVACY_RUNTIME_FILES.map((file) =>
      readOptionalTextFile(repositoryRoot, file)
    )
  );

  return [
    ...cargo.diagnostics,
    ...cargoLock.diagnostics,
    ...libSource.diagnostics,
    ...mainSource.diagnostics,
    ...boundaryModSource.diagnostics,
    ...accessPolicySource.diagnostics,
    ...capabilityGrantsSource.diagnostics,
    ...dataMinimizationSource.diagnostics,
    ...auditSource.diagnostics,
    ...(cargo.source === null
      ? []
      : validateSourceIncludes({
          file: CARGO_FILE,
          source: cargo.source,
          requiredFragments: ['axum', 'tokio', 'serde', 'serde_json', 'tower']
        })),
    ...(libSource.source === null
      ? []
      : validateSourceIncludes({
          file: RUNTIME_LIB_FILE,
          source: libSource.source,
          requiredFragments: [
            'pub const SERVICE_ID',
            '"privacy-broker"',
            'pub const DEFAULT_BIND_ADDR',
            '"127.0.0.1:3004"',
            'ZDP_PRIVACY_BROKER_BIND_ADDR',
            '.route("/healthz", get(healthz))',
            '.route("/readyz", get(readyz))',
            'ready: true',
            'checks:',
            '"contracts"',
            'healthz_returns_privacy_broker_identity',
            'readyz_reports_contract_readiness_only',
            'privacy_boundaries_do_not_own_source_truth_or_product_authorization',
            'owns_final_product_authorization',
            'can_return_raw_source_payload',
            'can_return_provider_credentials',
            'MAX_CAPABILITY_TTL_SECONDS'
          ]
        })),
    ...(mainSource.source === null
      ? []
      : validateSourceIncludes({
          file: RUNTIME_MAIN_FILE,
          source: mainSource.source,
          requiredFragments: ['bind_addr_from_env', 'serve']
        })),
    ...(boundaryModSource.source === null
      ? []
      : validateSourceIncludes({
          file: RUNTIME_BOUNDARY_MOD_FILE,
          source: boundaryModSource.source,
          requiredFragments: [
            'access_policy',
            'capability_grants',
            'data_minimization',
            'audit',
            'owns_final_product_authorization',
            'can_return_raw_source_payload',
            'can_return_provider_credentials'
          ]
        })),
    ...(accessPolicySource.source === null
      ? []
      : validateSourceIncludes({
          file: RUNTIME_ACCESS_POLICY_FILE,
          source: accessPolicySource.source,
          requiredFragments: [
            'id: "access_policy"',
            'owns_final_product_authorization: false',
            'can_return_raw_source_payload: false',
            'can_return_provider_credentials: false',
            'REQUIRED_ACCESS_CONTEXT',
            'actor_id',
            'tenant_id',
            'subject_id',
            'purpose',
            'resource_scope',
            'DEFAULT_DECISION',
            '"deny"'
          ]
        })),
    ...(capabilityGrantsSource.source === null
      ? []
      : validateSourceIncludes({
          file: RUNTIME_CAPABILITY_GRANTS_FILE,
          source: capabilityGrantsSource.source,
          requiredFragments: [
            'MAX_CAPABILITY_TTL_SECONDS',
            '= 300',
            'id: "capability_grants"',
            'owns_final_product_authorization: false',
            'can_return_raw_source_payload: false',
            'can_return_provider_credentials: false',
            'REQUIRED_GRANT_PROPERTIES',
            'non_delegable',
            'revocable',
            'policy_rechecked',
            'consent_rechecked'
          ]
        })),
    ...(dataMinimizationSource.source === null
      ? []
      : validateSourceIncludes({
          file: RUNTIME_DATA_MINIMIZATION_FILE,
          source: dataMinimizationSource.source,
          requiredFragments: [
            'id: "data_minimization"',
            'owns_final_product_authorization: false',
            'can_return_raw_source_payload: false',
            'can_return_provider_credentials: false',
            'ALLOWED_OUTPUT_SHAPES',
            'masked_summary',
            'limited_metadata',
            'aggregate_count',
            'FORBIDDEN_OUTPUT_SHAPES',
            'raw_payload',
            'full_mailbox_export',
            'subject_level_growth_stream'
          ]
        })),
    ...(auditSource.source === null
      ? []
      : validateSourceIncludes({
          file: RUNTIME_AUDIT_FILE,
          source: auditSource.source,
          requiredFragments: [
            'id: "audit"',
            'owns_final_product_authorization: false',
            'can_return_raw_source_payload: false',
            'can_return_provider_credentials: false',
            'REQUIRED_EVENTS',
            'privacy.capability.issued',
            'privacy.access.denied',
            'privacy.masking.applied',
            'FORBIDDEN_AUDIT_VALUES',
            'provider_refresh_token',
            'authorization_header',
            'cookie'
          ]
        }))
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
      createPrivacyDiagnostic(
        input.file,
        'source',
        `Privacy broker checker source must include \`${fragment}\`.`
      )
    );
  }

  return diagnostics;
}

function validateSourceCodeIncludes(input: {
  readonly file: string;
  readonly source: string;
  readonly requiredFragments: readonly string[];
}): readonly Diagnostic[] {
  const codeOnlySource = stripCommentsAndStringLiterals(input.source);
  const diagnostics: Diagnostic[] = [];

  for (const fragment of input.requiredFragments) {
    if (codeOnlySource.includes(fragment)) {
      continue;
    }

    diagnostics.push(
      createPrivacyDiagnostic(
        input.file,
        'source',
        `Privacy broker checker source must include code fragment \`${fragment}\`.`
      )
    );
  }

  return diagnostics;
}

function validateSourceTestNames(input: {
  readonly file: string;
  readonly source: string;
  readonly requiredNames: readonly string[];
}): readonly Diagnostic[] {
  const testNames = extractTestCallNames(input.source);
  const diagnostics: Diagnostic[] = [];

  for (const name of input.requiredNames) {
    if (testNames.includes(name)) {
      continue;
    }

    diagnostics.push(
      createPrivacyDiagnostic(
        input.file,
        'source',
        `Privacy broker checker source must include test case \`${name}\`.`
      )
    );
  }

  return diagnostics;
}

function validateRequiredLinterRule(value: unknown): readonly Diagnostic[] {
  const requiredRules = readStringArrayPath(
    value,
    'policy_gates.required_linter_rules'
  );

  if (requiredRules.includes(PRIVACY_CONTRACT_RULE_ID)) {
    return [];
  }

  return [
    createPrivacyDiagnostic(
      'service.yaml',
      'policy_gates.required_linter_rules',
      `Privacy broker service contract must require \`${PRIVACY_CONTRACT_RULE_ID}\`.`
    )
  ];
}
