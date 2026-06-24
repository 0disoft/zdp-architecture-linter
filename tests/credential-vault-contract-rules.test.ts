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

  test('fails when an added credential class weakens vault policy', async () => {
    const files = createValidCredentialVaultFiles();
    await withRepositoryRoot(
      {
        ...files,
        'contracts/credential-boundary.yaml': files[
          'contracts/credential-boundary.yaml'
        ].replace(
          '    storage_scope: vault_only\nforbidden_consumers:',
          [
            '    storage_scope: vault_only',
            '  - id: temporary_provider_secret',
            '    plaintext_export_allowed: true',
            '    encryption_required: true',
            '    audit_required: true',
            '    rotation_supported: true',
            '    storage_scope: vault_only',
            'forbidden_consumers:'
          ].join('\n')
        )
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
          path: 'credential_classes.temporary_provider_secret.plaintext_export_allowed',
          message:
            'Credential class `temporary_provider_secret` must set plaintext export to false.'
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

  test('fails when capability renewal or load shedding drifts open', async () => {
    const files = createValidCredentialVaultFiles();
    await withRepositoryRoot(
      {
        ...files,
        'contracts/capability-issuance.yaml': files[
          'contracts/capability-issuance.yaml'
        ]
          .replace('renewal:\n  supported: true\n', 'renewal:\n  supported: false\n')
          .replace('  renew_before_expiry_seconds: 60\n', '  renew_before_expiry_seconds: 0\n')
          .replace('  max_renewal_chain_seconds: 900\n', '  max_renewal_chain_seconds: 901\n')
          .replace('  requires_fresh_audit_reason: true\n', '  requires_fresh_audit_reason: false\n')
          .replace('    secret_material_allowed: false\n', '    secret_material_allowed: true\n')
          .replace('    allowed_by_default: false\n', '    allowed_by_default: true\n')
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
          path: 'renewal.supported',
          message: 'Credential capability renewal must stay supported.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CREDENTIAL-001',
          severity: 'error',
          file: 'contracts/capability-issuance.yaml',
          path: 'renewal.renew_before_expiry_seconds',
          message: 'Credential capability renewal lead time must be a positive integer.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CREDENTIAL-001',
          severity: 'error',
          file: 'contracts/capability-issuance.yaml',
          path: 'renewal.max_renewal_chain_seconds',
          message:
            'Credential capability renewal chains must stay short enough for revocation to matter.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CREDENTIAL-001',
          severity: 'error',
          file: 'contracts/capability-issuance.yaml',
          path: 'load_shedding.edge_validation_cache.secret_material_allowed',
          message: 'Credential edge validation cache must not allow secret material.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CREDENTIAL-001',
          severity: 'error',
          file: 'contracts/capability-issuance.yaml',
          path: 'load_shedding.stateless_capability.allowed_by_default',
          message: 'Credential stateless capabilities must not be allowed by default.'
        });
      }
    );
  });

  test('fails when capability issuance adds unapproved operations', async () => {
    const files = createValidCredentialVaultFiles();
    await withRepositoryRoot(
      {
        ...files,
        'contracts/capability-issuance.yaml': files[
          'contracts/capability-issuance.yaml'
        ].replace(
          '  - credential_revoke\n',
          '  - credential_revoke\n  - plaintext_secret_return\n'
        )
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
          path: 'allowed_operations',
          message:
            'Credential vault contract `contracts/capability-issuance.yaml` must not include unapproved `plaintext_secret_return` in `allowed_operations`.'
        });
      }
    );
  });

  test('fails when capability issuance duplicates approved operations', async () => {
    const files = createValidCredentialVaultFiles();
    await withRepositoryRoot(
      {
        ...files,
        'contracts/capability-issuance.yaml': files[
          'contracts/capability-issuance.yaml'
        ].replace(
          '  - credential_revoke\n',
          '  - credential_revoke\n  - credential_proxy_use\n'
        )
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
          path: 'allowed_operations',
          message:
            'Credential vault contract `contracts/capability-issuance.yaml` must not duplicate `credential_proxy_use` in `allowed_operations`.'
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

  test('fails when storage boundary adds unapproved interfaces', async () => {
    const files = createValidCredentialVaultFiles();
    await withRepositoryRoot(
      {
        ...files,
        'contracts/storage-boundary.yaml': files[
          'contracts/storage-boundary.yaml'
        ].replace(
          '  - credential_revoke\n',
          '  - credential_revoke\n  - plaintext_secret_export\n'
        )
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryCredentialVaultContract({
          repositoryRoot,
          repositoryServiceContract: createCredentialVaultServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CREDENTIAL-001',
          severity: 'error',
          file: 'contracts/storage-boundary.yaml',
          path: 'allowed_interfaces',
          message:
            'Credential vault contract `contracts/storage-boundary.yaml` must not include unapproved `plaintext_secret_export` in `allowed_interfaces`.'
        });
      }
    );
  });

  test('fails when storage boundary duplicates approved interfaces', async () => {
    const files = createValidCredentialVaultFiles();
    await withRepositoryRoot(
      {
        ...files,
        'contracts/storage-boundary.yaml': files[
          'contracts/storage-boundary.yaml'
        ].replace(
          '  - credential_revoke\n',
          '  - credential_revoke\n  - capability_issue\n'
        )
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryCredentialVaultContract({
          repositoryRoot,
          repositoryServiceContract: createCredentialVaultServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CREDENTIAL-001',
          severity: 'error',
          file: 'contracts/storage-boundary.yaml',
          path: 'allowed_interfaces',
          message:
            'Credential vault contract `contracts/storage-boundary.yaml` must not duplicate `capability_issue` in `allowed_interfaces`.'
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
          path: 'scripts.check',
          message:
            'Credential vault package `check` script must include `cargo test`.'
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
            'Credential vault checker source must include function `validateStorageBoundary`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CREDENTIAL-001',
          severity: 'error',
          file: 'src/credential-vault-contracts/validator.ts',
          path: 'source',
          message:
            'Credential vault checker source must include `requirePositiveSafeInteger`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CREDENTIAL-001',
          severity: 'error',
          file: 'tests/credential-vault-contracts.test.ts',
          path: 'source',
          message:
            'Credential vault checker source must include test case `validates the committed credential vault contracts`.'
        });
      }
    );
  });

  test('fails when credential vault contract string lists include non-string items', async () => {
    await withRepositoryRoot(
      {
        ...createValidCredentialVaultFiles(),
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
  - {}
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
          path: 'forbidden_consumers',
          message:
            'Credential vault contract `contracts/credential-boundary.yaml` must declare `forbidden_consumers` as a string list.'
        });
      }
    );
  });

  test('fails when credential vault source proof is only string literal stubs', async () => {
    await withRepositoryRoot(
      {
        ...createValidCredentialVaultFiles(),
        'src/credential-vault-contracts/validator.ts': `
const fakeProof = [
  'MAX_CAPABILITY_TTL_SECONDS',
  'CRED_CLASS_PLAINTEXT_EXPORT_ALLOWED',
  'CRED_CAPABILITY_TTL_TOO_HIGH',
  'CRED_CAPABILITY_CONNECTOR_PERSISTENCE_ALLOWED',
  'CRED_AUDIT_FORBIDDEN_VALUE_MISSING',
  'CRED_RESTORE_SECRET_VALUES_ALLOWED',
  'CRED_CAPABILITY_STATELESS_DEFAULT_ALLOWED',
  'CRED_RUST_CREDENTIAL_CLASS_DRIFT',
  'CRED_RUST_SECRET_LOGGING_PATTERN',
  'RUST_MARKER_EXPECTATIONS',
  'RUST_WEAK_CRYPTO_PATTERNS',
  'export function validateCredentialVaultContracts',
  'function validateCredentialBoundary',
  'function validateCapabilityIssuance',
  'function validateAccessAudit',
  'function validateStorageBoundary',
  'function validateRustBoundaryMarkers',
  'function validateRustSecurityPatterns'
];
export { fakeProof };
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
          file: 'src/credential-vault-contracts/validator.ts',
          path: 'source',
          message:
            'Credential vault checker source must include code fragment `export function validateCredentialVaultContracts`.'
        });
      }
    );
  });

  test('fails when credential vault diagnostic proof sits outside validation functions', async () => {
    const files = createValidCredentialVaultFiles();
    await withRepositoryRoot(
      {
        ...files,
        'src/credential-vault-contracts/validator.ts': files[
          'src/credential-vault-contracts/validator.ts'
        ].replace(
          `
function validateCapabilityIssuance(): void {
  const codes = [
    'CRED_CAPABILITY_TTL_TOO_HIGH',
    'CRED_CAPABILITY_TTL_NOT_POSITIVE_INTEGER',
    'CRED_CAPABILITY_RENEWAL_LEAD_NOT_POSITIVE_INTEGER',
    'CRED_CAPABILITY_RENEWAL_CHAIN_NOT_POSITIVE_INTEGER',
    'CRED_CAPABILITY_EDGE_CACHE_TTL_NOT_POSITIVE_INTEGER',
    'CRED_CAPABILITY_CONNECTOR_PERSISTENCE_ALLOWED',
    'CRED_CAPABILITY_STATELESS_DEFAULT_ALLOWED'
  ];
  void codes;
}
`,
          `
const misplacedCapabilityCodes = [
  'CRED_CAPABILITY_TTL_TOO_HIGH',
  'CRED_CAPABILITY_TTL_NOT_POSITIVE_INTEGER',
  'CRED_CAPABILITY_RENEWAL_LEAD_NOT_POSITIVE_INTEGER',
  'CRED_CAPABILITY_RENEWAL_CHAIN_NOT_POSITIVE_INTEGER',
  'CRED_CAPABILITY_EDGE_CACHE_TTL_NOT_POSITIVE_INTEGER',
  'CRED_CAPABILITY_CONNECTOR_PERSISTENCE_ALLOWED',
  'CRED_CAPABILITY_STATELESS_DEFAULT_ALLOWED'
];

function validateCapabilityIssuance(): void {
  void misplacedCapabilityCodes;
}
`
        )
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryCredentialVaultContract({
          repositoryRoot,
          repositoryServiceContract: createCredentialVaultServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CREDENTIAL-001',
          severity: 'error',
          file: 'src/credential-vault-contracts/validator.ts',
          path: 'source',
          message:
            'Credential vault checker function `validateCapabilityIssuance` must use `CRED_CAPABILITY_TTL_TOO_HIGH`.'
        });
      }
    );
  });

  test('fails when credential vault test proof is only a string list plus placeholder test', async () => {
    await withRepositoryRoot(
      {
        ...createValidCredentialVaultFiles(),
        'tests/credential-vault-contracts.test.ts': `
import { expect, test } from 'bun:test';
import { validateCredentialVaultContracts } from '../src/credential-vault-contracts/validator';

function loadCommittedContracts() {}

const fakeProof = [
  'validates the committed credential vault contracts',
  'fails when a credential class allows plaintext export',
  'fails when capability ttl is longer than five minutes',
  'fails when connector repositories can persist capabilities',
  'fails when stateless credential capabilities are allowed by default',
  'fails when audit records can include encrypted credential payloads',
  'fails when restore evidence can include secret values',
  'fails when Rust boundary markers drift from YAML contracts',
  'fails when Rust source introduces weak crypto or secret logging patterns'
];

test('credential vault placeholder', () => {
  expect(fakeProof).toContain('validates the committed credential vault contracts');
  expect(validateCredentialVaultContracts).toBeDefined();
  expect(loadCommittedContracts).toBeDefined();
});
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
          file: 'tests/credential-vault-contracts.test.ts',
          path: 'source',
          message:
            'Credential vault checker source must include test case `validates the committed credential vault contracts`.'
        });
      }
    );
  });

  test('fails when Rust boundary markers semantically drift from YAML contracts', async () => {
    const files = createValidCredentialVaultFiles();
    await withRepositoryRoot(
      {
        ...files,
        'src/boundaries/credential_boundary.rs': files[
          'src/boundaries/credential_boundary.rs'
        ].replace(
          '    "provider_api_credential",\n];',
          '    "provider_api_credential",\n    "temporary_provider_secret",\n];'
        ),
        'src/boundaries/capability_issuance.rs': files[
          'src/boundaries/capability_issuance.rs'
        ].replace(
          'pub const MAX_CAPABILITY_TTL_SECONDS: u16 = 300;',
          'pub const MAX_CAPABILITY_TTL_SECONDS: u16 = 3600; // = 300'
        )
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryCredentialVaultContract({
          repositoryRoot,
          repositoryServiceContract: createCredentialVaultServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CREDENTIAL-001',
          severity: 'error',
          file: 'src/boundaries/credential_boundary.rs',
          path: 'credential_classes',
          message:
            'Rust marker `REQUIRED_CREDENTIAL_CLASSES` must not include unapproved `temporary_provider_secret` outside the YAML contract.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CREDENTIAL-001',
          severity: 'error',
          file: 'src/boundaries/capability_issuance.rs',
          path: 'MAX_CAPABILITY_TTL_SECONDS',
          message:
            'Credential vault Rust capability TTL marker must match credential-boundary.yaml and capability-issuance.yaml.'
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
    "check": "tsc --noEmit && bun test && bun run contracts:check && cargo fmt --check && cargo check && cargo test",
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
const RUST_MARKER_EXPECTATIONS = [
  'CRED_RUST_CREDENTIAL_CLASS_DRIFT',
];
const RUST_WEAK_CRYPTO_PATTERNS = [];
const RUST_SECRET_LOGGING_PATTERN = /secret/;

export function validateCredentialVaultContracts(): void {
  validateCredentialBoundary();
  validateCapabilityIssuance();
  validateAccessAudit();
  validateStorageBoundary();
  validateRustBoundaryMarkers();
  validateRustSecurityPatterns();
}

function validateCredentialBoundary(): void {
  const code = 'CRED_BOUNDARY_TTL_NOT_POSITIVE_INTEGER';
  void code;
}

function validateCredentialClass(): void {
  const code = 'CRED_CLASS_PLAINTEXT_EXPORT_ALLOWED';
  void code;
}

function validateCapabilityIssuance(): void {
  const codes = [
    'CRED_CAPABILITY_TTL_TOO_HIGH',
    'CRED_CAPABILITY_TTL_NOT_POSITIVE_INTEGER',
    'CRED_CAPABILITY_RENEWAL_LEAD_NOT_POSITIVE_INTEGER',
    'CRED_CAPABILITY_RENEWAL_CHAIN_NOT_POSITIVE_INTEGER',
    'CRED_CAPABILITY_EDGE_CACHE_TTL_NOT_POSITIVE_INTEGER',
    'CRED_CAPABILITY_CONNECTOR_PERSISTENCE_ALLOWED',
    'CRED_CAPABILITY_STATELESS_DEFAULT_ALLOWED'
  ];
  void codes;
}

function validateAccessAudit(): void {
  const code = 'CRED_AUDIT_FORBIDDEN_VALUE_MISSING';
  void code;
}

function validateStorageBoundary(): void {
  const code = 'CRED_RESTORE_SECRET_VALUES_ALLOWED';
  void code;
}

function validateRustBoundaryMarkers(): void {
  void RUST_MARKER_EXPECTATIONS;
  void MAX_CAPABILITY_TTL_SECONDS;
}

function validateRustSecurityPatterns(): void {
  const code = 'CRED_RUST_SECRET_LOGGING_PATTERN';
  void RUST_WEAK_CRYPTO_PATTERNS;
  void RUST_SECRET_LOGGING_PATTERN;
  void code;
}

function requirePositiveSafeInteger(): void {
  const code = 'CRED_BOUNDARY_TTL_NOT_POSITIVE_INTEGER';
  void code;
}
`,
    'tests/credential-vault-contracts.test.ts': `
import { expect, it } from 'bun:test';
import { validateCredentialVaultContracts } from '../src/credential-vault-contracts/validator';

function loadCommittedContracts() {
  return {};
}

it('validates the committed credential vault contracts', () => {
  expect(validateCredentialVaultContracts).toBeDefined();
  expect(loadCommittedContracts).toBeDefined();
});
it('fails when a credential class allows plaintext export', () => {
  expect(validateCredentialVaultContracts).toBeDefined();
});
it('fails when capability ttl is longer than five minutes', () => {
  expect(validateCredentialVaultContracts).toBeDefined();
});
it('fails when capability ttl and renewal windows are not positive integers', () => {
  expect(validateCredentialVaultContracts).toBeDefined();
});
it('fails when connector repositories can persist capabilities', () => {
  expect(validateCredentialVaultContracts).toBeDefined();
});
it('fails when stateless credential capabilities are allowed by default', () => {
  expect(validateCredentialVaultContracts).toBeDefined();
});
it('fails when audit records can include encrypted credential payloads', () => {
  expect(validateCredentialVaultContracts).toBeDefined();
});
it('fails when restore evidence can include secret values', () => {
  expect(validateCredentialVaultContracts).toBeDefined();
});
it('fails when Rust boundary markers drift from YAML contracts', () => {
  expect(validateCredentialVaultContracts).toBeDefined();
});
it('fails when Rust source introduces weak crypto or secret logging patterns', () => {
  expect(validateCredentialVaultContracts).toBeDefined();
});
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
    "bearer_token_logging",
    "product_repo_persistence",
    "connector_local_cache",
    "ai_prompt_injection",
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
    "ai_repository",
    "analytics_event",
    "logs",
    "llms_txt",
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
renewal:
  supported: true
  renew_before_expiry_seconds: 60
  max_renewal_chain_seconds: 900
  requires_fresh_audit_reason: true
load_shedding:
  edge_validation_cache:
    allowed: true
    scope: revocation_metadata_only
    max_ttl_seconds: 30
    secret_material_allowed: false
  stateless_capability:
    allowed_by_default: false
    exception_requires:
      - architecture_decision
      - revocation_plan
      - audit_correlation
      - no_secret_material_claims
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
