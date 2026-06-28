import type { Diagnostic } from '../../diagnostics.ts';
import {
  CREDENTIAL_VAULT_REPOSITORY_NAME,
  createCredentialDiagnostic,
  readRecordArrayPath,
  readStringField,
  validateExactStringArrayEntries,
  validateExactValue,
  validateMaxNumber,
  validatePositiveSafeInteger,
  validateRequiredStringArrayEntries
} from './contract-helpers.ts';

export const CREDENTIAL_BOUNDARY_FILE = 'contracts/credential-boundary.yaml';
export const CAPABILITY_ISSUANCE_FILE = 'contracts/capability-issuance.yaml';
export const ACCESS_AUDIT_FILE = 'contracts/access-audit.yaml';
export const STORAGE_BOUNDARY_FILE = 'contracts/storage-boundary.yaml';

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

export const REQUIRED_AUDIT_EVENTS = [
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

const REQUIRED_STATELESS_EXCEPTION_FIELDS = [
  'architecture_decision',
  'revocation_plan',
  'audit_correlation',
  'no_secret_material_claims'
] as const;

export function validateCredentialBoundaryContract(
  value: unknown
): readonly Diagnostic[] {
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
    ...validatePositiveSafeInteger({
      value,
      file: CREDENTIAL_BOUNDARY_FILE,
      path: 'capabilities.max_ttl_seconds',
      message: 'Credential capability max TTL must be a positive integer.'
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

export function validateCapabilityIssuanceContract(
  value: unknown
): readonly Diagnostic[] {
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
    ...validatePositiveSafeInteger({
      value,
      file: CAPABILITY_ISSUANCE_FILE,
      path: 'max_ttl_seconds',
      message: 'Credential capability max TTL must be a positive integer.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: CAPABILITY_ISSUANCE_FILE,
      path: 'request_required',
      field: 'request_required',
      requiredEntries: REQUIRED_CAPABILITY_REQUEST_FIELDS
    }),
    ...validateExactStringArrayEntries({
      value,
      file: CAPABILITY_ISSUANCE_FILE,
      path: 'allowed_operations',
      field: 'allowed_operations',
      expectedEntries: REQUIRED_ALLOWED_OPERATIONS
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
      message:
        'Connector repositories must not persist credential capabilities.'
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
    }),
    ...validateExactValue({
      value,
      file: CAPABILITY_ISSUANCE_FILE,
      path: 'renewal.supported',
      expected: true,
      message: 'Credential capability renewal must stay supported.'
    }),
    ...validateMaxNumber({
      value,
      file: CAPABILITY_ISSUANCE_FILE,
      path: 'renewal.renew_before_expiry_seconds',
      max: 300,
      message:
        'Credential capability renewal lead time must not exceed the capability TTL.'
    }),
    ...validatePositiveSafeInteger({
      value,
      file: CAPABILITY_ISSUANCE_FILE,
      path: 'renewal.renew_before_expiry_seconds',
      message:
        'Credential capability renewal lead time must be a positive integer.'
    }),
    ...validateMaxNumber({
      value,
      file: CAPABILITY_ISSUANCE_FILE,
      path: 'renewal.max_renewal_chain_seconds',
      max: 900,
      message:
        'Credential capability renewal chains must stay short enough for revocation to matter.'
    }),
    ...validatePositiveSafeInteger({
      value,
      file: CAPABILITY_ISSUANCE_FILE,
      path: 'renewal.max_renewal_chain_seconds',
      message:
        'Credential capability renewal chain length must be a positive integer.'
    }),
    ...validateExactValue({
      value,
      file: CAPABILITY_ISSUANCE_FILE,
      path: 'renewal.requires_fresh_audit_reason',
      expected: true,
      message: 'Credential capability renewal must require a fresh audit reason.'
    }),
    ...validateExactValue({
      value,
      file: CAPABILITY_ISSUANCE_FILE,
      path: 'load_shedding.edge_validation_cache.allowed',
      expected: true,
      message: 'Credential edge validation cache must remain explicitly allowed.'
    }),
    ...validateExactValue({
      value,
      file: CAPABILITY_ISSUANCE_FILE,
      path: 'load_shedding.edge_validation_cache.scope',
      expected: 'revocation_metadata_only',
      message:
        'Credential edge validation cache must be limited to revocation metadata.'
    }),
    ...validateMaxNumber({
      value,
      file: CAPABILITY_ISSUANCE_FILE,
      path: 'load_shedding.edge_validation_cache.max_ttl_seconds',
      max: 30,
      message: 'Credential edge validation cache TTL must be 30 seconds or less.'
    }),
    ...validatePositiveSafeInteger({
      value,
      file: CAPABILITY_ISSUANCE_FILE,
      path: 'load_shedding.edge_validation_cache.max_ttl_seconds',
      message: 'Credential edge validation cache TTL must be a positive integer.'
    }),
    ...validateExactValue({
      value,
      file: CAPABILITY_ISSUANCE_FILE,
      path: 'load_shedding.edge_validation_cache.secret_material_allowed',
      expected: false,
      message: 'Credential edge validation cache must not allow secret material.'
    }),
    ...validateExactValue({
      value,
      file: CAPABILITY_ISSUANCE_FILE,
      path: 'load_shedding.stateless_capability.allowed_by_default',
      expected: false,
      message: 'Credential stateless capabilities must not be allowed by default.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: CAPABILITY_ISSUANCE_FILE,
      path: 'load_shedding.stateless_capability.exception_requires',
      field: 'load_shedding.stateless_capability.exception_requires',
      requiredEntries: REQUIRED_STATELESS_EXCEPTION_FIELDS
    })
  ];
}

export function validateAccessAuditContract(
  value: unknown
): readonly Diagnostic[] {
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

export function validateStorageBoundaryContract(
  value: unknown
): readonly Diagnostic[] {
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
    ...validateExactStringArrayEntries({
      value,
      file: STORAGE_BOUNDARY_FILE,
      path: 'allowed_interfaces',
      field: 'allowed_interfaces',
      expectedEntries: REQUIRED_ALLOWED_INTERFACES
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
  }

  for (const credentialClass of classes) {
    diagnostics.push(...validateCredentialClass(credentialClass));
  }

  return diagnostics;
}

function validateCredentialClass(
  credentialClass: Record<string, unknown>
): readonly Diagnostic[] {
  const credentialClassId =
    readStringField(credentialClass, 'id') ?? 'unknown_credential_class';

  return [
    ...validateExactValue({
      value: credentialClass,
      file: CREDENTIAL_BOUNDARY_FILE,
      path: 'plaintext_export_allowed',
      diagnosticPath: `credential_classes.${credentialClassId}.plaintext_export_allowed`,
      expected: false,
      message: `Credential class \`${credentialClassId}\` must set plaintext export to false.`
    }),
    ...validateExactValue({
      value: credentialClass,
      file: CREDENTIAL_BOUNDARY_FILE,
      path: 'encryption_required',
      diagnosticPath: `credential_classes.${credentialClassId}.encryption_required`,
      expected: true,
      message: `Credential class \`${credentialClassId}\` must require encryption.`
    }),
    ...validateExactValue({
      value: credentialClass,
      file: CREDENTIAL_BOUNDARY_FILE,
      path: 'audit_required',
      diagnosticPath: `credential_classes.${credentialClassId}.audit_required`,
      expected: true,
      message: `Credential class \`${credentialClassId}\` must require audit.`
    }),
    ...validateExactValue({
      value: credentialClass,
      file: CREDENTIAL_BOUNDARY_FILE,
      path: 'rotation_supported',
      diagnosticPath: `credential_classes.${credentialClassId}.rotation_supported`,
      expected: true,
      message: `Credential class \`${credentialClassId}\` must support rotation.`
    }),
    ...validateExactValue({
      value: credentialClass,
      file: CREDENTIAL_BOUNDARY_FILE,
      path: 'storage_scope',
      diagnosticPath: `credential_classes.${credentialClassId}.storage_scope`,
      expected: 'vault_only',
      message:
        `Credential class \`${credentialClassId}\` must keep storage scope at ` +
        '`vault_only`.'
    })
  ];
}
