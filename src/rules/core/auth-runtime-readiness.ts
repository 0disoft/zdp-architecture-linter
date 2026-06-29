import type { Diagnostic } from '../../diagnostics.ts';
import {
  createCoreDiagnostic,
  isRecord,
  readPath,
  readStringField,
  validateRequiredStringArrayEntries
} from './contract-helpers.ts';

export interface AuthRuntimeReadinessContractRefs {
  readonly authSessionRuntimeFile: string;
  readonly authRuntimeReadinessFile: string;
  readonly authRuntimeAdmissionContextFile: string;
  readonly authRuntimeCommandPropagationFile: string;
  readonly authRuntimeCommandPropagationBoundaryStatus: string;
  readonly identitySessionStoreFile: string;
  readonly identitySessionStoreStatus: string;
  readonly identitySessionStoreAdapterBoundaryStatus: string;
  readonly authDurableStorageAdmissionFile: string;
  readonly authDurableStorageMigrationReadinessFile: string;
  readonly authDurableStorageMigrationReadinessStatus: string;
  readonly authDurableStorageMigrationReadinessBoundaryStatus: string;
  readonly authDurableStorageTransactionOutboxFile: string;
  readonly authDurableStorageTransactionOutboxStatus: string;
  readonly authDurableStorageTransactionOutboxBoundaryStatus: string;
  readonly authCredentialVaultHandoffFile: string;
  readonly authCredentialVaultHandoffStatus: string;
  readonly authCredentialVaultCapabilityClientBoundaryStatus: string;
  readonly authPasskeyChallengeStoreFile: string;
  readonly authPasskeyChallengeStoreStatus: string;
  readonly authPasskeyChallengeStoreAdapterBoundaryStatus: string;
  readonly authOauthCallbackStateFile: string;
  readonly authOauthCallbackStateStatus: string;
  readonly authOauthCallbackStateAdapterBoundaryStatus: string;
  readonly authAuditEventPersistenceFile: string;
  readonly authAuditEventPersistenceStatus: string;
  readonly authAuditStorageAdapterFile: string;
  readonly authAuditStorageAdapterStatus: string;
  readonly authAuditStorageAdapterBoundaryStatus: string;
  readonly authIdempotencyStorageFile: string;
  readonly authIdempotencyStorageStatus: string;
  readonly authIdempotencyStorageAdapterBoundaryStatus: string;
  readonly coreRuntimePostgresAdapterFile: string;
  readonly coreRuntimePostgresAdapterStatus: string;
  readonly coreRuntimePostgresAdapterBoundaryStatus: string;
}

export interface AuthRuntimeReadinessGateRequirement {
  readonly gateId: string;
  readonly contractStatus: string;
  readonly typedBoundaryStatus: string;
  readonly durableImplementationStatus: string;
  readonly reviewStatus: string;
  readonly promotionBlocker?: string;
  readonly evidenceContracts: readonly string[];
}

const REQUIRED_AUTH_RUNTIME_READINESS_FORBIDDEN_CLAIMS = [
  'production_ready',
  'live_auth_handler_ready',
  'durable_storage_ready',
  'transaction_manager_ready',
  'outbox_dispatcher_ready',
  'oauth_provider_exchange_ready',
  'product_route_unblocked'
] as const;

export function createRequiredAuthRuntimeReadinessGates(
  refs: AuthRuntimeReadinessContractRefs
): readonly AuthRuntimeReadinessGateRequirement[] {
  return [
    {
      gateId: 'request_id_propagation',
      contractStatus: 'required_by_auth_runtime_admission_context',
      typedBoundaryStatus: refs.authRuntimeCommandPropagationBoundaryStatus,
      durableImplementationStatus: 'typed_propagation_plan_implemented',
      reviewStatus: 'typed_integration_review_passed',
      evidenceContracts: [
        refs.authSessionRuntimeFile,
        refs.authRuntimeAdmissionContextFile,
        refs.authRuntimeCommandPropagationFile
      ]
    },
    {
      gateId: 'trace_id_propagation',
      contractStatus: 'required_by_auth_runtime_admission_context',
      typedBoundaryStatus: refs.authRuntimeCommandPropagationBoundaryStatus,
      durableImplementationStatus: 'typed_propagation_plan_implemented',
      reviewStatus: 'typed_integration_review_passed',
      evidenceContracts: [
        refs.authSessionRuntimeFile,
        refs.authRuntimeAdmissionContextFile,
        refs.authRuntimeCommandPropagationFile
      ]
    },
    {
      gateId: 'session_store_contract',
      contractStatus: refs.identitySessionStoreStatus,
      typedBoundaryStatus: refs.identitySessionStoreAdapterBoundaryStatus,
      durableImplementationStatus:
        'sqlx_identity_session_store_adapter_implemented',
      reviewStatus: 'typed_sqlx_adapter_review_passed',
      evidenceContracts: [
        refs.authSessionRuntimeFile,
        refs.identitySessionStoreFile,
        refs.authDurableStorageAdmissionFile,
        refs.authDurableStorageMigrationReadinessFile,
        refs.authDurableStorageTransactionOutboxFile
      ]
    },
    {
      gateId: 'credential_vault_handoff',
      contractStatus: refs.authCredentialVaultHandoffStatus,
      typedBoundaryStatus:
        refs.authCredentialVaultCapabilityClientBoundaryStatus,
      durableImplementationStatus:
        'typed_capability_client_port_present_no_live_vault_client',
      reviewStatus: 'integration_review_pending',
      promotionBlocker:
        'credential_vault_live_client_integration_review_pending',
      evidenceContracts: [
        refs.authSessionRuntimeFile,
        refs.authCredentialVaultHandoffFile
      ]
    },
    {
      gateId: 'passkey_challenge_store_contract',
      contractStatus: refs.authPasskeyChallengeStoreStatus,
      typedBoundaryStatus: refs.authPasskeyChallengeStoreAdapterBoundaryStatus,
      durableImplementationStatus:
        'sqlx_passkey_challenge_store_adapter_implemented',
      reviewStatus: 'typed_sqlx_adapter_review_passed',
      evidenceContracts: [
        refs.authSessionRuntimeFile,
        refs.authPasskeyChallengeStoreFile,
        refs.authDurableStorageAdmissionFile,
        refs.authDurableStorageMigrationReadinessFile,
        refs.authDurableStorageTransactionOutboxFile
      ]
    },
    {
      gateId: 'oauth_callback_state_verification',
      contractStatus: refs.authOauthCallbackStateStatus,
      typedBoundaryStatus: refs.authOauthCallbackStateAdapterBoundaryStatus,
      durableImplementationStatus:
        'sqlx_oauth_callback_state_store_adapter_implemented',
      reviewStatus: 'typed_sqlx_adapter_review_passed',
      evidenceContracts: [
        refs.authSessionRuntimeFile,
        refs.authOauthCallbackStateFile,
        refs.authDurableStorageAdmissionFile,
        refs.authDurableStorageMigrationReadinessFile,
        refs.authDurableStorageTransactionOutboxFile
      ]
    },
    {
      gateId: 'audit_event_emission',
      contractStatus: refs.authAuditEventPersistenceStatus,
      typedBoundaryStatus: refs.authAuditStorageAdapterBoundaryStatus,
      durableImplementationStatus: 'sqlx_audit_persistence_adapter_implemented',
      reviewStatus: 'integration_review_pending',
      promotionBlocker: 'auth_audit_integration_review_pending',
      evidenceContracts: [
        refs.authSessionRuntimeFile,
        refs.authAuditEventPersistenceFile,
        refs.authDurableStorageAdmissionFile,
        refs.authDurableStorageMigrationReadinessFile,
        refs.authDurableStorageTransactionOutboxFile
      ]
    },
    {
      gateId: 'auth_audit_storage_adapter',
      contractStatus: refs.authAuditStorageAdapterStatus,
      typedBoundaryStatus: refs.authAuditStorageAdapterBoundaryStatus,
      durableImplementationStatus: 'sqlx_auth_audit_storage_adapter_implemented',
      reviewStatus: 'integration_review_pending',
      promotionBlocker: 'auth_audit_integration_review_pending',
      evidenceContracts: [
        refs.authAuditEventPersistenceFile,
        refs.authAuditStorageAdapterFile,
        refs.authDurableStorageAdmissionFile,
        refs.authDurableStorageMigrationReadinessFile,
        refs.authDurableStorageTransactionOutboxFile
      ]
    },
    {
      gateId: 'idempotency_key_scope',
      contractStatus: refs.authIdempotencyStorageStatus,
      typedBoundaryStatus: refs.authIdempotencyStorageAdapterBoundaryStatus,
      durableImplementationStatus: 'idempotency_adapter_implemented',
      reviewStatus: 'typed_sqlx_adapter_review_passed',
      evidenceContracts: [
        refs.authSessionRuntimeFile,
        refs.authRuntimeAdmissionContextFile,
        refs.authRuntimeCommandPropagationFile,
        refs.authIdempotencyStorageFile,
        refs.authDurableStorageAdmissionFile,
        refs.authDurableStorageMigrationReadinessFile,
        refs.authDurableStorageTransactionOutboxFile
      ]
    },
    {
      gateId: 'core_runtime_foundation_boundary',
      contractStatus: refs.coreRuntimePostgresAdapterStatus,
      typedBoundaryStatus: refs.coreRuntimePostgresAdapterBoundaryStatus,
      durableImplementationStatus:
        'sqlx_runtime_foundation_implemented_no_auth_promotion',
      reviewStatus: 'integration_review_pending',
      promotionBlocker: 'core_runtime_live_auth_integration_review_pending',
      evidenceContracts: [
        refs.authSessionRuntimeFile,
        refs.authRuntimeReadinessFile,
        refs.coreRuntimePostgresAdapterFile,
        refs.authIdempotencyStorageFile,
        refs.authDurableStorageTransactionOutboxFile
      ]
    },
    {
      gateId: 'refresh_token_rotation_without_plaintext_storage',
      contractStatus: refs.identitySessionStoreStatus,
      typedBoundaryStatus: refs.identitySessionStoreAdapterBoundaryStatus,
      durableImplementationStatus:
        'sqlx_refresh_token_rotation_adapter_implemented',
      reviewStatus: 'typed_sqlx_adapter_review_passed',
      evidenceContracts: [
        refs.authSessionRuntimeFile,
        refs.identitySessionStoreFile,
        refs.authDurableStorageAdmissionFile,
        refs.authDurableStorageMigrationReadinessFile,
        refs.authDurableStorageTransactionOutboxFile
      ]
    },
    {
      gateId: 'auth_durable_storage_migration_readiness',
      contractStatus: refs.authDurableStorageMigrationReadinessStatus,
      typedBoundaryStatus:
        refs.authDurableStorageMigrationReadinessBoundaryStatus,
      durableImplementationStatus:
        'repo_local_migration_preflight_implemented_no_apply',
      reviewStatus: 'integration_review_pending',
      promotionBlocker:
        'auth_durable_storage_migration_preflight_review_pending',
      evidenceContracts: [
        refs.authDurableStorageAdmissionFile,
        refs.authDurableStorageMigrationReadinessFile
      ]
    },
    {
      gateId: 'auth_durable_storage_transaction_outbox_boundary',
      contractStatus: refs.authDurableStorageTransactionOutboxStatus,
      typedBoundaryStatus:
        refs.authDurableStorageTransactionOutboxBoundaryStatus,
      durableImplementationStatus:
        'idempotency_transaction_outbox_adapter_implemented',
      reviewStatus: 'integration_review_pending',
      promotionBlocker: 'transaction_outbox_dispatcher_replay_review_pending',
      evidenceContracts: [
        refs.authDurableStorageMigrationReadinessFile,
        refs.authDurableStorageTransactionOutboxFile
      ]
    },
    {
      gateId: 'product_reviewer_approval',
      contractStatus: 'required_by_auth_session_runtime',
      typedBoundaryStatus: 'no_typed_boundary_needed',
      durableImplementationStatus: 'review_missing',
      reviewStatus: 'review_missing',
      promotionBlocker: 'no_product_reviewer_approval',
      evidenceContracts: [refs.authSessionRuntimeFile]
    }
  ];
}

export function validateAuthRuntimeReadinessContract(input: {
  readonly value: unknown;
  readonly file: string;
  readonly status: string;
  readonly runtimeStatus: string;
  readonly requiredGates: readonly AuthRuntimeReadinessGateRequirement[];
}): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (readPath(input.value, 'contract.status') !== input.status) {
    diagnostics.push(
      createCoreDiagnostic(
        input.file,
        'contract.status',
        `Core platform auth runtime readiness summary must stay \`${input.status}\` until durable implementation and review proof exist.`
      )
    );
  }

  if (readPath(input.value, 'contract.owner_boundary') !== 'identity') {
    diagnostics.push(
      createCoreDiagnostic(
        input.file,
        'contract.owner_boundary',
        'Core platform auth runtime readiness summary must keep owner_boundary `identity`.'
      )
    );
  }

  if (readPath(input.value, 'contract.runtime_status') !== input.runtimeStatus) {
    diagnostics.push(
      createCoreDiagnostic(
        input.file,
        'contract.runtime_status',
        `Core platform auth runtime readiness summary must keep runtime_status \`${input.runtimeStatus}\`.`
      )
    );
  }

  if (readPath(input.value, 'promotion_ready') !== false) {
    diagnostics.push(
      createCoreDiagnostic(
        input.file,
        'promotion_ready',
        'Core platform auth runtime readiness summary must keep `promotion_ready` false until all promotion blockers are removed by durable proof.'
      )
    );
  }

  if (readPath(input.value, 'production_route_ready') !== false) {
    diagnostics.push(
      createCoreDiagnostic(
        input.file,
        'production_route_ready',
        'Core platform auth runtime readiness summary must keep `production_route_ready` false until product route promotion is reviewed.'
      )
    );
  }

  const gateStates = readPath(input.value, 'required_gate_states');

  if (!Array.isArray(gateStates)) {
    diagnostics.push(
      createCoreDiagnostic(
        input.file,
        'required_gate_states',
        'Core platform auth runtime readiness summary must declare `required_gate_states`.'
      )
    );
  } else {
    diagnostics.push(
      ...validateAuthRuntimeReadinessGateStates({
        file: input.file,
        gateStates,
        requiredGates: input.requiredGates
      })
    );
  }

  diagnostics.push(
    ...validateRequiredStringArrayEntries({
      value: input.value,
      file: input.file,
      path: 'blocking_summary',
      field: 'blocking_summary',
      requiredEntries: input.requiredGates.flatMap((gate) =>
        gate.promotionBlocker === undefined ? [] : [gate.promotionBlocker]
      )
    }),
    ...validateRequiredStringArrayEntries({
      value: input.value,
      file: input.file,
      path: 'forbidden_readiness_claims',
      field: 'forbidden_readiness_claims',
      requiredEntries: REQUIRED_AUTH_RUNTIME_READINESS_FORBIDDEN_CLAIMS
    })
  );

  return diagnostics;
}

function validateAuthRuntimeReadinessGateStates(input: {
  readonly file: string;
  readonly gateStates: readonly unknown[];
  readonly requiredGates: readonly AuthRuntimeReadinessGateRequirement[];
}): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const requiredGate of input.requiredGates) {
    const gate = input.gateStates.find(
      (entry) =>
        isRecord(entry) && readStringField(entry, 'gate_id') === requiredGate.gateId
    );

    if (!isRecord(gate)) {
      diagnostics.push(
        createCoreDiagnostic(
          input.file,
          'required_gate_states',
          `Core platform auth runtime readiness summary must include gate \`${requiredGate.gateId}\`.`
        )
      );
      continue;
    }

    diagnostics.push(
      ...validateReadinessGateField({
        file: input.file,
        gate,
        gateId: requiredGate.gateId,
        field: 'contract_status',
        expectedValue: requiredGate.contractStatus
      }),
      ...validateReadinessGateField({
        file: input.file,
        gate,
        gateId: requiredGate.gateId,
        field: 'typed_boundary_status',
        expectedValue: requiredGate.typedBoundaryStatus
      }),
      ...validateReadinessGateField({
        file: input.file,
        gate,
        gateId: requiredGate.gateId,
        field: 'durable_implementation_status',
        expectedValue: requiredGate.durableImplementationStatus
      }),
      ...validateReadinessGateField({
        file: input.file,
        gate,
        gateId: requiredGate.gateId,
        field: 'review_status',
        expectedValue: requiredGate.reviewStatus
      }),
      ...validateReadinessGatePromotionBlocker({
        file: input.file,
        gate,
        gateId: requiredGate.gateId,
        expectedValue: requiredGate.promotionBlocker
      }),
      ...validateRequiredStringArrayEntries({
        value: gate,
        file: input.file,
        path: `required_gate_states.${requiredGate.gateId}.evidence_contracts`,
        field: 'evidence_contracts',
        requiredEntries: requiredGate.evidenceContracts
      })
    );
  }

  return diagnostics;
}

function validateReadinessGatePromotionBlocker(input: {
  readonly file: string;
  readonly gate: Record<string, unknown>;
  readonly gateId: string;
  readonly expectedValue?: string;
}): readonly Diagnostic[] {
  if (input.expectedValue !== undefined) {
    return validateReadinessGateField({
      file: input.file,
      gate: input.gate,
      gateId: input.gateId,
      field: 'promotion_blocker',
      expectedValue: input.expectedValue
    });
  }

  if (readStringField(input.gate, 'promotion_blocker') === null) {
    return [];
  }

  return [
    createCoreDiagnostic(
      input.file,
      `required_gate_states.${input.gateId}.promotion_blocker`,
      `Core platform auth runtime readiness gate \`${input.gateId}\` must omit \`promotion_blocker\` after typed integration review passes.`
    )
  ];
}

function validateReadinessGateField(input: {
  readonly file: string;
  readonly gate: Record<string, unknown>;
  readonly gateId: string;
  readonly field: string;
  readonly expectedValue: string;
}): readonly Diagnostic[] {
  if (readStringField(input.gate, input.field) === input.expectedValue) {
    return [];
  }

  return [
    createCoreDiagnostic(
      input.file,
      `required_gate_states.${input.gateId}.${input.field}`,
      `Core platform auth runtime readiness gate \`${input.gateId}\` must keep \`${input.field}\` as \`${input.expectedValue}\`.`
    )
  ];
}
