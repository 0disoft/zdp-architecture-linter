import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import {
  validateEventCatalogSchema,
  validateEventSchemaReferences
} from '../src/event-schema-validation.ts';

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

  test('reports omitted event schema error count', async () => {
    await withEventSchemaRoot(async (architectureRoot) => {
      const diagnostics = await validateEventCatalogSchema({
        architectureRoot,
        value: {
          schema_version: '0.1',
          events: [{}]
        }
      });

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.message).toContain(
        'and 3 more schema errors'
      );
    });
  });
});

describe('event schema references', () => {
  test('passes when schema_ref points to an existing JSON file under schemas/events', async () => {
    await withEventSchemaRoot(async (architectureRoot) => {
      const schemaRef = 'schemas/events/deletion-request-created.v1.json';

      await writeArchitectureFile(
        architectureRoot,
        schemaRef,
        JSON.stringify(createEventPayloadSchema(schemaRef))
      );

      const diagnostics = await validateEventSchemaReferences({
        architectureRoot,
        value: {
          events: [
            {
              id: 'deletion.request.created',
              schema_ref: schemaRef
            }
          ]
        }
      });

      expect(diagnostics).toEqual([]);
    });
  });

  test('passes when an event schema uses a local shared schema reference', async () => {
    await withEventSchemaRoot(async (architectureRoot) => {
      const schemaRef = 'schemas/events/web-page-viewed.v2.json';
      const privacySchemaRef = 'schemas/events/analytics-privacy-context.v1.json';

      await writeArchitectureFile(
        architectureRoot,
        privacySchemaRef,
        JSON.stringify({
          ...createEventPayloadSchema(privacySchemaRef),
          required: ['consent_state'],
          properties: {
            consent_state: { const: 'granted' }
          }
        })
      );
      await writeArchitectureFile(
        architectureRoot,
        schemaRef,
        JSON.stringify({
          ...createEventPayloadSchema(schemaRef),
          properties: {
            privacy_context: { $ref: 'analytics-privacy-context.v1.json' }
          }
        })
      );

      const diagnostics = await validateEventSchemaReferences({
        architectureRoot,
        value: {
          events: [{ id: 'web.page-viewed', schema_ref: schemaRef }]
        }
      });

      expect(diagnostics).toEqual([]);
    });
  });

  test('fails when a local shared event schema reference is missing', async () => {
    await withEventSchemaRoot(async (architectureRoot) => {
      const schemaRef = 'schemas/events/web-page-viewed.v2.json';

      await writeArchitectureFile(
        architectureRoot,
        schemaRef,
        JSON.stringify({
          ...createEventPayloadSchema(schemaRef),
          properties: {
            privacy_context: { $ref: 'missing-privacy-context.v1.json' }
          }
        })
      );

      const diagnostics = await validateEventSchemaReferences({
        architectureRoot,
        value: {
          events: [{ id: 'web.page-viewed', schema_ref: schemaRef }]
        }
      });

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]).toMatchObject({
        ruleId: 'ZDP-EVENT-003',
        severity: 'error',
        file: 'catalogs/events.yaml',
        path: 'events[0:web.page-viewed].schema_ref'
      });
      expect(diagnostics[0]?.message).toContain('missing-privacy-context.v1.json');
    });
  });

  test('fails when schema_ref points outside schemas/events', async () => {
    await withEventSchemaRoot(async (architectureRoot) => {
      const diagnostics = await validateEventSchemaReferences({
        architectureRoot,
        value: {
          events: [
            {
              id: 'deletion.request.created',
              schema_ref: '../events/deletion-request-created.v1.json'
            }
          ]
        }
      });

      expect(diagnostics).toEqual([
        {
          ruleId: 'ZDP-EVENT-002',
          severity: 'error',
          file: 'catalogs/events.yaml',
          path: 'events[0:deletion.request.created].schema_ref',
          message:
            'Event schema_ref `../events/deletion-request-created.v1.json` must point to a JSON file under `schemas/events/`.'
        }
      ]);
    });
  });

  test('fails when schema_ref target is missing', async () => {
    await withEventSchemaRoot(async (architectureRoot) => {
      const diagnostics = await validateEventSchemaReferences({
        architectureRoot,
        value: {
          events: [
            {
              id: 'deletion.request.created',
              schema_ref: 'schemas/events/deletion-request-created.v1.json'
            }
          ]
        }
      });

      expect(diagnostics).toEqual([
        {
          ruleId: 'ZDP-EVENT-002',
          severity: 'error',
          file: 'catalogs/events.yaml',
          path: 'events[0:deletion.request.created].schema_ref',
          message:
            'Event schema_ref target `schemas/events/deletion-request-created.v1.json` does not exist.'
        }
      ]);
    });
  });

  test('fails when schema_ref target declares a mismatched schema id', async () => {
    await withEventSchemaRoot(async (architectureRoot) => {
      const schemaRef = 'schemas/events/deletion-request-created.v1.json';

      await writeArchitectureFile(
        architectureRoot,
        schemaRef,
        JSON.stringify({
          ...createEventPayloadSchema(schemaRef),
          $id: 'https://zdp.zerodi.dev/schemas/events/other.v1.json'
        })
      );

      const diagnostics = await validateEventSchemaReferences({
        architectureRoot,
        value: {
          events: [
            {
              id: 'deletion.request.created',
              schema_ref: schemaRef
            }
          ]
        }
      });

      expect(diagnostics).toEqual([
        {
          ruleId: 'ZDP-EVENT-003',
          severity: 'error',
          file: 'catalogs/events.yaml',
          path: 'events[0:deletion.request.created].schema_ref',
          message:
            'Event schema_ref target `schemas/events/deletion-request-created.v1.json` must declare `$id: https://zdp.zerodi.dev/schemas/events/deletion-request-created.v1.json`.'
        }
      ]);
    });
  });

  test('fails when schema_ref target cannot compile as JSON Schema', async () => {
    await withEventSchemaRoot(async (architectureRoot) => {
      const schemaRef = 'schemas/events/deletion-request-created.v1.json';

      await writeArchitectureFile(
        architectureRoot,
        schemaRef,
        JSON.stringify({
          ...createEventPayloadSchema(schemaRef),
          type: 'not-a-json-schema-type'
        })
      );

      const diagnostics = await validateEventSchemaReferences({
        architectureRoot,
        value: {
          events: [
            {
              id: 'deletion.request.created',
              schema_ref: schemaRef
            }
          ]
        }
      });

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]).toMatchObject({
        ruleId: 'ZDP-EVENT-003',
        severity: 'error',
        file: 'catalogs/events.yaml',
        path: 'events[0:deletion.request.created].schema_ref'
      });
      expect(diagnostics[0]?.message).toStartWith(
        'Event schema_ref target `schemas/events/deletion-request-created.v1.json` must compile as JSON Schema:'
      );
    });
  });
});

async function withEventSchemaRoot(
  callback: (architectureRoot: string) => Promise<void>
): Promise<void> {
  const architectureRoot = await mkdtemp(join(tmpdir(), 'zdp-event-schema-'));

  try {
    await writeArchitectureFile(architectureRoot, 'schemas/event.schema.json', schemaSource);
    await callback(architectureRoot);
  } finally {
    await rm(architectureRoot, { recursive: true, force: true });
  }
}

function createEventPayloadSchema(schemaRef: string): Record<string, unknown> {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: `https://zdp.zerodi.dev/${schemaRef}`,
    type: 'object',
    additionalProperties: false,
    properties: {
      event_id: { type: 'string' }
    }
  };
}

async function writeArchitectureFile(
  architectureRoot: string,
  relativePath: string,
  source: string
): Promise<void> {
  const absolutePath = join(architectureRoot, relativePath);

  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, source, 'utf8');
}
