import type { Diagnostic } from './diagnostics.ts';

const REPOSITORY_REQUIRED_FIELDS = [
  'name',
  'status',
  'repo_stage',
  'kind',
  'area',
  'purpose',
  'owner',
  'risk_level'
] as const;

const REPOSITORIES_FILE = 'catalogs/repositories.yaml';

const NON_DEPLOYABLE_REPO_STAGES = new Set([
  'logical_only',
  'forbidden_now',
  'lab_only',
  'later_candidate'
]);

const CONDITIONAL_DEPLOY_UNIT_STAGE = 'conditional_deploy_unit';
const RESERVED_STATUS = 'reserved';
const DEPLOY_UNIT_KIND = 'deploy_unit';
const DEPLOY_UNIT_STAGE = 'deploy_unit';
const LATEST_REVIEW_FIELD = 'requires_latest_review';

const LATEST_REVIEW_NOTE_PATTERNS = [
  '최신 공식',
  '최신 보안 모델',
  '최신 GitHub',
  '최신 문서',
  '최신 정책'
] as const;

const EMPTY_REPOSITORY_POLICY_NOTE_RULES: RepositoryPolicyNoteRules = {
  rules: []
};

const EMPTY_REPOSITORY_AREA_RULES: RepositoryAreaRules = {
  exact: new Map(),
  prefixes: []
};

const EMPTY_REPOSITORY_ROADMAP_EVIDENCE: RepositoryRoadmapEvidence = {
  text: ''
};

export interface RepositoryCatalogRecord {
  readonly name: string;
  readonly repoStage: string | null;
  readonly kind: string | null;
  readonly area: string | null;
  readonly purpose: string | null;
  readonly riskLevel: string | null;
  readonly ownsData: readonly string[];
  readonly splitTargets: readonly string[];
  readonly path: string;
}

export interface RepositoryIndex {
  readonly byName: ReadonlyMap<string, RepositoryCatalogRecord>;
}

export interface RepositoryAreaPrefixRule {
  readonly prefix: string;
  readonly area: string;
}

export interface RepositoryAreaRules {
  readonly exact: ReadonlyMap<string, string>;
  readonly prefixes: readonly RepositoryAreaPrefixRule[];
}

export interface RepositoryRoadmapEvidence {
  readonly text: string;
}

export interface RepositoryPolicyNoteRule {
  readonly targetField: string;
  readonly notePatterns: readonly string[];
}

export interface RepositoryPolicyNoteRules {
  readonly rules: readonly RepositoryPolicyNoteRule[];
}

export function buildRepositoryIndex(value: unknown): RepositoryIndex {
  if (!isRecord(value) || !Array.isArray(value.repositories)) {
    return { byName: new Map() };
  }

  const entries: Array<[string, RepositoryCatalogRecord]> = [];

  for (const [index, repository] of value.repositories.entries()) {
    if (!isRecord(repository) || typeof repository.name !== 'string') {
      continue;
    }

    const name = repository.name.trim();

    if (name.length === 0) {
      continue;
    }

    entries.push([
      name,
      {
        name,
        repoStage: readStringField(repository, 'repo_stage'),
        kind: readStringField(repository, 'kind'),
        area: readStringField(repository, 'area'),
        purpose: readStringField(repository, 'purpose'),
        riskLevel: readStringField(repository, 'risk_level'),
        ownsData: readStringArray(repository.owns_data),
        splitTargets: readStringArray(repository.split_targets),
        path: getRepositoryDiagnosticPath(repository, index)
      }
    ]);
  }

  return { byName: new Map(entries) };
}

export function buildRepositoryAreaRules(value: unknown): RepositoryAreaRules {
  if (!isRecord(value) || !isRecord(value.repository_area_rules)) {
    return EMPTY_REPOSITORY_AREA_RULES;
  }

  const exact = buildExactAreaRules(value.repository_area_rules.exact);
  const prefixes = buildPrefixAreaRules(value.repository_area_rules.prefixes);

  return { exact, prefixes };
}

export function buildRepositoryPolicyNoteRules(
  value: unknown
): RepositoryPolicyNoteRules {
  if (!isRecord(value) || !Array.isArray(value.repository_note_machine_field_rules)) {
    return EMPTY_REPOSITORY_POLICY_NOTE_RULES;
  }

  return {
    rules: value.repository_note_machine_field_rules.flatMap((entry) => {
      if (!isRecord(entry)) {
        return [];
      }

      const targetField = readStringField(entry, 'target_field');
      const notePatterns = readStringArray(entry.note_patterns);

      return targetField === null || notePatterns.length === 0
        ? []
        : [{ targetField, notePatterns }];
    })
  };
}

export function validateRepositoriesCatalog(
  value: unknown,
  areaRules: RepositoryAreaRules = EMPTY_REPOSITORY_AREA_RULES,
  roadmapEvidence: RepositoryRoadmapEvidence = EMPTY_REPOSITORY_ROADMAP_EVIDENCE,
  policyNoteRules: RepositoryPolicyNoteRules = EMPTY_REPOSITORY_POLICY_NOTE_RULES
): readonly Diagnostic[] {
  if (!isRecord(value)) {
    return [
      createRepositoryDiagnostic(
        'repositories',
        '`repositories.yaml` must be a YAML object with a repositories array.'
      )
    ];
  }

  const repositories = value.repositories;

  if (!Array.isArray(repositories)) {
    return [
      createRepositoryDiagnostic(
        'repositories',
        '`repositories` must be a YAML array.'
      )
    ];
  }

  return repositories.flatMap((repository, index) =>
    validateRepositoryRecord(
      repository,
      index,
      areaRules,
      roadmapEvidence,
      policyNoteRules
    )
  );
}

function validateRepositoryRecord(
  value: unknown,
  index: number,
  areaRules: RepositoryAreaRules,
  roadmapEvidence: RepositoryRoadmapEvidence,
  policyNoteRules: RepositoryPolicyNoteRules
): readonly Diagnostic[] {
  if (!isRecord(value)) {
    return [
      createRepositoryDiagnostic(
        `repositories[${index}]`,
        'Repository entry must be a YAML object.'
      )
    ];
  }

  const repositoryPath = getRepositoryDiagnosticPath(value, index);

  return [
    ...REPOSITORY_REQUIRED_FIELDS.flatMap((field) =>
    hasRequiredRepositoryField(value, field)
      ? []
      : [
          createRepositoryDiagnostic(
            `${repositoryPath}.${field}`,
            `Repository entry is missing required field \`${field}\`.`
          )
        ]
    ),
    ...validateRepositoryStageKind(value, repositoryPath),
    ...validateRepositoryAreaPrefix(value, repositoryPath, areaRules),
    ...validateConditionalDeployUnitTrigger(value, repositoryPath),
    ...validateReservedDeployUnitRoadmapEvidence(
      value,
      repositoryPath,
      roadmapEvidence
    ),
    ...validateLatestReviewPolicyNotes(value, repositoryPath),
    ...validateGeneralPolicyNotesMachineFields(
      value,
      repositoryPath,
      policyNoteRules
    )
  ];
}

function validateRepositoryStageKind(
  value: Record<string, unknown>,
  repositoryPath: string
): readonly Diagnostic[] {
  const repoStage = readStringField(value, 'repo_stage');
  const kind = readStringField(value, 'kind');

  if (
    repoStage !== null &&
    kind === 'deploy_unit' &&
    NON_DEPLOYABLE_REPO_STAGES.has(repoStage)
  ) {
    return [
      {
        ruleId: 'ZDP-REPO-002',
        severity: 'error',
        file: REPOSITORIES_FILE,
        path: `${repositoryPath}.kind`,
        message: `Repository with repo_stage \`${repoStage}\` must not be kind \`deploy_unit\`.`
      }
    ];
  }

  return [];
}

function validateConditionalDeployUnitTrigger(
  value: Record<string, unknown>,
  repositoryPath: string
): readonly Diagnostic[] {
  if (readStringField(value, 'repo_stage') !== CONDITIONAL_DEPLOY_UNIT_STAGE) {
    return [];
  }

  if (hasCreateWhenEvidence(value.create_when)) {
    return [];
  }

  return [
    {
      ruleId: 'ZDP-REPO-WARN-001',
      severity: 'warning',
      file: REPOSITORIES_FILE,
      path: `${repositoryPath}.create_when`,
      message:
        'Repository with repo_stage `conditional_deploy_unit` should declare `create_when` evidence.'
    }
  ];
}

function validateReservedDeployUnitRoadmapEvidence(
  value: Record<string, unknown>,
  repositoryPath: string,
  roadmapEvidence: RepositoryRoadmapEvidence
): readonly Diagnostic[] {
  const name = readStringField(value, 'name');

  if (
    name === null ||
    roadmapEvidence.text.length === 0 ||
    readStringField(value, 'status') !== RESERVED_STATUS ||
    readStringField(value, 'repo_stage') !== DEPLOY_UNIT_STAGE ||
    readStringField(value, 'kind') !== DEPLOY_UNIT_KIND ||
    value.created === true ||
    roadmapEvidence.text.includes(name)
  ) {
    return [];
  }

  return [
    {
      ruleId: 'ZDP-REPO-WARN-002',
      severity: 'warning',
      file: REPOSITORIES_FILE,
      path: `${repositoryPath}.name`,
      message:
        `Reserved deploy unit \`${name}\` should appear in ROADMAP.md or docs/26-eighteen-month-roadmap.md.`
    }
  ];
}

function validateLatestReviewPolicyNotes(
  value: Record<string, unknown>,
  repositoryPath: string
): readonly Diagnostic[] {
  if (!hasLatestReviewPolicyNote(value.notes) || value[LATEST_REVIEW_FIELD] === true) {
    return [];
  }

  return [
    {
      ruleId: 'ZDP-NOTES-WARN-001',
      severity: 'warning',
      file: REPOSITORIES_FILE,
      path: `${repositoryPath}.${LATEST_REVIEW_FIELD}`,
      message:
        'Repository notes require a latest external review marker; set `requires_latest_review: true`.'
    }
  ];
}

function validateGeneralPolicyNotesMachineFields(
  value: Record<string, unknown>,
  repositoryPath: string,
  policyNoteRules: RepositoryPolicyNoteRules
): readonly Diagnostic[] {
  const notes = readStringArray(value.notes);

  if (notes.length === 0 || policyNoteRules.rules.length === 0) {
    return [];
  }

  const diagnostics: Diagnostic[] = [];

  for (const rule of policyNoteRules.rules) {
    if (hasUsableField(value, rule.targetField)) {
      continue;
    }

    const matchingNote = notes.find((note) =>
      rule.notePatterns.some((pattern) => note.includes(pattern))
    );

    if (matchingNote === undefined) {
      continue;
    }

    diagnostics.push({
      ruleId: 'ZDP-NOTES-WARN-002',
      severity: 'warning',
      file: REPOSITORIES_FILE,
      path: `${repositoryPath}.${rule.targetField}`,
      message:
        `Repository notes contain policy text that should be moved to machine field \`${rule.targetField}\`: ${matchingNote}`
    });
  }

  return diagnostics;
}

function hasLatestReviewPolicyNote(value: unknown): boolean {
  return readStringArray(value).some((entry) =>
    LATEST_REVIEW_NOTE_PATTERNS.some((pattern) => entry.includes(pattern))
  );
}

function validateRepositoryAreaPrefix(
  value: Record<string, unknown>,
  repositoryPath: string,
  areaRules: RepositoryAreaRules
): readonly Diagnostic[] {
  if (areaRules.exact.size === 0 && areaRules.prefixes.length === 0) {
    return [];
  }

  const name = readStringField(value, 'name');
  const area = readStringField(value, 'area');

  if (name === null || area === null) {
    return [];
  }

  const expectedArea = findExpectedRepositoryArea(name, areaRules);

  if (expectedArea === null) {
    return [
      {
        ruleId: 'ZDP-REPO-003',
        severity: 'error',
        file: REPOSITORIES_FILE,
        path: `${repositoryPath}.name`,
        message: `Repository name \`${name}\` does not match any allowed area prefix rule.`
      }
    ];
  }

  if (expectedArea !== area) {
    return [
      {
        ruleId: 'ZDP-REPO-003',
        severity: 'error',
        file: REPOSITORIES_FILE,
        path: `${repositoryPath}.area`,
        message: `Repository name \`${name}\` maps to area \`${expectedArea}\`, but catalog area is \`${area}\`.`
      }
    ];
  }

  return [];
}

export function isNonDeployableRepositoryStage(repoStage: string | null): boolean {
  return repoStage !== null && NON_DEPLOYABLE_REPO_STAGES.has(repoStage);
}

function findExpectedRepositoryArea(
  name: string,
  areaRules: RepositoryAreaRules
): string | null {
  const exactArea = areaRules.exact.get(name);

  if (exactArea !== undefined) {
    return exactArea;
  }

  const prefixRule = areaRules.prefixes.find((rule) =>
    name.startsWith(rule.prefix)
  );

  return prefixRule?.area ?? null;
}

function buildExactAreaRules(value: unknown): ReadonlyMap<string, string> {
  if (!isRecord(value)) {
    return new Map();
  }

  const entries: Array<[string, string]> = [];

  for (const [name, area] of Object.entries(value)) {
    if (
      typeof name === 'string' &&
      name.trim().length > 0 &&
      typeof area === 'string' &&
      area.trim().length > 0
    ) {
      entries.push([name.trim(), area.trim()]);
    }
  }

  return new Map(entries);
}

function buildPrefixAreaRules(value: unknown): readonly RepositoryAreaPrefixRule[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .flatMap((entry): RepositoryAreaPrefixRule[] => {
      if (!isRecord(entry)) {
        return [];
      }

      const prefix = readStringField(entry, 'prefix');
      const area = readStringField(entry, 'area');

      return prefix === null || area === null ? [] : [{ prefix, area }];
    })
    .sort((left, right) => right.prefix.length - left.prefix.length);
}

function getRepositoryDiagnosticPath(value: Record<string, unknown>, index: number): string {
  const name = value.name;

  return typeof name === 'string' && name.trim().length > 0
    ? `repositories[${index}:${name.trim()}]`
    : `repositories[${index}]`;
}

function hasRequiredRepositoryField(
  value: Record<string, unknown>,
  field: string
): boolean {
  return readStringField(value, field) !== null;
}

function hasUsableField(value: Record<string, unknown>, field: string): boolean {
  const candidate = readStringField(value, field) ?? value[field];

  if (typeof candidate === 'string') {
    return candidate.trim().length > 0;
  }

  return candidate !== null && candidate !== undefined;
}

function hasCreateWhenEvidence(value: unknown): boolean {
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  if (!Array.isArray(value)) {
    return false;
  }

  return value.some((entry) => typeof entry === 'string' && entry.trim().length > 0);
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

function createRepositoryDiagnostic(path: string, message: string): Diagnostic {
  return {
    ruleId: 'ZDP-REPO-001',
    severity: 'error',
    file: REPOSITORIES_FILE,
    path,
    message
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
