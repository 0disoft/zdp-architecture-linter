import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { validateRepositoryCoreContract } from '../src/core-contract-rules.ts';

describe('core platform contract rules', () => {
  test('passes when the core platform repository declares all contract gates', async () => {
    await withRepositoryRoot(createValidCoreFiles(), async (repositoryRoot) => {
      const diagnostics = await validateRepositoryCoreContract({
        repositoryRoot,
        repositoryServiceContract: createCoreServiceContract()
      });

      expect(diagnostics).toEqual([]);
    });
  });

  test('skips repositories that are not zdp-core-platform', async () => {
    await withRepositoryRoot({}, async (repositoryRoot) => {
      const diagnostics = await validateRepositoryCoreContract({
        repositoryRoot,
        repositoryServiceContract: {
          service: {
            repo: 'zdp-web-public'
          }
        }
      });

      expect(diagnostics).toEqual([]);
    });
  });

  test('fails when required core contract files are missing', async () => {
    await withRepositoryRoot({}, async (repositoryRoot) => {
      const diagnostics = await validateRepositoryCoreContract({
        repositoryRoot,
        repositoryServiceContract: createCoreServiceContract()
      });

      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-CORE-001',
        severity: 'error',
        file: 'contracts/core-boundaries.yaml',
        path: 'repository.root',
        message:
          'Core platform repository must include `contracts/core-boundaries.yaml`.'
      });
      expect(diagnostics).toHaveLength(4);
    });
  });

  test('fails when a core contract file is not valid YAML', async () => {
    await withRepositoryRoot(
      {
        ...createValidCoreFiles(),
        'contracts/command-envelope.yaml': 'required_fields: [command_id'
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryCoreContract({
          repositoryRoot,
          repositoryServiceContract: createCoreServiceContract()
        });

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]).toMatchObject({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/command-envelope.yaml',
          path: 'yaml'
        });
      }
    );
  });

  test('fails when core boundaries and contract fields drift', async () => {
    await withRepositoryRoot(
      {
        ...createValidCoreFiles(),
        'contracts/core-boundaries.yaml': `
permission_model:
  roles:
    - owner
authorization:
  final_decision_owner: ui
boundaries:
  - id: identity
    owns:
      - app_user_id
`,
        'contracts/audit-event.yaml': `
forbidden_payload_values:
  - raw_secret
`,
        'contracts/consent-record.yaml': `
required_fields:
  - purpose
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositoryCoreContract({
          repositoryRoot,
          repositoryServiceContract: createCoreServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/core-boundaries.yaml',
          path: 'permission_model.roles',
          message:
            'Core platform contract `contracts/core-boundaries.yaml` must include `admin` in `permission_model.roles`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/core-boundaries.yaml',
          path: 'authorization.final_decision_owner',
          message: 'Core platform final authorization owner must be `access`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/core-boundaries.yaml',
          path: 'boundaries.accounts',
          message:
            'Core platform boundaries contract must declare `accounts` boundary.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/audit-event.yaml',
          path: 'forbidden_payload_values',
          message:
            'Core platform contract `contracts/audit-event.yaml` must include `token` in `forbidden_payload_values`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-CORE-001',
          severity: 'error',
          file: 'contracts/consent-record.yaml',
          path: 'withdrawal_record',
          message:
            'Core platform consent contract must declare `withdrawal_record`.'
        });
      }
    );
  });
});

async function withRepositoryRoot(
  files: Record<string, string>,
  callback: (repositoryRoot: string) => Promise<void>
): Promise<void> {
  const repositoryRoot = await mkdtemp(join(tmpdir(), 'zdp-core-contract-'));

  try {
    for (const [relativePath, source] of Object.entries(files)) {
      const absolutePath = join(repositoryRoot, relativePath);

      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, source.trimStart(), 'utf8');
    }

    await callback(repositoryRoot);
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true });
  }
}

function createCoreServiceContract(): unknown {
  return {
    service: {
      repo: 'zdp-core-platform'
    }
  };
}

function createValidCoreFiles(): Record<string, string> {
  return {
    'contracts/core-boundaries.yaml': `
permission_model:
  roles:
    - owner
    - admin
    - member
    - viewer
    - service_account
authorization:
  final_decision_owner: access
boundaries:
  - id: identity
    owns: [app_user_id]
    must_not_own: [ledger_balance]
    db_schema: identity
    db_role: core_identity_user
    audit_required: true
    split_trigger: [identity security review requires independent deployment]
  - id: accounts
    owns: [organization]
    must_not_own: [permission_decision]
    db_schema: accounts
    db_role: core_accounts_user
    audit_required: true
    split_trigger: [account lifecycle needs isolated review]
  - id: access
    owns: [roles]
    must_not_own: [product_feature_logic]
    db_schema: access
    db_role: core_access_user
    audit_required: true
    split_trigger: [permission checks become a bottleneck]
  - id: consent
    owns: [consent_records]
    must_not_own: [provider_credentials]
    db_schema: consent
    db_role: core_consent_user
    audit_required: true
    split_trigger: [privacy review requires separate evidence export]
  - id: audit
    owns: [audit_log_contract]
    must_not_own: [raw_secret_values]
    db_schema: audit
    db_role: core_audit_writer
    audit_required: true
    split_trigger: [append-only audit storage needs independent durability policy]
`,
    'contracts/command-envelope.yaml': `
required_fields:
  - command_id
  - actor_id
  - tenant_id
  - reason
  - idempotency_key
`,
    'contracts/audit-event.yaml': `
forbidden_payload_values:
  - raw_secret
  - token
  - authorization_header
  - raw_personal_payload
`,
    'contracts/consent-record.yaml': `
required_fields:
  - purpose
  - scope
  - evidence_ref
withdrawal_record:
  required_fields:
    - withdrawal_id
`
  };
}
