import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { validateRepositorySecurityContract } from '../src/security-contract-rules.ts';

describe('security contract rules', () => {
  test('passes when the security repository declares baseline contracts', async () => {
    await withRepositoryRoot(createValidSecurityFiles(), async (repositoryRoot) => {
      const diagnostics = await validateRepositorySecurityContract({
        repositoryRoot,
        repositoryServiceContract: createSecurityServiceContract()
      });

      expect(diagnostics).toEqual([]);
    });
  });

  test('skips repositories that are not zdp-platform-security', async () => {
    await withRepositoryRoot({}, async (repositoryRoot) => {
      const diagnostics = await validateRepositorySecurityContract({
        repositoryRoot,
        repositoryServiceContract: {
          service: {
            repo: 'zdp-platform-runtime'
          }
        }
      });

      expect(diagnostics).toEqual([]);
    });
  });

  test('fails when required security contract files are missing', async () => {
    await withRepositoryRoot({}, async (repositoryRoot) => {
      const diagnostics = await validateRepositorySecurityContract({
        repositoryRoot,
        repositoryServiceContract: createSecurityServiceContract()
      });

      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-SECURITY-001',
        severity: 'error',
        file: 'contracts/security-baseline.yaml',
        path: 'repository.root',
        message:
          'Security repository must include `contracts/security-baseline.yaml`.'
      });
      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-SECURITY-001',
        severity: 'error',
        file: 'contracts/threat-model-template.yaml',
        path: 'repository.root',
        message:
          'Security repository must include `contracts/threat-model-template.yaml`.'
      });
      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-SECURITY-001',
        severity: 'error',
        file: 'contracts/secret-handling.yaml',
        path: 'repository.root',
        message: 'Security repository must include `contracts/secret-handling.yaml`.'
      });
      expect(diagnostics).toContainEqual({
        ruleId: 'ZDP-SECURITY-001',
        severity: 'error',
        file: 'contracts/dependency-review.yaml',
        path: 'repository.root',
        message:
          'Security repository must include `contracts/dependency-review.yaml`.'
      });
    });
  });

  test('fails when a security contract file is not valid YAML', async () => {
    await withRepositoryRoot(
      {
        ...createValidSecurityFiles(),
        'contracts/security-baseline.yaml': 'contract: ['
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositorySecurityContract({
          repositoryRoot,
          repositoryServiceContract: createSecurityServiceContract()
        });

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]).toMatchObject({
          ruleId: 'ZDP-SECURITY-001',
          severity: 'error',
          file: 'contracts/security-baseline.yaml',
          path: 'yaml'
        });
      }
    );
  });

  test('fails when the security baseline drifts open', async () => {
    await withRepositoryRoot(
      {
        ...createValidSecurityFiles(),
        'contracts/security-baseline.yaml': `
contract:
  version: 1
  status: draft
  owner: other
required_reviews:
  - critical_service_boundary
required_finding_fields:
  - finding_id
severity_levels:
  - high
verification_statuses:
  - suspected
promotion_blocking:
  - high finding without owner
forbidden:
  - committed_secret_values
references:
  threat_model_template: other.yaml
  secret_handling: secret-handling.yaml
  dependency_review: dependency-review.yaml
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositorySecurityContract({
          repositoryRoot,
          repositoryServiceContract: createSecurityServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-SECURITY-001',
          severity: 'error',
          file: 'contracts/security-baseline.yaml',
          path: 'contract.owner',
          message:
            'Security baseline contract must declare owner `platform-security`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-SECURITY-001',
          severity: 'error',
          file: 'contracts/security-baseline.yaml',
          path: 'required_reviews',
          message:
            'Security contract `contracts/security-baseline.yaml` must include `secret_storage_boundary` in `required_reviews`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-SECURITY-001',
          severity: 'error',
          file: 'contracts/security-baseline.yaml',
          path: 'forbidden',
          message:
            'Security contract `contracts/security-baseline.yaml` must include `private_incident_evidence` in `forbidden`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-SECURITY-001',
          severity: 'error',
          file: 'contracts/security-baseline.yaml',
          path: 'references.threat_model_template',
          message:
            'Security baseline contract must reference `threat-model-template.yaml`.'
        });
      }
    );
  });

  test('fails when threat model, secret, dependency, or service gates drift', async () => {
    await withRepositoryRoot(
      {
        ...createValidSecurityFiles(),
        'contracts/threat-model-template.yaml': `
template:
  required_fields:
    - system
  required_boundary_types:
    - identity
  review_statuses:
    - draft
controls:
  required_for_sensitive_boundaries:
    - audit_event
  evidence_refs_must_be_repository_paths: false
forbidden:
  - raw_secret
`,
        'contracts/secret-handling.yaml': `
secret_handling:
  source_of_truth: repository
  repository_policy: allow-secret-values
  allowed_repository_values:
    - secret_name
  required_for_secret_owner:
    - access_audit
  forbidden_repository_values:
    - plaintext_secret
logging:
  forbidden_fields:
    - secret
  allowed_evidence:
    - redacted_key_name
promotion_blocking:
  - secret value appears in repository
`,
        'contracts/dependency-review.yaml': `
dependency_review:
  applies_to:
    - authentication
  required_fields:
    - package_name
  critical_path_policy:
    allow_single_maintainer_dependency: true
    require_replacement_plan: false
forbidden:
  - scanner output containing raw secret values
promotion_blocking:
  - high maintainer risk accepted without owner
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositorySecurityContract({
          repositoryRoot,
          repositoryServiceContract: {
            service: {
              repo: 'zdp-platform-security'
            },
            policy_gates: {
              required_linter_rules: ['ZDP-REPO-BASELINE-001']
            }
          }
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-SECURITY-001',
          severity: 'error',
          file: 'contracts/threat-model-template.yaml',
          path: 'template.required_fields',
          message:
            'Security contract `contracts/threat-model-template.yaml` must include `boundary` in `template.required_fields`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-SECURITY-001',
          severity: 'error',
          file: 'contracts/threat-model-template.yaml',
          path: 'template.review_statuses',
          message:
            'Security contract `contracts/threat-model-template.yaml` must include `accepted_risk` in `template.review_statuses`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-SECURITY-001',
          severity: 'error',
          file: 'contracts/secret-handling.yaml',
          path: 'secret_handling.repository_policy',
          message: 'Security secret handling must declare `no-secret-values` policy.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-SECURITY-001',
          severity: 'error',
          file: 'contracts/secret-handling.yaml',
          path: 'logging.allowed_evidence',
          message:
            'Security contract `contracts/secret-handling.yaml` must include `audit_event_id` in `logging.allowed_evidence`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-SECURITY-001',
          severity: 'error',
          file: 'contracts/secret-handling.yaml',
          path: 'promotion_blocking',
          message:
            'Security contract `contracts/secret-handling.yaml` must include `break-glass path lacks audit evidence` in `promotion_blocking`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-SECURITY-001',
          severity: 'error',
          file: 'contracts/dependency-review.yaml',
          path:
            'dependency_review.critical_path_policy.allow_single_maintainer_dependency',
          message:
            'Security dependency review must forbid single-maintainer dependencies on critical paths by default.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-SECURITY-001',
          severity: 'error',
          file: 'service.yaml',
          path: 'policy_gates.required_linter_rules',
          message:
            'Security contract `service.yaml` must include `ZDP-SECURITY-001` in `policy_gates.required_linter_rules`.'
        });
      }
    );
  });

  test('fails when security checker files and scripts drift', async () => {
    await withRepositoryRoot(
      {
        ...createValidSecurityFiles(),
        'package.json': `
{
  "scripts": {
    "check": "bun test"
  }
}
`,
        'src/security-contracts/validator.ts': `
export function validateSecurityContracts(): void {}
`,
        'src/security-contracts/types.ts': `
export interface SecurityDiagnostic {
  readonly code: string;
}
`,
        'tests/security-contracts.test.ts': `
import { test } from 'bun:test';
test('security placeholder', () => {});
`
      },
      async (repositoryRoot) => {
        const diagnostics = await validateRepositorySecurityContract({
          repositoryRoot,
          repositoryServiceContract: createSecurityServiceContract()
        });

        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-SECURITY-001',
          severity: 'error',
          file: 'package.json',
          path: 'scripts.test',
          message: 'Security package must declare `test` script.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-SECURITY-001',
          severity: 'error',
          file: 'package.json',
          path: 'scripts.contracts:check',
          message: 'Security package must declare `contracts:check` script.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-SECURITY-001',
          severity: 'error',
          file: 'src/security-contracts/validator.ts',
          path: 'source',
          message: 'Security checker source must include `REQUIRED_REVIEWS`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-SECURITY-001',
          severity: 'error',
          file: 'src/security-contracts/types.ts',
          path: 'source',
          message: 'Security checker source must include `reviewStatuses`.'
        });
        expect(diagnostics).toContainEqual({
          ruleId: 'ZDP-SECURITY-001',
          severity: 'error',
          file: 'tests/security-contracts.test.ts',
          path: 'source',
          message:
            'Security checker source must include `fails when a required review trigger is missing`.'
        });
      }
    );
  });
});

async function withRepositoryRoot(
  files: Record<string, string>,
  callback: (repositoryRoot: string) => Promise<void>
): Promise<void> {
  const repositoryRoot = await mkdtemp(join(tmpdir(), 'zdp-security-contract-'));

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

function createSecurityServiceContract(): unknown {
  return {
    service: {
      repo: 'zdp-platform-security'
    },
    policy_gates: {
      required_linter_rules: ['ZDP-REPO-BASELINE-001', 'ZDP-SECURITY-001']
    },
    human_review_required: [
      'security baseline changes',
      'threat model template changes',
      'secret handling policy changes',
      'critical path dependency review policy changes'
    ],
    exit: {
      success_criteria: [
        'security baseline and review boundaries are available before critical implementation starts',
        'threat model, secret handling, and dependency review contracts exist before scanner implementation'
      ]
    }
  };
}

function createValidSecurityFiles(): Record<string, string> {
  return {
    ...createValidSecurityCheckerFiles(),
    'contracts/security-baseline.yaml': `
contract:
  version: 1
  status: draft
  owner: platform-security
required_reviews:
  - critical_service_boundary
  - secret_storage_boundary
  - payment_or_ledger_change
  - privacy_or_user_data_access
  - external_provider_credential_boundary
  - production_runtime_or_infra_boundary
required_finding_fields:
  - finding_id
  - owner
  - severity
  - affected_boundary
  - verification_status
  - evidence_ref
  - remediation_owner
severity_levels:
  - critical
  - high
  - medium
  - low
verification_statuses:
  - suspected
  - reproduced
  - mitigated
  - accepted_risk
promotion_blocking:
  - critical finding without mitigation
  - high finding without owner
  - missing threat model for tier0 or tier1 boundary
  - missing secret handling review for credential-owning change
  - security evidence contains raw secret or customer payload
forbidden:
  - committed_secret_values
  - provider_account_ids
  - customer_payload_fixtures
  - exploit_payloads
  - private_incident_evidence
  - unredacted_authorization_headers
  - unredacted_cookie_values
references:
  threat_model_template: threat-model-template.yaml
  secret_handling: secret-handling.yaml
  dependency_review: dependency-review.yaml
`,
    'contracts/threat-model-template.yaml': `
template:
  required_fields:
    - system
    - boundary
    - data_classes
    - actors
    - trust_boundaries
    - entrypoints
    - abuse_cases
    - controls
    - residual_risks
    - review_owner
    - review_status
  required_boundary_types:
    - identity
    - access
    - money
    - privacy
    - credential
    - connector
    - runtime
    - infra
    - analytics
  review_statuses:
    - draft
    - reviewed
    - blocked
    - accepted_risk
controls:
  required_for_sensitive_boundaries:
    - server_side_authorization
    - audit_event
    - redaction_policy
    - least_privilege_access
    - rollback_or_disable_path
  evidence_refs_must_be_repository_paths: true
forbidden:
  - raw_secret
  - raw_customer_payload
  - exploit_payload
  - private_incident_detail
  - provider_account_identifier
`,
    'contracts/secret-handling.yaml': `
secret_handling:
  source_of_truth: credential-vault-or-provider-secret-store
  repository_policy: no-secret-values
  allowed_repository_values:
    - secret_name
    - env_var_name
    - rotation_note
    - capability_name
    - placeholder
  required_for_secret_owner:
    - rotation_policy
    - access_audit
    - break_glass_reason
    - redaction_policy
    - restore_drill_note
  forbidden_repository_values:
    - plaintext_secret
    - oauth_refresh_token
    - webhook_secret_value
    - provider_api_token
    - private_key_material
    - authorization_header
    - cookie_value
    - database_url_with_credentials
logging:
  forbidden_fields:
    - secret
    - token
    - authorization
    - cookie
    - password
    - private_key
    - webhook_signature
  allowed_evidence:
    - redacted_key_name
    - hash_prefix
    - rotation_event_id
    - audit_event_id
promotion_blocking:
  - secret value appears in repository
  - secret owner lacks rotation policy
  - break-glass path lacks audit evidence
`,
    'contracts/dependency-review.yaml': `
dependency_review:
  applies_to:
    - authentication
    - authorization
    - payment
    - ledger
    - credential_storage
    - migration
    - deployment
    - queue
    - cryptography
  required_fields:
    - package_name
    - runtime_path
    - critical_path
    - maintainer_risk
    - license
    - replacement_plan
    - update_policy
    - vulnerability_policy
  critical_path_policy:
    allow_single_maintainer_dependency: false
    require_replacement_plan: true
forbidden:
  - dependency with unknown license on critical path
  - unpinned executable installer on critical path
  - package that requires committing provider credentials
  - scanner output containing raw secret values
promotion_blocking:
  - critical path dependency has no replacement plan
  - high maintainer risk accepted without owner
  - known critical vulnerability has no mitigation or accepted-risk record
`
  };
}

function createValidSecurityCheckerFiles(): Record<string, string> {
  return {
    'package.json': `
{
  "scripts": {
    "check": "tsc --noEmit && bun test && bun run contracts:check",
    "test": "bun test",
    "contracts:check": "bun scripts/check-security-contracts.ts"
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
    'scripts/check-security-contracts.ts': `
import { runSecurityContractCheckCli } from '../src/security-contracts/cli';
const exitCode = await runSecurityContractCheckCli(process.argv.slice(2));
process.exit(exitCode);
`,
    'src/security-contracts/cli.ts': `
export async function runSecurityContractCheckCli(): Promise<number> {
  return 0;
}
`,
    'src/security-contracts/parser.ts': `
const files = [
  'contracts/security-baseline.yaml',
  'contracts/threat-model-template.yaml',
  'contracts/secret-handling.yaml',
  'contracts/dependency-review.yaml'
];
const yamlFields = ['review_statuses', 'allowed_evidence', 'promotion_blocking'];
export { files };
`,
    'src/security-contracts/types.ts': `
export interface SecurityDiagnostic {
  readonly code: string;
}
export interface ThreatModelTemplateContract {
  readonly reviewStatuses: readonly string[];
}
export interface SecretHandlingContract {
  readonly loggingAllowedEvidence: readonly string[];
  readonly promotionBlocking: readonly string[];
}
`,
    'src/security-contracts/validator.ts': `
const REQUIRED_REVIEWS = [];
const REQUIRED_THREAT_MODEL_FIELDS = [];
const REQUIRED_THREAT_MODEL_REVIEW_STATUSES = [];
const REQUIRED_SECRET_FORBIDDEN_VALUES = [];
const REQUIRED_LOGGING_ALLOWED_EVIDENCE = [];
const REQUIRED_SECRET_PROMOTION_BLOCKERS = [];
const REQUIRED_DEPENDENCY_FIELDS = [];
const SECURITY_DEPENDENCY_SINGLE_MAINTAINER_ALLOWED =
  'SECURITY_DEPENDENCY_SINGLE_MAINTAINER_ALLOWED';
export {
  REQUIRED_REVIEWS,
  REQUIRED_THREAT_MODEL_FIELDS,
  REQUIRED_THREAT_MODEL_REVIEW_STATUSES,
  REQUIRED_SECRET_FORBIDDEN_VALUES,
  REQUIRED_LOGGING_ALLOWED_EVIDENCE,
  REQUIRED_SECRET_PROMOTION_BLOCKERS,
  REQUIRED_DEPENDENCY_FIELDS,
  SECURITY_DEPENDENCY_SINGLE_MAINTAINER_ALLOWED
};
`,
    'tests/security-contracts.test.ts': `
const cases = [
  'fails when a required review trigger is missing',
  'fails when threat models stop requiring server-side authorization controls',
  'fails when threat model review statuses no longer include accepted risk',
  'fails when the repository can store secret values',
  'fails when logging evidence no longer requires audit event ids',
  'fails when secret handling no longer blocks unaudited break-glass paths',
  'fails when critical path dependencies can be single-maintainer by default',
  'fails when critical path dependencies no longer require a replacement plan'
];
export { cases };
`
  };
}
