import type { Diagnostic } from './diagnostics.ts';

const EXTERNAL_PROVIDERS_FILE = 'catalogs/external-providers.yaml';
const SERVICES_FILE = 'catalogs/services.yaml';

export interface ExternalProviderRecord {
  readonly id: string;
  readonly path: string;
}

export interface ExternalProviderIndex {
  readonly byId: ReadonlyMap<string, ExternalProviderRecord>;
}

export function buildExternalProviderIndex(value: unknown): ExternalProviderIndex {
  if (!isRecord(value) || !Array.isArray(value.providers)) {
    return { byId: new Map() };
  }

  const entries: Array<[string, ExternalProviderRecord]> = [];

  for (const [index, provider] of value.providers.entries()) {
    if (!isRecord(provider) || typeof provider.id !== 'string') {
      continue;
    }

    const id = provider.id.trim();

    if (id.length === 0) {
      continue;
    }

    entries.push([
      id,
      {
        id,
        path: getProviderDiagnosticPath(provider, index)
      }
    ]);
  }

  return { byId: new Map(entries) };
}

export function validateExternalProviderCatalog(value: unknown): readonly Diagnostic[] {
  if (!isRecord(value)) {
    return [
      createProviderDiagnostic(
        'providers',
        '`external-providers.yaml` must be a YAML object with a providers array.'
      )
    ];
  }

  const providers = value.providers;

  if (!Array.isArray(providers)) {
    return [
      createProviderDiagnostic('providers', '`providers` must be a YAML array.')
    ];
  }

  return providers.flatMap((provider, index) =>
    validateProviderRecord(provider, index)
  );
}

export function validateServiceExternalDependencyReferences(
  value: unknown,
  providerIndex: ExternalProviderIndex
): readonly Diagnostic[] {
  if (!isRecord(value)) {
    return [
      createServiceProviderDiagnostic(
        'services',
        '`services.yaml` must be a YAML object with a services array.'
      )
    ];
  }

  const services = value.services;

  if (!Array.isArray(services)) {
    return [
      createServiceProviderDiagnostic('services', '`services` must be a YAML array.')
    ];
  }

  return services.flatMap((service, index) =>
    validateServiceExternalDependencyRecord(service, index, providerIndex)
  );
}

function validateProviderRecord(value: unknown, index: number): readonly Diagnostic[] {
  if (!isRecord(value)) {
    return [
      createProviderDiagnostic(
        `providers[${index}]`,
        'External provider entry must be a YAML object.'
      )
    ];
  }

  const providerPath = getProviderDiagnosticPath(value, index);
  const id = readStringField(value, 'id');

  if (id === null) {
    return [
      createProviderDiagnostic(
        `${providerPath}.id`,
        'External provider entry is missing required field `id`.'
      )
    ];
  }

  return [];
}

function validateServiceExternalDependencyRecord(
  value: unknown,
  index: number,
  providerIndex: ExternalProviderIndex
): readonly Diagnostic[] {
  if (!isRecord(value)) {
    return [
      createServiceProviderDiagnostic(
        `services[${index}]`,
        'Service entry must be a YAML object.'
      )
    ];
  }

  const servicePath = getServiceDiagnosticPath(value, index);
  const externalDependencies = value.external_dependencies;

  if (externalDependencies === undefined) {
    return [];
  }

  if (!Array.isArray(externalDependencies)) {
    return [
      createServiceProviderDiagnostic(
        `${servicePath}.external_dependencies`,
        '`external_dependencies` must be a YAML array when present.'
      )
    ];
  }

  return externalDependencies.flatMap((providerId, providerIndexInService) => {
    const path = `${servicePath}.external_dependencies[${providerIndexInService}]`;

    if (typeof providerId !== 'string' || providerId.trim().length === 0) {
      return [
        createServiceProviderDiagnostic(
          path,
          'External dependency entry must be a non-empty provider id.'
        )
      ];
    }

    const normalizedProviderId = providerId.trim();

    if (!providerIndex.byId.has(normalizedProviderId)) {
      return [
        createServiceProviderDiagnostic(
          path,
          `Service references unknown external provider \`${normalizedProviderId}\`.`
        )
      ];
    }

    return [];
  });
}

function getProviderDiagnosticPath(value: Record<string, unknown>, index: number): string {
  const id = readStringField(value, 'id');

  return id === null ? `providers[${index}]` : `providers[${index}:${id}]`;
}

function getServiceDiagnosticPath(value: Record<string, unknown>, index: number): string {
  const id = readStringField(value, 'id');

  return id === null ? `services[${index}]` : `services[${index}:${id}]`;
}

function createProviderDiagnostic(path: string, message: string): Diagnostic {
  return {
    ruleId: 'ZDP-REF-005',
    severity: 'error',
    file: EXTERNAL_PROVIDERS_FILE,
    path,
    message
  };
}

function createServiceProviderDiagnostic(path: string, message: string): Diagnostic {
  return {
    ruleId: 'ZDP-REF-005',
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
