import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { Diagnostic } from './diagnostics.ts';
import { stripCommentsAndStringLiterals } from './source-proof.ts';
import {
  ACCESS_AUDIT_FILE,
  CAPABILITY_ISSUANCE_FILE,
  CREDENTIAL_BOUNDARY_FILE,
  REQUIRED_AUDIT_EVENTS,
  STORAGE_BOUNDARY_FILE,
  validateAccessAuditContract,
  validateCapabilityIssuanceContract,
  validateCredentialBoundaryContract,
  validateStorageBoundaryContract
} from './rules/credential-vault/boundary-contracts.ts';
import {
  CREDENTIAL_VAULT_REPOSITORY_NAME,
  CREDENTIAL_VAULT_RULE_ID,
  createCredentialDiagnostic,
  formatError,
  isMissingPathError,
  isRecord,
  readFunctionBody,
  readPath,
  readRecordArrayPath,
  readRepositoryName,
  readRustNumberConstant,
  readRustStringArrayConstant,
  readStringArrayPath,
  readStringField,
  validateExactStringArrayEntries,
  validateExactStringSet,
  validateExactValue,
  validateMaxNumber,
  validatePositiveSafeInteger,
  validateRequiredStringArrayEntries,
  validateSourceTestNames
} from './rules/credential-vault/contract-helpers.ts';

const PACKAGE_FILE = 'package.json';
const BUN_LOCK_FILE = 'bun.lock';
const TSCONFIG_FILE = 'tsconfig.json';
const CHECKER_SCRIPT_FILE = 'scripts/check-credential-vault-contracts.ts';
const CHECKER_CLI_FILE = 'src/credential-vault-contracts/cli.ts';
const CHECKER_PARSER_FILE = 'src/credential-vault-contracts/parser.ts';
const CHECKER_TYPES_FILE = 'src/credential-vault-contracts/types.ts';
const CHECKER_VALIDATOR_FILE = 'src/credential-vault-contracts/validator.ts';
const CHECKER_TEST_FILE = 'tests/credential-vault-contracts.test.ts';
const CARGO_FILE = 'Cargo.toml';
const CARGO_LOCK_FILE = 'Cargo.lock';
const RUNTIME_LIB_FILE = 'src/lib.rs';
const RUNTIME_MAIN_FILE = 'src/main.rs';
const RUNTIME_BOUNDARY_MOD_FILE = 'src/boundaries/mod.rs';
const RUNTIME_CREDENTIAL_BOUNDARY_FILE = 'src/boundaries/credential_boundary.rs';
const RUNTIME_CAPABILITY_ISSUANCE_FILE =
  'src/boundaries/capability_issuance.rs';
const RUNTIME_ACCESS_AUDIT_FILE = 'src/boundaries/access_audit.rs';
const RUNTIME_STORAGE_BOUNDARY_FILE = 'src/boundaries/storage_boundary.rs';

const REQUIRED_CREDENTIAL_CHECKER_FILES = [
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

const REQUIRED_CREDENTIAL_RUNTIME_FILES = [
  CARGO_FILE,
  CARGO_LOCK_FILE,
  RUNTIME_LIB_FILE,
  RUNTIME_MAIN_FILE,
  RUNTIME_BOUNDARY_MOD_FILE,
  RUNTIME_CREDENTIAL_BOUNDARY_FILE,
  RUNTIME_CAPABILITY_ISSUANCE_FILE,
  RUNTIME_ACCESS_AUDIT_FILE,
  RUNTIME_STORAGE_BOUNDARY_FILE
] as const;

const RUST_MARKER_EXPECTATIONS = [
  {
    file: RUNTIME_CREDENTIAL_BOUNDARY_FILE,
    constName: 'REQUIRED_CREDENTIAL_CLASSES',
    yamlPath: 'credential_classes',
    expectedEntries: (contracts: CredentialVaultContractValues) =>
      readRecordArrayPath(contracts.credentialBoundary, 'credential_classes').flatMap(
        (entry) => {
          const id = readStringField(entry, 'id');
          return id === null ? [] : [id];
        }
      )
  },
  {
    file: RUNTIME_CREDENTIAL_BOUNDARY_FILE,
    constName: 'FORBIDDEN_CREDENTIAL_VALUES',
    yamlPath: 'forbidden_values',
    expectedEntries: (contracts: CredentialVaultContractValues) =>
      readStringArrayPath(contracts.credentialBoundary, 'forbidden_values')
  },
  {
    file: RUNTIME_CAPABILITY_ISSUANCE_FILE,
    constName: 'REQUIRED_CAPABILITY_REQUEST_FIELDS',
    yamlPath: 'request_required',
    expectedEntries: (contracts: CredentialVaultContractValues) =>
      readStringArrayPath(contracts.capabilityIssuance, 'request_required')
  },
  {
    file: RUNTIME_CAPABILITY_ISSUANCE_FILE,
    constName: 'FORBIDDEN_CAPABILITY_VALUES',
    yamlPath: 'forbidden',
    expectedEntries: (contracts: CredentialVaultContractValues) =>
      readStringArrayPath(contracts.capabilityIssuance, 'forbidden')
  },
  {
    file: RUNTIME_ACCESS_AUDIT_FILE,
    constName: 'REQUIRED_AUDIT_EVENTS',
    yamlPath: 'events_required',
    expectedEntries: (contracts: CredentialVaultContractValues) =>
      readStringArrayPath(contracts.accessAudit, 'events_required')
  },
  {
    file: RUNTIME_ACCESS_AUDIT_FILE,
    constName: 'FORBIDDEN_AUDIT_VALUES',
    yamlPath: 'forbidden_values',
    expectedEntries: (contracts: CredentialVaultContractValues) =>
      readStringArrayPath(contracts.accessAudit, 'forbidden_values')
  },
  {
    file: RUNTIME_STORAGE_BOUNDARY_FILE,
    constName: 'ALLOWED_INTERFACES',
    yamlPath: 'allowed_interfaces',
    expectedEntries: (contracts: CredentialVaultContractValues) =>
      readStringArrayPath(contracts.storageBoundary, 'allowed_interfaces')
  },
  {
    file: RUNTIME_STORAGE_BOUNDARY_FILE,
    constName: 'FORBIDDEN_STORAGE_LOCATIONS',
    yamlPath: 'forbidden_storage_locations',
    expectedEntries: (contracts: CredentialVaultContractValues) =>
      readStringArrayPath(contracts.storageBoundary, 'forbidden_storage_locations')
  }
] as const;

type CredentialVaultContractValues = {
  readonly credentialBoundary: unknown;
  readonly capabilityIssuance: unknown;
  readonly accessAudit: unknown;
  readonly storageBoundary: unknown;
};

export async function validateRepositoryCredentialVaultContract(input: {
  readonly repositoryRoot: string | undefined;
  readonly repositoryServiceContract: unknown;
}): Promise<readonly Diagnostic[]> {
  if (
    input.repositoryRoot === undefined ||
    readRepositoryName(input.repositoryServiceContract) !==
      CREDENTIAL_VAULT_REPOSITORY_NAME
  ) {
    return [];
  }

  const [credentialBoundary, capabilityIssuance, accessAudit, storageBoundary] =
    await Promise.all([
      readRequiredYamlContract(input.repositoryRoot, CREDENTIAL_BOUNDARY_FILE),
      readRequiredYamlContract(input.repositoryRoot, CAPABILITY_ISSUANCE_FILE),
      readRequiredYamlContract(input.repositoryRoot, ACCESS_AUDIT_FILE),
      readRequiredYamlContract(input.repositoryRoot, STORAGE_BOUNDARY_FILE)
    ]);
  const packageJson = await readRequiredJsonContract(input.repositoryRoot, PACKAGE_FILE);
  const contractValues =
    credentialBoundary.value === null ||
    capabilityIssuance.value === null ||
    accessAudit.value === null ||
    storageBoundary.value === null
      ? null
      : {
          credentialBoundary: credentialBoundary.value,
          capabilityIssuance: capabilityIssuance.value,
          accessAudit: accessAudit.value,
          storageBoundary: storageBoundary.value
        };

  return [
    ...credentialBoundary.diagnostics,
    ...capabilityIssuance.diagnostics,
    ...accessAudit.diagnostics,
    ...storageBoundary.diagnostics,
    ...packageJson.diagnostics,
    ...(credentialBoundary.value === null
      ? []
      : validateCredentialBoundaryContract(credentialBoundary.value)),
    ...(capabilityIssuance.value === null
      ? []
      : validateCapabilityIssuanceContract(capabilityIssuance.value)),
    ...(accessAudit.value === null
      ? []
      : validateAccessAuditContract(accessAudit.value)),
    ...(storageBoundary.value === null
      ? []
      : validateStorageBoundaryContract(storageBoundary.value)),
    ...(packageJson.value === null ? [] : validatePackageScripts(packageJson.value)),
    ...validateServiceContract(input.repositoryServiceContract),
    ...validateRequiredLinterRule(input.repositoryServiceContract),
    ...(await validateCheckerSurface(input.repositoryRoot)),
    ...(await validateRuntimeSurface(input.repositoryRoot, contractValues))
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
          createCredentialDiagnostic(
            file,
            'repository.root',
            `Credential vault repository must include \`${file}\`.`
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
        createCredentialDiagnostic(
          file,
          'yaml',
          `Credential vault contract \`${file}\` must be valid YAML: ${formatError(
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
          createCredentialDiagnostic(
            file,
            'repository.root',
            `Credential vault repository must include \`${file}\`.`
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
        createCredentialDiagnostic(
          file,
          'json',
          `Credential vault contract \`${file}\` must be valid JSON: ${formatError(
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
          createCredentialDiagnostic(
            file,
            'repository.root',
            `Credential vault repository must include \`${file}\`.`
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
      path: 'service.tier',
      expected: 'tier0',
      message: 'Credential vault service must remain tier0.'
    }),
    ...validateExactValue({
      value,
      file: 'service.yaml',
      path: 'domain.regulated',
      expected: true,
      message: 'Credential vault service must remain regulated.'
    }),
    ...validateExactValue({
      value,
      file: 'service.yaml',
      path: 'data.owner_domain',
      expected: 'privacy',
      message: 'Credential vault service must keep `privacy` as data owner domain.'
    }),
    ...validateExactValue({
      value,
      file: 'service.yaml',
      path: 'data.crypto_key_material',
      expected: true,
      message: 'Credential vault service must declare crypto key material handling.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: 'service.yaml',
      path: 'data.classes',
      field: 'data.classes',
      requiredEntries: ['oauth-tokens', 'credentials']
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: 'service.yaml',
      path: 'data.datastores',
      field: 'data.datastores',
      requiredEntries: ['privacy_credential_vault']
    }),
    ...validateExactValue({
      value,
      file: 'service.yaml',
      path: 'audit.required',
      expected: true,
      message: 'Credential vault service must require audit.'
    }),
    ...validateExactValue({
      value,
      file: 'service.yaml',
      path: 'audit.immutable',
      expected: true,
      message: 'Credential vault audit must remain immutable.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: 'service.yaml',
      path: 'audit.events',
      field: 'audit.events',
      requiredEntries: REQUIRED_AUDIT_EVENTS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: 'service.yaml',
      path: 'human_review_required',
      field: 'human_review_required',
      requiredEntries: [
        'credential class changes',
        'break-glass policy changes',
        'capability issuance contract changes',
        'storage, backup, restore, or deletion contract changes'
      ]
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: 'service.yaml',
      path: 'exit.kill_criteria',
      field: 'exit.kill_criteria',
      requiredEntries: [
        'refresh tokens or webhook secrets are stored in product repositories',
        'connector repositories cache provider credentials locally',
        'audit records, logs, or restore evidence include raw credential material'
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
      createCredentialDiagnostic(
        PACKAGE_FILE,
        `scripts.${script}`,
        `Credential vault package must declare \`${script}\` script.`
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
      createCredentialDiagnostic(
        PACKAGE_FILE,
        'scripts.check',
        `Credential vault package \`check\` script must include \`${fragment}\`.`
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
    REQUIRED_CREDENTIAL_CHECKER_FILES.map((file) =>
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
          requiredFragments: ['runCredentialVaultContractCheckCli']
        })),
    ...(parserSource.source === null
      ? []
      : validateSourceIncludes({
          file: CHECKER_PARSER_FILE,
          source: parserSource.source,
          requiredFragments: [
            'service.yaml',
            CREDENTIAL_BOUNDARY_FILE,
            CAPABILITY_ISSUANCE_FILE,
            ACCESS_AUDIT_FILE,
            STORAGE_BOUNDARY_FILE
          ]
        })),
    ...(validatorSource.source === null
      ? []
      : [
          ...validateSourceIncludes({
            file: CHECKER_VALIDATOR_FILE,
            source: validatorSource.source,
            requiredFragments: [
              'MAX_CAPABILITY_TTL_SECONDS',
              'requirePositiveSafeInteger',
              'CRED_RUST_CREDENTIAL_CLASS_DRIFT',
              'RUST_MARKER_EXPECTATIONS',
              'RUST_WEAK_CRYPTO_PATTERNS'
            ]
          }),
          ...validateSourceFunctionIncludes({
            file: CHECKER_VALIDATOR_FILE,
            source: validatorSource.source,
            functionName: 'validateCredentialBoundary',
            requiredFragments: ['CRED_BOUNDARY_TTL_NOT_POSITIVE_INTEGER']
          }),
          ...validateSourceFunctionIncludes({
            file: CHECKER_VALIDATOR_FILE,
            source: validatorSource.source,
            functionName: 'validateCredentialClass',
            requiredFragments: ['CRED_CLASS_PLAINTEXT_EXPORT_ALLOWED']
          }),
          ...validateSourceFunctionIncludes({
            file: CHECKER_VALIDATOR_FILE,
            source: validatorSource.source,
            functionName: 'validateCapabilityIssuance',
            requiredFragments: [
              'CRED_CAPABILITY_TTL_TOO_HIGH',
              'CRED_CAPABILITY_TTL_NOT_POSITIVE_INTEGER',
              'CRED_CAPABILITY_RENEWAL_LEAD_NOT_POSITIVE_INTEGER',
              'CRED_CAPABILITY_RENEWAL_CHAIN_NOT_POSITIVE_INTEGER',
              'CRED_CAPABILITY_EDGE_CACHE_TTL_NOT_POSITIVE_INTEGER',
              'CRED_CAPABILITY_CONNECTOR_PERSISTENCE_ALLOWED',
              'CRED_CAPABILITY_STATELESS_DEFAULT_ALLOWED'
            ]
          }),
          ...validateSourceFunctionIncludes({
            file: CHECKER_VALIDATOR_FILE,
            source: validatorSource.source,
            functionName: 'validateAccessAudit',
            requiredFragments: ['CRED_AUDIT_FORBIDDEN_VALUE_MISSING']
          }),
          ...validateSourceFunctionIncludes({
            file: CHECKER_VALIDATOR_FILE,
            source: validatorSource.source,
            functionName: 'validateStorageBoundary',
            requiredFragments: ['CRED_RESTORE_SECRET_VALUES_ALLOWED']
          }),
          ...validateSourceFunctionIncludes({
            file: CHECKER_VALIDATOR_FILE,
            source: validatorSource.source,
            functionName: 'validateRustSecurityPatterns',
            requiredFragments: ['CRED_RUST_SECRET_LOGGING_PATTERN']
          })
        ]),
    ...(validatorSource.source === null
      ? []
      : validateSourceCodeIncludes({
          file: CHECKER_VALIDATOR_FILE,
          source: validatorSource.source,
          requiredFragments: [
            'export function validateCredentialVaultContracts',
            'function validateCredentialBoundary',
            'function validateCapabilityIssuance',
            'function validateAccessAudit',
            'function validateStorageBoundary',
            'function validateRustBoundaryMarkers',
            'function validateRustSecurityPatterns'
          ]
        })),
    ...(testSource.source === null
      ? []
      : validateSourceCodeIncludes({
          file: CHECKER_TEST_FILE,
          source: testSource.source,
          requiredFragments: [
            'validateCredentialVaultContracts',
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
            'validates the committed credential vault contracts',
            'fails when a credential class allows plaintext export',
            'fails when capability ttl is longer than five minutes',
            'fails when capability ttl and renewal windows are not positive integers',
            'fails when connector repositories can persist capabilities',
            'fails when stateless credential capabilities are allowed by default',
            'fails when audit records can include encrypted credential payloads',
            'fails when restore evidence can include secret values',
            'fails when Rust boundary markers drift from YAML contracts',
            'fails when Rust source introduces weak crypto or secret logging patterns'
          ]
        }))
  ];
}

async function validateRuntimeSurface(
  repositoryRoot: string,
  contracts: CredentialVaultContractValues | null
): Promise<readonly Diagnostic[]> {
  const [
    cargo,
    cargoLock,
    libSource,
    mainSource,
    boundaryModSource,
    credentialBoundarySource,
    capabilityIssuanceSource,
    accessAuditSource,
    storageBoundarySource
  ] = await Promise.all(
    REQUIRED_CREDENTIAL_RUNTIME_FILES.map((file) =>
      readOptionalTextFile(repositoryRoot, file)
    )
  );

  return [
    ...cargo.diagnostics,
    ...cargoLock.diagnostics,
    ...libSource.diagnostics,
    ...mainSource.diagnostics,
    ...boundaryModSource.diagnostics,
    ...credentialBoundarySource.diagnostics,
    ...capabilityIssuanceSource.diagnostics,
    ...accessAuditSource.diagnostics,
    ...storageBoundarySource.diagnostics,
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
            '"credential-vault"',
            'pub const DEFAULT_BIND_ADDR',
            '"127.0.0.1:3005"',
            'ZDP_CREDENTIAL_VAULT_BIND_ADDR',
            '.route("/healthz", get(healthz))',
            '.route("/readyz", get(readyz))',
            'ready: true',
            'checks:',
            '"contracts"',
            'healthz_returns_credential_vault_identity',
            'readyz_reports_contract_readiness_only',
            'credential_boundaries_do_not_export_or_cache_plaintext_secret_material',
            'can_export_plaintext_secret',
            'can_cache_in_connector',
            'can_write_secret_to_audit_or_restore_evidence',
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
            'credential_boundary',
            'capability_issuance',
            'access_audit',
            'storage_boundary',
            'can_export_plaintext_secret',
            'can_cache_in_connector',
            'can_write_secret_to_audit_or_restore_evidence'
          ]
        })),
    ...(credentialBoundarySource.source === null
      ? []
      : validateSourceIncludes({
          file: RUNTIME_CREDENTIAL_BOUNDARY_FILE,
          source: credentialBoundarySource.source,
          requiredFragments: [
            'id: "credential_boundary"',
            'can_export_plaintext_secret: false',
            'can_cache_in_connector: false',
            'can_write_secret_to_audit_or_restore_evidence: false',
            'REQUIRED_CREDENTIAL_CLASSES',
            'oauth_refresh_token',
            'webhook_secret',
            'provider_api_credential',
            'FORBIDDEN_CREDENTIAL_VALUES',
            'raw_oauth_refresh_token',
            'raw_webhook_secret',
            'raw_provider_api_credential',
            'authorization_header',
            'cookie'
          ]
        })),
    ...(capabilityIssuanceSource.source === null
      ? []
      : validateSourceIncludes({
          file: RUNTIME_CAPABILITY_ISSUANCE_FILE,
          source: capabilityIssuanceSource.source,
          requiredFragments: [
            'MAX_CAPABILITY_TTL_SECONDS',
            '= 300',
            'id: "capability_issuance"',
            'can_export_plaintext_secret: false',
            'can_cache_in_connector: false',
            'can_write_secret_to_audit_or_restore_evidence: false',
            'REQUIRED_CAPABILITY_REQUEST_FIELDS',
            'service_id',
            'actor_id',
            'tenant_id',
            'purpose',
            'credential_ref',
            'scope',
            'idempotency_key',
            'request_id',
            'trace_id',
            'FORBIDDEN_CAPABILITY_VALUES',
            'plaintext_secret_return',
            'connector_local_cache',
            'analytics_event_export'
          ]
        })),
    ...(accessAuditSource.source === null
      ? []
      : validateSourceIncludes({
          file: RUNTIME_ACCESS_AUDIT_FILE,
          source: accessAuditSource.source,
          requiredFragments: [
            'id: "access_audit"',
            'can_export_plaintext_secret: false',
            'can_cache_in_connector: false',
            'can_write_secret_to_audit_or_restore_evidence: false',
            'REQUIRED_AUDIT_EVENTS',
            'credential.capability.issued',
            'credential.access.denied',
            'credential.break_glass.used',
            'credential.rotation.performed',
            'FORBIDDEN_AUDIT_VALUES',
            'raw_secret',
            'raw_token',
            'authorization_header',
            'cookie',
            'provider_payload',
            'encrypted_payload'
          ]
        })),
    ...(storageBoundarySource.source === null
      ? []
      : validateSourceIncludes({
          file: RUNTIME_STORAGE_BOUNDARY_FILE,
          source: storageBoundarySource.source,
          requiredFragments: [
            'id: "storage_boundary"',
            'can_export_plaintext_secret: false',
            'can_cache_in_connector: false',
            'can_write_secret_to_audit_or_restore_evidence: false',
            'ALLOWED_INTERFACES',
            'capability_issue',
            'credential_proxy_use',
            'webhook_signature_verify',
            'credential_rotation',
            'credential_revoke',
            'FORBIDDEN_STORAGE_LOCATIONS',
            'product_repository',
            'connector_repository',
            'analytics_event',
            'logs',
            'public_discovery'
          ]
        })),
    ...(contracts === null
      ? []
      : validateRustSemanticMarkers({
          contracts,
          sources: [
            [RUNTIME_CREDENTIAL_BOUNDARY_FILE, credentialBoundarySource.source],
            [RUNTIME_CAPABILITY_ISSUANCE_FILE, capabilityIssuanceSource.source],
            [RUNTIME_ACCESS_AUDIT_FILE, accessAuditSource.source],
            [RUNTIME_STORAGE_BOUNDARY_FILE, storageBoundarySource.source]
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
      createCredentialDiagnostic(
        input.file,
        'source',
        `Credential vault checker source must include \`${fragment}\`.`
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
      createCredentialDiagnostic(
        input.file,
        'source',
        `Credential vault checker source must include code fragment \`${fragment}\`.`
      )
    );
  }

  return diagnostics;
}

function validateSourceFunctionIncludes(input: {
  readonly file: string;
  readonly source: string;
  readonly functionName: string;
  readonly requiredFragments: readonly string[];
}): readonly Diagnostic[] {
  const body = readFunctionBody(input.source, input.functionName);
  const diagnostics: Diagnostic[] = [];

  if (body === null) {
    return [
      createCredentialDiagnostic(
        input.file,
        'source',
        `Credential vault checker source must include function \`${input.functionName}\`.`
      )
    ];
  }

  for (const fragment of input.requiredFragments) {
    if (body.includes(fragment)) {
      continue;
    }

    diagnostics.push(
      createCredentialDiagnostic(
        input.file,
        'source',
        `Credential vault checker function \`${input.functionName}\` must use \`${fragment}\`.`
      )
    );
  }

  return diagnostics;
}

function validateRustSemanticMarkers(input: {
  readonly contracts: CredentialVaultContractValues;
  readonly sources: readonly (readonly [string, string | null])[];
}): readonly Diagnostic[] {
  const sourcesByFile = new Map<string, string>();
  for (const [file, source] of input.sources) {
    if (source !== null) {
      sourcesByFile.set(file, source);
    }
  }

  const diagnostics: Diagnostic[] = [];

  for (const expectation of RUST_MARKER_EXPECTATIONS) {
    const source = sourcesByFile.get(expectation.file);
    if (source === undefined) {
      continue;
    }

    const actual = readRustStringArrayConstant(source, expectation.constName);
    if (actual === undefined) {
      diagnostics.push(
        createCredentialDiagnostic(
          expectation.file,
          expectation.constName,
          `Credential vault Rust marker must declare \`${expectation.constName}\`.`
        )
      );
      continue;
    }

    diagnostics.push(
      ...validateExactStringSet({
        actual,
        expected: expectation.expectedEntries(input.contracts),
        file: expectation.file,
        path: expectation.yamlPath,
        label: `Rust marker \`${expectation.constName}\``
      })
    );
  }

  const capabilitySource = sourcesByFile.get(RUNTIME_CAPABILITY_ISSUANCE_FILE);
  if (capabilitySource === undefined) {
    return diagnostics;
  }

  const rustTtl = readRustNumberConstant(
    capabilitySource,
    'MAX_CAPABILITY_TTL_SECONDS'
  );
  if (rustTtl === undefined) {
    diagnostics.push(
      createCredentialDiagnostic(
        RUNTIME_CAPABILITY_ISSUANCE_FILE,
        'MAX_CAPABILITY_TTL_SECONDS',
        'Credential vault Rust marker must declare `MAX_CAPABILITY_TTL_SECONDS`.'
      )
    );
    return diagnostics;
  }

  const capabilityTtl = readPath(
    input.contracts.capabilityIssuance,
    'max_ttl_seconds'
  );
  const boundaryTtl = readPath(
    input.contracts.credentialBoundary,
    'capabilities.max_ttl_seconds'
  );

  if (rustTtl !== capabilityTtl || rustTtl !== boundaryTtl) {
    diagnostics.push(
      createCredentialDiagnostic(
        RUNTIME_CAPABILITY_ISSUANCE_FILE,
        'MAX_CAPABILITY_TTL_SECONDS',
        'Credential vault Rust capability TTL marker must match credential-boundary.yaml and capability-issuance.yaml.'
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

  if (requiredRules.includes(CREDENTIAL_VAULT_RULE_ID)) {
    return [];
  }

  return [
    createCredentialDiagnostic(
      'service.yaml',
      'policy_gates.required_linter_rules',
      `Credential vault service contract must require \`${CREDENTIAL_VAULT_RULE_ID}\`.`
    )
  ];
}
