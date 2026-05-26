import type { DataClassIndex } from './data-class-rules.ts';
import type { DatastoreIndex } from './datastore-rules.ts';
import type { Diagnostic } from './diagnostics.ts';
import type { EventIndex } from './event-rules.ts';
import type { ExternalProviderIndex } from './provider-rules.ts';

const SERVICE_CONTRACT_FILE = 'service.yaml';
const PRODUCED_EVENT_SCHEMA_RULE_ID = 'ZDP-SERVICE-EVENT-001';

export function validateRepositoryServiceContractDataReferences(
  value: unknown,
  dataClassIndex: DataClassIndex,
  datastoreIndex: DatastoreIndex
): readonly Diagnostic[] {
  if (!isRecord(value)) {
    return [];
  }

  return [
    ...validateStringReferenceArray({
      value,
      path: 'data.classes',
      label: 'data class',
      indexById: dataClassIndex.byId,
      ruleId: 'ZDP-DATA-003'
    }),
    ...validateStringReferenceArray({
      value,
      path: 'data.datastores',
      label: 'datastore',
      indexById: datastoreIndex.byId,
      ruleId: 'ZDP-DATA-003'
    }),
    ...validateStringReferenceArray({
      value,
      path: 'dependencies.datastores',
      label: 'datastore',
      indexById: datastoreIndex.byId,
      ruleId: 'ZDP-REF-002'
    })
  ];
}

export function validateRepositoryServiceContractProviderReferences(
  value: unknown,
  providerIndex: ExternalProviderIndex
): readonly Diagnostic[] {
  if (!isRecord(value)) {
    return [];
  }

  const providers = value.providers;

  if (!Array.isArray(providers)) {
    return [];
  }

  return providers.flatMap((provider, index) => {
    const path = `providers[${index}].id`;

    if (!isRecord(provider)) {
      return [
        createServiceContractDiagnostic(
          'ZDP-REF-005',
          `providers[${index}]`,
          'Provider entry must be a YAML object.'
        )
      ];
    }

    const providerId = readStringField(provider, 'id');

    if (providerId === null) {
      return [
        createServiceContractDiagnostic(
          'ZDP-REF-005',
          path,
          'Provider entry is missing required field `id`.'
        )
      ];
    }

    if (!providerIndex.byId.has(providerId)) {
      return [
        createServiceContractDiagnostic(
          'ZDP-REF-005',
          path,
          `Service contract references unknown external provider \`${providerId}\`.`
        )
      ];
    }

    return [];
  });
}

export function validateRepositoryServiceContractEventReferences(
  value: unknown,
  eventIndex: EventIndex
): readonly Diagnostic[] {
  if (!isRecord(value)) {
    return [];
  }

  return [
    ...validateProducedEventReferences(value, 'events.produced'),
    ...validateEventReferenceArray(value, 'events.consumed')
  ];

  function validateProducedEventReferences(
    root: Record<string, unknown>,
    path: string
  ): readonly Diagnostic[] {
    const candidate = readValueAtPath(root, path);

    if (candidate === undefined) {
      return [];
    }

    if (!Array.isArray(candidate)) {
      return [
        createServiceContractDiagnostic(
          'ZDP-REF-007',
          path,
          `\`${path}\` must be a YAML array when present.`
        )
      ];
    }

    return candidate.flatMap((entry, index) =>
      validateProducedEventReference(entry, `${path}[${index}]`)
    );
  }

  function validateEventReferenceArray(
    root: Record<string, unknown>,
    path: string
  ): readonly Diagnostic[] {
    const candidate = readValueAtPath(root, path);

    if (candidate === undefined) {
      return [];
    }

    if (!Array.isArray(candidate)) {
      return [
        createServiceContractDiagnostic(
          'ZDP-REF-007',
          path,
          `\`${path}\` must be a YAML array when present.`
        )
      ];
    }

    return candidate.flatMap((entry, index) => {
      const entryPath = `${path}[${index}]`;
      const eventId = readEventReferenceId(entry);

      if (eventId === null) {
        return [
          createServiceContractDiagnostic(
            'ZDP-REF-007',
            entryPath,
            'Event reference must be a non-empty event id or an object with `id`.'
          )
        ];
      }

      if (!eventIndex.byId.has(eventId)) {
        return [
          createServiceContractDiagnostic(
            'ZDP-REF-007',
            entryPath,
            `Service contract references unknown event \`${eventId}\`.`
          )
        ];
      }

      return [];
    });
  }

  function validateProducedEventReference(
    entry: unknown,
    entryPath: string
  ): readonly Diagnostic[] {
    if (!isRecord(entry)) {
      return [
        createServiceContractDiagnostic(
          PRODUCED_EVENT_SCHEMA_RULE_ID,
          entryPath,
          'Produced event reference must be an object with `id` and `schema_ref`.'
        )
      ];
    }

    const eventId = readStringField(entry, 'id');

    if (eventId === null) {
      return [
        createServiceContractDiagnostic(
          'ZDP-REF-007',
          `${entryPath}.id`,
          'Produced event reference is missing required field `id`.'
        )
      ];
    }

    const eventRecord = eventIndex.byId.get(eventId);

    if (eventRecord === undefined) {
      return [
        createServiceContractDiagnostic(
          'ZDP-REF-007',
          entryPath,
          `Service contract references unknown event \`${eventId}\`.`
        )
      ];
    }

    const schemaRef = readStringField(entry, 'schema_ref');

    if (schemaRef === null) {
      return [
        createServiceContractDiagnostic(
          PRODUCED_EVENT_SCHEMA_RULE_ID,
          `${entryPath}.schema_ref`,
          `Produced event \`${eventId}\` must declare \`schema_ref\`.`
        )
      ];
    }

    if (eventRecord.schemaRef !== schemaRef) {
      return [
        createServiceContractDiagnostic(
          PRODUCED_EVENT_SCHEMA_RULE_ID,
          `${entryPath}.schema_ref`,
          `Produced event \`${eventId}\` schema_ref must match catalogs/events.yaml value \`${eventRecord.schemaRef ?? '<missing>'}\`.`
        )
      ];
    }

    return [];
  }
}

function validateStringReferenceArray(input: {
  readonly value: Record<string, unknown>;
  readonly path: string;
  readonly label: string;
  readonly indexById: ReadonlyMap<string, unknown>;
  readonly ruleId: 'ZDP-DATA-003' | 'ZDP-REF-002';
}): readonly Diagnostic[] {
  const candidate = readValueAtPath(input.value, input.path);

  if (candidate === undefined) {
    return [];
  }

  if (!Array.isArray(candidate)) {
    return [
      createServiceContractDiagnostic(
        input.ruleId,
        input.path,
        `\`${input.path}\` must be a YAML array when present.`
      )
    ];
  }

  return candidate.flatMap((entry, index) => {
    const path = `${input.path}[${index}]`;

    if (typeof entry !== 'string' || entry.trim().length === 0) {
      return [
        createServiceContractDiagnostic(
          input.ruleId,
          path,
          `Service contract ${input.label} entry must be a non-empty ${input.label} id.`
        )
      ];
    }

    const normalizedId = entry.trim();

    if (!input.indexById.has(normalizedId)) {
      return [
        createServiceContractDiagnostic(
          input.ruleId,
          path,
          `Service contract references unknown ${input.label} \`${normalizedId}\`.`
        )
      ];
    }

    return [];
  });
}

function readEventReferenceId(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  if (!isRecord(value)) {
    return null;
  }

  return readStringField(value, 'id');
}

function readValueAtPath(value: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (!isRecord(current)) {
      return undefined;
    }

    return current[segment];
  }, value);
}

function readStringField(value: Record<string, unknown>, field: string): string | null {
  const candidate = value[field];

  return typeof candidate === 'string' && candidate.trim().length > 0
    ? candidate.trim()
    : null;
}

function createServiceContractDiagnostic(
  ruleId:
    | 'ZDP-DATA-003'
    | 'ZDP-REF-002'
    | 'ZDP-REF-005'
    | 'ZDP-REF-007'
    | typeof PRODUCED_EVENT_SCHEMA_RULE_ID,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
