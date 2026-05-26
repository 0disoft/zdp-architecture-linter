import type { Diagnostic } from './diagnostics.ts';
import type { RepositoryIndex } from './repository-rules.ts';

const SPLIT_CANDIDATE_RULE_ID = 'ZDP-SPLIT-001';
const SPLIT_TRIGGERS_FILE = 'catalogs/split-triggers.yaml';
const REPOSITORIES_FILE = 'catalogs/repositories.yaml';
const SPLIT_CANDIDATE_THRESHOLD = 2;

const SPLITTABLE_REPO_STAGES = new Set([
  'logical_only',
  'conditional_deploy_unit',
  'later_candidate'
]);

export function validateSplitTriggerCatalog(
  value: unknown,
  repositoryIndex: RepositoryIndex
): readonly Diagnostic[] {
  if (!isRecord(value) || value.split_triggers === undefined) {
    return [];
  }

  if (!Array.isArray(value.split_triggers)) {
    return [
      createSplitDiagnostic(
        SPLIT_TRIGGERS_FILE,
        'split_triggers',
        '`split_triggers` must be a YAML array.'
      )
    ];
  }

  return value.split_triggers.flatMap((entry, index) =>
    validateSplitTriggerRecord(entry, index, repositoryIndex)
  );
}

export function validateRepositorySplitCandidates(
  value: unknown
): readonly Diagnostic[] {
  if (!isRecord(value) || !Array.isArray(value.repositories)) {
    return [];
  }

  return value.repositories.flatMap((repository, index) => {
    if (!isRecord(repository)) {
      return [];
    }

    return validateRepositorySplitCandidate(repository, index);
  });
}

function validateSplitTriggerRecord(
  value: unknown,
  index: number,
  repositoryIndex: RepositoryIndex
): readonly Diagnostic[] {
  if (!isRecord(value)) {
    return [
      createSplitDiagnostic(
        SPLIT_TRIGGERS_FILE,
        `split_triggers[${index}]`,
        'Split trigger entry must be a YAML object.'
      )
    ];
  }

  const path = getSplitTriggerDiagnosticPath(value, index);
  const futureRepo = readStringField(value, 'future_repo');
  const diagnostics: Diagnostic[] = [];

  if (futureRepo !== null && !repositoryIndex.byName.has(futureRepo)) {
    diagnostics.push(
      createSplitDiagnostic(
        SPLIT_TRIGGERS_FILE,
        `${path}.future_repo`,
        `Split trigger future repo \`${futureRepo}\` should be registered in repositories.yaml before it is used as a split target.`
      )
    );
  }

  diagnostics.push(
    ...validateMetSplitCandidate({
      file: SPLIT_TRIGGERS_FILE,
      path,
      value,
      candidateName: futureRepo ?? readStringField(value, 'domain') ?? `split_triggers[${index}]`
    })
  );

  return diagnostics;
}

function validateRepositorySplitCandidate(
  value: Record<string, unknown>,
  index: number
): readonly Diagnostic[] {
  const repoStage = readStringField(value, 'repo_stage');

  if (repoStage === null || !SPLITTABLE_REPO_STAGES.has(repoStage)) {
    return [];
  }

  const splitTriggers = readStringArray(value.split_trigger);

  if (splitTriggers.length < SPLIT_CANDIDATE_THRESHOLD) {
    return [];
  }

  return validateMetSplitCandidate({
    file: REPOSITORIES_FILE,
    path: getRepositoryDiagnosticPath(value, index),
    value,
    candidateName: readStringField(value, 'name') ?? `repositories[${index}]`
  });
}

function validateMetSplitCandidate(input: {
  readonly file: string;
  readonly path: string;
  readonly value: Record<string, unknown>;
  readonly candidateName: string;
}): readonly Diagnostic[] {
  const metCount = readMetSplitTriggerCount(input.value);

  if (metCount < SPLIT_CANDIDATE_THRESHOLD) {
    return [];
  }

  const diagnostics: Diagnostic[] = [
    createSplitDiagnostic(
      input.file,
      `${input.path}.split_trigger_met_count`,
      `Split candidate \`${input.candidateName}\` has ${metCount} met split triggers and should be reviewed as an independent repository candidate.`
    )
  ];

  if (readStringField(input.value, 'current_location') === null) {
    diagnostics.push(
      createSplitDiagnostic(
        input.file,
        `${input.path}.current_location`,
        `Split candidate \`${input.candidateName}\` should declare its current integrated location before repository promotion.`
      )
    );
  }

  return diagnostics;
}

function readMetSplitTriggerCount(value: Record<string, unknown>): number {
  const numericCount =
    readNumberField(value, 'split_trigger_met_count') ?? readNumberField(value, 'met_count');

  if (numericCount !== null) {
    return numericCount;
  }

  const metTriggers = [
    ...readStringArray(value.met_split_triggers),
    ...readStringArray(value.met_triggers)
  ];

  return metTriggers.length;
}

function getSplitTriggerDiagnosticPath(
  value: Record<string, unknown>,
  index: number
): string {
  const domain = readStringField(value, 'domain');

  return domain === null
    ? `split_triggers[${index}]`
    : `split_triggers[${index}:${domain}]`;
}

function getRepositoryDiagnosticPath(
  value: Record<string, unknown>,
  index: number
): string {
  const name = readStringField(value, 'name');

  return name === null ? `repositories[${index}]` : `repositories[${index}:${name}]`;
}

function readStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) =>
    typeof entry === 'string' && entry.trim().length > 0 ? [entry.trim()] : []
  );
}

function readStringField(value: Record<string, unknown>, field: string): string | null {
  const candidate = value[field];

  return typeof candidate === 'string' && candidate.trim().length > 0
    ? candidate.trim()
    : null;
}

function readNumberField(value: Record<string, unknown>, field: string): number | null {
  const candidate = value[field];

  return typeof candidate === 'number' && Number.isFinite(candidate)
    ? candidate
    : null;
}

function createSplitDiagnostic(
  file: string,
  path: string,
  message: string
): Diagnostic {
  return {
    ruleId: SPLIT_CANDIDATE_RULE_ID,
    severity: 'warning',
    file,
    path,
    message
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
