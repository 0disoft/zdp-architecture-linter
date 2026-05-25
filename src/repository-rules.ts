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

  return REPOSITORY_REQUIRED_FIELDS.flatMap((field) =>
    hasUsableField(value, field)
      ? []
      : [
          createRepositoryDiagnostic(
            `repositories[${index}].${field}`,
            `Repository entry is missing required field \`${field}\`.`
          )
        ]
  );
}

function hasUsableField(value: Record<string, unknown>, field: string): boolean {
  const candidate = value[field];

  if (typeof candidate === 'string') {
    return candidate.trim().length > 0;
  }

  return candidate !== null && candidate !== undefined;
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

