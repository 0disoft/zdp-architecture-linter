import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { validateEventCatalogSchema } from '../src/event-schema-validation.ts';

const schemaSource = JSON.stringify({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: false,
  required: ['schema_version', 'events'],
  properties: {
    schema_version: { type: 'string' },
    events: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'id',
          'description',
          'owner_repo',
          'schema_ref',
          'data_classes',
          'retention_days',
          'replay_supported',
          'dead_letter_required'
        ],
        properties: {
          id: {
            type: 'string',
            pattern: '^[a-z][a-z0-9-]*(\\.[a-z][a-z0-9-]*)+$'
          },
          description: { type: 'string' },
          owner_repo: { type: 'string' },
          schema_ref: { type: 'string' },
          data_classes: {
            type: 'array',
            items: { type: 'string' }
          },
          retention_days: { type: 'integer' },
          replay_supported: { type: 'boolean' },
          dead_letter_required: { type: 'boolean' }
        }
      }
    }
  }
});

describe('event catalog schema validation', () => {
  test('passes when events.yaml satisfies the event catalog schema', async () => {
    await withEventSchemaRoot(async (architectureRoot) => {
      const diagnostics = await validateEventCatalogSchema({
        architectureRoot,
        value: {
          schema_version: '0.1',
          events: [
            {
              id: 'deletion.request.created',
              description: 'Deletion request created.',
              owner_repo: 'zdp-core-platform',
              schema_ref: 'schemas/events/deletion-request-created.v1.json',
              data_classes: ['identity'],
              retention_days: 2555,
              replay_supported: true,
              dead_letter_required: true
            }
          ]
        }
      });

      expect(diagnostics).toEqual([]);
    });
  });

  test('fails when an event omits required delivery contract fields', async () => {
    await withEventSchemaRoot(async (architectureRoot) => {
      const diagnostics = await validateEventCatalogSchema({
        architectureRoot,
        value: {
          schema_version: '0.1',
          events: [
            {
              id: 'deletion.request.created',
              description: 'Deletion request created.',
              owner_repo: 'zdp-core-platform',
              data_classes: ['identity'],
              retention_days: 2555,
              replay_supported: true,
              dead_letter_required: true
            }
          ]
        }
      });

      expect(diagnostics).toEqual([
        {
          ruleId: 'ZDP-EVENT-001',
          severity: 'error',
          file: 'catalogs/events.yaml',
          path: 'events[0].schema_ref',
          message:
            "Event catalog violates `schemas/event.schema.json`: events[0].schema_ref must have required property 'schema_ref'"
        }
      ]);
    });
  });
});

async function withEventSchemaRoot(
  callback: (architectureRoot: string) => Promise<void>
): Promise<void> {
  const architectureRoot = await mkdtemp(join(tmpdir(), 'zdp-event-schema-'));

  try {
    const schemaPath = join(architectureRoot, 'schemas/event.schema.json');

    await mkdir(dirname(schemaPath), { recursive: true });
    await writeFile(schemaPath, schemaSource, 'utf8');
    await callback(architectureRoot);
  } finally {
    await rm(architectureRoot, { recursive: true, force: true });
  }
}
