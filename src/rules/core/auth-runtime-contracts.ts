import type { Diagnostic } from '../../diagnostics.ts';
import {
  createCoreDiagnostic,
  isRecord,
  readPath,
  readStringField,
  validateRequiredStringArrayEntries
} from './contract-helpers.ts';

export const AUTH_SESSION_RUNTIME_FILE = 'contracts/auth-session-runtime.yaml';
export const AUTH_RUNTIME_ADMISSION_CONTEXT_FILE =
  'contracts/auth-runtime-admission-context.yaml';
export const AUTH_RUNTIME_COMMAND_PROPAGATION_FILE =
  'contracts/auth-runtime-command-propagation.yaml';

export const AUTH_SESSION_RUNTIME_STATUS = 'contracted_no_live_handler';
const AUTH_RUNTIME_ADMISSION_CONTEXT_STATUS = 'contract_only_no_live_handler';
export const AUTH_RUNTIME_ADMISSION_CONTEXT_BOUNDARY_STATUS =
  'typed_admission_boundary_no_live_handler';
const AUTH_RUNTIME_COMMAND_PROPAGATION_STATUS = 'contract_only_no_live_handler';
export const AUTH_RUNTIME_COMMAND_PROPAGATION_BOUNDARY_STATUS =
  'typed_propagation_boundary_no_live_handler';
const AUTH_SESSION_CATALOG_SOURCE =
  'zdp-api-contracts/contracts/apis/catalog.yaml';

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
  'no_credential_vault_capability_handoff_implementation',
  'no_passkey_challenge_store_implementation',
  'no_auth_audit_event_persistence_implementation',
  'no_idempotency_storage_implementation',
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

const REQUIRED_AUTH_RUNTIME_ADMISSION_CONTEXT_FIELDS = [
  'operation_id',
  'actor_id',
  'tenant_id',
  'request_id',
  'trace_id',
  'idempotency_key',
  'command_id',
  'requested_at',
  'session_effect',
  'audit_event_ref',
  'resource_ref'
] as const;

const REQUIRED_AUTH_RUNTIME_ADMISSION_CONTEXT_OPTIONAL_FIELDS = [
  'correlation_id',
  'causation_id',
  'source'
] as const;

const REQUIRED_AUTH_RUNTIME_ADMISSION_CONTEXT_CONTROLS = [
  'command_envelope_composition',
  'operation_id_matches_command_type',
  'operation_session_effect_match',
  'request_id_required',
  'trace_id_required',
  'idempotency_key_scope',
  'tenant_actor_scope',
  'resource_scope_required',
  'audit_event_reference',
  'correlation_causation_propagation',
  'raw_credential_payload_rejected',
  'raw_provider_payload_rejected',
  'no_live_handler'
] as const;

const REQUIRED_AUTH_RUNTIME_ADMISSION_CONTEXT_FORBIDDEN_VALUES = [
  'raw_request_body',
  'raw_secret',
  'refresh_token_plaintext',
  'oauth_refresh_token_plaintext',
  'provider_secret',
  'authorization_header',
  'cookie_header',
  'raw_provider_payload',
  'raw_provider_error',
  'password_plaintext',
  'password_hash',
  'authorization_code',
  'oauth_access_token',
  'passkey_private_key',
  'client_data_json',
  'attestation_object'
] as const;

const REQUIRED_AUTH_RUNTIME_ADMISSION_CONTEXT_FORBIDDEN_CLAIMS = [
  'live_auth_handler_ready',
  'durable_storage_ready',
  'provider_token_exchange_ready',
  'product_route_unblocked'
] as const;

const REQUIRED_AUTH_RUNTIME_COMMAND_PROPAGATION_FIELDS = [
  'operation_id',
  'session_effect',
  'actor_id',
  'tenant_id',
  'request_id',
  'trace_id',
  'idempotency_key',
  'command_id',
  'audit_event_ref',
  'resource_ref'
] as const;

const REQUIRED_AUTH_RUNTIME_COMMAND_PROPAGATION_TARGETS = [
  'session_store',
  'passkey_challenge_store',
  'oauth_callback_state_store',
  'auth_audit_event',
  'idempotency_record'
] as const;

const REQUIRED_AUTH_RUNTIME_COMMAND_PROPAGATION_CONTROLS = [
  'admission_context_source',
  'target_scope_declared',
  'request_id_preserved',
  'trace_id_preserved',
  'idempotency_key_preserved',
  'command_id_preserved',
  'audit_event_ref_preserved',
  'tenant_actor_scope_preserved',
  'resource_ref_preserved',
  'raw_credential_payload_rejected',
  'raw_provider_payload_rejected',
  'no_live_handler'
] as const;

const REQUIRED_AUTH_RUNTIME_COMMAND_PROPAGATION_FORBIDDEN_VALUES = [
  'raw_request_body',
  'raw_secret',
  'refresh_token_plaintext',
  'oauth_refresh_token_plaintext',
  'provider_secret',
  'authorization_header',
  'cookie_header',
  'raw_provider_payload',
  'raw_provider_error',
  'password_plaintext',
  'password_hash',
  'authorization_code',
  'oauth_access_token',
  'passkey_private_key',
  'client_data_json',
  'attestation_object'
] as const;

const REQUIRED_AUTH_RUNTIME_COMMAND_PROPAGATION_FORBIDDEN_CLAIMS = [
  'live_auth_handler_ready',
  'durable_request_propagation_ready',
  'durable_storage_ready',
  'provider_token_exchange_ready',
  'product_route_unblocked'
] as const;

export function validateAuthSessionRuntimeContract(
  value: unknown
): readonly Diagnostic[] {
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

export function validateAuthRuntimeAdmissionContextContract(
  value: unknown
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (
    readPath(value, 'contract.status') !==
    AUTH_RUNTIME_ADMISSION_CONTEXT_STATUS
  ) {
    diagnostics.push(
      createCoreDiagnostic(
        AUTH_RUNTIME_ADMISSION_CONTEXT_FILE,
        'contract.status',
        `Core platform auth runtime admission context contract must stay \`${AUTH_RUNTIME_ADMISSION_CONTEXT_STATUS}\` until live handlers are reviewed.`
      )
    );
  }

  if (readPath(value, 'contract.owner_boundary') !== 'identity') {
    diagnostics.push(
      createCoreDiagnostic(
        AUTH_RUNTIME_ADMISSION_CONTEXT_FILE,
        'contract.owner_boundary',
        'Core platform auth runtime admission context contract must keep owner_boundary `identity`.'
      )
    );
  }

  if (readPath(value, 'contract.runtime_status') !== AUTH_SESSION_RUNTIME_STATUS) {
    diagnostics.push(
      createCoreDiagnostic(
        AUTH_RUNTIME_ADMISSION_CONTEXT_FILE,
        'contract.runtime_status',
        `Core platform auth runtime admission context contract must keep runtime_status \`${AUTH_SESSION_RUNTIME_STATUS}\`.`
      )
    );
  }

  if (
    readPath(value, 'contract.source_contract') !== AUTH_SESSION_RUNTIME_FILE
  ) {
    diagnostics.push(
      createCoreDiagnostic(
        AUTH_RUNTIME_ADMISSION_CONTEXT_FILE,
        'contract.source_contract',
        `Core platform auth runtime admission context contract must reference \`${AUTH_SESSION_RUNTIME_FILE}\`.`
      )
    );
  }

  if (
    readPath(value, 'contract.typed_boundary_status') !==
    AUTH_RUNTIME_ADMISSION_CONTEXT_BOUNDARY_STATUS
  ) {
    diagnostics.push(
      createCoreDiagnostic(
        AUTH_RUNTIME_ADMISSION_CONTEXT_FILE,
        'contract.typed_boundary_status',
        `Core platform auth runtime admission context boundary must stay \`${AUTH_RUNTIME_ADMISSION_CONTEXT_BOUNDARY_STATUS}\` until live handlers exist.`
      )
    );
  }

  diagnostics.push(
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_RUNTIME_ADMISSION_CONTEXT_FILE,
      path: 'required_context_fields',
      field: 'required_context_fields',
      requiredEntries: REQUIRED_AUTH_RUNTIME_ADMISSION_CONTEXT_FIELDS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_RUNTIME_ADMISSION_CONTEXT_FILE,
      path: 'optional_context_fields',
      field: 'optional_context_fields',
      requiredEntries: REQUIRED_AUTH_RUNTIME_ADMISSION_CONTEXT_OPTIONAL_FIELDS
    }),
    ...validateAuthRuntimeAdmissionOperations(
      readPath(value, 'supported_operations')
    ),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_RUNTIME_ADMISSION_CONTEXT_FILE,
      path: 'required_controls',
      field: 'required_controls',
      requiredEntries: REQUIRED_AUTH_RUNTIME_ADMISSION_CONTEXT_CONTROLS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_RUNTIME_ADMISSION_CONTEXT_FILE,
      path: 'forbidden_context_values',
      field: 'forbidden_context_values',
      requiredEntries: REQUIRED_AUTH_RUNTIME_ADMISSION_CONTEXT_FORBIDDEN_VALUES
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_RUNTIME_ADMISSION_CONTEXT_FILE,
      path: 'forbidden_runtime_claims',
      field: 'forbidden_runtime_claims',
      requiredEntries: REQUIRED_AUTH_RUNTIME_ADMISSION_CONTEXT_FORBIDDEN_CLAIMS
    })
  );

  return diagnostics;
}

export function validateAuthRuntimeCommandPropagationContract(
  value: unknown
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (
    readPath(value, 'contract.status') !==
    AUTH_RUNTIME_COMMAND_PROPAGATION_STATUS
  ) {
    diagnostics.push(
      createCoreDiagnostic(
        AUTH_RUNTIME_COMMAND_PROPAGATION_FILE,
        'contract.status',
        `Core platform auth runtime command propagation contract must stay \`${AUTH_RUNTIME_COMMAND_PROPAGATION_STATUS}\` until live handlers are reviewed.`
      )
    );
  }

  if (readPath(value, 'contract.owner_boundary') !== 'identity') {
    diagnostics.push(
      createCoreDiagnostic(
        AUTH_RUNTIME_COMMAND_PROPAGATION_FILE,
        'contract.owner_boundary',
        'Core platform auth runtime command propagation contract must keep owner_boundary `identity`.'
      )
    );
  }

  if (readPath(value, 'contract.runtime_status') !== AUTH_SESSION_RUNTIME_STATUS) {
    diagnostics.push(
      createCoreDiagnostic(
        AUTH_RUNTIME_COMMAND_PROPAGATION_FILE,
        'contract.runtime_status',
        `Core platform auth runtime command propagation contract must keep runtime_status \`${AUTH_SESSION_RUNTIME_STATUS}\`.`
      )
    );
  }

  if (
    readPath(value, 'contract.source_contract') !==
    AUTH_RUNTIME_ADMISSION_CONTEXT_FILE
  ) {
    diagnostics.push(
      createCoreDiagnostic(
        AUTH_RUNTIME_COMMAND_PROPAGATION_FILE,
        'contract.source_contract',
        `Core platform auth runtime command propagation contract must reference \`${AUTH_RUNTIME_ADMISSION_CONTEXT_FILE}\`.`
      )
    );
  }

  if (
    readPath(value, 'contract.typed_boundary_status') !==
    AUTH_RUNTIME_COMMAND_PROPAGATION_BOUNDARY_STATUS
  ) {
    diagnostics.push(
      createCoreDiagnostic(
        AUTH_RUNTIME_COMMAND_PROPAGATION_FILE,
        'contract.typed_boundary_status',
        `Core platform auth runtime command propagation boundary must stay \`${AUTH_RUNTIME_COMMAND_PROPAGATION_BOUNDARY_STATUS}\` until live handlers exist.`
      )
    );
  }

  diagnostics.push(
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_RUNTIME_COMMAND_PROPAGATION_FILE,
      path: 'required_propagated_fields',
      field: 'required_propagated_fields',
      requiredEntries: REQUIRED_AUTH_RUNTIME_COMMAND_PROPAGATION_FIELDS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_RUNTIME_COMMAND_PROPAGATION_FILE,
      path: 'supported_targets',
      field: 'supported_targets',
      requiredEntries: REQUIRED_AUTH_RUNTIME_COMMAND_PROPAGATION_TARGETS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_RUNTIME_COMMAND_PROPAGATION_FILE,
      path: 'required_controls',
      field: 'required_controls',
      requiredEntries: REQUIRED_AUTH_RUNTIME_COMMAND_PROPAGATION_CONTROLS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_RUNTIME_COMMAND_PROPAGATION_FILE,
      path: 'forbidden_propagation_values',
      field: 'forbidden_propagation_values',
      requiredEntries: REQUIRED_AUTH_RUNTIME_COMMAND_PROPAGATION_FORBIDDEN_VALUES
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_RUNTIME_COMMAND_PROPAGATION_FILE,
      path: 'forbidden_runtime_claims',
      field: 'forbidden_runtime_claims',
      requiredEntries: REQUIRED_AUTH_RUNTIME_COMMAND_PROPAGATION_FORBIDDEN_CLAIMS
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

function validateAuthRuntimeAdmissionOperations(
  operations: unknown
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (!Array.isArray(operations)) {
    return [
      createCoreDiagnostic(
        AUTH_RUNTIME_ADMISSION_CONTEXT_FILE,
        'supported_operations',
        'Core platform auth runtime admission context contract must declare `supported_operations`.'
      )
    ];
  }

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
          AUTH_RUNTIME_ADMISSION_CONTEXT_FILE,
          'supported_operations',
          `Core platform auth runtime admission context contract must include operation \`${requiredOperation.operationId}\`.`
        )
      );
      continue;
    }

    if (readStringField(operation, 'session_effect') !== requiredOperation.sessionEffect) {
      diagnostics.push(
        createCoreDiagnostic(
          AUTH_RUNTIME_ADMISSION_CONTEXT_FILE,
          `supported_operations.${requiredOperation.operationId}.session_effect`,
          `Core platform auth runtime admission operation \`${requiredOperation.operationId}\` must declare session_effect \`${requiredOperation.sessionEffect}\`.`
        )
      );
    }
  }

  return diagnostics;
}
