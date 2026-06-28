import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { Diagnostic } from './diagnostics.ts';
import {
  createCoreDiagnostic,
  formatError,
  hasRequiredBoundaryField,
  isMissingPathError,
  isRecord,
  readPath,
  readRepositoryName,
  readStringField,
  validateRequiredStringArrayEntries
} from './rules/core/contract-helpers.ts';
import { CORE_REPOSITORY_NAME } from './rules/core/core-repository.ts';
import {
  AUTH_RUNTIME_ADMISSION_CONTEXT_BOUNDARY_STATUS,
  AUTH_RUNTIME_ADMISSION_CONTEXT_FILE,
  AUTH_RUNTIME_COMMAND_PROPAGATION_BOUNDARY_STATUS,
  AUTH_RUNTIME_COMMAND_PROPAGATION_FILE,
  AUTH_SESSION_RUNTIME_FILE,
  AUTH_SESSION_RUNTIME_STATUS,
  validateAuthRuntimeAdmissionContextContract,
  validateAuthRuntimeCommandPropagationContract,
  validateAuthSessionRuntimeContract
} from './rules/core/auth-runtime-contracts.ts';
import {
  createRequiredAuthRuntimeReadinessGates,
  validateAuthRuntimeReadinessContract
} from './rules/core/auth-runtime-readiness.ts';
import {
  CORE_EVENT_OUTBOX_FILE,
  CORE_EVENT_OUTBOX_STATUS,
  validateCoreEventOutboxContract
} from './rules/core/core-event-outbox.ts';
import {
  CORE_DB_SCHEMA_FILE,
  CORE_FOUNDATION_MIGRATION_FILE,
  validateCoreDbSchemaContract,
  validateCoreFoundationMigration
} from './rules/core/core-db-schema.ts';
import {
  AUTH_DURABLE_STORAGE_ADMISSION_BOUNDARY_STATUS,
  AUTH_DURABLE_STORAGE_ADMISSION_FILE,
  AUTH_DURABLE_STORAGE_MIGRATION_READINESS_BOUNDARY_STATUS,
  AUTH_DURABLE_STORAGE_MIGRATION_READINESS_FILE,
  AUTH_DURABLE_STORAGE_MIGRATION_READINESS_STATUS,
  AUTH_DURABLE_STORAGE_TRANSACTION_OUTBOX_BOUNDARY_STATUS,
  AUTH_DURABLE_STORAGE_TRANSACTION_OUTBOX_FILE,
  AUTH_DURABLE_STORAGE_TRANSACTION_OUTBOX_STATUS,
  validateAuthDurableStorageAdmissionContract,
  validateAuthDurableStorageMigrationReadinessContract,
  validateAuthDurableStorageTransactionOutboxContract
} from './rules/core/auth-durable-storage.ts';
import {
  IDENTITY_SESSION_STORE_ADAPTER_BOUNDARY_STATUS,
  IDENTITY_SESSION_STORE_FILE,
  IDENTITY_SESSION_STORE_STATUS,
  validateIdentitySessionStoreContract
} from './rules/core/auth-identity-session-store.ts';
import {
  AUTH_CREDENTIAL_VAULT_CAPABILITY_CLIENT_BOUNDARY_STATUS,
  AUTH_CREDENTIAL_VAULT_HANDOFF_FILE,
  AUTH_CREDENTIAL_VAULT_HANDOFF_STATUS,
  validateAuthCredentialVaultHandoffContract
} from './rules/core/auth-credential-vault-handoff.ts';
import {
  AUTH_OAUTH_CALLBACK_STATE_ADAPTER_BOUNDARY_STATUS,
  AUTH_OAUTH_CALLBACK_STATE_FILE,
  AUTH_OAUTH_CALLBACK_STATE_STATUS,
  AUTH_PASSKEY_CHALLENGE_STORE_ADAPTER_BOUNDARY_STATUS,
  AUTH_PASSKEY_CHALLENGE_STORE_FILE,
  AUTH_PASSKEY_CHALLENGE_STORE_STATUS,
  validateAuthOauthCallbackStateContract,
  validateAuthPasskeyChallengeStoreContract
} from './rules/core/auth-challenge-state.ts';
import {
  AUTH_AUDIT_EVENT_PERSISTENCE_FILE,
  AUTH_AUDIT_EVENT_PERSISTENCE_STATUS,
  AUTH_AUDIT_STORAGE_ADAPTER_BOUNDARY_STATUS,
  AUTH_AUDIT_STORAGE_ADAPTER_FILE,
  AUTH_AUDIT_STORAGE_ADAPTER_STATUS,
  validateAuthAuditEventPersistenceContract,
  validateAuthAuditStorageAdapterContract
} from './rules/core/auth-audit.ts';
import {
  AUTH_IDEMPOTENCY_STORAGE_ADAPTER_BOUNDARY_STATUS,
  AUTH_IDEMPOTENCY_STORAGE_FILE,
  AUTH_IDEMPOTENCY_STORAGE_STATUS,
  validateAuthIdempotencyStorageContract
} from './rules/core/auth-idempotency-storage.ts';

const CORE_CI_WORKFLOW_FILE = '.github/workflows/ci.yml';
const CORE_BOUNDARIES_FILE = 'contracts/core-boundaries.yaml';
const COMMAND_ENVELOPE_FILE = 'contracts/command-envelope.yaml';
const AUDIT_EVENT_FILE = 'contracts/audit-event.yaml';
const CONSENT_RECORD_FILE = 'contracts/consent-record.yaml';
const AUTH_RUNTIME_READINESS_FILE = 'contracts/auth-runtime-readiness.yaml';

const AUTH_RUNTIME_READINESS_STATUS =
  'readiness_summary_no_runtime_promotion';

const REQUIRED_CORE_CI_WORKFLOW_SNIPPETS = [
  'actions/checkout@v7',
  'dtolnay/rust-toolchain@stable',
  'components: rustfmt',
  'cargo fmt --check',
  'cargo check --locked --all-targets',
  'cargo test --locked',
  'permissions:',
  'contents: read',
  'pull_request:',
  'timeout-minutes: 15'
] as const;

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

const REQUIRED_AUTH_RUNTIME_READINESS_GATES =
  createRequiredAuthRuntimeReadinessGates({
    authSessionRuntimeFile: AUTH_SESSION_RUNTIME_FILE,
    authRuntimeAdmissionContextFile: AUTH_RUNTIME_ADMISSION_CONTEXT_FILE,
    authRuntimeAdmissionContextBoundaryStatus:
      AUTH_RUNTIME_ADMISSION_CONTEXT_BOUNDARY_STATUS,
    authRuntimeCommandPropagationFile: AUTH_RUNTIME_COMMAND_PROPAGATION_FILE,
    identitySessionStoreFile: IDENTITY_SESSION_STORE_FILE,
    identitySessionStoreStatus: IDENTITY_SESSION_STORE_STATUS,
    identitySessionStoreAdapterBoundaryStatus:
      IDENTITY_SESSION_STORE_ADAPTER_BOUNDARY_STATUS,
    authDurableStorageAdmissionFile: AUTH_DURABLE_STORAGE_ADMISSION_FILE,
    authDurableStorageMigrationReadinessFile:
      AUTH_DURABLE_STORAGE_MIGRATION_READINESS_FILE,
    authDurableStorageMigrationReadinessStatus:
      AUTH_DURABLE_STORAGE_MIGRATION_READINESS_STATUS,
    authDurableStorageMigrationReadinessBoundaryStatus:
      AUTH_DURABLE_STORAGE_MIGRATION_READINESS_BOUNDARY_STATUS,
    authDurableStorageTransactionOutboxFile:
      AUTH_DURABLE_STORAGE_TRANSACTION_OUTBOX_FILE,
    authDurableStorageTransactionOutboxStatus:
      AUTH_DURABLE_STORAGE_TRANSACTION_OUTBOX_STATUS,
    authDurableStorageTransactionOutboxBoundaryStatus:
      AUTH_DURABLE_STORAGE_TRANSACTION_OUTBOX_BOUNDARY_STATUS,
    authCredentialVaultHandoffFile: AUTH_CREDENTIAL_VAULT_HANDOFF_FILE,
    authCredentialVaultHandoffStatus: AUTH_CREDENTIAL_VAULT_HANDOFF_STATUS,
    authCredentialVaultCapabilityClientBoundaryStatus:
      AUTH_CREDENTIAL_VAULT_CAPABILITY_CLIENT_BOUNDARY_STATUS,
    authPasskeyChallengeStoreFile: AUTH_PASSKEY_CHALLENGE_STORE_FILE,
    authPasskeyChallengeStoreStatus: AUTH_PASSKEY_CHALLENGE_STORE_STATUS,
    authPasskeyChallengeStoreAdapterBoundaryStatus:
      AUTH_PASSKEY_CHALLENGE_STORE_ADAPTER_BOUNDARY_STATUS,
    authOauthCallbackStateFile: AUTH_OAUTH_CALLBACK_STATE_FILE,
    authOauthCallbackStateStatus: AUTH_OAUTH_CALLBACK_STATE_STATUS,
    authOauthCallbackStateAdapterBoundaryStatus:
      AUTH_OAUTH_CALLBACK_STATE_ADAPTER_BOUNDARY_STATUS,
    authAuditEventPersistenceFile: AUTH_AUDIT_EVENT_PERSISTENCE_FILE,
    authAuditEventPersistenceStatus: AUTH_AUDIT_EVENT_PERSISTENCE_STATUS,
    authAuditStorageAdapterFile: AUTH_AUDIT_STORAGE_ADAPTER_FILE,
    authAuditStorageAdapterStatus: AUTH_AUDIT_STORAGE_ADAPTER_STATUS,
    authAuditStorageAdapterBoundaryStatus:
      AUTH_AUDIT_STORAGE_ADAPTER_BOUNDARY_STATUS,
    authIdempotencyStorageFile: AUTH_IDEMPOTENCY_STORAGE_FILE,
    authIdempotencyStorageStatus: AUTH_IDEMPOTENCY_STORAGE_STATUS,
    authIdempotencyStorageAdapterBoundaryStatus:
      AUTH_IDEMPOTENCY_STORAGE_ADAPTER_BOUNDARY_STATUS
  });

const AUTH_DURABLE_STORAGE_CONTRACT_REFS = {
  authSessionRuntimeStatus: AUTH_SESSION_RUNTIME_STATUS,
  authRuntimeReadinessFile: AUTH_RUNTIME_READINESS_FILE,
  authRuntimeAdmissionContextFile: AUTH_RUNTIME_ADMISSION_CONTEXT_FILE,
  authRuntimeCommandPropagationFile: AUTH_RUNTIME_COMMAND_PROPAGATION_FILE
} as const;

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
    ciWorkflow,
    boundaries,
    commandEnvelope,
    auditEvent,
    consentRecord,
    coreDbSchema,
    coreFoundationMigration,
    authSessionRuntime,
    authRuntimeReadiness,
    authRuntimeAdmissionContext,
    authRuntimeCommandPropagation,
    authDurableStorageAdmission,
    authDurableStorageMigrationReadiness,
    authDurableStorageTransactionOutbox,
    identitySessionStore,
    authCredentialVaultHandoff,
    authPasskeyChallengeStore,
    authOauthCallbackState,
    authAuditEventPersistence,
    authAuditStorageAdapter,
    coreEventOutbox,
    authIdempotencyStorage
  ] = await Promise.all([
      readRequiredTextFile(input.repositoryRoot, CORE_CI_WORKFLOW_FILE),
      readRequiredYamlContract(input.repositoryRoot, CORE_BOUNDARIES_FILE),
      readRequiredYamlContract(input.repositoryRoot, COMMAND_ENVELOPE_FILE),
      readRequiredYamlContract(input.repositoryRoot, AUDIT_EVENT_FILE),
      readRequiredYamlContract(input.repositoryRoot, CONSENT_RECORD_FILE),
      readRequiredYamlContract(input.repositoryRoot, CORE_DB_SCHEMA_FILE),
      readRequiredTextFile(input.repositoryRoot, CORE_FOUNDATION_MIGRATION_FILE),
      readRequiredYamlContract(input.repositoryRoot, AUTH_SESSION_RUNTIME_FILE),
      readRequiredYamlContract(input.repositoryRoot, AUTH_RUNTIME_READINESS_FILE),
      readRequiredYamlContract(input.repositoryRoot, AUTH_RUNTIME_ADMISSION_CONTEXT_FILE),
      readRequiredYamlContract(input.repositoryRoot, AUTH_RUNTIME_COMMAND_PROPAGATION_FILE),
      readRequiredYamlContract(input.repositoryRoot, AUTH_DURABLE_STORAGE_ADMISSION_FILE),
      readRequiredYamlContract(
        input.repositoryRoot,
        AUTH_DURABLE_STORAGE_MIGRATION_READINESS_FILE
      ),
      readRequiredYamlContract(
        input.repositoryRoot,
        AUTH_DURABLE_STORAGE_TRANSACTION_OUTBOX_FILE
      ),
      readRequiredYamlContract(input.repositoryRoot, IDENTITY_SESSION_STORE_FILE),
      readRequiredYamlContract(input.repositoryRoot, AUTH_CREDENTIAL_VAULT_HANDOFF_FILE),
      readRequiredYamlContract(input.repositoryRoot, AUTH_PASSKEY_CHALLENGE_STORE_FILE),
      readRequiredYamlContract(input.repositoryRoot, AUTH_OAUTH_CALLBACK_STATE_FILE),
      readRequiredYamlContract(input.repositoryRoot, AUTH_AUDIT_EVENT_PERSISTENCE_FILE),
      readRequiredYamlContract(input.repositoryRoot, AUTH_AUDIT_STORAGE_ADAPTER_FILE),
      readRequiredYamlContract(input.repositoryRoot, CORE_EVENT_OUTBOX_FILE),
      readRequiredYamlContract(input.repositoryRoot, AUTH_IDEMPOTENCY_STORAGE_FILE)
    ]);

  return [
    ...ciWorkflow.diagnostics,
    ...boundaries.diagnostics,
    ...commandEnvelope.diagnostics,
    ...auditEvent.diagnostics,
    ...consentRecord.diagnostics,
    ...coreDbSchema.diagnostics,
    ...coreFoundationMigration.diagnostics,
    ...authSessionRuntime.diagnostics,
    ...authRuntimeReadiness.diagnostics,
    ...authRuntimeAdmissionContext.diagnostics,
    ...authRuntimeCommandPropagation.diagnostics,
    ...authDurableStorageAdmission.diagnostics,
    ...authDurableStorageMigrationReadiness.diagnostics,
    ...authDurableStorageTransactionOutbox.diagnostics,
    ...identitySessionStore.diagnostics,
    ...authCredentialVaultHandoff.diagnostics,
    ...authPasskeyChallengeStore.diagnostics,
    ...authOauthCallbackState.diagnostics,
    ...authAuditEventPersistence.diagnostics,
    ...authAuditStorageAdapter.diagnostics,
    ...coreEventOutbox.diagnostics,
    ...authIdempotencyStorage.diagnostics,
    ...(ciWorkflow.value === null ? [] : validateCoreCiWorkflow(ciWorkflow.value)),
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
    ...(coreDbSchema.value === null
      ? []
      : validateCoreDbSchemaContract(coreDbSchema.value)),
    ...(coreFoundationMigration.value === null
      ? []
      : validateCoreFoundationMigration(coreFoundationMigration.value)),
    ...(authSessionRuntime.value === null
      ? []
      : validateAuthSessionRuntimeContract(authSessionRuntime.value)),
    ...(authRuntimeReadiness.value === null
      ? []
      : validateAuthRuntimeReadinessContract({
          value: authRuntimeReadiness.value,
          file: AUTH_RUNTIME_READINESS_FILE,
          status: AUTH_RUNTIME_READINESS_STATUS,
          runtimeStatus: AUTH_SESSION_RUNTIME_STATUS,
          requiredGates: REQUIRED_AUTH_RUNTIME_READINESS_GATES
        })),
    ...(authRuntimeAdmissionContext.value === null
      ? []
      : validateAuthRuntimeAdmissionContextContract(
          authRuntimeAdmissionContext.value
        )),
    ...(authRuntimeCommandPropagation.value === null
      ? []
      : validateAuthRuntimeCommandPropagationContract(
          authRuntimeCommandPropagation.value
        )),
    ...(authDurableStorageAdmission.value === null
      ? []
      : validateAuthDurableStorageAdmissionContract({
          value: authDurableStorageAdmission.value,
          refs: AUTH_DURABLE_STORAGE_CONTRACT_REFS
        })),
    ...(authDurableStorageMigrationReadiness.value === null
      ? []
      : validateAuthDurableStorageMigrationReadinessContract({
          value: authDurableStorageMigrationReadiness.value,
          refs: AUTH_DURABLE_STORAGE_CONTRACT_REFS
        })),
    ...(authDurableStorageTransactionOutbox.value === null
      ? []
      : validateAuthDurableStorageTransactionOutboxContract({
          value: authDurableStorageTransactionOutbox.value,
          refs: AUTH_DURABLE_STORAGE_CONTRACT_REFS
        })),
    ...(identitySessionStore.value === null
      ? []
      : validateIdentitySessionStoreContract(identitySessionStore.value)),
    ...(authCredentialVaultHandoff.value === null
      ? []
      : validateAuthCredentialVaultHandoffContract(authCredentialVaultHandoff.value)),
    ...(authPasskeyChallengeStore.value === null
      ? []
      : validateAuthPasskeyChallengeStoreContract(authPasskeyChallengeStore.value)),
    ...(authOauthCallbackState.value === null
      ? []
      : validateAuthOauthCallbackStateContract(authOauthCallbackState.value)),
    ...(authAuditEventPersistence.value === null
      ? []
      : validateAuthAuditEventPersistenceContract(authAuditEventPersistence.value)),
    ...(authAuditStorageAdapter.value === null
      ? []
      : validateAuthAuditStorageAdapterContract(authAuditStorageAdapter.value)),
    ...(coreEventOutbox.value === null
      ? []
      : validateCoreEventOutboxContract(coreEventOutbox.value)),
    ...(authIdempotencyStorage.value === null
      ? []
      : validateAuthIdempotencyStorageContract(authIdempotencyStorage.value))
  ];
}

async function readRequiredTextFile(
  repositoryRoot: string,
  file: string
): Promise<{
  readonly value: string | null;
  readonly diagnostics: readonly Diagnostic[];
}> {
  try {
    return {
      value: await readFile(join(repositoryRoot, file), 'utf8'),
      diagnostics: []
    };
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

function validateCoreCiWorkflow(source: string): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const snippet of REQUIRED_CORE_CI_WORKFLOW_SNIPPETS) {
    if (source.includes(snippet)) {
      continue;
    }

    diagnostics.push(
      createCoreDiagnostic(
        CORE_CI_WORKFLOW_FILE,
        'ci.workflow',
        `Core platform CI workflow must include \`${snippet}\`.`
      )
    );
  }

  return diagnostics;
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
