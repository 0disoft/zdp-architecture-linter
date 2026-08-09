import { describe, expect, test } from 'bun:test';
import { buildDataClassIndex } from '../src/data-class-rules.ts';
import {
  buildEventIndex,
  validateDataClassDeletionEventReferences,
  validateEventCatalog,
  validateEventDataClassReferences,
  validateEventPiiFloor,
  validateEventRepositoryReferences
} from '../src/event-rules.ts';
import { buildRepositoryIndex } from '../src/repository-rules.ts';

describe('event catalog', () => {
  test('passes when events have ids', () => {
    const diagnostics = validateEventCatalog({
      events: [
        {
          id: 'deletion.request.created',
          owner_repo: 'zdp-core-platform'
        }
      ]
    });

    expect(diagnostics).toEqual([]);
  });

  test('fails when an event id is missing', () => {
    const diagnostics = validateEventCatalog({
      events: [
        {
          owner_repo: 'zdp-core-platform'
        }
      ]
    });

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-REF-007',
        severity: 'error',
        file: 'catalogs/events.yaml',
        path: 'events[0].id',
        message: 'Event entry is missing required field `id`.'
      }
    ]);
  });
});

describe('event repository references', () => {
  test('passes when event repository references exist in the repository catalog', () => {
    const diagnostics = validateEventRepositoryReferences(
      {
        events: [
          {
            id: 'deletion.request.created',
            owner_repo: 'zdp-core-platform',
            emitted_by: ['zdp-core-accounts'],
            consumed_by: ['zdp-core-audit']
          }
        ]
      },
      buildRepositoryIndex({
        repositories: [
          createRepository({ name: 'zdp-core-platform' }),
          createRepository({ name: 'zdp-core-accounts', repo_stage: 'logical_only' }),
          createRepository({ name: 'zdp-core-audit', repo_stage: 'logical_only' })
        ]
      })
    );

    expect(diagnostics).toEqual([]);
  });

  test('fails when owner repo is missing', () => {
    const diagnostics = validateEventRepositoryReferences(
      {
        events: [
          {
            id: 'deletion.request.created',
            emitted_by: ['zdp-core-accounts']
          }
        ]
      },
      buildRepositoryIndex({
        repositories: [createRepository({ name: 'zdp-core-accounts' })]
      })
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-REF-008',
        severity: 'error',
        file: 'catalogs/events.yaml',
        path: 'events[0:deletion.request.created].owner_repo',
        message: 'Event entry is missing required field `owner_repo`.'
      }
    ]);
  });

  test('fails when owner repo references an unknown repository', () => {
    const diagnostics = validateEventRepositoryReferences(
      {
        events: [
          {
            id: 'deletion.request.created',
            owner_repo: 'zdp-ghost-platform'
          }
        ]
      },
      buildRepositoryIndex({
        repositories: [createRepository({ name: 'zdp-core-platform' })]
      })
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-REF-008',
        severity: 'error',
        file: 'catalogs/events.yaml',
        path: 'events[0:deletion.request.created].owner_repo',
        message: 'Event references unknown owner repository `zdp-ghost-platform`.'
      }
    ]);
  });

  test('fails when emitted_by references an unknown repository', () => {
    const diagnostics = validateEventRepositoryReferences(
      {
        events: [
          {
            id: 'deletion.request.created',
            owner_repo: 'zdp-core-platform',
            emitted_by: ['zdp-ghost-producer']
          }
        ]
      },
      buildRepositoryIndex({
        repositories: [createRepository({ name: 'zdp-core-platform' })]
      })
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-REF-008',
        severity: 'error',
        file: 'catalogs/events.yaml',
        path: 'events[0:deletion.request.created].emitted_by[0]',
        message:
          'Event references unknown emitted_by repository or logical boundary `zdp-ghost-producer`.'
      }
    ]);
  });

  test('fails when consumed_by is not an array', () => {
    const diagnostics = validateEventRepositoryReferences(
      {
        events: [
          {
            id: 'deletion.request.created',
            owner_repo: 'zdp-core-platform',
            consumed_by: 'zdp-core-audit'
          }
        ]
      },
      buildRepositoryIndex({
        repositories: [createRepository({ name: 'zdp-core-platform' })]
      })
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-REF-008',
        severity: 'error',
        file: 'catalogs/events.yaml',
        path: 'events[0:deletion.request.created].consumed_by',
        message: '`consumed_by` must be a YAML array when present.'
      }
    ]);
  });
});

describe('event data class references', () => {
  test('passes when event data classes reference known data classes', () => {
    const diagnostics = validateEventDataClassReferences(
      {
        events: [
          {
            id: 'deletion.request.created',
            data_classes: ['identity']
          }
        ]
      },
      buildDataClassIndex({
        data_classes: [{ id: 'identity' }]
      })
    );

    expect(diagnostics).toEqual([]);
  });

  test('fails when event data classes reference unknown data classes', () => {
    const diagnostics = validateEventDataClassReferences(
      {
        events: [
          {
            id: 'deletion.request.created',
            data_classes: ['ghost-data']
          }
        ]
      },
      buildDataClassIndex({
        data_classes: [{ id: 'identity' }]
      })
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-REF-007',
        severity: 'error',
        file: 'catalogs/events.yaml',
        path: 'events[0:deletion.request.created].data_classes[0]',
        message: 'Event references unknown data class `ghost-data`.'
      }
    ]);
  });
});

describe('event PII floor', () => {
  test('passes non-PII events and events that preserve the PII classification', () => {
    const index = buildDataClassIndex({
      data_classes: [
        { id: 'events', contains_pii: false },
        { id: 'support-case-metadata', contains_pii: true }
      ]
    });

    expect(
      validateEventPiiFloor(
        {
          events: [
            { id: 'analytics.event-recorded', data_classes: ['events'], contains_pii: false },
            { id: 'support.case-upserted', data_classes: ['support-case-metadata'], contains_pii: true }
          ]
        },
        index
      )
    ).toEqual([]);
  });

  test.each([false, undefined])(
    'rejects a PII event with contains_pii=%s',
    (containsPii) => {
      const event: Record<string, unknown> = {
        id: 'support.case-upserted',
        data_classes: ['events', 'support-case-metadata']
      };
      if (containsPii !== undefined) {
        event.contains_pii = containsPii;
      }

      expect(
        validateEventPiiFloor(
          { events: [event] },
          buildDataClassIndex({
            data_classes: [
              { id: 'events', contains_pii: false },
              { id: 'support-case-metadata', contains_pii: true }
            ]
          })
        )
      ).toEqual([
        {
          ruleId: 'ZDP-DATA-009',
          severity: 'error',
          file: 'catalogs/events.yaml',
          path: 'events[0:support.case-upserted].contains_pii',
          message:
            'Event references PII data class `support-case-metadata` and must declare `contains_pii: true`.'
        }
      ]);
    }
  );
});

function createRepository(
  overrides: Partial<Record<string, unknown>>
): Record<string, unknown> {
  return {
    name: 'zdp-example',
    status: 'reserved',
    repo_stage: 'deploy_unit',
    kind: 'deploy_unit',
    area: 'core',
    purpose: 'Example repository.',
    owner: '0disoft',
    risk_level: 'medium',
    ...overrides
  };
}

describe('data class deletion event references', () => {
  test('passes when deletion events reference known events', () => {
    const diagnostics = validateDataClassDeletionEventReferences(
      {
        data_classes: [
          {
            id: 'identity',
            deletion_events: ['deletion.request.created']
          }
        ]
      },
      buildEventIndex({
        events: [{ id: 'deletion.request.created' }]
      })
    );

    expect(diagnostics).toEqual([]);
  });

  test('fails when deletion events reference unknown events', () => {
    const diagnostics = validateDataClassDeletionEventReferences(
      {
        data_classes: [
          {
            id: 'identity',
            deletion_events: ['ghost.event']
          }
        ]
      },
      buildEventIndex({
        events: [{ id: 'deletion.request.created' }]
      })
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-REF-007',
        severity: 'error',
        file: 'catalogs/data-classes.yaml',
        path: 'data_classes[0:identity].deletion_events[0]',
        message: 'Data class references unknown deletion event `ghost.event`.'
      }
    ]);
  });

  test('fails when deletion events is not an array', () => {
    const diagnostics = validateDataClassDeletionEventReferences(
      {
        data_classes: [
          {
            id: 'identity',
            deletion_events: 'deletion.request.created'
          }
        ]
      },
      buildEventIndex({
        events: [{ id: 'deletion.request.created' }]
      })
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-REF-007',
        severity: 'error',
        file: 'catalogs/data-classes.yaml',
        path: 'data_classes[0:identity].deletion_events',
        message: '`deletion_events` must be a YAML array when present.'
      }
    ]);
  });
});
