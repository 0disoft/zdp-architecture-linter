import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { Diagnostic } from './diagnostics.ts';

const PRIVACY_REPOSITORY_NAME = 'zdp-privacy-access-broker';
const PRIVACY_CONTRACT_RULE_ID = 'ZDP-PRIVACY-001';

const PRIVACY_ACCESS_POLICY_FILE = 'contracts/privacy-access-policy.yaml';
const CAPABILITY_GRANTS_FILE = 'contracts/capability-grants.yaml';
const DATA_MINIMIZATION_FILE = 'contracts/data-minimization.yaml';
const ACCESS_CAPABILITY_FILE = 'contracts/access-capability.yaml';
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

const REQUIRED_POLICY_CONTEXT = [
  'actor_id',
  'tenant_id',
  'subject_id',
  'purpose',
  'resource_kind',
  'resource_scope',
  'consent_reference',
  'permission_reference',
  'audit_context'
] as const;

const REQUIRED_POLICY_CHECKS = [
  'authenticated_actor',
  'tenant_boundary',
  'object_level_permission',
  'explicit_purpose',
  'active_consent',
  'data_minimization',
  'source_system_allowed',
  'audit_event_prepared'
] as const;

const REQUIRED_FORBIDDEN_DECISIONS = [
  'final_authorization_for_product_feature',
  'entitlement_decision',
  'billing_or_ledger_decision',
  'access_based_only_on_client_role'
] as const;

const REQUIRED_FORBIDDEN_OUTPUTS = [
  'raw_oauth_token',
  'provider_refresh_token',
  'authorization_header',
  'cookie',
  'unrestricted_source_payload',
  'full_mailbox_export',
  'full_message_history_export',
  'full_file_corpus_export'
] as const;

const REQUIRED_AUDIT_EVENTS = [
  'privacy.access.allowed',
  'privacy.access.denied',
  'privacy.capability.issued',
  'privacy.masking.applied',
  'privacy.break_glass.used'
] as const;

const REQUIRED_BREAK_GLASS_FIELDS = [
  'human_approval',
  'reason',
  'time_limit',
  'target_scope',
  'audit_event'
] as const;

const REQUIRED_CAPABILITY_REQUEST_FIELDS = [
  'actor_id',
  'tenant_id',
  'subject_id',
  'requester_service',
  'purpose',
  'resource_kind',
  'resource_scope',
  'allowed_operations',
  'consent_reference',
  'permission_reference',
  'idempotency_key',
  'request_id',
  'trace_id'
] as const;

const REQUIRED_CAPABILITY_RECORD_FIELDS = [
  'grant_id',
  'issued_at',
  'expires_at',
  'actor_id',
  'tenant_id',
  'subject_id',
  'requester_service',
  'purpose',
  'resource_scope',
  'allowed_operations',
  'audit_event_id'
] as const;

const REQUIRED_FORBIDDEN_OPERATIONS = [
  'read_raw_secret',
  'read_raw_oauth_token',
  'read_unbounded_content',
  'write_source_content',
  'mutate_entitlement',
  'mutate_ledger',
  'bypass_consent'
] as const;

const REQUIRED_REDACTIONS = [
  'email_address',
  'phone_number',
  'physical_address',
  'government_identifier',
  'payment_identifier',
  'authorization_header',
  'cookie',
  'secret',
  'token',
  'provider_credential'
] as const;

const REQUIRED_FORBIDDEN_OUTPUT_SHAPES = [
  'raw_payload',
  'raw_mail_body',
  'raw_message_body',
  'raw_file_body',
  'raw_prompt_body',
  'raw_payment_payload',
  'credential_value',
  'token_value'
] as const;

const REQUIRED_GROWTH_FORBIDDEN_SHAPES = [
  'raw_payload',
  'subject_level_event_stream',
  'reidentification_key'
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

function validateAccessPolicyContract(value: unknown): readonly Diagnostic[] {
  return [
    ...validateExactValue({
      value,
      file: PRIVACY_ACCESS_POLICY_FILE,
      path: 'decision_owner',
      expected: PRIVACY_REPOSITORY_NAME,
      message: 'Privacy access policy must be owned by `zdp-privacy-access-broker`.'
    }),
    ...validateExactValue({
      value,
      file: PRIVACY_ACCESS_POLICY_FILE,
      path: 'default_decision',
      expected: 'deny',
      message: 'Privacy access policy must default to `deny`.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: PRIVACY_ACCESS_POLICY_FILE,
      path: 'request_context_required',
      field: 'request_context_required',
      requiredEntries: REQUIRED_POLICY_CONTEXT
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: PRIVACY_ACCESS_POLICY_FILE,
      path: 'required_checks',
      field: 'required_checks',
      requiredEntries: REQUIRED_POLICY_CHECKS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: PRIVACY_ACCESS_POLICY_FILE,
      path: 'forbidden_decisions',
      field: 'forbidden_decisions',
      requiredEntries: REQUIRED_FORBIDDEN_DECISIONS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: PRIVACY_ACCESS_POLICY_FILE,
      path: 'forbidden_outputs',
      field: 'forbidden_outputs',
      requiredEntries: REQUIRED_FORBIDDEN_OUTPUTS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: PRIVACY_ACCESS_POLICY_FILE,
      path: 'fail_closed_when_missing',
      field: 'fail_closed_when_missing',
      requiredEntries: REQUIRED_POLICY_CONTEXT.filter(
        (entry) => entry !== 'resource_kind'
      )
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: PRIVACY_ACCESS_POLICY_FILE,
      path: 'audit_events_required',
      field: 'audit_events_required',
      requiredEntries: REQUIRED_AUDIT_EVENTS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: PRIVACY_ACCESS_POLICY_FILE,
      path: 'break_glass.requires',
      field: 'break_glass.requires',
      requiredEntries: REQUIRED_BREAK_GLASS_FIELDS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: PRIVACY_ACCESS_POLICY_FILE,
      path: 'break_glass.forbidden',
      field: 'break_glass.forbidden',
      requiredEntries: [
        'silent_superuser_access',
        'permanent_exception',
        'raw_secret_return'
      ]
    })
  ];
}

function validateCapabilityGrantsContract(value: unknown): readonly Diagnostic[] {
  return [
    ...validateExactValue({
      value,
      file: CAPABILITY_GRANTS_FILE,
      path: 'grant_owner',
      expected: PRIVACY_REPOSITORY_NAME,
      message: 'Privacy capability grants must be owned by `zdp-privacy-access-broker`.'
    }),
    ...validateExactValue({
      value,
      file: CAPABILITY_GRANTS_FILE,
      path: 'token_shape',
      expected: 'opaque',
      message: 'Privacy capability grants must use opaque tokens.'
    }),
    ...validateMaxNumber({
      value,
      file: CAPABILITY_GRANTS_FILE,
      path: 'max_ttl_seconds',
      max: 300,
      message: 'Privacy capability max TTL must be 300 seconds or less.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: CAPABILITY_GRANTS_FILE,
      path: 'grant_request_required',
      field: 'grant_request_required',
      requiredEntries: REQUIRED_CAPABILITY_REQUEST_FIELDS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: CAPABILITY_GRANTS_FILE,
      path: 'grant_record_required',
      field: 'grant_record_required',
      requiredEntries: REQUIRED_CAPABILITY_RECORD_FIELDS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: CAPABILITY_GRANTS_FILE,
      path: 'forbidden_operations',
      field: 'forbidden_operations',
      requiredEntries: REQUIRED_FORBIDDEN_OPERATIONS
    }),
    ...validateExactValue({
      value,
      file: CAPABILITY_GRANTS_FILE,
      path: 'delegation.onward_delegation_allowed',
      expected: false,
      message: 'Privacy capability onward delegation must be disabled.'
    }),
    ...validateExactValue({
      value,
      file: CAPABILITY_GRANTS_FILE,
      path: 'delegation.bearer_logging_allowed',
      expected: false,
      message: 'Privacy capability bearer logging must be disabled.'
    }),
    ...validateExactValue({
      value,
      file: CAPABILITY_GRANTS_FILE,
      path: 'delegation.persist_in_product_repo_allowed',
      expected: false,
      message: 'Privacy capability persistence in product repositories must be disabled.'
    }),
    ...validateExactValue({
      value,
      file: CAPABILITY_GRANTS_FILE,
      path: 'revocation.supported',
      expected: true,
      message: 'Privacy capabilities must support revocation.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: CAPABILITY_GRANTS_FILE,
      path: 'revocation.triggers',
      field: 'revocation.triggers',
      requiredEntries: [
        'consent_withdrawn',
        'permission_changed',
        'tenant_membership_removed',
        'break_glass_window_expired'
      ]
    }),
    ...validateExactValue({
      value,
      file: CAPABILITY_GRANTS_FILE,
      path: 'audit.reason_required',
      expected: true,
      message: 'Privacy capability audit must require a reason.'
    })
  ];
}

function validateDataMinimizationContract(value: unknown): readonly Diagnostic[] {
  return [
    ...validateExactValue({
      value,
      file: DATA_MINIMIZATION_FILE,
      path: 'minimization_owner',
      expected: PRIVACY_REPOSITORY_NAME,
      message: 'Privacy data minimization must be owned by `zdp-privacy-access-broker`.'
    }),
    ...validateExactValue({
      value,
      file: DATA_MINIMIZATION_FILE,
      path: 'default_output',
      expected: 'deny',
      message: 'Privacy data minimization must default to `deny`.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: DATA_MINIMIZATION_FILE,
      path: 'allowed_output_shapes',
      field: 'allowed_output_shapes',
      requiredEntries: [
        'masked_summary',
        'masked_excerpt',
        'limited_metadata',
        'aggregate_count',
        'policy_decision'
      ]
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: DATA_MINIMIZATION_FILE,
      path: 'forbidden_output_shapes',
      field: 'forbidden_output_shapes',
      requiredEntries: REQUIRED_FORBIDDEN_OUTPUT_SHAPES
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: DATA_MINIMIZATION_FILE,
      path: 'required_redactions',
      field: 'required_redactions',
      requiredEntries: REQUIRED_REDACTIONS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: DATA_MINIMIZATION_FILE,
      path: 'purpose_limits.growth_or_analytics.allowed_shapes',
      field: 'purpose_limits.growth_or_analytics.allowed_shapes',
      requiredEntries: ['aggregate_count']
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: DATA_MINIMIZATION_FILE,
      path: 'purpose_limits.growth_or_analytics.forbidden_shapes',
      field: 'purpose_limits.growth_or_analytics.forbidden_shapes',
      requiredEntries: REQUIRED_GROWTH_FORBIDDEN_SHAPES
    }),
    ...validateExactValue({
      value,
      file: DATA_MINIMIZATION_FILE,
      path: 'retention.raw_source_retention_allowed',
      expected: false,
      message: 'Privacy minimization must not allow raw source retention.'
    }),
    ...validateExactValue({
      value,
      file: DATA_MINIMIZATION_FILE,
      path: 'retention.deletion_requires_evidence',
      expected: true,
      message: 'Privacy minimization deletion must require evidence.'
    }),
    ...validateExactValue({
      value,
      file: DATA_MINIMIZATION_FILE,
      path: 'logging.log_raw_payload',
      expected: false,
      message: 'Privacy minimization must not log raw payloads.'
    }),
    ...validateExactValue({
      value,
      file: DATA_MINIMIZATION_FILE,
      path: 'logging.log_capability_token',
      expected: false,
      message: 'Privacy minimization must not log capability tokens.'
    })
  ];
}

function validateAccessCapabilityContract(value: unknown): readonly Diagnostic[] {
  return [
    ...validateMaxNumber({
      value,
      file: ACCESS_CAPABILITY_FILE,
      path: 'capability.max_ttl_seconds',
      max: 300,
      message: 'Legacy privacy access capability max TTL must be 300 seconds or less.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: ACCESS_CAPABILITY_FILE,
      path: 'capability.requires',
      field: 'capability.requires',
      requiredEntries: [
        'actor_id',
        'tenant_id',
        'purpose',
        'resource_scope',
        'consent_reference'
      ]
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: ACCESS_CAPABILITY_FILE,
      path: 'forbidden',
      field: 'forbidden',
      requiredEntries: [
        'raw_oauth_token_return',
        'unscoped_source_data_access',
        'unaudited_ai_data_access'
      ]
    })
  ];
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
            ACCESS_CAPABILITY_FILE
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
            'PRIV_CAPABILITY_TTL_TOO_HIGH',
            'PRIV_CAPABILITY_POLICY_RECHECK_DISABLED',
            'PRIV_MINIMIZATION_RAW_RETENTION_ALLOWED',
            'PRIV_MINIMIZATION_ANALYTICS_RAW_STREAM_ALLOWED'
          ]
        })),
    ...(testSource.source === null
      ? []
      : validateSourceIncludes({
          file: CHECKER_TEST_FILE,
          source: testSource.source,
          requiredFragments: [
            'fails when access policy does not default deny',
            'fails when capability ttl is longer than five minutes',
            'fails when capability can skip policy recheck',
            'fails when data minimization can retain raw source data',
            'fails when growth or analytics can receive subject-level raw streams'
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
      createPrivacyDiagnostic(
        input.file,
        input.path,
        `Privacy broker contract \`${input.file}\` must include \`${requiredEntry}\` in \`${input.field}\`.`
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

  return [createPrivacyDiagnostic(input.file, input.path, input.message)];
}

function validateMaxNumber(input: {
  readonly value: unknown;
  readonly file: string;
  readonly path: string;
  readonly max: number;
  readonly message: string;
}): readonly Diagnostic[] {
  const actual = readPath(input.value, input.path);

  if (typeof actual === 'number' && actual <= input.max) {
    return [];
  }

  return [createPrivacyDiagnostic(input.file, input.path, input.message)];
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

function createPrivacyDiagnostic(
  file: string,
  path: string,
  message: string
): Diagnostic {
  return {
    ruleId: PRIVACY_CONTRACT_RULE_ID,
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
