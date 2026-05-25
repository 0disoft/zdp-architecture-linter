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

export interface RepositoryCatalogRecord {
  readonly name: string;
  readonly repoStage: string | null;
  readonly kind: string | null;
  readonly path: string;
}

export interface RepositoryIndex {
  readonly byName: ReadonlyMap<string, RepositoryCatalogRecord>;
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
        path: getRepositoryDiagnosticPath(repository, index)
      }
    ]);
  }

  return { byName: new Map(entries) };
}

export function validateRepositoriesCatalog(value: unknown): readonly Diagnostic[] {
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
    validateRepositoryRecord(repository, index)
  );
}

function validateRepositoryRecord(value: unknown, index: number): readonly Diagnostic[] {
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
    hasUsableField(value, field)
      ? []
      : [
          createRepositoryDiagnostic(
            `${repositoryPath}.${field}`,
            `Repository entry is missing required field \`${field}\`.`
          )
        ]
    ),
    ...validateRepositoryStageKind(value, repositoryPath)
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

export function isNonDeployableRepositoryStage(repoStage: string | null): boolean {
  return repoStage !== null && NON_DEPLOYABLE_REPO_STAGES.has(repoStage);
}

function getRepositoryDiagnosticPath(value: Record<string, unknown>, index: number): string {
  const name = value.name;

  return typeof name === 'string' && name.trim().length > 0
    ? `repositories[${index}:${name.trim()}]`
    : `repositories[${index}]`;
}

function hasUsableField(value: Record<string, unknown>, field: string): boolean {
  const candidate = readStringField(value, field) ?? value[field];

  if (typeof candidate === 'string') {
    return candidate.trim().length > 0;
  }

  return candidate !== null && candidate !== undefined;
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
