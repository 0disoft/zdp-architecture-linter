import type { Diagnostic } from './diagnostics.ts';

const SERVICE_CONTRACT_FILE = 'service.yaml';

export function buildRepositoryServiceContractCatalog(value: unknown): {
  readonly services: readonly unknown[];
} {
  if (!isRecord(value)) {
    return { services: [value] };
  }

  return {
    services: [normalizeRepositoryServiceContract(value)]
  };
}

export function mapServiceCatalogDiagnosticsToRepositoryServiceContract(
  diagnostics: readonly Diagnostic[]
): readonly Diagnostic[] {
  return diagnostics.map((diagnostic) => ({
    ...diagnostic,
    file: SERVICE_CONTRACT_FILE,
    path: mapServiceCatalogPathToServiceContractPath(diagnostic.path)
  }));
}

function normalizeRepositoryServiceContract(
  value: Record<string, unknown>
): Record<string, unknown> {
  const service = isRecord(value.service) ? value.service : {};
  const runtime = isRecord(value.runtime) ? value.runtime : {};
  const data = isRecord(value.data) ? value.data : {};

  return {
    ...value,
    id: readStringField(service, 'id') ?? readStringField(value, 'id') ?? undefined,
    repo:
      readStringField(service, 'repo') ?? readStringField(value, 'repo') ?? undefined,
    status:
      readStringField(service, 'status') ??
      readStringField(value, 'status') ??
      undefined,
    tier:
      readStringField(service, 'tier') ?? readStringField(value, 'tier') ?? undefined,
    risk_level:
      readStringField(service, 'risk_level') ??
      readStringField(value, 'risk_level') ??
      undefined,
    runtime:
      readStringField(runtime, 'edge') ??
      readStringField(runtime, 'deploy_target') ??
      readStringField(runtime, 'core') ??
      readStringField(value, 'runtime') ??
      undefined,
    direct_datastore_access:
      readStringArrayField(value, 'direct_datastore_access') ??
      readStringArrayField(data, 'direct_datastore_access') ??
      readStringArrayField(data, 'datastores') ??
      undefined
  };
}

function mapServiceCatalogPathToServiceContractPath(path: string): string {
  if (path === 'services') {
    return 'service';
  }

  const mappedPath = path.replace(/^services\[\d+(?::[^\]]+)?\]\.?/, '');

  return mappedPath.length > 0 ? mappedPath : 'service';
}

function readStringField(value: Record<string, unknown>, field: string): string | null {
  const candidate = value[field];

  return typeof candidate === 'string' && candidate.trim().length > 0
    ? candidate.trim()
    : null;
}

function readStringArrayField(
  value: Record<string, unknown>,
  field: string
): readonly string[] | null {
  const candidate = value[field];

  if (!Array.isArray(candidate)) {
    return null;
  }

  return candidate.flatMap((entry) =>
    typeof entry === 'string' && entry.trim().length > 0 ? [entry.trim()] : []
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
