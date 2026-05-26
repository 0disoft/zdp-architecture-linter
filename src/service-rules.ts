import type { Diagnostic } from './diagnostics.ts';
import {
  isNonDeployableRepositoryStage,
  type RepositoryIndex
} from './repository-rules.ts';

const SERVICES_FILE = 'catalogs/services.yaml';
const SERVICE_CONTRACT_FILE = 'service.yaml';

export interface ServiceCatalogRecord {
  readonly id: string;
  readonly repo: string | null;
  readonly path: string;
}

export interface ServiceIndex {
  readonly byId: ReadonlyMap<string, ServiceCatalogRecord>;
}

export function buildServiceIndex(value: unknown): ServiceIndex {
  if (!isRecord(value) || !Array.isArray(value.services)) {
    return { byId: new Map() };
  }

  const entries: Array<[string, ServiceCatalogRecord]> = [];

  for (const [index, service] of value.services.entries()) {
    if (!isRecord(service) || typeof service.id !== 'string') {
      continue;
    }

    const id = service.id.trim();

    if (id.length === 0) {
      continue;
    }

    entries.push([
      id,
      {
        id,
        repo: readStringField(service, 'repo'),
        path: getServiceDiagnosticPath(service, index)
      }
    ]);
  }

  return { byId: new Map(entries) };
}

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

export function validateRepositoryServiceContractRepositoryReference(
  value: unknown,
  repositoryIndex: RepositoryIndex
): readonly Diagnostic[] {
  if (!isRecord(value)) {
    return [];
  }

  const service = value.service;

  if (!isRecord(service)) {
    return [];
  }

  const repo = readStringField(service, 'repo');

  if (repo === null) {
    return [];
  }

  const repository = repositoryIndex.byName.get(repo);

  if (repository === undefined) {
    return [
      createRepositoryServiceContractDiagnostic(
        'ZDP-REF-001',
        'service.repo',
        `Service contract references unknown repository \`${repo}\`.`
      )
    ];
  }

  if (isBlockedServiceOwnerRepository(repository)) {
    return [
      createRepositoryServiceContractDiagnostic(
        'ZDP-REPO-002',
        'service.repo',
        `Service contract must not be owned by \`${repo}\` because its repo_stage is \`${repository.repoStage}\`.`
      )
    ];
  }

  return [];
}

export function validateRepositoryServiceContractServiceCatalogReference(
  value: unknown,
  serviceIndex: ServiceIndex
): readonly Diagnostic[] {
  if (!isRecord(value)) {
    return [];
  }

  const service = value.service;

  if (!isRecord(service)) {
    return [];
  }

  const serviceId = readStringField(service, 'id');

  if (serviceId === null) {
    return [];
  }

  const catalogService = serviceIndex.byId.get(serviceId);

  if (catalogService === undefined) {
    return [
      createRepositoryServiceContractDiagnostic(
        'ZDP-REF-009',
        'service.id',
        `Service contract id \`${serviceId}\` is not registered in \`catalogs/services.yaml\`.`
      )
    ];
  }

  const repo = readStringField(service, 'repo');

  if (
    repo !== null &&
    catalogService.repo !== null &&
    repo !== catalogService.repo
  ) {
    return [
      createRepositoryServiceContractDiagnostic(
        'ZDP-REF-009',
        'service.repo',
        `Service contract repo \`${repo}\` does not match \`catalogs/services.yaml\` repo \`${catalogService.repo}\` for service \`${serviceId}\`.`
      )
    ];
  }

  return [];
}

export function validateServiceDependencyReferences(
  value: unknown,
  serviceIndex: ServiceIndex
): readonly Diagnostic[] {
  if (!isRecord(value)) {
    return [
      createServiceDiagnostic(
        'ZDP-REF-004',
        'services',
        '`services.yaml` must be a YAML object with a services array.'
      )
    ];
  }

  const services = value.services;

  if (!Array.isArray(services)) {
    return [
      createServiceDiagnostic(
        'ZDP-REF-004',
        'services',
        '`services` must be a YAML array.'
      )
    ];
  }

  return services.flatMap((service, index) =>
    validateServiceDependencyRecord(service, index, serviceIndex)
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

  if (isBlockedServiceOwnerRepository(repository)) {
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

function isBlockedServiceOwnerRepository(repository: {
  readonly repoStage: string | null;
  readonly kind: string | null;
}): boolean {
  if (repository.repoStage === 'lab_only' && repository.kind === 'lab') {
    return false;
  }

  return isNonDeployableRepositoryStage(repository.repoStage);
}

function validateServiceDependencyRecord(
  value: unknown,
  index: number,
  serviceIndex: ServiceIndex
): readonly Diagnostic[] {
  if (!isRecord(value)) {
    return [
      createServiceDiagnostic(
        'ZDP-REF-004',
        `services[${index}]`,
        'Service entry must be a YAML object.'
      )
    ];
  }

  const servicePath = getServiceDiagnosticPath(value, index);
  const dependencies = value.dependencies;

  if (dependencies === undefined) {
    return [];
  }

  if (!Array.isArray(dependencies)) {
    return [
      createServiceDiagnostic(
        'ZDP-REF-004',
        `${servicePath}.dependencies`,
        '`dependencies` must be a YAML array when present.'
      )
    ];
  }

  return dependencies.flatMap((dependency, dependencyIndex) => {
    const path = `${servicePath}.dependencies[${dependencyIndex}]`;

    if (typeof dependency !== 'string' || dependency.trim().length === 0) {
      return [
        createServiceDiagnostic(
          'ZDP-REF-004',
          path,
          'Service dependency entry must be a non-empty service id.'
        )
      ];
    }

    const dependencyId = dependency.trim();

    if (!serviceIndex.byId.has(dependencyId)) {
      return [
        createServiceDiagnostic(
          'ZDP-REF-004',
          path,
          `Service references unknown dependency service \`${dependencyId}\`.`
        )
      ];
    }

    return [];
  });
}

function getServiceDiagnosticPath(value: Record<string, unknown>, index: number): string {
  const id = readStringField(value, 'id');

  return id === null ? `services[${index}]` : `services[${index}:${id}]`;
}

function createServiceDiagnostic(
  ruleId: 'ZDP-REF-001' | 'ZDP-REF-004' | 'ZDP-REPO-002',
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

function createRepositoryServiceContractDiagnostic(
  ruleId: 'ZDP-REF-001' | 'ZDP-REF-009' | 'ZDP-REPO-002',
  path: string,
  message: string
): Diagnostic {
  return {
    ruleId,
    severity: 'error',
    file: SERVICE_CONTRACT_FILE,
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
