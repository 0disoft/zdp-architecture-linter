import { describe, expect, test } from 'bun:test';
import { buildDataClassIndex } from '../src/data-class-rules.ts';
import {
  buildEventIndex,
  validateDataClassDeletionEventReferences,
  validateEventCatalog,
  validateEventDataClassReferences
} from '../src/event-rules.ts';

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
