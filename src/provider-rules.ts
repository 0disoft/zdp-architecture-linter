import type { Diagnostic } from './diagnostics.ts';

const EXTERNAL_PROVIDERS_FILE = 'catalogs/external-providers.yaml';
const SERVICES_FILE = 'catalogs/services.yaml';
const PROVIDER_CONTRACT_RULE_ID = 'ZDP-PROVIDER-001';
const PROVIDER_WEBHOOK_RULE_ID = 'ZDP-PROVIDER-002';
const PROVIDER_CATALOG_WEBHOOK_RULE_ID = 'ZDP-PROVIDER-003';

const EMPTY_PROVIDER_CONTRACT_POLICY: ProviderContractPolicy = {
  enabled: false,
  requiredProviderFields: []
};

const EMPTY_PROVIDER_WEBHOOK_POLICY: ProviderWebhookPolicy = {
  enabled: false,
  requiredWebhookFields: []
};

const EMPTY_PROVIDER_CATALOG_WEBHOOK_POLICY: ProviderCatalogWebhookPolicy = {
  enabled: false,
  providerCategories: [],
  requiredWebhookIntakeFields: []
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

export interface ProviderWebhookPolicy {
  readonly enabled: boolean;
  readonly requiredWebhookFields: readonly string[];
}

export interface ProviderCatalogWebhookPolicy {
  readonly enabled: boolean;
  readonly providerCategories: readonly string[];
  readonly requiredWebhookIntakeFields: readonly string[];
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

  const providerRule = findRuleById(value.rules, PROVIDER_CONTRACT_RULE_ID);

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

export function buildProviderWebhookPolicy(value: unknown): ProviderWebhookPolicy {
  if (!isRecord(value) || !Array.isArray(value.rules)) {
    return EMPTY_PROVIDER_WEBHOOK_POLICY;
  }

  const providerWebhookRule = findRuleById(value.rules, PROVIDER_WEBHOOK_RULE_ID);

  if (providerWebhookRule === undefined) {
    return EMPTY_PROVIDER_WEBHOOK_POLICY;
  }

  const assertions = isRecord(providerWebhookRule.assertions)
    ? providerWebhookRule.assertions
    : {};
  const requiredWebhookFields = readStringArray(assertions.require_fields)
    .map((field) => parseProviderWebhookField(field))
    .filter((field): field is string => field !== null);

  return {
    enabled: true,
    requiredWebhookFields
  };
}

export function buildProviderCatalogWebhookPolicy(
  value: unknown
): ProviderCatalogWebhookPolicy {
  if (!isRecord(value) || !Array.isArray(value.rules)) {
    return EMPTY_PROVIDER_CATALOG_WEBHOOK_POLICY;
  }

  const providerRule = findRuleById(
    value.rules,
    PROVIDER_CATALOG_WEBHOOK_RULE_ID
  );

  if (providerRule === undefined) {
    return EMPTY_PROVIDER_CATALOG_WEBHOOK_POLICY;
  }

  const condition = isRecord(providerRule.condition) ? providerRule.condition : {};
  const assertions = isRecord(providerRule.assertions)
    ? providerRule.assertions
    : {};
  const requiredWebhookIntakeFields = readStringArray(assertions.require_fields)
    .map((field) => parseProviderWebhookIntakeField(field))
    .filter((field): field is string => field !== null);

  return {
    enabled: true,
    providerCategories: readStringArray(condition.any_category),
    requiredWebhookIntakeFields
  };
}

export function validateExternalProviderCatalog(
  value: unknown,
  policy: ProviderCatalogWebhookPolicy = EMPTY_PROVIDER_CATALOG_WEBHOOK_POLICY
): readonly Diagnostic[] {
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
    validateProviderRecord(provider, index, policy)
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

export function validateServiceProviderWebhooks(
  value: unknown,
  policy: ProviderWebhookPolicy
): readonly Diagnostic[] {
  if (!policy.enabled) {
    return [];
  }

  if (!isRecord(value)) {
    return [
      createServiceProviderWebhookDiagnostic(
        'services',
        '`services.yaml` must be a YAML object with a services array.'
      )
    ];
  }

  const services = value.services;

  if (!Array.isArray(services)) {
    return [
      createServiceProviderWebhookDiagnostic(
        'services',
        '`services` must be a YAML array.'
      )
    ];
  }

  return services.flatMap((service, index) =>
    validateServiceProviderWebhookRecord(service, index, policy)
  );
}

function validateProviderRecord(
  value: unknown,
  index: number,
  policy: ProviderCatalogWebhookPolicy
): readonly Diagnostic[] {
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

  if (!providerMatchesCatalogWebhookPolicy(value, policy)) {
    return [];
  }

  const webhookIntake = value.webhook_intake;

  if (!isRecord(webhookIntake)) {
    return [
      createProviderCatalogWebhookDiagnostic(
        `${providerPath}.webhook_intake`,
        'PSP provider entry must declare a `webhook_intake` policy object.'
      )
    ];
  }

  return policy.requiredWebhookIntakeFields.flatMap((field) =>
    readValueAtPath(webhookIntake, field) === true
      ? []
      : [
          createProviderCatalogWebhookDiagnostic(
            `${providerPath}.webhook_intake.${field}`,
            `PSP provider webhook intake field \`${field}\` must be set to true.`
          )
        ]
  );
}

function providerMatchesCatalogWebhookPolicy(
  value: Record<string, unknown>,
  policy: ProviderCatalogWebhookPolicy
): boolean {
  if (!policy.enabled || policy.providerCategories.length === 0) {
    return false;
  }

  const categories = readStringArray(value.categories);

  return categories.some((category) => policy.providerCategories.includes(category));
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

function validateServiceProviderWebhookRecord(
  value: unknown,
  index: number,
  policy: ProviderWebhookPolicy
): readonly Diagnostic[] {
  if (!isRecord(value)) {
    return [
      createServiceProviderWebhookDiagnostic(
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
      createServiceProviderWebhookDiagnostic(
        `${servicePath}.providers`,
        '`providers` must be a YAML array when present.'
      )
    ];
  }

  return providers.flatMap((provider, providerIndex) =>
    validateProviderWebhookEntry(
      provider,
      `${servicePath}.providers[${providerIndex}]`,
      policy
    )
  );
}

function validateProviderWebhookEntry(
  value: unknown,
  providerPath: string,
  policy: ProviderWebhookPolicy
): readonly Diagnostic[] {
  if (!isRecord(value)) {
    return [
      createServiceProviderWebhookDiagnostic(
        providerPath,
        'Provider entry must be a YAML object.'
      )
    ];
  }

  const webhook = value.webhook;

  if (webhook === undefined) {
    return [];
  }

  if (!isRecord(webhook)) {
    return [
      createServiceProviderWebhookDiagnostic(
        `${providerPath}.webhook`,
        '`webhook` must be a YAML object when present.'
      )
    ];
  }

  if (webhook.enabled !== true) {
    return [];
  }

  return policy.requiredWebhookFields.flatMap((field) => {
    const candidate = readValueAtPath(webhook, field);

    if (isWebhookBooleanControlField(field)) {
      return candidate === true
        ? []
        : [
            createServiceProviderWebhookDiagnostic(
              `${providerPath}.webhook.${field}`,
              `Provider webhook field \`${field}\` must be set to true when webhook is enabled.`
            )
          ];
    }

    return hasUsableProviderField(webhook, field)
      ? []
      : [
          createServiceProviderWebhookDiagnostic(
            `${providerPath}.webhook.${field}`,
            `Provider webhook is missing required field \`${field}\`.`
          )
        ];
  });
}

function isWebhookBooleanControlField(field: string): boolean {
  return field === 'replay_supported' || field === 'signature_required';
}

function hasUsableProviderField(
  value: Record<string, unknown>,
  field: string
): boolean {
  const candidate = readValueAtPath(value, field);

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

function readValueAtPath(value: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (!isRecord(current)) {
      return undefined;
    }

    return current[segment];
  }, value);
}

function parseProviderField(field: string): string | null {
  const prefix = 'providers[].';

  return field.startsWith(prefix) && field.length > prefix.length
    ? field.slice(prefix.length)
    : null;
}

function parseProviderWebhookField(field: string): string | null {
  const prefix = 'providers[].webhook.';

  return field.startsWith(prefix) && field.length > prefix.length
    ? field.slice(prefix.length)
    : null;
}

function parseProviderWebhookIntakeField(field: string): string | null {
  const prefix = 'providers[].webhook_intake.';

  return field.startsWith(prefix) && field.length > prefix.length
    ? field.slice(prefix.length)
    : null;
}

function findRuleById(
  rules: readonly unknown[],
  ruleId: string
): Record<string, unknown> | undefined {
  return rules.find(
    (rule): rule is Record<string, unknown> =>
      isRecord(rule) && readStringField(rule, 'id') === ruleId
  );
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

function createServiceProviderWebhookDiagnostic(
  path: string,
  message: string
): Diagnostic {
  return {
    ruleId: PROVIDER_WEBHOOK_RULE_ID,
    severity: 'error',
    file: SERVICES_FILE,
    path,
    message
  };
}

function createProviderCatalogWebhookDiagnostic(
  path: string,
  message: string
): Diagnostic {
  return {
    ruleId: PROVIDER_CATALOG_WEBHOOK_RULE_ID,
    severity: 'error',
    file: EXTERNAL_PROVIDERS_FILE,
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
