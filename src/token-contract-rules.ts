import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { Diagnostic } from './diagnostics.ts';

const TOKEN_PROTOCOL_REPOSITORY_NAME = 'zdp-token-protocol';
const TOKEN_AUTHORITY_RULE_ID = 'ZDP-TOKEN-001';
const TOKEN_AUTHORITY_MATRIX_FILE = 'contracts/token-authority-matrix.yaml';

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

export async function validateRepositoryTokenProtocolContract(input: {
  readonly repositoryRoot: string | undefined;
  readonly repositoryServiceContract: unknown;
}): Promise<readonly Diagnostic[]> {
  if (
    input.repositoryRoot === undefined ||
    readRepositoryName(input.repositoryServiceContract) !==
      TOKEN_PROTOCOL_REPOSITORY_NAME
  ) {
    return [];
  }

  const contract = await readRequiredYamlContract(
    input.repositoryRoot,
    TOKEN_AUTHORITY_MATRIX_FILE
  );

  if (contract.diagnostics.length > 0) {
    return contract.diagnostics;
  }

  return validateTokenAuthorityMatrix(contract.value);
}

function validateTokenAuthorityMatrix(value: unknown): readonly Diagnostic[] {
  return [
    ...validateExactValue({
      value,
      path: 'contract.owner',
      expected: TOKEN_PROTOCOL_REPOSITORY_NAME,
      message:
        'Token authority matrix contract must declare owner `zdp-token-protocol`.'
    }),
    ...validateExactValue({
      value,
      path: 'contract.status',
      expected: 'lab_only_no_mainnet',
      message:
        'Token authority matrix must stay lab-only and must not claim mainnet readiness.'
    }),
    ...validateRequiredStringEntries({
      value,
      path: 'authority_matrix.required_capabilities',
      requiredEntries: REQUIRED_CAPABILITIES,
      label: 'Token authority matrix'
    }),
    ...validateRequiredStringEntries({
      value,
      path: 'authority_matrix.capability_required_fields',
      requiredEntries: REQUIRED_CAPABILITY_FIELDS,
      label: 'Token capability field contract'
    }),
    ...validateExactValue({
      value,
      path: 'authority_separation.supply_upgrade_compliance_emergency_split',
      expected: true,
      message:
        'Token authority matrix must keep supply, upgrade, compliance, and emergency authorities split.'
    }),
    ...validateExactValue({
      value,
      path: 'authority_separation.single_admin_cap_allowed',
      expected: false,
      message: 'Token authority matrix must forbid a single unlimited `AdminCap`.'
    }),
    ...validateExactValue({
      value,
      path: 'authority_separation.single_hot_wallet_allowed',
      expected: false,
      message:
        'Token authority matrix must forbid single hot wallet custody of privileged capabilities.'
    }),
    ...validateRequiredStringEntries({
      value,
      path: 'authority_separation.forbidden_holders',
      requiredEntries: REQUIRED_FORBIDDEN_HOLDERS,
      label: 'Token authority forbidden holder contract'
    }),
    ...validateExactValue({
      value,
      path: 'custody_boundary.default_model',
      expected: 'self_custody',
      message:
        'Token custody boundary must keep self-custody as the default model.'
    }),
    ...validateExactValue({
      value,
      path: 'custody_boundary.managed_custody_requires_gate',
      expected: true,
      message:
        'Token custody boundary must require a separate gate before managed or custodial operation.'
    }),
    ...validateRequiredStringEntries({
      value,
      path: 'custody_boundary.forbidden_runtime_owners',
      requiredEntries: REQUIRED_CUSTODY_FORBIDDEN_OWNERS,
      label: 'Token custody forbidden runtime owner contract'
    })
  ];
}

async function readRequiredYamlContract(
  repositoryRoot: string,
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
            relativePath,
            'repository.root',
            `Token protocol repository must include \`${relativePath}\`.`
          )
        ]
      };
    }

    return {
      value: null,
      diagnostics: [
        createTokenDiagnostic(
          relativePath,
          'yaml',
          `Token protocol contract \`${relativePath}\` could not be read or parsed: ${formatError(error)}`
        )
      ]
    };
  }
}

function validateExactValue(input: {
  readonly value: unknown;
  readonly path: string;
  readonly expected: unknown;
  readonly message: string;
}): readonly Diagnostic[] {
  return readPath(input.value, input.path) === input.expected
    ? []
    : [
        createTokenDiagnostic(
          TOKEN_AUTHORITY_MATRIX_FILE,
          input.path,
          input.message
        )
      ];
}

function validateRequiredStringEntries(input: {
  readonly value: unknown;
  readonly path: string;
  readonly requiredEntries: readonly string[];
  readonly label: string;
}): readonly Diagnostic[] {
  const candidate = readPath(input.value, input.path);

  if (!Array.isArray(candidate)) {
    return [
      createTokenDiagnostic(
        TOKEN_AUTHORITY_MATRIX_FILE,
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
        TOKEN_AUTHORITY_MATRIX_FILE,
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
        TOKEN_AUTHORITY_MATRIX_FILE,
        input.path,
        `${input.label} must include \`${requiredEntry}\` in \`${input.path}\`.`
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
  file: string,
  path: string,
  message: string
): Diagnostic {
  return {
    ruleId: TOKEN_AUTHORITY_RULE_ID,
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
