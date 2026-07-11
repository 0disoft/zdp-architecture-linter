import type { Diagnostic } from './diagnostics.ts';
import type { DatastoreIndex } from './datastore-rules.ts';

const DATA_CLASSES_FILE = 'catalogs/data-classes.yaml';
const DATASTORES_FILE = 'catalogs/datastores.yaml';
const SERVICES_FILE = 'catalogs/services.yaml';
const SERVICE_DATA_CATALOG_RULE_ID = 'ZDP-DATA-003';
const SERVICE_DATA_OWNERSHIP_RULE_ID = 'ZDP-DATA-005';
const PRODUCT_LOCAL_PII_RULE_ID = 'ZDP-DATA-006';

const EMPTY_SERVICE_DATA_CATALOG_POLICY: ServiceDataCatalogPolicy = {
  enabled: false,
  validateClasses: false,
  validateDatastores: false
};

const EMPTY_SERVICE_DATA_OWNERSHIP_POLICY: ServiceDataOwnershipPolicy = {
  enabled: false,
  requiredFields: [],
  productLocalPiiEnabled: false,
  productLocalPiiRequiredFields: []
};

export interface DataClassRecord {
  readonly id: string;
  readonly path: string;
}

export interface DataClassIndex {
  readonly byId: ReadonlyMap<string, DataClassRecord>;
}

export interface ServiceDataCatalogPolicy {
  readonly enabled: boolean;
  readonly validateClasses: boolean;
  readonly validateDatastores: boolean;
}

export interface ServiceDataOwnershipPolicy {
  readonly enabled: boolean;
  readonly requiredFields: readonly string[];
  readonly productLocalPiiEnabled: boolean;
  readonly productLocalPiiRequiredFields: readonly string[];
}

export function buildDataClassIndex(value: unknown): DataClassIndex {
  if (!isRecord(value) || !Array.isArray(value.data_classes)) {
    return { byId: new Map() };
  }

  const entries: Array<[string, DataClassRecord]> = [];

  for (const [index, dataClass] of value.data_classes.entries()) {
    if (!isRecord(dataClass) || typeof dataClass.id !== 'string') {
      continue;
    }

    const id = dataClass.id.trim();

    if (id.length === 0) {
      continue;
    }

    entries.push([
      id,
      {
        id,
        path: getDataClassDiagnosticPath(dataClass, index)
      }
    ]);
  }

  return { byId: new Map(entries) };
}

export function buildServiceDataCatalogPolicy(
  value: unknown
): ServiceDataCatalogPolicy {
  if (!isRecord(value) || !Array.isArray(value.rules)) {
    return EMPTY_SERVICE_DATA_CATALOG_POLICY;
  }

  const dataCatalogRule = findRuleById(value.rules, SERVICE_DATA_CATALOG_RULE_ID);

  if (dataCatalogRule === undefined) {
    return EMPTY_SERVICE_DATA_CATALOG_POLICY;
  }

  const assertions = isRecord(dataCatalogRule.assertions)
    ? dataCatalogRule.assertions
    : {};
  const requireCatalogRefs = isRecord(assertions.require_catalog_refs)
    ? assertions.require_catalog_refs
    : {};

  return {
    enabled: true,
    validateClasses: 'data.classes' in requireCatalogRefs,
    validateDatastores: 'data.datastores' in requireCatalogRefs
  };
}

export function buildServiceDataOwnershipPolicy(
  value: unknown
): ServiceDataOwnershipPolicy {
  if (!isRecord(value) || !Array.isArray(value.rules)) {
    return EMPTY_SERVICE_DATA_OWNERSHIP_POLICY;
  }

  const dataOwnershipRule = findRuleById(
    value.rules,
    SERVICE_DATA_OWNERSHIP_RULE_ID
  );

  if (dataOwnershipRule === undefined) {
    return EMPTY_SERVICE_DATA_OWNERSHIP_POLICY;
  }

  const productLocalPiiRule = findRuleById(value.rules, PRODUCT_LOCAL_PII_RULE_ID);

  const assertions = isRecord(dataOwnershipRule.assertions)
    ? dataOwnershipRule.assertions
    : {};

  return {
    enabled: true,
    requiredFields: readStringArray(assertions.require_fields),
    productLocalPiiEnabled: productLocalPiiRule !== undefined,
    productLocalPiiRequiredFields: readStringArray(
      isRecord(productLocalPiiRule?.assertions)
        ? productLocalPiiRule.assertions.require_fields
        : []
    )
  };
}

export function validateDataClassCatalog(value: unknown): readonly Diagnostic[] {
  if (!isRecord(value)) {
    return [
      createDataClassDiagnostic(
        'data_classes',
        '`data-classes.yaml` must be a YAML object with a data_classes array.'
      )
    ];
  }

  const dataClasses = value.data_classes;

  if (!Array.isArray(dataClasses)) {
    return [
      createDataClassDiagnostic(
        'data_classes',
        '`data_classes` must be a YAML array.'
      )
    ];
  }

  return dataClasses.flatMap((dataClass, index) =>
    validateDataClassRecord(dataClass, index)
  );
}

export function validateServiceDataOwnershipContracts(
  value: unknown,
  policy: ServiceDataOwnershipPolicy
): readonly Diagnostic[] {
  if (!policy.enabled) {
    return [];
  }

  if (!isRecord(value)) {
    return [
      createServiceDataOwnershipDiagnostic(
        'services',
        '`services.yaml` must be a YAML object with a services array.'
      )
    ];
  }

  const services = value.services;

  if (!Array.isArray(services)) {
    return [
      createServiceDataOwnershipDiagnostic(
        'services',
        '`services` must be a YAML array.'
      )
    ];
  }

  return services.flatMap((service, index) =>
    validateServiceDataOwnershipRecord(service, index, policy)
  );
}

export function validateServiceDataCatalogReferences(
  value: unknown,
  policy: ServiceDataCatalogPolicy,
  dataClassIndex: DataClassIndex,
  datastoreIndex: DatastoreIndex
): readonly Diagnostic[] {
  if (!policy.enabled) {
    return [];
  }

  if (!isRecord(value)) {
    return [
      createServiceDataCatalogDiagnostic(
        'services',
        '`services.yaml` must be a YAML object with a services array.'
      )
    ];
  }

  const services = value.services;

  if (!Array.isArray(services)) {
    return [
      createServiceDataCatalogDiagnostic(
        'services',
        '`services` must be a YAML array.'
      )
    ];
  }

  return services.flatMap((service, index) =>
    validateServiceDataCatalogRecord(
      service,
      index,
      policy,
      dataClassIndex,
      datastoreIndex
    )
  );
}

export function validateDatastoreDataClassReferences(
  value: unknown,
  dataClassIndex: DataClassIndex
): readonly Diagnostic[] {
  if (!isRecord(value)) {
    return [
      createDatastoreDataClassDiagnostic(
        'datastores',
        '`datastores.yaml` must be a YAML object with a datastores array.'
      )
    ];
  }

  const datastores = value.datastores;

  if (!Array.isArray(datastores)) {
    return [
      createDatastoreDataClassDiagnostic(
        'datastores',
        '`datastores` must be a YAML array.'
      )
    ];
  }

  return datastores.flatMap((datastore, index) =>
    validateDatastoreRecord(datastore, index, dataClassIndex)
  );
}

export function validateDataClassAllowedDatastoreReferences(
  value: unknown,
  datastoreIndex: DatastoreIndex
): readonly Diagnostic[] {
  if (!isRecord(value)) {
    return [
      createDataClassDiagnostic(
        'data_classes',
        '`data-classes.yaml` must be a YAML object with a data_classes array.'
      )
    ];
  }

  const dataClasses = value.data_classes;

  if (!Array.isArray(dataClasses)) {
    return [
      createDataClassDiagnostic(
        'data_classes',
        '`data_classes` must be a YAML array.'
      )
    ];
  }

  return dataClasses.flatMap((dataClass, index) =>
    validateDataClassAllowedDatastoreRecord(dataClass, index, datastoreIndex)
  );
}

function validateServiceDataCatalogRecord(
  value: unknown,
  index: number,
  policy: ServiceDataCatalogPolicy,
  dataClassIndex: DataClassIndex,
  datastoreIndex: DatastoreIndex
): readonly Diagnostic[] {
  if (!isRecord(value)) {
    return [
      createServiceDataCatalogDiagnostic(
        `services[${index}]`,
        'Service entry must be a YAML object.'
      )
    ];
  }

  const diagnostics: Diagnostic[] = [];

  if (policy.validateClasses) {
    diagnostics.push(
      ...validateServiceDataCatalogArray(
        value,
        index,
        'data.classes',
        'data class',
        dataClassIndex.byId
      )
    );
  }

  if (policy.validateDatastores) {
    diagnostics.push(
      ...validateServiceDataCatalogArray(
        value,
        index,
        'data.datastores',
        'datastore',
        datastoreIndex.byId
      )
    );
  }

  return diagnostics;
}

function validateServiceDataCatalogArray(
  value: Record<string, unknown>,
  index: number,
  fieldPath: string,
  label: string,
  indexById: ReadonlyMap<string, unknown>
): readonly Diagnostic[] {
  const candidate = readValueAtPath(value, fieldPath);

  if (candidate === undefined) {
    return [];
  }

  const servicePath = getServiceDiagnosticPath(value, index);

  if (!Array.isArray(candidate)) {
    return [
      createServiceDataCatalogDiagnostic(
        `${servicePath}.${fieldPath}`,
        `\`${fieldPath}\` must be a YAML array when present.`
      )
    ];
  }

  return candidate.flatMap((entry, entryIndex) => {
    const path = `${servicePath}.${fieldPath}[${entryIndex}]`;

    if (typeof entry !== 'string' || entry.trim().length === 0) {
      return [
        createServiceDataCatalogDiagnostic(
          path,
          `Service ${label} entry must be a non-empty ${label} id.`
        )
      ];
    }

    const normalizedId = entry.trim();

    if (!indexById.has(normalizedId)) {
      return [
        createServiceDataCatalogDiagnostic(
          path,
          `Service references unknown ${label} \`${normalizedId}\`.`
        )
      ];
    }

    return [];
  });
}

function validateServiceDataOwnershipRecord(
  value: unknown,
  index: number,
  policy: ServiceDataOwnershipPolicy
): readonly Diagnostic[] {
  if (!isRecord(value)) {
    return [
      createServiceDataOwnershipDiagnostic(
        `services[${index}]`,
        'Service entry must be a YAML object.'
      )
    ];
  }

  const dataClasses = readStringArrayAtPath(value, 'data.classes');

  if (dataClasses.length === 0) {
    return [];
  }

  const servicePath = getServiceDiagnosticPath(value, index);
  const serviceName = getServiceName(value, index);
  const diagnostics = policy.requiredFields.flatMap((field) =>
    hasUsableFieldAtPath(value, field)
      ? []
      : [
          createServiceDataOwnershipDiagnostic(
            `${servicePath}.${field}`,
            `Service \`${serviceName}\` declares data classes and must set \`${field}\`.`
          )
        ]
  );

  if (!isProductLocalPiiService(value) || !policy.productLocalPiiEnabled) {
    return diagnostics;
  }

  diagnostics.push(
    ...policy.productLocalPiiRequiredFields.flatMap((field) =>
      hasRequiredProductPiiField(value, field)
        ? []
        : [
            createProductLocalPiiDiagnostic(
              `${servicePath}.${field}`,
              `Product service \`${serviceName}\` stores PII and must set \`${field}\` to a usable privacy contract value.`
            )
          ]
    )
  );

  if (!readStringArrayAtPath(value, 'human_review_required').includes('privacy')) {
    diagnostics.push(
      createProductLocalPiiDiagnostic(
        `${servicePath}.human_review_required`,
        `Product service \`${serviceName}\` stores PII and must include \`privacy\` in \`human_review_required\`.`
      )
    );
  }

  return diagnostics;
}

function isProductLocalPiiService(value: Record<string, unknown>): boolean {
  const piiLevel = readValueAtPath(value, 'data.pii_level');

  return (
    readValueAtPath(value, 'domain.type') === 'product' &&
    typeof piiLevel === 'string' &&
    piiLevel !== 'none'
  );
}

function hasRequiredProductPiiField(
  value: Record<string, unknown>,
  path: string
): boolean {
  const candidate = readValueAtPath(value, path);

  if (path.endsWith('.required') || path.endsWith('.evidence_required')) {
    return candidate === true;
  }

  return hasUsableFieldAtPath(value, path);
}

function validateDataClassRecord(value: unknown, index: number): readonly Diagnostic[] {
  if (!isRecord(value)) {
    return [
      createDataClassDiagnostic(
        `data_classes[${index}]`,
        'Data class entry must be a YAML object.'
      )
    ];
  }

  const dataClassPath = getDataClassDiagnosticPath(value, index);
  const id = readStringField(value, 'id');

  if (id === null) {
    return [
      createDataClassDiagnostic(
        `${dataClassPath}.id`,
        'Data class entry is missing required field `id`.'
      )
    ];
  }

  return [];
}

function validateDataClassAllowedDatastoreRecord(
  value: unknown,
  index: number,
  datastoreIndex: DatastoreIndex
): readonly Diagnostic[] {
  if (!isRecord(value)) {
    return [
      createDataClassDiagnostic(
        `data_classes[${index}]`,
        'Data class entry must be a YAML object.'
      )
    ];
  }

  const dataClassPath = getDataClassDiagnosticPath(value, index);
  const allowedDatastores = value.allowed_datastores;

  if (allowedDatastores === undefined) {
    return [];
  }

  if (!Array.isArray(allowedDatastores)) {
    return [
      createDataClassDiagnostic(
        `${dataClassPath}.allowed_datastores`,
        '`allowed_datastores` must be a YAML array when present.'
      )
    ];
  }

  return allowedDatastores.flatMap((datastoreId, datastoreIndexInDataClass) => {
    const path = `${dataClassPath}.allowed_datastores[${datastoreIndexInDataClass}]`;

    if (typeof datastoreId !== 'string' || datastoreId.trim().length === 0) {
      return [
        createDataClassDiagnostic(
          path,
          'Allowed datastore entry must be a non-empty datastore id.'
        )
      ];
    }

    const normalizedDatastoreId = datastoreId.trim();

    if (!datastoreIndex.byId.has(normalizedDatastoreId)) {
      return [
        createDataClassDiagnostic(
          path,
          `Data class references unknown allowed datastore \`${normalizedDatastoreId}\`.`
        )
      ];
    }

    return [];
  });
}

function validateDatastoreRecord(
  value: unknown,
  index: number,
  dataClassIndex: DataClassIndex
): readonly Diagnostic[] {
  if (!isRecord(value)) {
    return [
      createDatastoreDataClassDiagnostic(
        `datastores[${index}]`,
        'Datastore entry must be a YAML object.'
      )
    ];
  }

  const datastorePath = getDatastoreDiagnosticPath(value, index);
  const dataClasses = value.data_classes;

  if (dataClasses === undefined) {
    return [];
  }

  if (!Array.isArray(dataClasses)) {
    return [
      createDatastoreDataClassDiagnostic(
        `${datastorePath}.data_classes`,
        '`data_classes` must be a YAML array when present.'
      )
    ];
  }

  return dataClasses.flatMap((dataClassId, dataClassIndexInDatastore) => {
    const path = `${datastorePath}.data_classes[${dataClassIndexInDatastore}]`;

    if (typeof dataClassId !== 'string' || dataClassId.trim().length === 0) {
      return [
        createDatastoreDataClassDiagnostic(
          path,
          'Datastore data class entry must be a non-empty data class id.'
        )
      ];
    }

    const normalizedDataClassId = dataClassId.trim();

    if (!dataClassIndex.byId.has(normalizedDataClassId)) {
      return [
        createDatastoreDataClassDiagnostic(
          path,
          `Datastore references unknown data class \`${normalizedDataClassId}\`.`
        )
      ];
    }

    return [];
  });
}

function readStringArrayAtPath(
  value: Record<string, unknown>,
  path: string
): readonly string[] {
  const candidate = readValueAtPath(value, path);

  return Array.isArray(candidate) ? readStringArray(candidate) : [];
}

function hasUsableFieldAtPath(
  value: Record<string, unknown>,
  path: string
): boolean {
  const candidate = readValueAtPath(value, path);

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

function findRuleById(
  rules: readonly unknown[],
  ruleId: string
): Record<string, unknown> | undefined {
  return rules.find(
    (rule): rule is Record<string, unknown> =>
      isRecord(rule) && readStringField(rule, 'id') === ruleId
  );
}

function getDataClassDiagnosticPath(value: Record<string, unknown>, index: number): string {
  const id = readStringField(value, 'id');

  return id === null ? `data_classes[${index}]` : `data_classes[${index}:${id}]`;
}

function getDatastoreDiagnosticPath(value: Record<string, unknown>, index: number): string {
  const id = readStringField(value, 'id');

  return id === null ? `datastores[${index}]` : `datastores[${index}:${id}]`;
}

function getServiceDiagnosticPath(value: Record<string, unknown>, index: number): string {
  const id = readStringField(value, 'id');

  return id === null ? `services[${index}]` : `services[${index}:${id}]`;
}

function getServiceName(value: Record<string, unknown>, index: number): string {
  return readStringField(value, 'id') ?? `services[${index}]`;
}

function createDataClassDiagnostic(path: string, message: string): Diagnostic {
  return {
    ruleId: 'ZDP-REF-006',
    severity: 'error',
    file: DATA_CLASSES_FILE,
    path,
    message
  };
}

function createDatastoreDataClassDiagnostic(path: string, message: string): Diagnostic {
  return {
    ruleId: 'ZDP-REF-006',
    severity: 'error',
    file: DATASTORES_FILE,
    path,
    message
  };
}

function createServiceDataCatalogDiagnostic(
  path: string,
  message: string
): Diagnostic {
  return {
    ruleId: SERVICE_DATA_CATALOG_RULE_ID,
    severity: 'error',
    file: SERVICES_FILE,
    path,
    message
  };
}

function createServiceDataOwnershipDiagnostic(
  path: string,
  message: string
): Diagnostic {
  return {
    ruleId: SERVICE_DATA_OWNERSHIP_RULE_ID,
    severity: 'error',
    file: SERVICES_FILE,
    path,
    message
  };
}

function createProductLocalPiiDiagnostic(path: string, message: string): Diagnostic {
  return {
    ruleId: PRODUCT_LOCAL_PII_RULE_ID,
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
