import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { Diagnostic } from '../diagnostics.ts';
import type { RepositoryIndex } from '../repository-rules.ts';

const SERVICE_CONTRACT_FILE = 'service.yaml';
const DEPLOY_UNIT_STAGE = 'deploy_unit';
const AUTO_CI_CONTRACT_RULE_ID = 'ZDP-AUTO-001';
const AUTO_DEPENDENCY_BOT_CONFLICT_RULE_ID = 'ZDP-AUTO-002';
const AUTO_RULESET_STATUS_CHECK_RULE_ID = 'ZDP-AUTO-003';
const AUTO_RELEASE_HELPER_POLICY_RULE_ID = 'ZDP-AUTO-004';
const AUTO_TEMPLATE_SECRET_WARNING_RULE_ID = 'ZDP-AUTO-005';
const AUTO_AUTO_MERGE_GUARD_RULE_ID = 'ZDP-AUTO-006';
const AUTO_STALE_BOT_SAFETY_RULE_ID = 'ZDP-AUTO-007';

const RENOVATE_CONFIG_PATHS = [
  'renovate.json',
  'renovate.json5',
  '.renovaterc',
  '.renovaterc.json',
  '.renovaterc.json5',
  '.github/renovate.json',
  '.github/renovate.json5'
] as const;

const DEPENDABOT_CONFIG_PATHS = [
  '.github/dependabot.yml',
  '.github/dependabot.yaml'
] as const;

const RELEASE_HELPER_CONFIG_PATHS = [
  'release-please-config.json',
  '.release-please-manifest.json',
  '.github/release-drafter.yml',
  '.github/release-drafter.yaml',
  '.github/workflows/release-please.yml',
  '.github/workflows/release-please.yaml',
  '.github/workflows/release-drafter.yml',
  '.github/workflows/release-drafter.yaml'
] as const;

const ISSUE_TEMPLATE_SINGLE_FILE_PATHS = [
  'ISSUE_TEMPLATE.md',
  '.github/ISSUE_TEMPLATE.md'
] as const;

const ISSUE_TEMPLATE_DIRECTORIES = ['.github/ISSUE_TEMPLATE'] as const;

const PULL_REQUEST_TEMPLATE_SINGLE_FILE_PATHS = [
  'PULL_REQUEST_TEMPLATE.md',
  'pull_request_template.md',
  '.github/PULL_REQUEST_TEMPLATE.md',
  '.github/pull_request_template.md'
] as const;

const PULL_REQUEST_TEMPLATE_DIRECTORIES = ['.github/PULL_REQUEST_TEMPLATE'] as const;

const TEMPLATE_FILE_EXTENSIONS = ['.md', '.txt', '.yml', '.yaml'] as const;

const REQUIRED_FORBIDDEN_SUBMISSION_CLASSES = [
  'secrets',
  'payment payloads',
  'customer raw data'
] as const;

const STALE_BOT_REQUIRED_EXEMPT_LABELS = ['bug', 'security'] as const;

export function validateRepositoryAutomationContract(input: {
  readonly repositoryRoot?: string;
  readonly repositoryServiceContract: unknown;
  readonly repositoryIndex: RepositoryIndex;
}): readonly Diagnostic[] {
  if (!isRecord(input.repositoryServiceContract)) {
    return [];
  }

  const service = isRecord(input.repositoryServiceContract.service)
    ? input.repositoryServiceContract.service
    : null;

  if (service === null) {
    return [];
  }

  const repoName = readStringField(service, 'repo');
  const repositoryRecord =
    repoName === null ? undefined : input.repositoryIndex.byName.get(repoName);

  if (repositoryRecord?.repoStage !== DEPLOY_UNIT_STAGE) {
    return [];
  }

  const automation = isRecord(input.repositoryServiceContract.automation)
    ? input.repositoryServiceContract.automation
    : null;
  const ci = automation !== null && isRecord(automation.ci) ? automation.ci : null;
  const dependencyUpdates =
    automation !== null && isRecord(automation.dependency_updates)
      ? automation.dependency_updates
      : null;
  const ruleset =
    automation !== null && isRecord(automation.ruleset)
      ? automation.ruleset
      : null;
  const releaseHelper =
    automation !== null && isRecord(automation.release_helper)
      ? automation.release_helper
      : null;
  const templates =
    automation !== null && isRecord(automation.templates)
      ? automation.templates
      : null;
  const autoMerge =
    automation !== null && isRecord(automation.auto_merge)
      ? automation.auto_merge
      : null;
  const staleBot =
    automation !== null && isRecord(automation.stale_bot)
      ? automation.stale_bot
      : null;

  return [
    ...validateCiContract(ci),
    ...validateDependencyUpdateBotConflict({
      dependencyUpdates,
      repositoryRoot: input.repositoryRoot
    }),
    ...validateRulesetStatusChecks(ci, ruleset),
    ...validateReleaseHelperPolicy({
      releaseHelper,
      repositoryRoot: input.repositoryRoot
    }),
    ...validateTemplateSubmissionWarnings({
      repositoryRoot: input.repositoryRoot,
      templates
    }),
    ...validateAutoMergeGuards(autoMerge),
    ...validateStaleBotSafety(staleBot)
  ];
}

function validateCiContract(ci: Record<string, unknown> | null): readonly Diagnostic[] {
  if (ci === null) {
    return [
      createAutomationDiagnostic(
        AUTO_CI_CONTRACT_RULE_ID,
        'automation.ci',
        'Deploy unit service contract should declare `automation.ci` or an explicit CI missing reason.'
      )
    ];
  }

  if (ci.required === false && readStringField(ci, 'missing_reason') === null) {
    return [
      createAutomationDiagnostic(
        AUTO_CI_CONTRACT_RULE_ID,
        'automation.ci.missing_reason',
        'Deploy unit service contract with CI disabled should declare `automation.ci.missing_reason`.'
      )
    ];
  }

  return [];
}

function validateDependencyUpdateBotConflict(input: {
  readonly dependencyUpdates: Record<string, unknown> | null;
  readonly repositoryRoot: string | undefined;
}): readonly Diagnostic[] {
  const serviceContractEnablesBoth =
    input.dependencyUpdates?.renovate_enabled === true &&
    input.dependencyUpdates.dependabot_enabled === true;
  const repositoryHasRenovateConfig =
    input.repositoryRoot !== undefined &&
    hasAnyPath(input.repositoryRoot, RENOVATE_CONFIG_PATHS);
  const repositoryHasDependabotConfig =
    input.repositoryRoot !== undefined &&
    hasAnyPath(input.repositoryRoot, DEPENDABOT_CONFIG_PATHS);

  if (!serviceContractEnablesBoth && !(repositoryHasRenovateConfig && repositoryHasDependabotConfig)) {
    return [];
  }

  const path = serviceContractEnablesBoth
    ? 'automation.dependency_updates'
    : 'repository.root';

  return [
    createAutomationDiagnostic(
      AUTO_DEPENDENCY_BOT_CONFLICT_RULE_ID,
      path,
      'Deploy unit service contract should not enable Renovate and Dependabot in the same repository; choose one dependency update owner or document a migration by disabling one bot.'
    )
  ];
}

function validateRulesetStatusChecks(
  ci: Record<string, unknown> | null,
  ruleset: Record<string, unknown> | null
): readonly Diagnostic[] {
  if (ruleset === null || ruleset.required !== true) {
    return [];
  }

  const rulesetChecks = readStringArray(ruleset.required_status_checks);
  const ciChecks = ci === null ? [] : readStringArray(ci.required_status_checks);

  if (sameStringSet(rulesetChecks, ciChecks)) {
    return [];
  }

  return [
    createAutomationDiagnostic(
      AUTO_RULESET_STATUS_CHECK_RULE_ID,
      'automation.ruleset.required_status_checks',
      'Ruleset required status checks should match `automation.ci.required_status_checks`.'
    )
  ];
}

function validateReleaseHelperPolicy(input: {
  readonly releaseHelper: Record<string, unknown> | null;
  readonly repositoryRoot: string | undefined;
}): readonly Diagnostic[] {
  const serviceContractEnablesReleaseHelper = input.releaseHelper?.enabled === true;
  const repositoryHasReleaseHelperConfig =
    input.repositoryRoot !== undefined &&
    hasAnyPath(input.repositoryRoot, RELEASE_HELPER_CONFIG_PATHS);

  if (!serviceContractEnablesReleaseHelper && !repositoryHasReleaseHelperConfig) {
    return [];
  }

  if (
    input.releaseHelper !== null &&
    readStringField(input.releaseHelper, 'version_source_of_truth') !== null &&
    readStringField(input.releaseHelper, 'changelog_policy') !== null
  ) {
    return [];
  }

  return [
    createAutomationDiagnostic(
      AUTO_RELEASE_HELPER_POLICY_RULE_ID,
      'automation.release_helper',
      'Deploy unit release helper should declare `automation.release_helper.version_source_of_truth` and `automation.release_helper.changelog_policy`.'
    )
  ];
}

function validateTemplateSubmissionWarnings(input: {
  readonly repositoryRoot: string | undefined;
  readonly templates: Record<string, unknown> | null;
}): readonly Diagnostic[] {
  const issueTemplateFiles =
    input.repositoryRoot === undefined
      ? []
      : collectTemplateFiles(
          input.repositoryRoot,
          ISSUE_TEMPLATE_SINGLE_FILE_PATHS,
          ISSUE_TEMPLATE_DIRECTORIES
        );
  const pullRequestTemplateFiles =
    input.repositoryRoot === undefined
      ? []
      : collectTemplateFiles(
          input.repositoryRoot,
          PULL_REQUEST_TEMPLATE_SINGLE_FILE_PATHS,
          PULL_REQUEST_TEMPLATE_DIRECTORIES
        );

  if (issueTemplateFiles.length === 0 && pullRequestTemplateFiles.length === 0) {
    return [];
  }

  const missingIssueContract =
    issueTemplateFiles.length > 0 &&
    input.templates?.issue_forms_secret_warning !== true;
  const missingPullRequestContract =
    pullRequestTemplateFiles.length > 0 &&
    input.templates?.pr_template_secret_warning !== true;
  const missingForbiddenClasses =
    !hasRequiredForbiddenSubmissionClasses(input.templates);
  const issueTemplateTextMissingWarning = templateFilesMissWarning(
    issueTemplateFiles
  );
  const pullRequestTemplateTextMissingWarning = templateFilesMissWarning(
    pullRequestTemplateFiles
  );

  if (
    !missingIssueContract &&
    !missingPullRequestContract &&
    !missingForbiddenClasses &&
    !issueTemplateTextMissingWarning &&
    !pullRequestTemplateTextMissingWarning
  ) {
    return [];
  }

  return [
    createAutomationDiagnostic(
      AUTO_TEMPLATE_SECRET_WARNING_RULE_ID,
      'automation.templates',
      'Issue forms and PR templates should warn users not to submit secrets, payment payloads, or customer raw data, and `automation.templates` should declare those forbidden submission classes.'
    )
  ];
}

function validateAutoMergeGuards(
  autoMerge: Record<string, unknown> | null
): readonly Diagnostic[] {
  if (autoMerge === null || autoMerge.enabled !== true) {
    return [];
  }

  const requiredChecks = readStringArray(autoMerge.required_checks);
  const ownerReviewRequired = autoMerge.owner_review_required === true;
  const majorUpdateAllowed = autoMerge.major_update_allowed === true;

  if (
    requiredChecks.length > 0 &&
    ownerReviewRequired &&
    !majorUpdateAllowed
  ) {
    return [];
  }

  return [
    createAutomationDiagnostic(
      AUTO_AUTO_MERGE_GUARD_RULE_ID,
      'automation.auto_merge',
      'Deploy unit auto-merge should declare required checks, require owner review, and keep major updates out of auto-merge.'
    )
  ];
}

function validateStaleBotSafety(
  staleBot: Record<string, unknown> | null
): readonly Diagnostic[] {
  if (staleBot === null || staleBot.enabled !== true) {
    return [];
  }

  const exemptLabels = new Set(
    readStringArray(staleBot.exempt_labels).map((value) =>
      value.trim().toLowerCase()
    )
  );
  const missingRequiredExemptLabel = STALE_BOT_REQUIRED_EXEMPT_LABELS.some(
    (label) => !exemptLabels.has(label)
  );
  const securityIssueAutoCloseAllowed =
    staleBot.security_issue_auto_close_allowed === true;

  if (!missingRequiredExemptLabel && !securityIssueAutoCloseAllowed) {
    return [];
  }

  return [
    createAutomationDiagnostic(
      AUTO_STALE_BOT_SAFETY_RULE_ID,
      'automation.stale_bot',
      'Deploy unit stale bot should exempt bug and security labels, and must not auto-close security issues.'
    )
  ];
}

function createAutomationDiagnostic(
  ruleId:
    | typeof AUTO_CI_CONTRACT_RULE_ID
    | typeof AUTO_DEPENDENCY_BOT_CONFLICT_RULE_ID
    | typeof AUTO_RULESET_STATUS_CHECK_RULE_ID
    | typeof AUTO_RELEASE_HELPER_POLICY_RULE_ID
    | typeof AUTO_TEMPLATE_SECRET_WARNING_RULE_ID
    | typeof AUTO_AUTO_MERGE_GUARD_RULE_ID
    | typeof AUTO_STALE_BOT_SAFETY_RULE_ID,
  path: string,
  message: string
): Diagnostic {
  return {
    ruleId,
    severity: 'warning',
    file: SERVICE_CONTRACT_FILE,
    path,
    message
  };
}

function hasAnyPath(root: string, paths: readonly string[]): boolean {
  return paths.some((path) => existsSync(join(root, path)));
}

function collectTemplateFiles(
  root: string,
  filePaths: readonly string[],
  directoryPaths: readonly string[]
): readonly string[] {
  const directFiles = filePaths
    .map((path) => join(root, path))
    .filter(isFile);
  const directoryFiles = directoryPaths.flatMap((directoryPath) =>
    collectTemplateFilesFromDirectory(join(root, directoryPath))
  );

  return [...directFiles, ...directoryFiles];
}

function collectTemplateFilesFromDirectory(directory: string): readonly string[] {
  if (!isDirectory(directory)) {
    return [];
  }

  return readdirSync(directory)
    .map((entry) => join(directory, entry))
    .filter((path) => isFile(path) && hasTemplateExtension(path) && !isIssueTemplateConfig(path));
}

function templateFilesMissWarning(paths: readonly string[]): boolean {
  return paths.some((path) => !templateTextIncludesForbiddenSubmissionWarnings(readTextFile(path)));
}

function templateTextIncludesForbiddenSubmissionWarnings(text: string): boolean {
  const normalized = text.toLowerCase();

  return (
    /(secret|token|api key|credential|비밀값|토큰|인증 정보)/u.test(normalized) &&
    /(payment payload|payment data|card data|결제 payload|결제 데이터|카드 데이터)/u.test(normalized) &&
    /(customer raw data|raw customer data|customer data|고객 원문 데이터|고객 데이터)/u.test(normalized)
  );
}

function hasRequiredForbiddenSubmissionClasses(
  templates: Record<string, unknown> | null
): boolean {
  const forbiddenClasses = readStringArray(templates?.forbidden_submission_classes)
    .map((value) => value.trim().toLowerCase());
  const forbiddenClassSet = new Set(forbiddenClasses);

  return REQUIRED_FORBIDDEN_SUBMISSION_CLASSES.every((value) =>
    forbiddenClassSet.has(value)
  );
}

function readTextFile(path: string): string {
  return readFileSync(path, 'utf8');
}

function hasTemplateExtension(path: string): boolean {
  const normalized = path.toLowerCase();

  return TEMPLATE_FILE_EXTENSIONS.some((extension) => normalized.endsWith(extension));
}

function isIssueTemplateConfig(path: string): boolean {
  const fileName = basename(path).toLowerCase();

  return fileName === 'config.yml' || fileName === 'config.yaml';
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function sameStringSet(
  left: readonly string[],
  right: readonly string[]
): boolean {
  if (left.length !== right.length) {
    return false;
  }

  const normalizedRight = new Set(right);

  return left.every((value) => normalizedRight.has(value));
}

function readStringArray(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function readStringField(value: Record<string, unknown>, field: string): string | null {
  const candidate = value[field];

  return typeof candidate === 'string' && candidate.trim().length > 0
    ? candidate.trim()
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
