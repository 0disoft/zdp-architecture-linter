import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { Diagnostic } from './diagnostics.ts';

const SECURITY_REPOSITORY_NAME = 'zdp-platform-security';
const SECURITY_RULE_ID = 'ZDP-SECURITY-001';

const SECURITY_BASELINE_FILE = 'contracts/security-baseline.yaml';
const THREAT_MODEL_TEMPLATE_FILE = 'contracts/threat-model-template.yaml';
const SECRET_HANDLING_FILE = 'contracts/secret-handling.yaml';
const DEPENDENCY_REVIEW_FILE = 'contracts/dependency-review.yaml';

const REQUIRED_REVIEWS = [
  'critical_service_boundary',
  'secret_storage_boundary',
  'payment_or_ledger_change',
  'privacy_or_user_data_access',
  'external_provider_credential_boundary',
  'production_runtime_or_infra_boundary'
] as const;

const REQUIRED_FINDING_FIELDS = [
  'finding_id',
  'owner',
  'severity',
  'affected_boundary',
  'verification_status',
  'evidence_ref',
  'remediation_owner'
] as const;

const REQUIRED_SEVERITY_LEVELS = ['critical', 'high', 'medium', 'low'] as const;

const REQUIRED_VERIFICATION_STATUSES = [
  'suspected',
  'reproduced',
  'mitigated',
  'accepted_risk'
] as const;

const REQUIRED_BASELINE_FORBIDDEN_VALUES = [
  'committed_secret_values',
  'provider_account_ids',
  'customer_payload_fixtures',
  'exploit_payloads',
  'private_incident_evidence',
  'unredacted_authorization_headers',
  'unredacted_cookie_values'
] as const;

const REQUIRED_BASELINE_PROMOTION_BLOCKERS = [
  'critical finding without mitigation',
  'high finding without owner',
  'missing threat model for tier0 or tier1 boundary',
  'missing secret handling review for credential-owning change',
  'security evidence contains raw secret or customer payload'
] as const;

const REQUIRED_THREAT_MODEL_FIELDS = [
  'system',
  'boundary',
  'data_classes',
  'actors',
  'trust_boundaries',
  'entrypoints',
  'abuse_cases',
  'controls',
  'residual_risks',
  'review_owner',
  'review_status'
] as const;

const REQUIRED_BOUNDARY_TYPES = [
  'identity',
  'access',
  'money',
  'privacy',
  'credential',
  'connector',
  'runtime',
  'infra',
  'analytics'
] as const;

const REQUIRED_SENSITIVE_BOUNDARY_CONTROLS = [
  'server_side_authorization',
  'audit_event',
  'redaction_policy',
  'least_privilege_access',
  'rollback_or_disable_path'
] as const;

const REQUIRED_THREAT_MODEL_FORBIDDEN_VALUES = [
  'raw_secret',
  'raw_customer_payload',
  'exploit_payload',
  'private_incident_detail',
  'provider_account_identifier'
] as const;

const REQUIRED_ALLOWED_REPOSITORY_VALUES = [
  'secret_name',
  'env_var_name',
  'rotation_note',
  'capability_name',
  'placeholder'
] as const;

const REQUIRED_SECRET_OWNER_CONTROLS = [
  'rotation_policy',
  'access_audit',
  'break_glass_reason',
  'redaction_policy',
  'restore_drill_note'
] as const;

const REQUIRED_SECRET_FORBIDDEN_VALUES = [
  'plaintext_secret',
  'oauth_refresh_token',
  'webhook_secret_value',
  'provider_api_token',
  'private_key_material',
  'authorization_header',
  'cookie_value',
  'database_url_with_credentials'
] as const;

const REQUIRED_LOGGING_FORBIDDEN_FIELDS = [
  'secret',
  'token',
  'authorization',
  'cookie',
  'password',
  'private_key',
  'webhook_signature'
] as const;

const REQUIRED_DEPENDENCY_REVIEW_SURFACES = [
  'authentication',
  'authorization',
  'payment',
  'ledger',
  'credential_storage',
  'migration',
  'deployment',
  'queue',
  'cryptography'
] as const;

const REQUIRED_DEPENDENCY_FIELDS = [
  'package_name',
  'runtime_path',
  'critical_path',
  'maintainer_risk',
  'license',
  'replacement_plan',
  'update_policy',
  'vulnerability_policy'
] as const;

const REQUIRED_DEPENDENCY_FORBIDDEN_VALUES = [
  'dependency with unknown license on critical path',
  'unpinned executable installer on critical path',
  'package that requires committing provider credentials',
  'scanner output containing raw secret values'
] as const;

const REQUIRED_DEPENDENCY_PROMOTION_BLOCKERS = [
  'critical path dependency has no replacement plan',
  'high maintainer risk accepted without owner',
  'known critical vulnerability has no mitigation or accepted-risk record'
] as const;

export async function validateRepositorySecurityContract(input: {
  readonly repositoryRoot: string | undefined;
  readonly repositoryServiceContract: unknown;
}): Promise<readonly Diagnostic[]> {
  if (
    input.repositoryRoot === undefined ||
    readRepositoryName(input.repositoryServiceContract) !==
      SECURITY_REPOSITORY_NAME
  ) {
    return [];
  }

  const [securityBaseline, threatModel, secretHandling, dependencyReview] =
    await Promise.all([
      readRequiredYamlContract(input.repositoryRoot, SECURITY_BASELINE_FILE),
      readRequiredYamlContract(input.repositoryRoot, THREAT_MODEL_TEMPLATE_FILE),
      readRequiredYamlContract(input.repositoryRoot, SECRET_HANDLING_FILE),
      readRequiredYamlContract(input.repositoryRoot, DEPENDENCY_REVIEW_FILE)
    ]);

  return [
    ...securityBaseline.diagnostics,
    ...threatModel.diagnostics,
    ...secretHandling.diagnostics,
    ...dependencyReview.diagnostics,
    ...(securityBaseline.value === null
      ? []
      : validateSecurityBaselineContract(securityBaseline.value)),
    ...(threatModel.value === null
      ? []
      : validateThreatModelTemplateContract(threatModel.value)),
    ...(secretHandling.value === null
      ? []
      : validateSecretHandlingContract(secretHandling.value)),
    ...(dependencyReview.value === null
      ? []
      : validateDependencyReviewContract(dependencyReview.value)),
    ...validateServiceContract(input.repositoryServiceContract)
  ];
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
          createSecurityDiagnostic(
            file,
            'repository.root',
            `Security repository must include \`${file}\`.`
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
        createSecurityDiagnostic(
          file,
          'yaml',
          `Security contract \`${file}\` must be valid YAML: ${formatError(
            error
          )}`
        )
      ]
    };
  }
}

function validateSecurityBaselineContract(value: unknown): readonly Diagnostic[] {
  return [
    ...validateExactValue({
      value,
      file: SECURITY_BASELINE_FILE,
      path: 'contract.owner',
      expected: 'platform-security',
      message:
        'Security baseline contract must declare owner `platform-security`.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: SECURITY_BASELINE_FILE,
      path: 'required_reviews',
      field: 'required_reviews',
      requiredEntries: REQUIRED_REVIEWS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: SECURITY_BASELINE_FILE,
      path: 'required_finding_fields',
      field: 'required_finding_fields',
      requiredEntries: REQUIRED_FINDING_FIELDS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: SECURITY_BASELINE_FILE,
      path: 'severity_levels',
      field: 'severity_levels',
      requiredEntries: REQUIRED_SEVERITY_LEVELS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: SECURITY_BASELINE_FILE,
      path: 'verification_statuses',
      field: 'verification_statuses',
      requiredEntries: REQUIRED_VERIFICATION_STATUSES
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: SECURITY_BASELINE_FILE,
      path: 'promotion_blocking',
      field: 'promotion_blocking',
      requiredEntries: REQUIRED_BASELINE_PROMOTION_BLOCKERS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: SECURITY_BASELINE_FILE,
      path: 'forbidden',
      field: 'forbidden',
      requiredEntries: REQUIRED_BASELINE_FORBIDDEN_VALUES
    }),
    ...validateExactValue({
      value,
      file: SECURITY_BASELINE_FILE,
      path: 'references.threat_model_template',
      expected: 'threat-model-template.yaml',
      message:
        'Security baseline contract must reference `threat-model-template.yaml`.'
    }),
    ...validateExactValue({
      value,
      file: SECURITY_BASELINE_FILE,
      path: 'references.secret_handling',
      expected: 'secret-handling.yaml',
      message: 'Security baseline contract must reference `secret-handling.yaml`.'
    }),
    ...validateExactValue({
      value,
      file: SECURITY_BASELINE_FILE,
      path: 'references.dependency_review',
      expected: 'dependency-review.yaml',
      message:
        'Security baseline contract must reference `dependency-review.yaml`.'
    })
  ];
}

function validateThreatModelTemplateContract(
  value: unknown
): readonly Diagnostic[] {
  return [
    ...validateRequiredStringArrayEntries({
      value,
      file: THREAT_MODEL_TEMPLATE_FILE,
      path: 'template.required_fields',
      field: 'template.required_fields',
      requiredEntries: REQUIRED_THREAT_MODEL_FIELDS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: THREAT_MODEL_TEMPLATE_FILE,
      path: 'template.required_boundary_types',
      field: 'template.required_boundary_types',
      requiredEntries: REQUIRED_BOUNDARY_TYPES
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: THREAT_MODEL_TEMPLATE_FILE,
      path: 'controls.required_for_sensitive_boundaries',
      field: 'controls.required_for_sensitive_boundaries',
      requiredEntries: REQUIRED_SENSITIVE_BOUNDARY_CONTROLS
    }),
    ...validateExactValue({
      value,
      file: THREAT_MODEL_TEMPLATE_FILE,
      path: 'controls.evidence_refs_must_be_repository_paths',
      expected: true,
      message:
        'Security threat model template must require repository-path evidence refs.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: THREAT_MODEL_TEMPLATE_FILE,
      path: 'forbidden',
      field: 'forbidden',
      requiredEntries: REQUIRED_THREAT_MODEL_FORBIDDEN_VALUES
    })
  ];
}

function validateSecretHandlingContract(value: unknown): readonly Diagnostic[] {
  return [
    ...validateExactValue({
      value,
      file: SECRET_HANDLING_FILE,
      path: 'secret_handling.source_of_truth',
      expected: 'credential-vault-or-provider-secret-store',
      message:
        'Security secret handling must keep credential vault or provider secret store as source of truth.'
    }),
    ...validateExactValue({
      value,
      file: SECRET_HANDLING_FILE,
      path: 'secret_handling.repository_policy',
      expected: 'no-secret-values',
      message: 'Security secret handling must declare `no-secret-values` policy.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: SECRET_HANDLING_FILE,
      path: 'secret_handling.allowed_repository_values',
      field: 'secret_handling.allowed_repository_values',
      requiredEntries: REQUIRED_ALLOWED_REPOSITORY_VALUES
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: SECRET_HANDLING_FILE,
      path: 'secret_handling.required_for_secret_owner',
      field: 'secret_handling.required_for_secret_owner',
      requiredEntries: REQUIRED_SECRET_OWNER_CONTROLS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: SECRET_HANDLING_FILE,
      path: 'secret_handling.forbidden_repository_values',
      field: 'secret_handling.forbidden_repository_values',
      requiredEntries: REQUIRED_SECRET_FORBIDDEN_VALUES
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: SECRET_HANDLING_FILE,
      path: 'logging.forbidden_fields',
      field: 'logging.forbidden_fields',
      requiredEntries: REQUIRED_LOGGING_FORBIDDEN_FIELDS
    })
  ];
}

function validateDependencyReviewContract(value: unknown): readonly Diagnostic[] {
  return [
    ...validateRequiredStringArrayEntries({
      value,
      file: DEPENDENCY_REVIEW_FILE,
      path: 'dependency_review.applies_to',
      field: 'dependency_review.applies_to',
      requiredEntries: REQUIRED_DEPENDENCY_REVIEW_SURFACES
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: DEPENDENCY_REVIEW_FILE,
      path: 'dependency_review.required_fields',
      field: 'dependency_review.required_fields',
      requiredEntries: REQUIRED_DEPENDENCY_FIELDS
    }),
    ...validateExactValue({
      value,
      file: DEPENDENCY_REVIEW_FILE,
      path: 'dependency_review.critical_path_policy.allow_single_maintainer_dependency',
      expected: false,
      message:
        'Security dependency review must forbid single-maintainer dependencies on critical paths by default.'
    }),
    ...validateExactValue({
      value,
      file: DEPENDENCY_REVIEW_FILE,
      path: 'dependency_review.critical_path_policy.require_replacement_plan',
      expected: true,
      message:
        'Security dependency review must require replacement plans for critical paths.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: DEPENDENCY_REVIEW_FILE,
      path: 'forbidden',
      field: 'forbidden',
      requiredEntries: REQUIRED_DEPENDENCY_FORBIDDEN_VALUES
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: DEPENDENCY_REVIEW_FILE,
      path: 'promotion_blocking',
      field: 'promotion_blocking',
      requiredEntries: REQUIRED_DEPENDENCY_PROMOTION_BLOCKERS
    })
  ];
}

function validateServiceContract(value: unknown): readonly Diagnostic[] {
  return [
    ...validateRequiredStringArrayEntries({
      value,
      file: 'service.yaml',
      path: 'policy_gates.required_linter_rules',
      field: 'policy_gates.required_linter_rules',
      requiredEntries: [SECURITY_RULE_ID]
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: 'service.yaml',
      path: 'human_review_required',
      field: 'human_review_required',
      requiredEntries: [
        'security baseline changes',
        'threat model template changes',
        'secret handling policy changes',
        'critical path dependency review policy changes'
      ]
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: 'service.yaml',
      path: 'exit.success_criteria',
      field: 'exit.success_criteria',
      requiredEntries: [
        'security baseline and review boundaries are available before critical implementation starts',
        'threat model, secret handling, and dependency review contracts exist before scanner implementation'
      ]
    })
  ];
}

function validateRequiredStringArrayEntries(input: {
  readonly value: unknown;
  readonly file: string;
  readonly path: string;
  readonly field: string;
  readonly requiredEntries: readonly string[];
}): readonly Diagnostic[] {
  const entries = readStringArrayPath(input.value, input.field);
  const diagnostics: Diagnostic[] = [];

  for (const requiredEntry of input.requiredEntries) {
    if (entries.includes(requiredEntry)) {
      continue;
    }

    diagnostics.push(
      createSecurityDiagnostic(
        input.file,
        input.path,
        `Security contract \`${input.file}\` must include \`${requiredEntry}\` in \`${input.field}\`.`
      )
    );
  }

  return diagnostics;
}

function validateExactValue(input: {
  readonly value: unknown;
  readonly file: string;
  readonly path: string;
  readonly field?: string;
  readonly expected: unknown;
  readonly message: string;
}): readonly Diagnostic[] {
  const actual = readPath(input.value, input.field ?? input.path);

  if (actual === input.expected) {
    return [];
  }

  return [createSecurityDiagnostic(input.file, input.path, input.message)];
}

function readRepositoryName(value: unknown): string | null {
  if (!isRecord(value) || !isRecord(value.service)) {
    return null;
  }

  return readStringField(value.service, 'repo');
}

function readStringArrayPath(value: unknown, path: string): readonly string[] {
  const candidate = readPath(value, path);

  if (!Array.isArray(candidate)) {
    return [];
  }

  return candidate.flatMap((entry) =>
    typeof entry === 'string' && entry.trim().length > 0 ? [entry.trim()] : []
  );
}

function readPath(value: unknown, path: string): unknown {
  let current = value;

  for (const segment of path.split('.')) {
    if (!isRecord(current)) {
      return undefined;
    }

    current = current[segment];
  }

  return current;
}

function readStringField(
  value: Record<string, unknown>,
  field: string
): string | null {
  const candidate = value[field];

  return typeof candidate === 'string' && candidate.trim().length > 0
    ? candidate.trim()
    : null;
}

function createSecurityDiagnostic(
  file: string,
  path: string,
  message: string
): Diagnostic {
  return {
    ruleId: SECURITY_RULE_ID,
    severity: 'error',
    file,
    path,
    message
  };
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isMissingPathError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
