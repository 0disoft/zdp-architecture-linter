import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Diagnostic } from '../diagnostics.ts';
import type { RepositoryIndex } from '../repository-rules.ts';

const SERVICE_CONTRACT_FILE = 'service.yaml';
const DEPLOY_UNIT_STAGE = 'deploy_unit';
const AUTO_CI_CONTRACT_RULE_ID = 'ZDP-AUTO-001';
const AUTO_DEPENDENCY_BOT_CONFLICT_RULE_ID = 'ZDP-AUTO-002';
const AUTO_RULESET_STATUS_CHECK_RULE_ID = 'ZDP-AUTO-003';

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

  return [
    ...validateCiContract(ci),
    ...validateDependencyUpdateBotConflict({
      dependencyUpdates,
      repositoryRoot: input.repositoryRoot
    }),
    ...validateRulesetStatusChecks(ci, ruleset)
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

function createAutomationDiagnostic(
  ruleId:
    | typeof AUTO_CI_CONTRACT_RULE_ID
    | typeof AUTO_DEPENDENCY_BOT_CONFLICT_RULE_ID
    | typeof AUTO_RULESET_STATUS_CHECK_RULE_ID,
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
