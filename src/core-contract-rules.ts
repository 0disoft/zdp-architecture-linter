import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { Diagnostic } from './diagnostics.ts';

const CORE_REPOSITORY_NAME = 'zdp-core-platform';
const CORE_CONTRACT_RULE_ID = 'ZDP-CORE-001';

const CORE_BOUNDARIES_FILE = 'contracts/core-boundaries.yaml';
const COMMAND_ENVELOPE_FILE = 'contracts/command-envelope.yaml';
const AUDIT_EVENT_FILE = 'contracts/audit-event.yaml';
const CONSENT_RECORD_FILE = 'contracts/consent-record.yaml';
const AUTH_SESSION_RUNTIME_FILE = 'contracts/auth-session-runtime.yaml';
const IDENTITY_SESSION_STORE_FILE = 'contracts/identity-session-store.yaml';

const AUTH_SESSION_RUNTIME_STATUS = 'contracted_no_live_handler';
const IDENTITY_SESSION_STORE_STATUS = 'contract_only_no_migration';
const AUTH_SESSION_CATALOG_SOURCE =
  'zdp-api-contracts/contracts/apis/catalog.yaml';

const REQUIRED_BOUNDARIES = [
  'identity',
  'accounts',
  'access',
  'consent',
  'audit'
] as const;

const REQUIRED_BOUNDARY_FIELDS = [
  'owns',
  'must_not_own',
  'db_schema',
  'db_role',
  'audit_required',
  'split_trigger'
] as const;

const REQUIRED_RBAC_ROLES = [
  'owner',
  'admin',
  'member',
  'viewer',
  'service_account'
] as const;

const REQUIRED_COMMAND_FIELDS = [
  'command_id',
  'actor_id',
  'tenant_id',
  'reason',
  'idempotency_key'
] as const;

const REQUIRED_AUDIT_FORBIDDEN_VALUES = [
  'raw_secret',
  'token',
  'authorization_header',
  'raw_personal_payload'
] as const;

const REQUIRED_CONSENT_FIELDS = [
  'purpose',
  'scope',
  'withdrawal_record',
  'evidence_ref'
] as const;

const REQUIRED_AUTH_SESSION_RUNTIME_OPERATIONS = [
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

const REQUIRED_AUTH_SESSION_HANDOFF_CONTROLS = [
  'request_id_propagation',
  'trace_id_propagation',
  'idempotency_key_scope',
  'audit_event_emission',
  'session_store_contract',
  'credential_vault_handoff',
  'passkey_challenge_store_contract',
  'oauth_callback_state_verification',
  'refresh_token_rotation_without_plaintext_storage'
] as const;

const REQUIRED_AUTH_SESSION_PROMOTION_BLOCKERS = [
  'no_identity_session_store_implementation',
  'no_credential_vault_capability_handoff',
  'no_auth_audit_event_persistence',
  'no_idempotency_storage',
  'no_product_reviewer_approval'
] as const;

const REQUIRED_AUTH_SESSION_FORBIDDEN_RUNTIME_CLAIMS = [
  'live_login_handler',
  'live_session_issue_handler',
  'live_session_refresh_handler',
  'live_session_revoke_handler',
  'plaintext_refresh_token_storage',
  'provider_secret_storage',
  'product_authorization_decision'
] as const;

const REQUIRED_IDENTITY_SESSION_STORE_FIELDS = [
  'session_id',
  'subject_id',
  'tenant_id',
  'session_version',
  'state',
  'issued_at',
  'expires_at',
  'refresh_token_family_id',
  'refresh_token_hash',
  'rotation_counter',
  'created_by_command_id',
  'trace_id'
] as const;

const REQUIRED_IDENTITY_SESSION_STORE_STATES = [
  'active',
  'refreshed',
  'revoked',
  'expired',
  'compromised'
] as const;

const REQUIRED_IDENTITY_SESSION_REFRESH_ROTATION_FIELDS = [
  'refresh_token_family_id',
  'refresh_token_hash',
  'previous_refresh_token_hash',
  'rotation_counter',
  'rotated_at',
  'rotated_by_command_id',
  'trace_id'
] as const;

const REQUIRED_IDENTITY_SESSION_REVOCATION_FIELDS = [
  'revoked_at',
  'revoked_by_actor_id',
  'revoke_reason',
  'revocation_command_id',
  'trace_id'
] as const;

const REQUIRED_IDENTITY_SESSION_STORE_CONTROLS = [
  'tenant_actor_scope',
  'opaque_session_id',
  'hashed_refresh_token_only',
  'refresh_token_rotation',
  'refresh_reuse_detection',
  'revoke_current_session',
  'revoke_family_on_reuse',
  'ttl_enforced_by_storage',
  'command_idempotency_reference',
  'audit_event_reference'
] as const;

const REQUIRED_IDENTITY_SESSION_STORE_UNIQUENESS = [
  'session_id',
  'refresh_token_hash',
  'created_by_command_id'
] as const;

const REQUIRED_IDENTITY_SESSION_FORBIDDEN_STORAGE_VALUES = [
  'refresh_token_plaintext',
  'session_secret_plaintext',
  'oauth_refresh_token_plaintext',
  'provider_secret',
  'authorization_header',
  'cookie_header',
  'raw_provider_payload',
  'password_hash'
] as const;

export async function validateRepositoryCoreContract(input: {
  readonly repositoryRoot: string | undefined;
  readonly repositoryServiceContract: unknown;
}): Promise<readonly Diagnostic[]> {
  if (
    input.repositoryRoot === undefined ||
    readRepositoryName(input.repositoryServiceContract) !== CORE_REPOSITORY_NAME
  ) {
    return [];
  }

  const [
    boundaries,
    commandEnvelope,
    auditEvent,
    consentRecord,
    authSessionRuntime,
    identitySessionStore
  ] = await Promise.all([
      readRequiredYamlContract(input.repositoryRoot, CORE_BOUNDARIES_FILE),
      readRequiredYamlContract(input.repositoryRoot, COMMAND_ENVELOPE_FILE),
      readRequiredYamlContract(input.repositoryRoot, AUDIT_EVENT_FILE),
      readRequiredYamlContract(input.repositoryRoot, CONSENT_RECORD_FILE),
      readRequiredYamlContract(input.repositoryRoot, AUTH_SESSION_RUNTIME_FILE),
      readRequiredYamlContract(input.repositoryRoot, IDENTITY_SESSION_STORE_FILE)
    ]);

  return [
    ...boundaries.diagnostics,
    ...commandEnvelope.diagnostics,
    ...auditEvent.diagnostics,
    ...consentRecord.diagnostics,
    ...authSessionRuntime.diagnostics,
    ...identitySessionStore.diagnostics,
    ...(boundaries.value === null ? [] : validateCoreBoundaries(boundaries.value)),
    ...(commandEnvelope.value === null
      ? []
      : validateRequiredStringArrayEntries({
          value: commandEnvelope.value,
          file: COMMAND_ENVELOPE_FILE,
          path: 'required_fields',
          field: 'required_fields',
          requiredEntries: REQUIRED_COMMAND_FIELDS
        })),
    ...(auditEvent.value === null
      ? []
      : validateRequiredStringArrayEntries({
          value: auditEvent.value,
          file: AUDIT_EVENT_FILE,
          path: 'forbidden_payload_values',
          field: 'forbidden_payload_values',
          requiredEntries: REQUIRED_AUDIT_FORBIDDEN_VALUES
        })),
    ...(consentRecord.value === null
      ? []
      : validateConsentRecordContract(consentRecord.value)),
    ...(authSessionRuntime.value === null
      ? []
      : validateAuthSessionRuntimeContract(authSessionRuntime.value)),
    ...(identitySessionStore.value === null
      ? []
      : validateIdentitySessionStoreContract(identitySessionStore.value))
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
          createCoreDiagnostic(
            file,
            'repository.root',
            `Core platform repository must include \`${file}\`.`
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
        createCoreDiagnostic(
          file,
          'yaml',
          `Core platform contract \`${file}\` must be valid YAML: ${formatError(
            error
          )}`
        )
      ]
    };
  }
}

function validateCoreBoundaries(value: unknown): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  diagnostics.push(
    ...validateRequiredStringArrayEntries({
      value,
      file: CORE_BOUNDARIES_FILE,
      path: 'permission_model.roles',
      field: 'permission_model.roles',
      requiredEntries: REQUIRED_RBAC_ROLES
    })
  );

  if (readPath(value, 'authorization.final_decision_owner') !== 'access') {
    diagnostics.push(
      createCoreDiagnostic(
        CORE_BOUNDARIES_FILE,
        'authorization.final_decision_owner',
        'Core platform final authorization owner must be `access`.'
      )
    );
  }

  const boundaries = readPath(value, 'boundaries');

  if (!Array.isArray(boundaries)) {
    diagnostics.push(
      createCoreDiagnostic(
        CORE_BOUNDARIES_FILE,
        'boundaries',
        'Core platform boundaries contract must declare a `boundaries` array.'
      )
    );
    return diagnostics;
  }

  const boundaryById = new Map<string, Record<string, unknown>>();

  for (const boundary of boundaries) {
    if (!isRecord(boundary)) {
      continue;
    }

    const id = readStringField(boundary, 'id');

    if (id !== null) {
      boundaryById.set(id, boundary);
    }
  }

  for (const boundaryId of REQUIRED_BOUNDARIES) {
    const boundary = boundaryById.get(boundaryId);

    if (boundary === undefined) {
      diagnostics.push(
        createCoreDiagnostic(
          CORE_BOUNDARIES_FILE,
          `boundaries.${boundaryId}`,
          `Core platform boundaries contract must declare \`${boundaryId}\` boundary.`
        )
      );
      continue;
    }

    for (const field of REQUIRED_BOUNDARY_FIELDS) {
      if (hasRequiredBoundaryField(boundary, field)) {
        continue;
      }

      diagnostics.push(
        createCoreDiagnostic(
          CORE_BOUNDARIES_FILE,
          `boundaries.${boundaryId}.${field}`,
          `Core platform boundary \`${boundaryId}\` must declare non-empty \`${field}\`.`
        )
      );
    }
  }

  return diagnostics;
}

function validateConsentRecordContract(value: unknown): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  diagnostics.push(
    ...validateRequiredStringArrayEntries({
      value,
      file: CONSENT_RECORD_FILE,
      path: 'required_fields',
      field: 'required_fields',
      requiredEntries: REQUIRED_CONSENT_FIELDS.filter(
        (field) => field !== 'withdrawal_record'
      )
    })
  );

  if (!isRecord(readPath(value, 'withdrawal_record'))) {
    diagnostics.push(
      createCoreDiagnostic(
        CONSENT_RECORD_FILE,
        'withdrawal_record',
        'Core platform consent contract must declare `withdrawal_record`.'
      )
    );
  }

  return diagnostics;
}

function validateAuthSessionRuntimeContract(value: unknown): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (readPath(value, 'contract.status') !== AUTH_SESSION_RUNTIME_STATUS) {
    diagnostics.push(
      createCoreDiagnostic(
        AUTH_SESSION_RUNTIME_FILE,
        'contract.status',
        `Core platform auth/session runtime contract must stay \`${AUTH_SESSION_RUNTIME_STATUS}\` until live handlers are reviewed.`
      )
    );
  }

  if (readPath(value, 'contract.catalog_source') !== AUTH_SESSION_CATALOG_SOURCE) {
    diagnostics.push(
      createCoreDiagnostic(
        AUTH_SESSION_RUNTIME_FILE,
        'contract.catalog_source',
        `Core platform auth/session runtime contract must reference \`${AUTH_SESSION_CATALOG_SOURCE}\`.`
      )
    );
  }

  const operations = readPath(value, 'required_operations');

  if (!Array.isArray(operations)) {
    diagnostics.push(
      createCoreDiagnostic(
        AUTH_SESSION_RUNTIME_FILE,
        'required_operations',
        'Core platform auth/session runtime contract must declare `required_operations`.'
      )
    );
  } else {
    diagnostics.push(...validateAuthSessionRuntimeOperations(operations));
  }

  diagnostics.push(
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_SESSION_RUNTIME_FILE,
      path: 'required_handoff_controls',
      field: 'required_handoff_controls',
      requiredEntries: REQUIRED_AUTH_SESSION_HANDOFF_CONTROLS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_SESSION_RUNTIME_FILE,
      path: 'promotion_blockers',
      field: 'promotion_blockers',
      requiredEntries: REQUIRED_AUTH_SESSION_PROMOTION_BLOCKERS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_SESSION_RUNTIME_FILE,
      path: 'forbidden_runtime_claims',
      field: 'forbidden_runtime_claims',
      requiredEntries: REQUIRED_AUTH_SESSION_FORBIDDEN_RUNTIME_CLAIMS
    })
  );

  return diagnostics;
}

function validateIdentitySessionStoreContract(value: unknown): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (readPath(value, 'contract.status') !== IDENTITY_SESSION_STORE_STATUS) {
    diagnostics.push(
      createCoreDiagnostic(
        IDENTITY_SESSION_STORE_FILE,
        'contract.status',
        `Core platform identity session store contract must stay \`${IDENTITY_SESSION_STORE_STATUS}\` until migrations exist.`
      )
    );
  }

  if (readPath(value, 'contract.owner_boundary') !== 'identity') {
    diagnostics.push(
      createCoreDiagnostic(
        IDENTITY_SESSION_STORE_FILE,
        'contract.owner_boundary',
        'Core platform identity session store contract must keep owner_boundary `identity`.'
      )
    );
  }

  diagnostics.push(
    ...validateRequiredStringArrayEntries({
      value,
      file: IDENTITY_SESSION_STORE_FILE,
      path: 'required_session_record_fields',
      field: 'required_session_record_fields',
      requiredEntries: REQUIRED_IDENTITY_SESSION_STORE_FIELDS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: IDENTITY_SESSION_STORE_FILE,
      path: 'state_values',
      field: 'state_values',
      requiredEntries: REQUIRED_IDENTITY_SESSION_STORE_STATES
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: IDENTITY_SESSION_STORE_FILE,
      path: 'required_refresh_rotation_fields',
      field: 'required_refresh_rotation_fields',
      requiredEntries: REQUIRED_IDENTITY_SESSION_REFRESH_ROTATION_FIELDS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: IDENTITY_SESSION_STORE_FILE,
      path: 'required_revocation_fields',
      field: 'required_revocation_fields',
      requiredEntries: REQUIRED_IDENTITY_SESSION_REVOCATION_FIELDS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: IDENTITY_SESSION_STORE_FILE,
      path: 'required_controls',
      field: 'required_controls',
      requiredEntries: REQUIRED_IDENTITY_SESSION_STORE_CONTROLS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: IDENTITY_SESSION_STORE_FILE,
      path: 'uniqueness',
      field: 'uniqueness',
      requiredEntries: REQUIRED_IDENTITY_SESSION_STORE_UNIQUENESS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: IDENTITY_SESSION_STORE_FILE,
      path: 'forbidden_storage_values',
      field: 'forbidden_storage_values',
      requiredEntries: REQUIRED_IDENTITY_SESSION_FORBIDDEN_STORAGE_VALUES
    })
  );

  return diagnostics;
}

function validateAuthSessionRuntimeOperations(
  operations: readonly unknown[]
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const operationById = new Map<string, Record<string, unknown>>();

  for (const operation of operations) {
    if (!isRecord(operation)) {
      continue;
    }

    const operationId = readStringField(operation, 'operation_id');

    if (operationId !== null) {
      operationById.set(operationId, operation);
    }
  }

  for (const requiredOperation of REQUIRED_AUTH_SESSION_RUNTIME_OPERATIONS) {
    const operation = operationById.get(requiredOperation.operationId);

    if (operation === undefined) {
      diagnostics.push(
        createCoreDiagnostic(
          AUTH_SESSION_RUNTIME_FILE,
          'required_operations',
          `Core platform auth/session runtime contract must include operation \`${requiredOperation.operationId}\`.`
        )
      );
      continue;
    }

    if (readStringField(operation, 'runtime_status') !== AUTH_SESSION_RUNTIME_STATUS) {
      diagnostics.push(
        createCoreDiagnostic(
          AUTH_SESSION_RUNTIME_FILE,
          `required_operations.${requiredOperation.operationId}.runtime_status`,
          `Core platform auth/session operation \`${requiredOperation.operationId}\` must stay \`${AUTH_SESSION_RUNTIME_STATUS}\`.`
        )
      );
    }

    if (readStringField(operation, 'session_effect') !== requiredOperation.sessionEffect) {
      diagnostics.push(
        createCoreDiagnostic(
          AUTH_SESSION_RUNTIME_FILE,
          `required_operations.${requiredOperation.operationId}.session_effect`,
          `Core platform auth/session operation \`${requiredOperation.operationId}\` must declare session_effect \`${requiredOperation.sessionEffect}\`.`
        )
      );
    }

    if (readStringField(operation, 'handoff_owner') !== 'identity') {
      diagnostics.push(
        createCoreDiagnostic(
          AUTH_SESSION_RUNTIME_FILE,
          `required_operations.${requiredOperation.operationId}.handoff_owner`,
          `Core platform auth/session operation \`${requiredOperation.operationId}\` must keep handoff_owner \`identity\`.`
        )
      );
    }
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
      createCoreDiagnostic(
        input.file,
        input.path,
        `Core platform contract \`${input.file}\` must include \`${requiredEntry}\` in \`${input.field}\`.`
      )
    );
  }

  return diagnostics;
}

function hasRequiredBoundaryField(
  boundary: Record<string, unknown>,
  field: string
): boolean {
  const value = boundary[field];

  if (Array.isArray(value)) {
    return value.some(
      (entry) => typeof entry === 'string' && entry.trim().length > 0
    );
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  return typeof value === 'boolean';
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

function createCoreDiagnostic(
  file: string,
  path: string,
  message: string
): Diagnostic {
  return {
    ruleId: CORE_CONTRACT_RULE_ID,
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
