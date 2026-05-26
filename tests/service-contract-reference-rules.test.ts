import { describe, expect, test } from 'bun:test';
import { buildDataClassIndex } from '../src/data-class-rules.ts';
import { buildDatastoreIndex } from '../src/datastore-rules.ts';
import { buildEventIndex } from '../src/event-rules.ts';
import { buildExternalProviderIndex } from '../src/provider-rules.ts';
import {
  validateRepositoryServiceContractDataReferences,
  validateRepositoryServiceContractEventReferences,
  validateRepositoryServiceContractProviderReferences
} from '../src/service-contract-reference-rules.ts';

describe('repository service contract data references', () => {
  test('passes when data classes and datastores exist in catalogs', () => {
    const diagnostics = validateRepositoryServiceContractDataReferences(
      {
        data: {
          classes: ['identity'],
          datastores: ['core_postgres']
        },
        dependencies: {
          datastores: ['core_postgres']
        }
      },
      buildDataClassIndex({
        data_classes: [{ id: 'identity' }]
      }),
      buildDatastoreIndex({
        datastores: [{ id: 'core_postgres' }]
      })
    );

    expect(diagnostics).toEqual([]);
  });

  test('fails when service.yaml references unknown data classes and datastores', () => {
    const diagnostics = validateRepositoryServiceContractDataReferences(
      {
        data: {
          classes: ['ghost-data'],
          datastores: ['ghost_postgres']
        },
        dependencies: {
          datastores: ['missing_postgres']
        }
      },
      buildDataClassIndex({ data_classes: [] }),
      buildDatastoreIndex({ datastores: [] })
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-DATA-003',
        severity: 'error',
        file: 'service.yaml',
        path: 'data.classes[0]',
        message: 'Service contract references unknown data class `ghost-data`.'
      },
      {
        ruleId: 'ZDP-DATA-003',
        severity: 'error',
        file: 'service.yaml',
        path: 'data.datastores[0]',
        message: 'Service contract references unknown datastore `ghost_postgres`.'
      },
      {
        ruleId: 'ZDP-REF-002',
        severity: 'error',
        file: 'service.yaml',
        path: 'dependencies.datastores[0]',
        message:
          'Service contract references unknown datastore `missing_postgres`.'
      }
    ]);
  });
});

describe('repository service contract provider references', () => {
  test('passes when providers exist in the external provider catalog', () => {
    const diagnostics = validateRepositoryServiceContractProviderReferences(
      {
        providers: [
          {
            id: 'openai'
          }
        ]
      },
      buildExternalProviderIndex({
        providers: [{ id: 'openai' }]
      })
    );

    expect(diagnostics).toEqual([]);
  });

  test('fails when service.yaml references an unknown external provider', () => {
    const diagnostics = validateRepositoryServiceContractProviderReferences(
      {
        providers: [
          {
            id: 'ghost-provider'
          }
        ]
      },
      buildExternalProviderIndex({ providers: [] })
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-REF-005',
        severity: 'error',
        file: 'service.yaml',
        path: 'providers[0].id',
        message:
          'Service contract references unknown external provider `ghost-provider`.'
      }
    ]);
  });
});

describe('repository service contract event references', () => {
  test('passes when produced and consumed events exist in the event catalog', () => {
    const diagnostics = validateRepositoryServiceContractEventReferences(
      {
        events: {
          produced: [
            {
              id: 'service.created',
              schema_ref: 'schemas/events/service.created.schema.json'
            }
          ],
          consumed: [
            {
              id: 'service.deleted',
              schema_ref: 'schemas/events/service.deleted.schema.json'
            }
          ],
          replay_supported: true,
          dead_letter_policy: 'retry then dlq'
        }
      },
      buildEventIndex({
        events: [
          {
            id: 'service.created',
            schema_ref: 'schemas/events/service.created.schema.json',
            replay_supported: true,
            dead_letter_required: true
          },
          {
            id: 'service.deleted',
            schema_ref: 'schemas/events/service.deleted.schema.json',
            replay_supported: true,
            dead_letter_required: true
          }
        ]
      })
    );

    expect(diagnostics).toEqual([]);
  });

  test('fails when service.yaml references unknown events', () => {
    const diagnostics = validateRepositoryServiceContractEventReferences(
      {
        events: {
          produced: [
            {
              id: 'ghost.produced',
              schema_ref: 'schemas/events/ghost.produced.schema.json'
            }
          ],
          consumed: [
            {
              id: 'ghost.consumed',
              schema_ref: 'schemas/events/ghost.consumed.schema.json'
            }
          ]
        }
      },
      buildEventIndex({ events: [] })
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-REF-007',
        severity: 'error',
        file: 'service.yaml',
        path: 'events.produced[0]',
        message: 'Service contract references unknown event `ghost.produced`.'
      },
      {
        ruleId: 'ZDP-REF-007',
        severity: 'error',
        file: 'service.yaml',
        path: 'events.consumed[0]',
        message: 'Service contract references unknown event `ghost.consumed`.'
      }
    ]);
  });

  test('fails when produced events use the string shortcut without schema_ref', () => {
    const diagnostics = validateRepositoryServiceContractEventReferences(
      {
        events: {
          produced: ['service.created']
        }
      },
      buildEventIndex({
        events: [
          {
            id: 'service.created',
            schema_ref: 'schemas/events/service.created.schema.json'
          }
        ]
      })
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-SERVICE-EVENT-001',
        severity: 'error',
        file: 'service.yaml',
        path: 'events.produced[0]',
        message:
          'Produced event reference must be an object with `id` and `schema_ref`.'
      }
    ]);
  });

  test('fails when produced event schema_ref is missing or differs from the catalog', () => {
    const eventIndex = buildEventIndex({
      events: [
        {
          id: 'service.created',
          schema_ref: 'schemas/events/service.created.schema.json'
        },
        {
          id: 'service.deleted',
          schema_ref: 'schemas/events/service.deleted.schema.json'
        }
      ]
    });
    const diagnostics = validateRepositoryServiceContractEventReferences(
      {
        events: {
          produced: [
            {
              id: 'service.created'
            },
            {
              id: 'service.deleted',
              schema_ref: 'schemas/events/wrong.schema.json'
            }
          ]
        }
      },
      eventIndex
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-SERVICE-EVENT-001',
        severity: 'error',
        file: 'service.yaml',
        path: 'events.produced[0].schema_ref',
        message: 'Produced event `service.created` must declare `schema_ref`.'
      },
      {
        ruleId: 'ZDP-SERVICE-EVENT-001',
        severity: 'error',
        file: 'service.yaml',
        path: 'events.produced[1].schema_ref',
        message:
          'Produced event `service.deleted` schema_ref must match catalogs/events.yaml value `schemas/events/service.deleted.schema.json`.'
      }
    ]);
  });

  test('fails when referenced events require replay and dead-letter policy controls', () => {
    const diagnostics = validateRepositoryServiceContractEventReferences(
      {
        events: {
          produced: [
            {
              id: 'service.created',
              schema_ref: 'schemas/events/service.created.schema.json'
            }
          ],
          consumed: ['service.deleted'],
          replay_supported: false,
          dead_letter_policy: null
        }
      },
      buildEventIndex({
        events: [
          {
            id: 'service.created',
            schema_ref: 'schemas/events/service.created.schema.json',
            replay_supported: true,
            dead_letter_required: true
          },
          {
            id: 'service.deleted',
            schema_ref: 'schemas/events/service.deleted.schema.json',
            replay_supported: true,
            dead_letter_required: true
          }
        ]
      })
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-SERVICE-EVENT-002',
        severity: 'error',
        file: 'service.yaml',
        path: 'events.replay_supported',
        message:
          'Service contract references replayable events but `events.replay_supported` is not true.'
      },
      {
        ruleId: 'ZDP-SERVICE-EVENT-002',
        severity: 'error',
        file: 'service.yaml',
        path: 'events.dead_letter_policy',
        message:
          'Service contract references events that require a dead-letter policy but `events.dead_letter_policy` is empty.'
      }
    ]);
  });

  test('passes when referenced events do not require replay or dead-letter controls', () => {
    const diagnostics = validateRepositoryServiceContractEventReferences(
      {
        events: {
          consumed: ['service.deleted'],
          replay_supported: false,
          dead_letter_policy: null
        }
      },
      buildEventIndex({
        events: [
          {
            id: 'service.deleted',
            schema_ref: 'schemas/events/service.deleted.schema.json',
            replay_supported: false,
            dead_letter_required: false
          }
        ]
      })
    );

    expect(diagnostics).toEqual([]);
  });
});
