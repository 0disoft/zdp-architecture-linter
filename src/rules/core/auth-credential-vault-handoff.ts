import type { Diagnostic } from '../../diagnostics.ts';
import {
  createCoreDiagnostic,
  readPath,
  validateRequiredStringArrayEntries
} from './contract-helpers.ts';

export const AUTH_CREDENTIAL_VAULT_HANDOFF_FILE =
  'contracts/auth-credential-vault-handoff.yaml';

export const AUTH_CREDENTIAL_VAULT_HANDOFF_STATUS =
  'contract_only_no_capability_client';

export const AUTH_CREDENTIAL_VAULT_CAPABILITY_CLIENT_BOUNDARY_STATUS =
  'typed_capability_client_boundary_no_vault_client';

const REQUIRED_AUTH_CREDENTIAL_VAULT_FIELDS = [
  'capability_ref',
  'capability_subject_id',
  'tenant_id',
  'capability_scope',
  'credential_kind',
  'issued_at',
  'expires_at',
  'created_by_command_id',
  'trace_id'
] as const;

const REQUIRED_AUTH_CREDENTIAL_VAULT_KINDS = [
  'oauth_refresh_token',
  'passkey_credential',
  'password_recovery_secret',
  'session_refresh_token_material'
] as const;

const REQUIRED_AUTH_CREDENTIAL_VAULT_SCOPES = [
  'store_credential',
  'read_credential_metadata',
  'rotate_credential',
  'revoke_credential'
] as const;

const REQUIRED_AUTH_CREDENTIAL_VAULT_CONTROLS = [
  'vault_capability_ref_only',
  'short_lived_capability',
  'tenant_actor_scope',
  'request_id_propagation',
  'trace_id_propagation',
  'command_idempotency_reference',
  'audit_event_reference',
  'no_raw_secret_return',
  'vault_access_audit_required'
] as const;

const REQUIRED_AUTH_CREDENTIAL_VAULT_CAPABILITY_CLIENT_KINDS = [
  'vault_capability_client',
  'credential_metadata_client'
] as const;

const REQUIRED_AUTH_CREDENTIAL_VAULT_CAPABILITY_CLIENT_FIELDS = [
  'client_id',
  'vault_owner_ref',
  'capability_ref',
  'capability_subject_id',
  'tenant_id',
  'credential_kind',
  'capability_scope',
  'issued_at',
  'expires_at',
  'created_by_command_id',
  'idempotency_key',
  'trace_id',
  'request_id',
  'audit_event_ref',
  'vault_access_audit_ref',
  'review_or_client_implementation_ref'
] as const;

const REQUIRED_AUTH_CREDENTIAL_VAULT_CAPABILITY_CLIENT_CONTROLS = [
  'capability_ref_only',
  'metadata_only_response',
  'short_lived_capability',
  'tenant_actor_scope',
  'request_id_propagation',
  'trace_id_propagation',
  'command_idempotency_reference',
  'audit_event_reference_required',
  'vault_access_audit_required',
  'raw_secret_material_rejected',
  'no_provider_payload_storage'
] as const;

const REQUIRED_AUTH_CREDENTIAL_VAULT_FORBIDDEN_VALUES = [
  'refresh_token_plaintext',
  'oauth_refresh_token_plaintext',
  'provider_secret',
  'passkey_private_key',
  'password_plaintext',
  'password_hash',
  'authorization_header',
  'cookie_header',
  'raw_provider_payload'
] as const;

export function validateAuthCredentialVaultHandoffContract(
  value: unknown
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (
    readPath(value, 'contract.status') !== AUTH_CREDENTIAL_VAULT_HANDOFF_STATUS
  ) {
    diagnostics.push(
      createCoreDiagnostic(
        AUTH_CREDENTIAL_VAULT_HANDOFF_FILE,
        'contract.status',
        `Core platform auth credential vault handoff contract must stay \`${AUTH_CREDENTIAL_VAULT_HANDOFF_STATUS}\` until a capability client exists.`
      )
    );
  }

  if (readPath(value, 'contract.owner_boundary') !== 'identity') {
    diagnostics.push(
      createCoreDiagnostic(
        AUTH_CREDENTIAL_VAULT_HANDOFF_FILE,
        'contract.owner_boundary',
        'Core platform auth credential vault handoff contract must keep owner_boundary `identity`.'
      )
    );
  }

  if (
    readPath(value, 'contract.vault_owner_repo') !==
    'zdp-privacy-credential-vault'
  ) {
    diagnostics.push(
      createCoreDiagnostic(
        AUTH_CREDENTIAL_VAULT_HANDOFF_FILE,
        'contract.vault_owner_repo',
        'Core platform auth credential vault handoff contract must keep vault_owner_repo `zdp-privacy-credential-vault`.'
      )
    );
  }

  if (
    readPath(value, 'capability_client_contract.status') !==
    AUTH_CREDENTIAL_VAULT_CAPABILITY_CLIENT_BOUNDARY_STATUS
  ) {
    diagnostics.push(
      createCoreDiagnostic(
        AUTH_CREDENTIAL_VAULT_HANDOFF_FILE,
        'capability_client_contract.status',
        `Core platform auth credential vault capability client boundary must stay \`${AUTH_CREDENTIAL_VAULT_CAPABILITY_CLIENT_BOUNDARY_STATUS}\` until a reviewed live vault client exists.`
      )
    );
  }

  diagnostics.push(
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_CREDENTIAL_VAULT_HANDOFF_FILE,
      path: 'required_capability_fields',
      field: 'required_capability_fields',
      requiredEntries: REQUIRED_AUTH_CREDENTIAL_VAULT_FIELDS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_CREDENTIAL_VAULT_HANDOFF_FILE,
      path: 'required_credential_kinds',
      field: 'required_credential_kinds',
      requiredEntries: REQUIRED_AUTH_CREDENTIAL_VAULT_KINDS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_CREDENTIAL_VAULT_HANDOFF_FILE,
      path: 'required_scopes',
      field: 'required_scopes',
      requiredEntries: REQUIRED_AUTH_CREDENTIAL_VAULT_SCOPES
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_CREDENTIAL_VAULT_HANDOFF_FILE,
      path: 'required_handoff_controls',
      field: 'required_handoff_controls',
      requiredEntries: REQUIRED_AUTH_CREDENTIAL_VAULT_CONTROLS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_CREDENTIAL_VAULT_HANDOFF_FILE,
      path: 'capability_client_contract.client_kinds',
      field: 'capability_client_contract.client_kinds',
      requiredEntries: REQUIRED_AUTH_CREDENTIAL_VAULT_CAPABILITY_CLIENT_KINDS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_CREDENTIAL_VAULT_HANDOFF_FILE,
      path: 'capability_client_contract.required_client_fields',
      field: 'capability_client_contract.required_client_fields',
      requiredEntries: REQUIRED_AUTH_CREDENTIAL_VAULT_CAPABILITY_CLIENT_FIELDS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_CREDENTIAL_VAULT_HANDOFF_FILE,
      path: 'capability_client_contract.required_client_controls',
      field: 'capability_client_contract.required_client_controls',
      requiredEntries: REQUIRED_AUTH_CREDENTIAL_VAULT_CAPABILITY_CLIENT_CONTROLS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: AUTH_CREDENTIAL_VAULT_HANDOFF_FILE,
      path: 'forbidden_payload_values',
      field: 'forbidden_payload_values',
      requiredEntries: REQUIRED_AUTH_CREDENTIAL_VAULT_FORBIDDEN_VALUES
    })
  );

  return diagnostics;
}
