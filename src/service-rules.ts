import type { Diagnostic } from './diagnostics.ts';
import {
  isNonDeployableRepositoryStage,
  type RepositoryIndex
} from './repository-rules.ts';

const SERVICES_FILE = 'catalogs/services.yaml';

export function validateServiceRepositoryReferences(
  value: unknown,
  repositoryIndex: RepositoryIndex
): readonly Diagnostic[] {
  if (!isRecord(value)) {
    return [
      createServiceDiagnostic(
        'ZDP-REF-001',
        'services',
        '`services.yaml` must be a YAML object with a services array.'
      )
    ];
  }

  const services = value.services;

  if (!Array.isArray(services)) {
    return [
      createServiceDiagnostic(
        'ZDP-REF-001',
        'services',
        '`services` must be a YAML array.'
      )
    ];
  }

  return services.flatMap((service, index) =>
    validateServiceRecord(service, index, repositoryIndex)
  );
}

function validateServiceRecord(
  value: unknown,
  index: number,
  repositoryIndex: RepositoryIndex
): readonly Diagnostic[] {
  if (!isRecord(value)) {
    return [
      createServiceDiagnostic(
        'ZDP-REF-001',
        `services[${index}]`,
        'Service entry must be a YAML object.'
      )
    ];
  }

  const servicePath = getServiceDiagnosticPath(value, index);
  const repo = readStringField(value, 'repo');

  if (repo === null) {
    return [
      createServiceDiagnostic(
        'ZDP-REF-001',
        `${servicePath}.repo`,
        'Service entry is missing required field `repo`.'
      )
    ];
  }

  const repository = repositoryIndex.byName.get(repo);

  if (repository === undefined) {
    return [
      createServiceDiagnostic(
        'ZDP-REF-001',
        `${servicePath}.repo`,
        `Service references unknown repository \`${repo}\`.`
      )
    ];
  }

  if (isNonDeployableRepositoryStage(repository.repoStage)) {
    return [
      createServiceDiagnostic(
        'ZDP-REPO-002',
        `${servicePath}.repo`,
        `Service must not be owned by \`${repo}\` because its repo_stage is \`${repository.repoStage}\`.`
      )
    ];
  }

  return [];
}

function getServiceDiagnosticPath(value: Record<string, unknown>, index: number): string {
  const id = readStringField(value, 'id');

  return id === null ? `services[${index}]` : `services[${index}:${id}]`;
}

function createServiceDiagnostic(
  ruleId: 'ZDP-REF-001' | 'ZDP-REPO-002',
  path: string,
  message: string
): Diagnostic {
  return {
    ruleId,
    severity: 'error',
    file: SERVICES_FILE,
    path,
    message
  };
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

