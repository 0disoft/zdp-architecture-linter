import type { Diagnostic } from './diagnostics.ts';

const EXTERNAL_PROVIDERS_FILE = 'catalogs/external-providers.yaml';
const SERVICES_FILE = 'catalogs/services.yaml';
const PROVIDER_CONTRACT_RULE_ID = 'ZDP-PROVIDER-001';

const EMPTY_PROVIDER_CONTRACT_POLICY: ProviderContractPolicy = {
  enabled: false,
  requiredProviderFields: []
};

export interface ExternalProviderRecord {
  readonly id: string;
  readonly path: string;
}

export interface ExternalProviderIndex {
  readonly byId: ReadonlyMap<string, ExternalProviderRecord>;
}

export interface ProviderContractPolicy {
  readonly enabled: boolean;
  readonly requiredProviderFields: readonly string[];
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

export function buildProviderContractPolicy(value: unknown): ProviderContractPolicy {
  if (!isRecord(value) || !Array.isArray(value.rules)) {
    return EMPTY_PROVIDER_CONTRACT_POLICY;
  }

  const providerRule = value.rules.find(
    (rule): rule is Record<string, unknown> =>
      isRecord(rule) && readStringField(rule, 'id') === PROVIDER_CONTRACT_RULE_ID
  );

  if (providerRule === undefined) {
    return EMPTY_PROVIDER_CONTRACT_POLICY;
  }

  const assertions = isRecord(providerRule.assertions)
    ? providerRule.assertions
    : {};
  const requiredProviderFields = readStringArray(assertions.require_fields)
    .map((field) => parseProviderField(field))
    .filter((field): field is string => field !== null);

  return {
    enabled: true,
    requiredProviderFields
  };
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

export function validateServiceProviderContracts(
  value: unknown,
  policy: ProviderContractPolicy
): readonly Diagnostic[] {
  if (!policy.enabled) {
    return [];
  }

  if (!isRecord(value)) {
    return [
      createServiceProviderContractDiagnostic(
        'services',
        '`services.yaml` must be a YAML object with a services array.'
      )
    ];
  }

  const services = value.services;

  if (!Array.isArray(services)) {
    return [
      createServiceProviderContractDiagnostic(
        'services',
        '`services` must be a YAML array.'
      )
    ];
  }

  return services.flatMap((service, index) =>
    validateServiceProviderContractRecord(service, index, policy)
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

function validateServiceProviderContractRecord(
  value: unknown,
  index: number,
  policy: ProviderContractPolicy
): readonly Diagnostic[] {
  if (!isRecord(value)) {
    return [
      createServiceProviderContractDiagnostic(
        `services[${index}]`,
        'Service entry must be a YAML object.'
      )
    ];
  }

  const providers = value.providers;

  if (providers === undefined) {
    return [];
  }

  const servicePath = getServiceDiagnosticPath(value, index);

  if (!Array.isArray(providers)) {
    return [
      createServiceProviderContractDiagnostic(
        `${servicePath}.providers`,
        '`providers` must be a YAML array when present.'
      )
    ];
  }

  if (providers.length === 0) {
    return [];
  }

  return providers.flatMap((provider, providerIndex) =>
    validateProviderContractEntry(
      provider,
      `${servicePath}.providers[${providerIndex}]`,
      policy
    )
  );
}

function validateProviderContractEntry(
  value: unknown,
  providerPath: string,
  policy: ProviderContractPolicy
): readonly Diagnostic[] {
  if (!isRecord(value)) {
    return [
      createServiceProviderContractDiagnostic(
        providerPath,
        'Provider entry must be a YAML object.'
      )
    ];
  }

  return policy.requiredProviderFields.flatMap((field) =>
    hasUsableProviderField(value, field)
      ? []
      : [
          createServiceProviderContractDiagnostic(
            `${providerPath}.${field}`,
            `Provider entry is missing required field \`${field}\`.`
          )
        ]
  );
}

function hasUsableProviderField(
  value: Record<string, unknown>,
  field: string
): boolean {
  const candidate = value[field];

  if (typeof candidate === 'string') {
    return candidate.trim().length > 0;
  }

  if (Array.isArray(candidate)) {
    return candidate.some(
      (entry) => typeof entry === 'string' && entry.trim().length > 0
    );
  }

  return candidate !== null && candidate !== undefined;
}

function parseProviderField(field: string): string | null {
  const prefix = 'providers[].';

  return field.startsWith(prefix) && field.length > prefix.length
    ? field.slice(prefix.length)
    : null;
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

function createServiceProviderContractDiagnostic(
  path: string,
  message: string
): Diagnostic {
  return {
    ruleId: PROVIDER_CONTRACT_RULE_ID,
    severity: 'error',
    file: SERVICES_FILE,
    path,
    message
  };
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
