import type { DataClassIndex } from './data-class-rules.ts';
import type { Diagnostic } from './diagnostics.ts';
import type { RepositoryIndex } from './repository-rules.ts';

const DATA_CLASSES_FILE = 'catalogs/data-classes.yaml';
const EVENTS_FILE = 'catalogs/events.yaml';

export interface EventRecord {
  readonly id: string;
  readonly path: string;
  readonly schemaRef: string | null;
}

export interface EventIndex {
  readonly byId: ReadonlyMap<string, EventRecord>;
}

export function buildEventIndex(value: unknown): EventIndex {
  if (!isRecord(value) || !Array.isArray(value.events)) {
    return { byId: new Map() };
  }

  const entries: Array<[string, EventRecord]> = [];

  for (const [index, event] of value.events.entries()) {
    if (!isRecord(event) || typeof event.id !== 'string') {
      continue;
    }

    const id = event.id.trim();

    if (id.length === 0) {
      continue;
    }

    entries.push([
      id,
      {
        id,
        path: getEventDiagnosticPath(event, index),
        schemaRef: readStringField(event, 'schema_ref')
      }
    ]);
  }

  return { byId: new Map(entries) };
}

export function validateEventCatalog(value: unknown): readonly Diagnostic[] {
  if (!isRecord(value)) {
    return [
      createEventDiagnostic(
        'events',
        '`events.yaml` must be a YAML object with an events array.'
      )
    ];
  }

  const events = value.events;

  if (!Array.isArray(events)) {
    return [
      createEventDiagnostic('events', '`events` must be a YAML array.')
    ];
  }

  return events.flatMap((event, index) => validateEventRecord(event, index));
}

export function validateEventDataClassReferences(
  value: unknown,
  dataClassIndex: DataClassIndex
): readonly Diagnostic[] {
  if (!isRecord(value)) {
    return [
      createEventDiagnostic(
        'events',
        '`events.yaml` must be a YAML object with an events array.'
      )
    ];
  }

  const events = value.events;

  if (!Array.isArray(events)) {
    return [
      createEventDiagnostic('events', '`events` must be a YAML array.')
    ];
  }

  return events.flatMap((event, index) =>
    validateEventDataClassRecord(event, index, dataClassIndex)
  );
}

export function validateEventRepositoryReferences(
  value: unknown,
  repositoryIndex: RepositoryIndex
): readonly Diagnostic[] {
  if (!isRecord(value)) {
    return [
      createEventRepositoryDiagnostic(
        'events',
        '`events.yaml` must be a YAML object with an events array.'
      )
    ];
  }

  const events = value.events;

  if (!Array.isArray(events)) {
    return [
      createEventRepositoryDiagnostic('events', '`events` must be a YAML array.')
    ];
  }

  return events.flatMap((event, index) =>
    validateEventRepositoryRecord(event, index, repositoryIndex)
  );
}

export function validateDataClassDeletionEventReferences(
  value: unknown,
  eventIndex: EventIndex
): readonly Diagnostic[] {
  if (!isRecord(value)) {
    return [
      createDataClassEventDiagnostic(
        'data_classes',
        '`data-classes.yaml` must be a YAML object with a data_classes array.'
      )
    ];
  }

  const dataClasses = value.data_classes;

  if (!Array.isArray(dataClasses)) {
    return [
      createDataClassEventDiagnostic(
        'data_classes',
        '`data_classes` must be a YAML array.'
      )
    ];
  }

  return dataClasses.flatMap((dataClass, index) =>
    validateDataClassDeletionEventRecord(dataClass, index, eventIndex)
  );
}

function validateEventRecord(value: unknown, index: number): readonly Diagnostic[] {
  if (!isRecord(value)) {
    return [
      createEventDiagnostic(
        `events[${index}]`,
        'Event entry must be a YAML object.'
      )
    ];
  }

  const eventPath = getEventDiagnosticPath(value, index);
  const id = readStringField(value, 'id');

  if (id === null) {
    return [
      createEventDiagnostic(
        `${eventPath}.id`,
        'Event entry is missing required field `id`.'
      )
    ];
  }

  return [];
}

function validateEventDataClassRecord(
  value: unknown,
  index: number,
  dataClassIndex: DataClassIndex
): readonly Diagnostic[] {
  if (!isRecord(value)) {
    return [
      createEventDiagnostic(
        `events[${index}]`,
        'Event entry must be a YAML object.'
      )
    ];
  }

  const eventPath = getEventDiagnosticPath(value, index);
  const dataClasses = value.data_classes;

  if (dataClasses === undefined) {
    return [];
  }

  if (!Array.isArray(dataClasses)) {
    return [
      createEventDiagnostic(
        `${eventPath}.data_classes`,
        '`data_classes` must be a YAML array when present.'
      )
    ];
  }

  return dataClasses.flatMap((dataClassId, dataClassIndexInEvent) => {
    const path = `${eventPath}.data_classes[${dataClassIndexInEvent}]`;

    if (typeof dataClassId !== 'string' || dataClassId.trim().length === 0) {
      return [
        createEventDiagnostic(
          path,
          'Event data class entry must be a non-empty data class id.'
        )
      ];
    }

    const normalizedDataClassId = dataClassId.trim();

    if (!dataClassIndex.byId.has(normalizedDataClassId)) {
      return [
        createEventDiagnostic(
          path,
          `Event references unknown data class \`${normalizedDataClassId}\`.`
        )
      ];
    }

    return [];
  });
}

function validateEventRepositoryRecord(
  value: unknown,
  index: number,
  repositoryIndex: RepositoryIndex
): readonly Diagnostic[] {
  if (!isRecord(value)) {
    return [
      createEventRepositoryDiagnostic(
        `events[${index}]`,
        'Event entry must be a YAML object.'
      )
    ];
  }

  const eventPath = getEventDiagnosticPath(value, index);
  const ownerRepo = readStringField(value, 'owner_repo');

  return [
    ...validateEventOwnerRepo(ownerRepo, eventPath, repositoryIndex),
    ...validateEventRepositoryArray(
      value,
      'emitted_by',
      eventPath,
      repositoryIndex
    ),
    ...validateEventRepositoryArray(
      value,
      'consumed_by',
      eventPath,
      repositoryIndex
    )
  ];
}

function validateEventOwnerRepo(
  ownerRepo: string | null,
  eventPath: string,
  repositoryIndex: RepositoryIndex
): readonly Diagnostic[] {
  if (ownerRepo === null) {
    return [
      createEventRepositoryDiagnostic(
        `${eventPath}.owner_repo`,
        'Event entry is missing required field `owner_repo`.'
      )
    ];
  }

  if (!repositoryIndex.byName.has(ownerRepo)) {
    return [
      createEventRepositoryDiagnostic(
        `${eventPath}.owner_repo`,
        `Event references unknown owner repository \`${ownerRepo}\`.`
      )
    ];
  }

  return [];
}

function validateEventRepositoryArray(
  value: Record<string, unknown>,
  field: 'emitted_by' | 'consumed_by',
  eventPath: string,
  repositoryIndex: RepositoryIndex
): readonly Diagnostic[] {
  const repositoryRefs = value[field];

  if (repositoryRefs === undefined) {
    return [];
  }

  if (!Array.isArray(repositoryRefs)) {
    return [
      createEventRepositoryDiagnostic(
        `${eventPath}.${field}`,
        `\`${field}\` must be a YAML array when present.`
      )
    ];
  }

  return repositoryRefs.flatMap((repositoryName, repositoryIndexInEvent) => {
    const path = `${eventPath}.${field}[${repositoryIndexInEvent}]`;

    if (typeof repositoryName !== 'string' || repositoryName.trim().length === 0) {
      return [
        createEventRepositoryDiagnostic(
          path,
          `${field} entry must be a non-empty repository or logical boundary id.`
        )
      ];
    }

    const normalizedRepositoryName = repositoryName.trim();

    if (!repositoryIndex.byName.has(normalizedRepositoryName)) {
      return [
        createEventRepositoryDiagnostic(
          path,
          `Event references unknown ${field} repository or logical boundary \`${normalizedRepositoryName}\`.`
        )
      ];
    }

    return [];
  });
}

function validateDataClassDeletionEventRecord(
  value: unknown,
  index: number,
  eventIndex: EventIndex
): readonly Diagnostic[] {
  if (!isRecord(value)) {
    return [
      createDataClassEventDiagnostic(
        `data_classes[${index}]`,
        'Data class entry must be a YAML object.'
      )
    ];
  }

  const dataClassPath = getDataClassDiagnosticPath(value, index);
  const deletionEvents = value.deletion_events;

  if (deletionEvents === undefined) {
    return [];
  }

  if (!Array.isArray(deletionEvents)) {
    return [
      createDataClassEventDiagnostic(
        `${dataClassPath}.deletion_events`,
        '`deletion_events` must be a YAML array when present.'
      )
    ];
  }

  return deletionEvents.flatMap((eventId, eventIndexInDataClass) => {
    const path = `${dataClassPath}.deletion_events[${eventIndexInDataClass}]`;

    if (typeof eventId !== 'string' || eventId.trim().length === 0) {
      return [
        createDataClassEventDiagnostic(
          path,
          'Deletion event entry must be a non-empty event id.'
        )
      ];
    }

    const normalizedEventId = eventId.trim();

    if (!eventIndex.byId.has(normalizedEventId)) {
      return [
        createDataClassEventDiagnostic(
          path,
          `Data class references unknown deletion event \`${normalizedEventId}\`.`
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

function getEventDiagnosticPath(value: Record<string, unknown>, index: number): string {
  const id = readStringField(value, 'id');

  return id === null ? `events[${index}]` : `events[${index}:${id}]`;
}

function createDataClassEventDiagnostic(path: string, message: string): Diagnostic {
  return {
    ruleId: 'ZDP-REF-007',
    severity: 'error',
    file: DATA_CLASSES_FILE,
    path,
    message
  };
}

function createEventDiagnostic(path: string, message: string): Diagnostic {
  return {
    ruleId: 'ZDP-REF-007',
    severity: 'error',
    file: EVENTS_FILE,
    path,
    message
  };
}

function createEventRepositoryDiagnostic(path: string, message: string): Diagnostic {
  return {
    ruleId: 'ZDP-REF-008',
    severity: 'error',
    file: EVENTS_FILE,
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
