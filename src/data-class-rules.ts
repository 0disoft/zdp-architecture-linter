import type { Diagnostic } from './diagnostics.ts';

const DATA_CLASSES_FILE = 'catalogs/data-classes.yaml';
const DATASTORES_FILE = 'catalogs/datastores.yaml';

export interface DataClassRecord {
  readonly id: string;
  readonly path: string;
}

export interface DataClassIndex {
  readonly byId: ReadonlyMap<string, DataClassRecord>;
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

function getDataClassDiagnosticPath(value: Record<string, unknown>, index: number): string {
  const id = readStringField(value, 'id');

  return id === null ? `data_classes[${index}]` : `data_classes[${index}:${id}]`;
}

function getDatastoreDiagnosticPath(value: Record<string, unknown>, index: number): string {
  const id = readStringField(value, 'id');

  return id === null ? `datastores[${index}]` : `datastores[${index}:${id}]`;
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

function readStringField(value: Record<string, unknown>, field: string): string | null {
  const candidate = value[field];

  return typeof candidate === 'string' && candidate.trim().length > 0
    ? candidate.trim()
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
