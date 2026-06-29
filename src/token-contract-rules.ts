import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { Diagnostic } from './diagnostics.ts';

const TOKEN_PROTOCOL_REPOSITORY_NAME = 'zdp-token-protocol';
const TOKEN_INDEXER_REPOSITORY_NAME = 'zdp-token-indexer';
const TOKEN_AUTHORITY_RULE_ID = 'ZDP-TOKEN-001';
const TOKEN_CHAIN_FACT_RULE_ID = 'ZDP-TOKEN-002';
const TOKEN_SUI_API_RULE_ID = 'ZDP-TOKEN-003';
const TOKEN_AUTHORITY_MATRIX_FILE = 'contracts/token-authority-matrix.yaml';
const TOKEN_CHAIN_FACT_FILE = 'contracts/chain-fact-contract.yaml';
const TOKEN_SUI_API_SELECTION_FILE = 'contracts/sui-api-selection.yaml';

const REQUIRED_CAPABILITIES = [
  'TreasuryCap',
  'UpgradeCap',
  'DenyCapV2',
  'MetadataCap',
  'PauseCap',
  'migration_config_cap',
  'PAS_POLICY_CAP_OR_APPROVAL_WITNESS'
] as const;

const REQUIRED_CAPABILITY_FIELDS = [
  'owner_boundary',
  'approver_boundary',
  'signer_threshold',
  'timelock_policy',
  'rotation_policy',
  'revocation_policy',
  'monitoring_policy',
  'emergency_replacement_policy'
] as const;

const REQUIRED_FORBIDDEN_HOLDERS = [
  'zdp-money-platform',
  'zdp-core-platform',
  'zdp-token-indexer',
  'hot_wallet_singleton'
] as const;

const REQUIRED_CUSTODY_FORBIDDEN_OWNERS = [
  'zdp-money-platform',
  'zdp-core-platform',
  'zdp-token-indexer',
  'ci'
] as const;

const REQUIRED_CHAIN_FACT_FIELDS = [
  'checkpoint_sequence',
  'transaction_digest',
  'event_sequence',
  'source_kind',
  'object_id',
  'package_id',
  'original_package_id',
  'emitting_package_id',
  'type_origin_package_id',
  'module',
  'event_type',
  'raw_bcs',
  'parsed_payload',
  'canonical_fact_id',
  'canonical_status',
  'quarantine_reason',
  'processed_at'
] as const;

const REQUIRED_CHAIN_FACT_SOURCES = [
  'checkpoint',
  'transaction_effects',
  'object_changes',
  'move_event',
  'bcs_payload'
] as const;

const FORBIDDEN_INDEXER_RESPONSIBILITIES = [
  'signing',
  'custody',
  'ledger_posting',
  'mint_burn_correction',
  'customer_right_source_of_truth'
] as const;

const ALLOWED_SUI_API_BASELINES = [
  'grpc',
  'graphql',
  'core_api',
  'grpc_core_api'
] as const;

const REQUIRED_EVALUATED_SUI_APIS = [
  'grpc',
  'graphql',
  'core_api',
  'archival_provider',
  'json_rpc_legacy'
] as const;

const REQUIRED_SUI_API_SELECTION_EVIDENCE = [
  'baseline',
  'fallback',
  'latest_official_docs_review_ref',
  'migration_guide_review_ref',
  'archival_provider_policy',
  'endpoint_config_owner'
] as const;

export async function validateRepositoryTokenContracts(input: {
  readonly repositoryRoot: string | undefined;
  readonly repositoryServiceContract: unknown;
}): Promise<readonly Diagnostic[]> {
  if (input.repositoryRoot === undefined) {
    return [];
  }

  const repositoryName = readRepositoryName(input.repositoryServiceContract);

  if (repositoryName === TOKEN_PROTOCOL_REPOSITORY_NAME) {
    return [
      ...(await validateRepositoryTokenProtocolContract(input.repositoryRoot)),
      ...(await validateRepositorySuiApiSelectionContract(
        input.repositoryRoot,
        repositoryName
      ))
    ];
  }

  if (repositoryName === TOKEN_INDEXER_REPOSITORY_NAME) {
    return [
      ...(await validateRepositoryTokenIndexerContract(input.repositoryRoot)),
      ...(await validateRepositorySuiApiSelectionContract(
        input.repositoryRoot,
        repositoryName
      ))
    ];
  }

  return [];
}

async function validateRepositoryTokenProtocolContract(
  repositoryRoot: string
): Promise<readonly Diagnostic[]> {
  const contract = await readRequiredYamlContract(
    repositoryRoot,
    {
      ruleId: TOKEN_AUTHORITY_RULE_ID,
      missingMessage: (relativePath) =>
        `Token protocol repository must include \`${relativePath}\`.`,
      parseMessage: (relativePath, error) =>
        `Token protocol contract \`${relativePath}\` could not be read or parsed: ${formatError(error)}`
    },
    TOKEN_AUTHORITY_MATRIX_FILE
  );

  if (contract.diagnostics.length > 0) {
    return contract.diagnostics;
  }

  return validateTokenAuthorityMatrix(contract.value);
}

async function validateRepositoryTokenIndexerContract(
  repositoryRoot: string
): Promise<readonly Diagnostic[]> {
  const contract = await readRequiredYamlContract(
    repositoryRoot,
    {
      ruleId: TOKEN_CHAIN_FACT_RULE_ID,
      missingMessage: (relativePath) =>
        `Token indexer repository must include \`${relativePath}\`.`,
      parseMessage: (relativePath, error) =>
        `Token indexer contract \`${relativePath}\` could not be read or parsed: ${formatError(error)}`
    },
    TOKEN_CHAIN_FACT_FILE
  );

  if (contract.diagnostics.length > 0) {
    return contract.diagnostics;
  }

  return validateTokenChainFactContract(contract.value);
}

async function validateRepositorySuiApiSelectionContract(
  repositoryRoot: string,
  repositoryName: string
): Promise<readonly Diagnostic[]> {
  const contract = await readRequiredYamlContract(
    repositoryRoot,
    {
      ruleId: TOKEN_SUI_API_RULE_ID,
      missingMessage: (relativePath) =>
        `Token repository must include \`${relativePath}\` before choosing a Sui API integration baseline.`,
      parseMessage: (relativePath, error) =>
        `Sui API selection contract \`${relativePath}\` could not be read or parsed: ${formatError(error)}`
    },
    TOKEN_SUI_API_SELECTION_FILE
  );

  if (contract.diagnostics.length > 0) {
    return contract.diagnostics;
  }

  return validateSuiApiSelectionContract(contract.value, repositoryName);
}

function validateTokenAuthorityMatrix(value: unknown): readonly Diagnostic[] {
  return [
    ...validateExactValue({
      value,
      ruleId: TOKEN_AUTHORITY_RULE_ID,
      file: TOKEN_AUTHORITY_MATRIX_FILE,
      path: 'contract.owner',
      expected: TOKEN_PROTOCOL_REPOSITORY_NAME,
      message:
        'Token authority matrix contract must declare owner `zdp-token-protocol`.'
    }),
    ...validateExactValue({
      value,
      ruleId: TOKEN_AUTHORITY_RULE_ID,
      file: TOKEN_AUTHORITY_MATRIX_FILE,
      path: 'contract.status',
      expected: 'lab_only_no_mainnet',
      message:
        'Token authority matrix must stay lab-only and must not claim mainnet readiness.'
    }),
    ...validateRequiredStringEntries({
      value,
      ruleId: TOKEN_AUTHORITY_RULE_ID,
      file: TOKEN_AUTHORITY_MATRIX_FILE,
      path: 'authority_matrix.required_capabilities',
      requiredEntries: REQUIRED_CAPABILITIES,
      label: 'Token authority matrix'
    }),
    ...validateRequiredStringEntries({
      value,
      ruleId: TOKEN_AUTHORITY_RULE_ID,
      file: TOKEN_AUTHORITY_MATRIX_FILE,
      path: 'authority_matrix.capability_required_fields',
      requiredEntries: REQUIRED_CAPABILITY_FIELDS,
      label: 'Token capability field contract'
    }),
    ...validateExactValue({
      value,
      ruleId: TOKEN_AUTHORITY_RULE_ID,
      file: TOKEN_AUTHORITY_MATRIX_FILE,
      path: 'authority_separation.supply_upgrade_compliance_emergency_split',
      expected: true,
      message:
        'Token authority matrix must keep supply, upgrade, compliance, and emergency authorities split.'
    }),
    ...validateExactValue({
      value,
      ruleId: TOKEN_AUTHORITY_RULE_ID,
      file: TOKEN_AUTHORITY_MATRIX_FILE,
      path: 'authority_separation.single_admin_cap_allowed',
      expected: false,
      message: 'Token authority matrix must forbid a single unlimited `AdminCap`.'
    }),
    ...validateExactValue({
      value,
      ruleId: TOKEN_AUTHORITY_RULE_ID,
      file: TOKEN_AUTHORITY_MATRIX_FILE,
      path: 'authority_separation.single_hot_wallet_allowed',
      expected: false,
      message:
        'Token authority matrix must forbid single hot wallet custody of privileged capabilities.'
    }),
    ...validateRequiredStringEntries({
      value,
      ruleId: TOKEN_AUTHORITY_RULE_ID,
      file: TOKEN_AUTHORITY_MATRIX_FILE,
      path: 'authority_separation.forbidden_holders',
      requiredEntries: REQUIRED_FORBIDDEN_HOLDERS,
      label: 'Token authority forbidden holder contract'
    }),
    ...validateExactValue({
      value,
      ruleId: TOKEN_AUTHORITY_RULE_ID,
      file: TOKEN_AUTHORITY_MATRIX_FILE,
      path: 'custody_boundary.default_model',
      expected: 'self_custody',
      message:
        'Token custody boundary must keep self-custody as the default model.'
    }),
    ...validateExactValue({
      value,
      ruleId: TOKEN_AUTHORITY_RULE_ID,
      file: TOKEN_AUTHORITY_MATRIX_FILE,
      path: 'custody_boundary.managed_custody_requires_gate',
      expected: true,
      message:
        'Token custody boundary must require a separate gate before managed or custodial operation.'
    }),
    ...validateRequiredStringEntries({
      value,
      ruleId: TOKEN_AUTHORITY_RULE_ID,
      file: TOKEN_AUTHORITY_MATRIX_FILE,
      path: 'custody_boundary.forbidden_runtime_owners',
      requiredEntries: REQUIRED_CUSTODY_FORBIDDEN_OWNERS,
      label: 'Token custody forbidden runtime owner contract'
    })
  ];
}

function validateSuiApiSelectionContract(
  value: unknown,
  repositoryName: string
): readonly Diagnostic[] {
  return [
    ...validateExactValue({
      value,
      ruleId: TOKEN_SUI_API_RULE_ID,
      file: TOKEN_SUI_API_SELECTION_FILE,
      path: 'contract.owner',
      expected: repositoryName,
      message: `Sui API selection contract must declare owner \`${repositoryName}\`.`
    }),
    ...validateExactValue({
      value,
      ruleId: TOKEN_SUI_API_RULE_ID,
      file: TOKEN_SUI_API_SELECTION_FILE,
      path: 'sui_api.latest_official_docs_review_required',
      expected: true,
      message:
        'Sui API selection must require a latest official docs review before implementation.'
    }),
    ...validateExactValue({
      value,
      ruleId: TOKEN_SUI_API_RULE_ID,
      file: TOKEN_SUI_API_SELECTION_FILE,
      path: 'sui_api.migration_guide_review_required',
      expected: true,
      message:
        'Sui API selection must require Sui SDK/API migration guide review before implementation.'
    }),
    ...validateExactValue({
      value,
      ruleId: TOKEN_SUI_API_RULE_ID,
      file: TOKEN_SUI_API_SELECTION_FILE,
      path: 'sui_api.archival_provider_policy_required',
      expected: true,
      message:
        'Sui API selection must keep archival provider or archival storage policy review as an explicit requirement.'
    }),
    ...validateExactValue({
      value,
      ruleId: TOKEN_SUI_API_RULE_ID,
      file: TOKEN_SUI_API_SELECTION_FILE,
      path: 'sui_api.endpoint_config_single_source',
      expected: true,
      message:
        'Sui API selection must keep network, RPC/API endpoint, GraphQL endpoint, package id, and registry id under one config owner.'
    }),
    ...validateAllowedStringValue({
      value,
      ruleId: TOKEN_SUI_API_RULE_ID,
      file: TOKEN_SUI_API_SELECTION_FILE,
      path: 'sui_api.baseline',
      allowedValues: ALLOWED_SUI_API_BASELINES,
      label: 'Sui API baseline'
    }),
    ...validateForbiddenScalarValue({
      value,
      ruleId: TOKEN_SUI_API_RULE_ID,
      file: TOKEN_SUI_API_SELECTION_FILE,
      path: 'sui_api.baseline',
      forbiddenValue: 'json_rpc',
      message:
        'Sui API selection must not use JSON-RPC as the baseline for new token integrations.'
    }),
    ...validateExactValue({
      value,
      ruleId: TOKEN_SUI_API_RULE_ID,
      file: TOKEN_SUI_API_SELECTION_FILE,
      path: 'sui_api.json_rpc_role',
      expected: 'legacy_compatibility_only',
      message:
        'Sui API selection must keep JSON-RPC as a legacy compatibility path, not the new integration baseline.'
    }),
    ...validateRequiredStringEntries({
      value,
      ruleId: TOKEN_SUI_API_RULE_ID,
      file: TOKEN_SUI_API_SELECTION_FILE,
      path: 'sui_api.evaluated_apis',
      requiredEntries: REQUIRED_EVALUATED_SUI_APIS,
      label: 'Sui API evaluated API contract'
    }),
    ...validateRequiredStringEntries({
      value,
      ruleId: TOKEN_SUI_API_RULE_ID,
      file: TOKEN_SUI_API_SELECTION_FILE,
      path: 'sui_api.required_selection_evidence',
      requiredEntries: REQUIRED_SUI_API_SELECTION_EVIDENCE,
      label: 'Sui API selection evidence contract'
    })
  ];
}

function validateTokenChainFactContract(value: unknown): readonly Diagnostic[] {
  return [
    ...validateExactValue({
      value,
      ruleId: TOKEN_CHAIN_FACT_RULE_ID,
      file: TOKEN_CHAIN_FACT_FILE,
      path: 'contract.owner',
      expected: TOKEN_INDEXER_REPOSITORY_NAME,
      message:
        'Token chain fact contract must declare owner `zdp-token-indexer`.'
    }),
    ...validateExactValue({
      value,
      ruleId: TOKEN_CHAIN_FACT_RULE_ID,
      file: TOKEN_CHAIN_FACT_FILE,
      path: 'contract.status',
      expected: 'lab_only_no_product_rights',
      message:
        'Token chain fact contract must stay lab-only until product rights or balance projections are approved.'
    }),
    ...validateRequiredStringEntries({
      value,
      ruleId: TOKEN_CHAIN_FACT_RULE_ID,
      file: TOKEN_CHAIN_FACT_FILE,
      path: 'chain_fact.sources',
      requiredEntries: REQUIRED_CHAIN_FACT_SOURCES,
      label: 'Token chain fact source contract'
    }),
    ...validateRequiredStringEntries({
      value,
      ruleId: TOKEN_CHAIN_FACT_RULE_ID,
      file: TOKEN_CHAIN_FACT_FILE,
      path: 'chain_fact.required_fields',
      requiredEntries: REQUIRED_CHAIN_FACT_FIELDS,
      label: 'Token chain fact field contract'
    }),
    ...validateExactValue({
      value,
      ruleId: TOKEN_CHAIN_FACT_RULE_ID,
      file: TOKEN_CHAIN_FACT_FILE,
      path: 'chain_fact.observed_event',
      expected: 'chain.fact.observed',
      message:
        'Token chain fact contract must keep `chain.fact.observed` as the canonical observed fact event.'
    }),
    ...validateExactValue({
      value,
      ruleId: TOKEN_CHAIN_FACT_RULE_ID,
      file: TOKEN_CHAIN_FACT_FILE,
      path: 'chain_fact.quarantined_event',
      expected: 'chain.fact.quarantined',
      message:
        'Token chain fact contract must keep `chain.fact.quarantined` for observations that cannot be interpreted safely.'
    }),
    ...validateExactValue({
      value,
      ruleId: TOKEN_CHAIN_FACT_RULE_ID,
      file: TOKEN_CHAIN_FACT_FILE,
      path: 'chain_fact.replay_required',
      expected: true,
      message:
        'Token indexer chain facts must remain replayable from checkpoint/effects/object-change evidence.'
    }),
    ...validateExactValue({
      value,
      ruleId: TOKEN_CHAIN_FACT_RULE_ID,
      file: TOKEN_CHAIN_FACT_FILE,
      path: 'chain_fact.quarantine_required',
      expected: true,
      message:
        'Token indexer chain facts must keep quarantine for unknown package, type, amount, checkpoint, or event/effects mismatch cases.'
    }),
    ...validateForbiddenStringEntries({
      value,
      ruleId: TOKEN_CHAIN_FACT_RULE_ID,
      file: TOKEN_CHAIN_FACT_FILE,
      path: 'indexer.allowed_responsibilities',
      forbiddenEntries: FORBIDDEN_INDEXER_RESPONSIBILITIES,
      label: 'Token indexer responsibility contract'
    }),
    ...validateRequiredStringEntries({
      value,
      ruleId: TOKEN_CHAIN_FACT_RULE_ID,
      file: TOKEN_CHAIN_FACT_FILE,
      path: 'money_consumption.required_gates',
      requiredEntries: [
        'approved_business_request',
        'idempotency_key',
        'amount_invariant',
        'package_version_allowlist',
        'replay_state'
      ],
      label: 'Money chain fact consumption gate'
    })
  ];
}

async function readRequiredYamlContract(
  repositoryRoot: string,
  rule: {
    readonly ruleId: string;
    readonly missingMessage: (relativePath: string) => string;
    readonly parseMessage: (relativePath: string, error: unknown) => string;
  },
  relativePath: string
): Promise<{
  readonly value: unknown;
  readonly diagnostics: readonly Diagnostic[];
}> {
  try {
    const source = await readFile(join(repositoryRoot, relativePath), 'utf8');

    return {
      value: parse(source) as unknown,
      diagnostics: []
    };
  } catch (error) {
    if (isMissingPathError(error)) {
      return {
        value: null,
        diagnostics: [
          createTokenDiagnostic(
            rule.ruleId,
            relativePath,
            'repository.root',
            rule.missingMessage(relativePath)
          )
        ]
      };
    }

    return {
      value: null,
      diagnostics: [
        createTokenDiagnostic(
          rule.ruleId,
          relativePath,
          'yaml',
          rule.parseMessage(relativePath, error)
        )
      ]
    };
  }
}

function validateExactValue(input: {
  readonly value: unknown;
  readonly ruleId: string;
  readonly file: string;
  readonly path: string;
  readonly expected: unknown;
  readonly message: string;
}): readonly Diagnostic[] {
  return readPath(input.value, input.path) === input.expected
    ? []
    : [
        createTokenDiagnostic(
          input.ruleId,
          input.file,
          input.path,
          input.message
        )
      ];
}

function validateRequiredStringEntries(input: {
  readonly value: unknown;
  readonly ruleId: string;
  readonly file: string;
  readonly path: string;
  readonly requiredEntries: readonly string[];
  readonly label: string;
}): readonly Diagnostic[] {
  const candidate = readPath(input.value, input.path);

  if (!Array.isArray(candidate)) {
    return [
      createTokenDiagnostic(
        input.ruleId,
        input.file,
        input.path,
        `${input.label} must declare \`${input.path}\` as a string list.`
      )
    ];
  }

  const entries = candidate.flatMap((entry) =>
    typeof entry === 'string' && entry.trim().length > 0 ? [entry.trim()] : []
  );
  const diagnostics: Diagnostic[] = [];

  if (entries.length !== candidate.length) {
    diagnostics.push(
      createTokenDiagnostic(
        input.ruleId,
        input.file,
        input.path,
        `${input.label} must declare only non-empty string entries in \`${input.path}\`.`
      )
    );
  }

  for (const requiredEntry of input.requiredEntries) {
    if (entries.includes(requiredEntry)) {
      continue;
    }

    diagnostics.push(
      createTokenDiagnostic(
        input.ruleId,
        input.file,
        input.path,
        `${input.label} must include \`${requiredEntry}\` in \`${input.path}\`.`
      )
    );
  }

  return diagnostics;
}

function validateAllowedStringValue(input: {
  readonly value: unknown;
  readonly ruleId: string;
  readonly file: string;
  readonly path: string;
  readonly allowedValues: readonly string[];
  readonly label: string;
}): readonly Diagnostic[] {
  const candidate = readPath(input.value, input.path);

  if (typeof candidate !== 'string' || candidate.trim().length === 0) {
    return [
      createTokenDiagnostic(
        input.ruleId,
        input.file,
        input.path,
        `${input.label} must declare \`${input.path}\` as a non-empty string.`
      )
    ];
  }

  const normalized = candidate.trim();

  return input.allowedValues.includes(normalized)
    ? []
    : [
        createTokenDiagnostic(
          input.ruleId,
          input.file,
          input.path,
          `${input.label} must be one of: ${input.allowedValues.join(', ')}.`
        )
      ];
}

function validateForbiddenScalarValue(input: {
  readonly value: unknown;
  readonly ruleId: string;
  readonly file: string;
  readonly path: string;
  readonly forbiddenValue: unknown;
  readonly message: string;
}): readonly Diagnostic[] {
  return readPath(input.value, input.path) === input.forbiddenValue
    ? [
        createTokenDiagnostic(
          input.ruleId,
          input.file,
          input.path,
          input.message
        )
      ]
    : [];
}

function validateForbiddenStringEntries(input: {
  readonly value: unknown;
  readonly ruleId: string;
  readonly file: string;
  readonly path: string;
  readonly forbiddenEntries: readonly string[];
  readonly label: string;
}): readonly Diagnostic[] {
  const candidate = readPath(input.value, input.path);

  if (!Array.isArray(candidate)) {
    return [
      createTokenDiagnostic(
        input.ruleId,
        input.file,
        input.path,
        `${input.label} must declare \`${input.path}\` as a string list.`
      )
    ];
  }

  const entries = candidate.flatMap((entry) =>
    typeof entry === 'string' && entry.trim().length > 0 ? [entry.trim()] : []
  );
  const diagnostics: Diagnostic[] = [];

  if (entries.length !== candidate.length) {
    diagnostics.push(
      createTokenDiagnostic(
        input.ruleId,
        input.file,
        input.path,
        `${input.label} must declare only non-empty string entries in \`${input.path}\`.`
      )
    );
  }

  for (const forbiddenEntry of input.forbiddenEntries) {
    if (!entries.includes(forbiddenEntry)) {
      continue;
    }

    diagnostics.push(
      createTokenDiagnostic(
        input.ruleId,
        input.file,
        input.path,
        `${input.label} must not include \`${forbiddenEntry}\` in \`${input.path}\`.`
      )
    );
  }

  return diagnostics;
}

function readRepositoryName(value: unknown): string | null {
  if (!isRecord(value) || !isRecord(value.service)) {
    return null;
  }

  const candidate = value.service.repo;

  return typeof candidate === 'string' && candidate.trim().length > 0
    ? candidate.trim()
    : null;
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

function createTokenDiagnostic(
  ruleId: string,
  file: string,
  path: string,
  message: string
): Diagnostic {
  return {
    ruleId,
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
