import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { validateRepositoryCredentialVaultContract } from '../src/credential-vault-contract-rules.ts';

describe('credential vault contract rules', () => {
  test('passes when the credential vault repository declares vault contracts', async () => {
    await withRepositoryRoot(createValidCredentialVaultFiles(), async (repositoryRoot) => {
      const diagnostics = await validateRepositoryCredentialVaultContract({
        repositoryRoot,
        repositoryServiceContract: createCredentialVaultServiceContract()
      });

      expect(diagnostics).toEqual([]);
    });
  });

  test('skips repositories that are not zdp-privacy-credential-vault', async () => {
    await withRepositoryRoot({}, async (repositoryRoot) => {
      const diagnostics = await validateRepositoryCredentialVaultContract({
        repositoryRoot,
        repositoryServiceContract: {
          service: {
            repo: 'zdp-privacy-access-broker'
          }
        }
      });

      expect(diagnostics).toEqual([]);
    });
  });

  test('fails when required credential vault contract files are missing', async () => {
    await withRepositoryRoot({}, async (repositoryRoot) => {
      const diagnostics = await validateRepositoryCredentialVaultContract({
        repositoryRoot,
        repositoryServiceContract: createCredentialVaultServiceContract()
      });

      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-CREDENTIAL-001',
        severity: 'error',
        file: 'contracts/credential-boundary.yaml',
        path: 'repository.root',
        message:
          'Credential vault repository must include `contracts/credential-boundary.yaml`.'
      });
      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-CREDENTIAL-001',
        severity: 'error',
        file: 'contracts/capability-issuance.yaml',
        path: 'repository.root',
        message:
          'Credential vault repository must include `contracts/capability-issuance.yaml`.'
      });
      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-CREDENTIAL-001',
        severity: 'error',
        file: 'contracts/access-audit.yaml',
        path: 'repository.root',
        message:
          'Credential vault repository must include `contracts/access-audit.yaml`.'
      });
      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-CREDENTIAL-001',
        severity: 'error',
        file: 'contracts/storage-boundary.yaml',
        path: 'repository.root',
        message:
          'Credential vault repository must include `contracts/storage-boundary.yaml`.'
      });
    });
  });

  test('fails when a credential vault contract file is not valid YAML', async () => {
    await withRepositoryRoot(
      {
        ...createValidCredentialVaultFiles(),
        'contracts/credential-boundary.yaml': 'contract: [broken'
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryCredentialVaultContract({
          repositoryRoot,
          repositoryServiceContract: createCredentialVaultServiceContract()
        });

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]).toMatchObject({
          ruleId: 'ZDP-CREDENTIAL-001',
          severity: 'error',
          file: 'contracts/credential-boundary.yaml',
          path: 'yaml'
        });
      }
    );
  });

  test('fails when credential boundary drifts open', async () => {
    await withRepositoryRoot(
      {
        ...createValidCredentialVaultFiles(),
        'contracts/credential-boundary.yaml': `
contract:
  version: 1
  status: draft
credential_owner: zdp-connectors-platform
default_plaintext_export_allowed: true
credential_classes:
  - id: oauth_refresh_token
    plaintext_export_allowed: true
    encryption_required: false
    audit_required: false
    rotation_supported: false
    storage_scope: connector_cache
forbidden_consumers:
  - product_repositories
forbidden_values:
  - raw_oauth_refresh_token
capabilities:
  max_ttl_seconds: 3600
  requester_must_identify:
    - service_id
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryCredentialVaultContract({
          repositoryRoot,
          repositoryServiceContract: createCredentialVaultServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CREDENTIAL-001',
          severity: 'error',
          file: 'contracts/credential-boundary.yaml',
          path: 'credential_owner',
          message:
            'Credential boundary owner must remain `zdp-privacy-credential-vault`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CREDENTIAL-001',
          severity: 'error',
          file: 'contracts/credential-boundary.yaml',
          path: 'default_plaintext_export_allowed',
          message: 'Credential boundary must default plaintext export to false.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CREDENTIAL-001',
          severity: 'error',
          file: 'contracts/credential-boundary.yaml',
          path: 'credential_classes',
          message:
            'Credential boundary must declare credential class `webhook_secret`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CREDENTIAL-001',
          severity: 'error',
          file: 'contracts/credential-boundary.yaml',
          path: 'forbidden_consumers',
          message:
            'Credential vault contract `contracts/credential-boundary.yaml` must include `connector_repositories` in `forbidden_consumers`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CREDENTIAL-001',
          severity: 'error',
          file: 'contracts/credential-boundary.yaml',
          path: 'capabilities.max_ttl_seconds',
          message: 'Credential capability max TTL must be 300 seconds or less.'
        });
      }
    );
  });

  test('fails when capability issuance allows persistence or delegation', async () => {
    await withRepositoryRoot(
      {
        ...createValidCredentialVaultFiles(),
        'contracts/capability-issuance.yaml': `
contract:
  version: 1
  status: draft
capability_owner: zdp-privacy-credential-vault
token_shape: jwt
max_ttl_seconds: 3600
request_required:
  - service_id
allowed_operations:
  - credential_proxy_use
delegation:
  onward_delegation_allowed: true
  bearer_logging_allowed: true
  persist_in_product_repo_allowed: true
  persist_in_connector_repo_allowed: true
forbidden:
  - plaintext_secret_return
revocation:
  supported: false
audit:
  reason_required: false
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryCredentialVaultContract({
          repositoryRoot,
          repositoryServiceContract: createCredentialVaultServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CREDENTIAL-001',
          severity: 'error',
          file: 'contracts/capability-issuance.yaml',
          path: 'token_shape',
          message: 'Credential capabilities must use opaque references.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CREDENTIAL-001',
          severity: 'error',
          file: 'contracts/capability-issuance.yaml',
          path: 'request_required',
          message:
            'Credential vault contract `contracts/capability-issuance.yaml` must include `trace_id` in `request_required`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CREDENTIAL-001',
          severity: 'error',
          file: 'contracts/capability-issuance.yaml',
          path: 'delegation.onward_delegation_allowed',
          message: 'Credential capabilities must not allow onward delegation.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CREDENTIAL-001',
          severity: 'error',
          file: 'contracts/capability-issuance.yaml',
          path: 'delegation.persist_in_connector_repo_allowed',
          message: 'Connector repositories must not persist credential capabilities.'
        });
      }
    );
  });

  test('fails when audit or storage can expose credential material', async () => {
    await withRepositoryRoot(
      {
        ...createValidCredentialVaultFiles(),
        'contracts/access-audit.yaml': `
contract:
  version: 1
  status: draft
audit_owner: zdp-privacy-credential-vault
events_required:
  - credential.capability.issued
record_required:
  - event_id
forbidden_values:
  - raw_secret
break_glass:
  requires:
    - reason
  forbidden:
    - permanent_exception
`,
        'contracts/storage-boundary.yaml': `
contract:
  version: 1
  status: draft
storage_owner: zdp-connectors-platform
storage_backend_class: postgresql
encryption_at_rest_required: false
key_owner: connector-managed
plaintext_backups_allowed: true
allowed_interfaces:
  - capability_issue
forbidden_storage_locations:
  - product_repository
deletion:
  required: false
  evidence_required: false
restore:
  secret_values_in_restore_evidence_allowed: true
  restore_drill_required_before_production: false
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryCredentialVaultContract({
          repositoryRoot,
          repositoryServiceContract: createCredentialVaultServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CREDENTIAL-001',
          severity: 'error',
          file: 'contracts/access-audit.yaml',
          path: 'audit_owner',
          message: 'Credential access audit owner must remain `zdp-core-platform`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CREDENTIAL-001',
          severity: 'error',
          file: 'contracts/access-audit.yaml',
          path: 'forbidden_values',
          message:
            'Credential vault contract `contracts/access-audit.yaml` must include `encrypted_payload` in `forbidden_values`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CREDENTIAL-001',
          severity: 'error',
          file: 'contracts/storage-boundary.yaml',
          path: 'plaintext_backups_allowed',
          message: 'Credential storage must not allow plaintext backups.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CREDENTIAL-001',
          severity: 'error',
          file: 'contracts/storage-boundary.yaml',
          path: 'restore.secret_values_in_restore_evidence_allowed',
          message: 'Credential restore evidence must not include secret values.'
        });
      }
    );
  });

  test('fails when service contract does not require the credential gate', async () => {
    await withRepositoryRoot(createValidCredentialVaultFiles(), async (repositoryRoot) => {
      const diagnostics = await validateRepositoryCredentialVaultContract({
        repositoryRoot,
        repositoryServiceContract: {
          ...createCredentialVaultServiceContract(),
          policy_gates: {
            required_linter_rules: ['ZDP-REPO-BASELINE-001']
          }
        }
      });

      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-CREDENTIAL-001',
        severity: 'error',
        file: 'service.yaml',
        path: 'policy_gates.required_linter_rules',
        message:
          'Credential vault service contract must require `ZDP-CREDENTIAL-001`.'
      });
    });
  });

  test('fails when credential vault checker files and scripts drift', async () => {
    await withRepositoryRoot(
      {
        ...createValidCredentialVaultFiles(),
        'package.json': `
{
  "scripts": {
    "check": "tsc --noEmit"
  }
}
`,
        'src/credential-vault-contracts/validator.ts': `
const MAX_CAPABILITY_TTL_SECONDS = 300;
`,
        'tests/credential-vault-contracts.test.ts': `
import { test } from 'bun:test';
test('placeholder', () => {});
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryCredentialVaultContract({
          repositoryRoot,
          repositoryServiceContract: createCredentialVaultServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CREDENTIAL-001',
          severity: 'error',
          file: 'package.json',
          path: 'scripts.test',
          message: 'Credential vault package must declare `test` script.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CREDENTIAL-001',
          severity: 'error',
          file: 'package.json',
          path: 'scripts.contracts:check',
          message:
            'Credential vault package must declare `contracts:check` script.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CREDENTIAL-001',
          severity: 'error',
          file: 'src/credential-vault-contracts/validator.ts',
          path: 'source',
          message:
            'Credential vault checker source must include `CRED_RESTORE_SECRET_VALUES_ALLOWED`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CREDENTIAL-001',
          severity: 'error',
          file: 'tests/credential-vault-contracts.test.ts',
          path: 'source',
          message:
            'Credential vault checker source must include `fails when restore evidence can include secret values`.'
        });
      }
    );
  });

  test('fails when credential vault runtime skeleton files and source drift', async () => {
    await withRepositoryRoot(
      {
        ...createValidCredentialVaultFiles(),
        'src/lib.rs': `
pub const SERVICE_ID: &str = "credential-vault";
pub fn app() {}
`,
        'src/boundaries/mod.rs': `
pub mod credential_boundary;
`,
        'src/boundaries/capability_issuance.rs': `
pub const MAX_CAPABILITY_TTL_SECONDS: u16 = 3600;
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryCredentialVaultContract({
          repositoryRoot,
          repositoryServiceContract: createCredentialVaultServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CREDENTIAL-001',
          severity: 'error',
          file: 'src/lib.rs',
          path: 'source',
          message:
            'Credential vault checker source must include `.route("/healthz", get(healthz))`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CREDENTIAL-001',
          severity: 'error',
          file: 'src/lib.rs',
          path: 'source',
          message:
            'Credential vault checker source must include `can_export_plaintext_secret`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CREDENTIAL-001',
          severity: 'error',
          file: 'src/boundaries/mod.rs',
          path: 'source',
          message:
            'Credential vault checker source must include `capability_issuance`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CREDENTIAL-001',
          severity: 'error',
          file: 'src/boundaries/capability_issuance.rs',
          path: 'source',
          message:
            'Credential vault checker source must include `connector_local_cache`.'
        });
      }
    );
  });
});

async function withRepositoryRoot(
  files: Record<string, string>,
  callback: (repositoryRoot: string) => Promise<void>
): Promise<void> {
  const repositoryRoot = await mkdtemp(join(tmpdir(), 'zdp-credential-vault-'));

  try {
    await Promise.all(
      Object.entries(files).map(async ([file, content]) => {
        const target = join(repositoryRoot, file);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, content.trimStart(), 'utf8');
      })
    );

    await callback(repositoryRoot);
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true });
  }
}

function createValidCredentialVaultFiles(): Record<string, string> {
  return {
    'package.json': `
{
  "scripts": {
    "check": "tsc --noEmit && bun test && bun run contracts:check",
    "test": "bun test",
    "contracts:check": "bun scripts/check-credential-vault-contracts.ts"
  }
}
`,
    'bun.lock': `
{
  "lockfileVersion": 1
}
`,
    'tsconfig.json': `
{
  "compilerOptions": {
    "strict": true
  }
}
`,
    'scripts/check-credential-vault-contracts.ts': `
import { runCredentialVaultContractCheckCli } from '../src/credential-vault-contracts/cli';
`,
    'src/credential-vault-contracts/cli.ts': `
export async function runCredentialVaultContractCheckCli(): Promise<number> {
  return 0;
}
`,
    'src/credential-vault-contracts/parser.ts': `
const files = [
  'service.yaml',
  'contracts/credential-boundary.yaml',
  'contracts/capability-issuance.yaml',
  'contracts/access-audit.yaml',
  'contracts/storage-boundary.yaml'
];
`,
    'src/credential-vault-contracts/types.ts': `
export interface CredentialVaultContracts {}
`,
    'src/credential-vault-contracts/validator.ts': `
const MAX_CAPABILITY_TTL_SECONDS = 300;
const codes = [
  'CRED_CLASS_PLAINTEXT_EXPORT_ALLOWED',
  'CRED_CAPABILITY_TTL_TOO_HIGH',
  'CRED_CAPABILITY_CONNECTOR_PERSISTENCE_ALLOWED',
  'CRED_AUDIT_FORBIDDEN_VALUE_MISSING',
  'CRED_RESTORE_SECRET_VALUES_ALLOWED'
];
`,
    'tests/credential-vault-contracts.test.ts': `
const cases = [
  'fails when a credential class allows plaintext export',
  'fails when capability ttl is longer than five minutes',
  'fails when connector repositories can persist capabilities',
  'fails when audit records can include encrypted credential payloads',
  'fails when restore evidence can include secret values'
];
`,
    'Cargo.toml': `
[package]
name = "zdp-privacy-credential-vault"
version = "0.1.0"
edition = "2024"
publish = false

[dependencies]
axum = "0.8"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["macros", "net", "rt-multi-thread", "signal"] }

[dev-dependencies]
tower = { version = "0.5", features = ["util"] }
`,
    'Cargo.lock': `
# This file is automatically @generated by Cargo.
version = 4
`,
    'src/lib.rs': `
use axum::{Json, Router, routing::get};

pub mod boundaries;

pub const SERVICE_ID: &str = "credential-vault";
pub const DEFAULT_BIND_ADDR: &str = "127.0.0.1:3005";
pub const BIND_ADDR_ENV: &str = "ZDP_CREDENTIAL_VAULT_BIND_ADDR";

pub fn app() -> Router {
    Router::new()
        .route("/healthz", get(healthz))
        .route("/readyz", get(readyz))
}

async fn healthz() -> Json<()> {
    Json(())
}

async fn readyz() -> Json<ReadinessResponse> {
    Json(ReadinessResponse {
        ready: true,
        checks: &["contracts"],
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn healthz_returns_credential_vault_identity() {}

    #[test]
    fn readyz_reports_contract_readiness_only() {}

    #[test]
    fn credential_boundaries_do_not_export_or_cache_plaintext_secret_material() {
        let _ = boundaries::ALL
            .iter()
            .all(|boundary| !boundary.can_export_plaintext_secret);
        let _ = boundaries::ALL
            .iter()
            .all(|boundary| !boundary.can_cache_in_connector);
        let _ = boundaries::ALL
            .iter()
            .all(|boundary| !boundary.can_write_secret_to_audit_or_restore_evidence);
        let _ = boundaries::capability_issuance::MAX_CAPABILITY_TTL_SECONDS;
    }
}
`,
    'src/main.rs': `
fn main() {
    let _ = zdp_privacy_credential_vault::bind_addr_from_env;
    let _ = zdp_privacy_credential_vault::serve;
}
`,
    'src/boundaries/mod.rs': `
pub mod access_audit;
pub mod capability_issuance;
pub mod credential_boundary;
pub mod storage_boundary;

pub struct BoundaryMarker {
    pub can_export_plaintext_secret: bool,
    pub can_cache_in_connector: bool,
    pub can_write_secret_to_audit_or_restore_evidence: bool,
}
`,
    'src/boundaries/credential_boundary.rs': `
pub const MARKER: super::BoundaryMarker = super::BoundaryMarker {
    id: "credential_boundary",
    can_export_plaintext_secret: false,
    can_cache_in_connector: false,
    can_write_secret_to_audit_or_restore_evidence: false,
};

pub const REQUIRED_CREDENTIAL_CLASSES: &[&str] = &[
    "oauth_refresh_token",
    "webhook_secret",
    "provider_api_credential",
];

pub const FORBIDDEN_CREDENTIAL_VALUES: &[&str] = &[
    "raw_oauth_refresh_token",
    "raw_webhook_secret",
    "raw_provider_api_credential",
    "authorization_header",
    "cookie",
];
`,
    'src/boundaries/capability_issuance.rs': `
pub const MAX_CAPABILITY_TTL_SECONDS: u16 = 300;

pub const MARKER: super::BoundaryMarker = super::BoundaryMarker {
    id: "capability_issuance",
    can_export_plaintext_secret: false,
    can_cache_in_connector: false,
    can_write_secret_to_audit_or_restore_evidence: false,
};

pub const REQUIRED_CAPABILITY_REQUEST_FIELDS: &[&str] = &[
    "service_id",
    "actor_id",
    "tenant_id",
    "purpose",
    "credential_ref",
    "scope",
    "idempotency_key",
    "request_id",
    "trace_id",
];

pub const FORBIDDEN_CAPABILITY_VALUES: &[&str] = &[
    "plaintext_secret_return",
    "connector_local_cache",
    "analytics_event_export",
];
`,
    'src/boundaries/access_audit.rs': `
pub const MARKER: super::BoundaryMarker = super::BoundaryMarker {
    id: "access_audit",
    can_export_plaintext_secret: false,
    can_cache_in_connector: false,
    can_write_secret_to_audit_or_restore_evidence: false,
};

pub const REQUIRED_AUDIT_EVENTS: &[&str] = &[
    "credential.capability.issued",
    "credential.access.denied",
    "credential.break_glass.used",
    "credential.rotation.performed",
];

pub const FORBIDDEN_AUDIT_VALUES: &[&str] = &[
    "raw_secret",
    "raw_token",
    "authorization_header",
    "cookie",
    "provider_payload",
    "encrypted_payload",
];
`,
    'src/boundaries/storage_boundary.rs': `
pub const MARKER: super::BoundaryMarker = super::BoundaryMarker {
    id: "storage_boundary",
    can_export_plaintext_secret: false,
    can_cache_in_connector: false,
    can_write_secret_to_audit_or_restore_evidence: false,
};

pub const ALLOWED_INTERFACES: &[&str] = &[
    "capability_issue",
    "credential_proxy_use",
    "webhook_signature_verify",
    "credential_rotation",
    "credential_revoke",
];

pub const FORBIDDEN_STORAGE_LOCATIONS: &[&str] = &[
    "product_repository",
    "connector_repository",
    "analytics_event",
    "logs",
    "public_discovery",
];
`,
    'contracts/credential-boundary.yaml': `
contract:
  version: 1
  status: draft
credential_owner: zdp-privacy-credential-vault
default_plaintext_export_allowed: false
credential_classes:
  - id: oauth_refresh_token
    plaintext_export_allowed: false
    encryption_required: true
    audit_required: true
    rotation_supported: true
    storage_scope: vault_only
  - id: webhook_secret
    plaintext_export_allowed: false
    encryption_required: true
    audit_required: true
    rotation_supported: true
    storage_scope: vault_only
  - id: provider_api_credential
    plaintext_export_allowed: false
    encryption_required: true
    audit_required: true
    rotation_supported: true
    storage_scope: vault_only
forbidden_consumers:
  - product_repositories
  - connector_repositories
  - ai_services
  - analytics_services
forbidden_values:
  - raw_oauth_refresh_token
  - raw_webhook_secret
  - raw_provider_api_credential
  - authorization_header
  - cookie
capabilities:
  max_ttl_seconds: 300
  requester_must_identify:
    - service_id
    - actor_id
    - tenant_id
    - purpose
    - credential_ref
`,
    'contracts/capability-issuance.yaml': `
contract:
  version: 1
  status: draft
capability_owner: zdp-privacy-credential-vault
token_shape: opaque_reference
max_ttl_seconds: 300
request_required:
  - service_id
  - actor_id
  - tenant_id
  - purpose
  - credential_ref
  - scope
  - idempotency_key
  - request_id
  - trace_id
allowed_operations:
  - credential_proxy_use
  - webhook_signature_verify
  - credential_rotation
  - credential_revoke
delegation:
  onward_delegation_allowed: false
  bearer_logging_allowed: false
  persist_in_product_repo_allowed: false
  persist_in_connector_repo_allowed: false
forbidden:
  - plaintext_secret_return
  - bearer_token_logging
  - product_repo_persistence
  - connector_local_cache
  - ai_prompt_injection
  - analytics_event_export
revocation:
  supported: true
audit:
  reason_required: true
`,
    'contracts/access-audit.yaml': `
contract:
  version: 1
  status: draft
audit_owner: zdp-core-platform
events_required:
  - credential.capability.issued
  - credential.access.denied
  - credential.break_glass.used
  - credential.rotation.performed
record_required:
  - event_id
  - actor_id
  - service_id
  - tenant_id
  - purpose
  - credential_ref
  - decision
  - reason
  - request_id
  - trace_id
forbidden_values:
  - raw_secret
  - raw_token
  - authorization_header
  - cookie
  - provider_payload
  - encrypted_payload
break_glass:
  requires:
    - human_approval
    - reason
    - time_limit
    - target_scope
    - follow_up_review
  forbidden:
    - permanent_exception
    - unaudited_access
    - wildcard_target_scope
`,
    'contracts/storage-boundary.yaml': `
contract:
  version: 1
  status: draft
storage_owner: zdp-privacy-credential-vault
storage_backend_class: secure-storage
encryption_at_rest_required: true
key_owner: vault-managed
plaintext_backups_allowed: false
allowed_interfaces:
  - capability_issue
  - credential_proxy_use
  - webhook_signature_verify
  - credential_rotation
  - credential_revoke
forbidden_storage_locations:
  - product_repository
  - connector_repository
  - ai_repository
  - analytics_event
  - logs
  - llms_txt
  - public_discovery
deletion:
  required: true
  evidence_required: true
restore:
  secret_values_in_restore_evidence_allowed: false
  restore_drill_required_before_production: true
`
  };
}

function createCredentialVaultServiceContract(): Record<string, unknown> {
  return {
    service: {
      repo: 'zdp-privacy-credential-vault',
      tier: 'tier0'
    },
    domain: {
      regulated: true
    },
    data: {
      owner_domain: 'privacy',
      crypto_key_material: true,
      classes: ['oauth-tokens', 'credentials'],
      datastores: ['privacy_credential_vault']
    },
    audit: {
      required: true,
      immutable: true,
      events: [
        'credential.capability.issued',
        'credential.access.denied',
        'credential.break_glass.used',
        'credential.rotation.performed'
      ]
    },
    human_review_required: [
      'credential class changes',
      'break-glass policy changes',
      'capability issuance contract changes',
      'storage, backup, restore, or deletion contract changes'
    ],
    exit: {
      kill_criteria: [
        'refresh tokens or webhook secrets are stored in product repositories',
        'connector repositories cache provider credentials locally',
        'audit records, logs, or restore evidence include raw credential material'
      ]
    },
    policy_gates: {
      required_linter_rules: [
        'ZDP-REPO-BASELINE-001',
        'ZDP-CREDENTIAL-001'
      ]
    }
  };
}
