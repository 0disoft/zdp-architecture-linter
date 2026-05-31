import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { Diagnostic } from './diagnostics.ts';

const CREDENTIAL_VAULT_REPOSITORY_NAME = 'zdp-privacy-credential-vault';
const CREDENTIAL_VAULT_RULE_ID = 'ZDP-CREDENTIAL-001';

const CREDENTIAL_BOUNDARY_FILE = 'contracts/credential-boundary.yaml';
const CAPABILITY_ISSUANCE_FILE = 'contracts/capability-issuance.yaml';
const ACCESS_AUDIT_FILE = 'contracts/access-audit.yaml';
const STORAGE_BOUNDARY_FILE = 'contracts/storage-boundary.yaml';

const REQUIRED_CREDENTIAL_CLASSES = [
  'oauth_refresh_token',
  'webhook_secret',
  'provider_api_credential'
] as const;

const REQUIRED_FORBIDDEN_CONSUMERS = [
  'product_repositories',
  'connector_repositories',
  'ai_services',
  'analytics_services'
] as const;

const REQUIRED_FORBIDDEN_CREDENTIAL_VALUES = [
  'raw_oauth_refresh_token',
  'raw_webhook_secret',
  'raw_provider_api_credential',
  'authorization_header',
  'cookie'
] as const;

const REQUIRED_CAPABILITY_REQUEST_FIELDS = [
  'service_id',
  'actor_id',
  'tenant_id',
  'purpose',
  'credential_ref',
  'scope',
  'idempotency_key',
  'request_id',
  'trace_id'
] as const;

const REQUIRED_ALLOWED_OPERATIONS = [
  'credential_proxy_use',
  'webhook_signature_verify',
  'credential_rotation',
  'credential_revoke'
] as const;

const REQUIRED_CAPABILITY_FORBIDDEN_VALUES = [
  'plaintext_secret_return',
  'bearer_token_logging',
  'product_repo_persistence',
  'connector_local_cache',
  'ai_prompt_injection',
  'analytics_event_export'
] as const;

const REQUIRED_AUDIT_EVENTS = [
  'credential.capability.issued',
  'credential.access.denied',
  'credential.break_glass.used',
  'credential.rotation.performed'
] as const;

const REQUIRED_AUDIT_RECORD_FIELDS = [
  'event_id',
  'actor_id',
  'service_id',
  'tenant_id',
  'purpose',
  'credential_ref',
  'decision',
  'reason',
  'request_id',
  'trace_id'
] as const;

const REQUIRED_AUDIT_FORBIDDEN_VALUES = [
  'raw_secret',
  'raw_token',
  'authorization_header',
  'cookie',
  'provider_payload',
  'encrypted_payload'
] as const;

const REQUIRED_BREAK_GLASS_FIELDS = [
  'human_approval',
  'reason',
  'time_limit',
  'target_scope',
  'follow_up_review'
] as const;

const REQUIRED_ALLOWED_INTERFACES = [
  'capability_issue',
  'credential_proxy_use',
  'webhook_signature_verify',
  'credential_rotation',
  'credential_revoke'
] as const;

const REQUIRED_FORBIDDEN_STORAGE_LOCATIONS = [
  'product_repository',
  'connector_repository',
  'ai_repository',
  'analytics_event',
  'logs',
  'llms_txt',
  'public_discovery'
] as const;

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

  return [
    ...credentialBoundary.diagnostics,
    ...capabilityIssuance.diagnostics,
    ...accessAudit.diagnostics,
    ...storageBoundary.diagnostics,
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
    ...validateServiceContract(input.repositoryServiceContract),
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

function validateCredentialBoundaryContract(value: unknown): readonly Diagnostic[] {
  return [
    ...validateExactValue({
      value,
      file: CREDENTIAL_BOUNDARY_FILE,
      path: 'credential_owner',
      expected: CREDENTIAL_VAULT_REPOSITORY_NAME,
      message:
        'Credential boundary owner must remain `zdp-privacy-credential-vault`.'
    }),
    ...validateExactValue({
      value,
      file: CREDENTIAL_BOUNDARY_FILE,
      path: 'default_plaintext_export_allowed',
      expected: false,
      message: 'Credential boundary must default plaintext export to false.'
    }),
    ...validateCredentialClasses(value),
    ...validateRequiredStringArrayEntries({
      value,
      file: CREDENTIAL_BOUNDARY_FILE,
      path: 'forbidden_consumers',
      field: 'forbidden_consumers',
      requiredEntries: REQUIRED_FORBIDDEN_CONSUMERS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: CREDENTIAL_BOUNDARY_FILE,
      path: 'forbidden_values',
      field: 'forbidden_values',
      requiredEntries: REQUIRED_FORBIDDEN_CREDENTIAL_VALUES
    }),
    ...validateMaxNumber({
      value,
      file: CREDENTIAL_BOUNDARY_FILE,
      path: 'capabilities.max_ttl_seconds',
      max: 300,
      message: 'Credential capability max TTL must be 300 seconds or less.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: CREDENTIAL_BOUNDARY_FILE,
      path: 'capabilities.requester_must_identify',
      field: 'capabilities.requester_must_identify',
      requiredEntries: [
        'service_id',
        'actor_id',
        'tenant_id',
        'purpose',
        'credential_ref'
      ]
    })
  ];
}

function validateCredentialClasses(value: unknown): readonly Diagnostic[] {
  const classes = readRecordArrayPath(value, 'credential_classes');
  const diagnostics: Diagnostic[] = [];

  for (const requiredClass of REQUIRED_CREDENTIAL_CLASSES) {
    const credentialClass = classes.find(
      (entry) => readStringField(entry, 'id') === requiredClass
    );

    if (credentialClass === undefined) {
      diagnostics.push(
        createCredentialDiagnostic(
          CREDENTIAL_BOUNDARY_FILE,
          'credential_classes',
          `Credential boundary must declare credential class \`${requiredClass}\`.`
        )
      );
      continue;
    }

    diagnostics.push(
      ...validateExactValue({
        value: credentialClass,
        file: CREDENTIAL_BOUNDARY_FILE,
        path: 'plaintext_export_allowed',
        diagnosticPath: `credential_classes.${requiredClass}.plaintext_export_allowed`,
        expected: false,
        message:
          `Credential class \`${requiredClass}\` must set plaintext export to false.`
      }),
      ...validateExactValue({
        value: credentialClass,
        file: CREDENTIAL_BOUNDARY_FILE,
        path: 'encryption_required',
        diagnosticPath: `credential_classes.${requiredClass}.encryption_required`,
        expected: true,
        message: `Credential class \`${requiredClass}\` must require encryption.`
      }),
      ...validateExactValue({
        value: credentialClass,
        file: CREDENTIAL_BOUNDARY_FILE,
        path: 'audit_required',
        diagnosticPath: `credential_classes.${requiredClass}.audit_required`,
        expected: true,
        message: `Credential class \`${requiredClass}\` must require audit.`
      }),
      ...validateExactValue({
        value: credentialClass,
        file: CREDENTIAL_BOUNDARY_FILE,
        path: 'rotation_supported',
        diagnosticPath: `credential_classes.${requiredClass}.rotation_supported`,
        expected: true,
        message: `Credential class \`${requiredClass}\` must support rotation.`
      }),
      ...validateExactValue({
        value: credentialClass,
        file: CREDENTIAL_BOUNDARY_FILE,
        path: 'storage_scope',
        diagnosticPath: `credential_classes.${requiredClass}.storage_scope`,
        expected: 'vault_only',
        message:
          `Credential class \`${requiredClass}\` must keep storage scope at ` +
          '`vault_only`.'
      })
    );
  }

  return diagnostics;
}

function validateCapabilityIssuanceContract(value: unknown): readonly Diagnostic[] {
  return [
    ...validateExactValue({
      value,
      file: CAPABILITY_ISSUANCE_FILE,
      path: 'capability_owner',
      expected: CREDENTIAL_VAULT_REPOSITORY_NAME,
      message:
        'Credential capability owner must remain `zdp-privacy-credential-vault`.'
    }),
    ...validateExactValue({
      value,
      file: CAPABILITY_ISSUANCE_FILE,
      path: 'token_shape',
      expected: 'opaque_reference',
      message: 'Credential capabilities must use opaque references.'
    }),
    ...validateMaxNumber({
      value,
      file: CAPABILITY_ISSUANCE_FILE,
      path: 'max_ttl_seconds',
      max: 300,
      message: 'Credential capability max TTL must be 300 seconds or less.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: CAPABILITY_ISSUANCE_FILE,
      path: 'request_required',
      field: 'request_required',
      requiredEntries: REQUIRED_CAPABILITY_REQUEST_FIELDS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: CAPABILITY_ISSUANCE_FILE,
      path: 'allowed_operations',
      field: 'allowed_operations',
      requiredEntries: REQUIRED_ALLOWED_OPERATIONS
    }),
    ...validateExactValue({
      value,
      file: CAPABILITY_ISSUANCE_FILE,
      path: 'delegation.onward_delegation_allowed',
      expected: false,
      message: 'Credential capabilities must not allow onward delegation.'
    }),
    ...validateExactValue({
      value,
      file: CAPABILITY_ISSUANCE_FILE,
      path: 'delegation.bearer_logging_allowed',
      expected: false,
      message: 'Credential capabilities must not be loggable bearer tokens.'
    }),
    ...validateExactValue({
      value,
      file: CAPABILITY_ISSUANCE_FILE,
      path: 'delegation.persist_in_product_repo_allowed',
      expected: false,
      message: 'Product repositories must not persist credential capabilities.'
    }),
    ...validateExactValue({
      value,
      file: CAPABILITY_ISSUANCE_FILE,
      path: 'delegation.persist_in_connector_repo_allowed',
      expected: false,
      message: 'Connector repositories must not persist credential capabilities.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: CAPABILITY_ISSUANCE_FILE,
      path: 'forbidden',
      field: 'forbidden',
      requiredEntries: REQUIRED_CAPABILITY_FORBIDDEN_VALUES
    }),
    ...validateExactValue({
      value,
      file: CAPABILITY_ISSUANCE_FILE,
      path: 'revocation.supported',
      expected: true,
      message: 'Credential capabilities must support revocation.'
    }),
    ...validateExactValue({
      value,
      file: CAPABILITY_ISSUANCE_FILE,
      path: 'audit.reason_required',
      expected: true,
      message: 'Credential capability issuance must require an audit reason.'
    })
  ];
}

function validateAccessAuditContract(value: unknown): readonly Diagnostic[] {
  return [
    ...validateExactValue({
      value,
      file: ACCESS_AUDIT_FILE,
      path: 'audit_owner',
      expected: 'zdp-core-platform',
      message: 'Credential access audit owner must remain `zdp-core-platform`.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: ACCESS_AUDIT_FILE,
      path: 'events_required',
      field: 'events_required',
      requiredEntries: REQUIRED_AUDIT_EVENTS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: ACCESS_AUDIT_FILE,
      path: 'record_required',
      field: 'record_required',
      requiredEntries: REQUIRED_AUDIT_RECORD_FIELDS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: ACCESS_AUDIT_FILE,
      path: 'forbidden_values',
      field: 'forbidden_values',
      requiredEntries: REQUIRED_AUDIT_FORBIDDEN_VALUES
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: ACCESS_AUDIT_FILE,
      path: 'break_glass.requires',
      field: 'break_glass.requires',
      requiredEntries: REQUIRED_BREAK_GLASS_FIELDS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: ACCESS_AUDIT_FILE,
      path: 'break_glass.forbidden',
      field: 'break_glass.forbidden',
      requiredEntries: [
        'permanent_exception',
        'unaudited_access',
        'wildcard_target_scope'
      ]
    })
  ];
}

function validateStorageBoundaryContract(value: unknown): readonly Diagnostic[] {
  return [
    ...validateExactValue({
      value,
      file: STORAGE_BOUNDARY_FILE,
      path: 'storage_owner',
      expected: CREDENTIAL_VAULT_REPOSITORY_NAME,
      message:
        'Credential storage owner must remain `zdp-privacy-credential-vault`.'
    }),
    ...validateExactValue({
      value,
      file: STORAGE_BOUNDARY_FILE,
      path: 'storage_backend_class',
      expected: 'secure-storage',
      message: 'Credential storage backend class must remain `secure-storage`.'
    }),
    ...validateExactValue({
      value,
      file: STORAGE_BOUNDARY_FILE,
      path: 'encryption_at_rest_required',
      expected: true,
      message: 'Credential storage must require encryption at rest.'
    }),
    ...validateExactValue({
      value,
      file: STORAGE_BOUNDARY_FILE,
      path: 'key_owner',
      expected: 'vault-managed',
      message: 'Credential storage keys must remain vault-managed.'
    }),
    ...validateExactValue({
      value,
      file: STORAGE_BOUNDARY_FILE,
      path: 'plaintext_backups_allowed',
      expected: false,
      message: 'Credential storage must not allow plaintext backups.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: STORAGE_BOUNDARY_FILE,
      path: 'allowed_interfaces',
      field: 'allowed_interfaces',
      requiredEntries: REQUIRED_ALLOWED_INTERFACES
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: STORAGE_BOUNDARY_FILE,
      path: 'forbidden_storage_locations',
      field: 'forbidden_storage_locations',
      requiredEntries: REQUIRED_FORBIDDEN_STORAGE_LOCATIONS
    }),
    ...validateExactValue({
      value,
      file: STORAGE_BOUNDARY_FILE,
      path: 'deletion.required',
      expected: true,
      message: 'Credential storage must require deletion support.'
    }),
    ...validateExactValue({
      value,
      file: STORAGE_BOUNDARY_FILE,
      path: 'deletion.evidence_required',
      expected: true,
      message: 'Credential deletion must require evidence.'
    }),
    ...validateExactValue({
      value,
      file: STORAGE_BOUNDARY_FILE,
      path: 'restore.secret_values_in_restore_evidence_allowed',
      expected: false,
      message: 'Credential restore evidence must not include secret values.'
    }),
    ...validateExactValue({
      value,
      file: STORAGE_BOUNDARY_FILE,
      path: 'restore.restore_drill_required_before_production',
      expected: true,
      message:
        'Credential restore drills must be required before production storage.'
    })
  ];
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
      createCredentialDiagnostic(
        input.file,
        input.path,
        `Credential vault contract \`${input.file}\` must include \`${requiredEntry}\` in \`${input.field}\`.`
      )
    );
  }

  return diagnostics;
}

function validateExactValue(input: {
  readonly value: unknown;
  readonly file: string;
  readonly path: string;
  readonly diagnosticPath?: string;
  readonly expected: unknown;
  readonly message: string;
}): readonly Diagnostic[] {
  const actual = readPath(input.value, input.path);

  if (actual === input.expected) {
    return [];
  }

  return [
    createCredentialDiagnostic(
      input.file,
      input.diagnosticPath ?? input.path,
      input.message
    )
  ];
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

  return [createCredentialDiagnostic(input.file, input.path, input.message)];
}

function readRepositoryName(value: unknown): string | null {
  if (!isRecord(value) || !isRecord(value.service)) {
    return null;
  }

  return readStringField(value.service, 'repo');
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

function createCredentialDiagnostic(
  file: string,
  path: string,
  message: string
): Diagnostic {
  return {
    ruleId: CREDENTIAL_VAULT_RULE_ID,
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
