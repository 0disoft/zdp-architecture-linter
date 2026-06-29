import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { Diagnostic } from './diagnostics.ts';
import {
  createCoreDiagnostic,
  formatError,
  isMissingPathError,
  readRepositoryName,
  validateRequiredStringArrayEntries
} from './rules/core/contract-helpers.ts';
import { CORE_REPOSITORY_NAME } from './rules/core/core-repository.ts';
import {
  AUDIT_EVENT_FILE,
  COMMAND_ENVELOPE_FILE,
  CONSENT_RECORD_FILE,
  CORE_BOUNDARIES_FILE,
  CORE_CI_WORKFLOW_FILE,
  REQUIRED_AUDIT_FORBIDDEN_VALUES,
  REQUIRED_COMMAND_FIELDS,
  validateConsentRecordContract,
  validateCoreBoundaries,
  validateCoreCiWorkflow
} from './rules/core/core-baseline.ts';
import {
  AUTH_RUNTIME_ADMISSION_CONTEXT_FILE,
  AUTH_RUNTIME_COMMAND_PROPAGATION_FILE,
  AUTH_SESSION_RUNTIME_FILE,
  validateAuthRuntimeAdmissionContextContract,
  validateAuthRuntimeCommandPropagationContract,
  validateAuthSessionRuntimeContract
} from './rules/core/auth-runtime-contracts.ts';
import { validateAuthRuntimeReadinessContract } from './rules/core/auth-runtime-readiness.ts';
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
  AUTH_DURABLE_STORAGE_ADMISSION_FILE,
  AUTH_DURABLE_STORAGE_MIGRATION_READINESS_FILE,
  AUTH_DURABLE_STORAGE_TRANSACTION_OUTBOX_FILE,
  validateAuthDurableStorageAdmissionContract,
  validateAuthDurableStorageMigrationReadinessContract,
  validateAuthDurableStorageTransactionOutboxContract
} from './rules/core/auth-durable-storage.ts';
import {
  IDENTITY_SESSION_STORE_FILE,
  validateIdentitySessionStoreContract
} from './rules/core/auth-identity-session-store.ts';
import {
  AUTH_CREDENTIAL_VAULT_HANDOFF_FILE,
  validateAuthCredentialVaultHandoffContract
} from './rules/core/auth-credential-vault-handoff.ts';
import {
  AUTH_OAUTH_CALLBACK_STATE_FILE,
  AUTH_PASSKEY_CHALLENGE_STORE_FILE,
  validateAuthOauthCallbackStateContract,
  validateAuthPasskeyChallengeStoreContract
} from './rules/core/auth-challenge-state.ts';
import {
  AUTH_AUDIT_EVENT_PERSISTENCE_FILE,
  AUTH_AUDIT_STORAGE_ADAPTER_FILE,
  validateAuthAuditEventPersistenceContract,
  validateAuthAuditStorageAdapterContract
} from './rules/core/auth-audit.ts';
import {
  AUTH_IDEMPOTENCY_STORAGE_FILE,
  validateAuthIdempotencyStorageContract
} from './rules/core/auth-idempotency-storage.ts';
import {
  AUTH_DURABLE_STORAGE_CONTRACT_REFS,
  AUTH_RUNTIME_READINESS_FILE,
  AUTH_RUNTIME_READINESS_RUNTIME_STATUS,
  AUTH_RUNTIME_READINESS_STATUS,
  REQUIRED_AUTH_RUNTIME_READINESS_GATES
} from './rules/core/auth-contract-wiring.ts';
import {
  CORE_RUNTIME_POSTGRES_ADAPTER_FILE,
  validateCoreRuntimePostgresAdapterContract
} from './rules/core/core-runtime-postgres-adapter.ts';

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
    authIdempotencyStorage,
    coreRuntimePostgresAdapter
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
      readRequiredYamlContract(input.repositoryRoot, AUTH_IDEMPOTENCY_STORAGE_FILE),
      readRequiredYamlContract(input.repositoryRoot, CORE_RUNTIME_POSTGRES_ADAPTER_FILE)
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
    ...coreRuntimePostgresAdapter.diagnostics,
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
          runtimeStatus: AUTH_RUNTIME_READINESS_RUNTIME_STATUS,
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
      : validateAuthIdempotencyStorageContract(authIdempotencyStorage.value)),
    ...(coreRuntimePostgresAdapter.value === null
      ? []
      : validateCoreRuntimePostgresAdapterContract(
          coreRuntimePostgresAdapter.value
        ))
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
