import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { validateEventSchemaCompatibility } from '../src/event-schema-compatibility.ts';

describe('event schema compatibility', () => {
  test('allows optional properties and enum expansion in the same version', async () => {
    await withSchemaRoots(async ({ baseRoot, headRoot }) => {
      const schemaRef = 'schemas/events/job-state.v1.json';
      const baseSchema = createEventSchema(schemaRef, 1);
      const headSchema = createEventSchema(schemaRef, 1);

      headSchema.properties.state.enum.push('failed');
      headSchema.properties.note = { type: 'string' };

      await writeJson(baseRoot, schemaRef, baseSchema);
      await writeJson(headRoot, schemaRef, headSchema);

      expect(validateEventSchemaCompatibility({
        baseArchitectureRoot: baseRoot,
        headArchitectureRoot: headRoot
      })).toEqual([]);
    });
  });

  test('blocks in-place required, type, enum, and removal changes', async () => {
    await withSchemaRoots(async ({ baseRoot, headRoot }) => {
      const schemaRef = 'schemas/events/job-state.v1.json';
      const baseSchema = createEventSchema(schemaRef, 1);
      const headSchema = createEventSchema(schemaRef, 1);

      headSchema.required.push('note');
      headSchema.properties.note = { type: 'string' };
      headSchema.properties.event_id = { type: 'integer' };
      headSchema.properties.state = { type: 'string', enum: ['ready'] };

      await writeJson(baseRoot, schemaRef, baseSchema);
      await writeJson(headRoot, schemaRef, headSchema);

      const diagnostics = validateEventSchemaCompatibility({
        baseArchitectureRoot: baseRoot,
        headArchitectureRoot: headRoot
      });

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]).toMatchObject({
        ruleId: 'ZDP-EVENT-004',
        severity: 'error',
        file: schemaRef,
        path: 'schema'
      });
      expect(diagnostics[0]?.message).toContain('required added `note`');
      expect(diagnostics[0]?.message).toContain('enum removed "done"');
      expect(diagnostics[0]?.message).toContain(
        'type changed from "string" to "integer"'
      );
    });
  });

  test('keeps published schema versions available', async () => {
    await withSchemaRoots(async ({ baseRoot, headRoot }) => {
      const schemaRef = 'schemas/events/job-state.v1.json';

      await writeJson(baseRoot, schemaRef, createEventSchema(schemaRef, 1));

      expect(validateEventSchemaCompatibility({
        baseArchitectureRoot: baseRoot,
        headArchitectureRoot: headRoot
      })).toEqual([
        {
          ruleId: 'ZDP-EVENT-004',
          severity: 'error',
          file: schemaRef,
          path: 'schema',
          message:
            'Published event schema `schemas/events/job-state.v1.json` was removed. Keep released schema versions available and add a new version instead.'
        }
      ]);
    });
  });

  test('requires migration evidence only for a new breaking version', async () => {
    await withSchemaRoots(async ({ baseRoot, headRoot }) => {
      const v1Ref = 'schemas/events/job-state.v1.json';
      const v2Ref = 'schemas/events/job-state.v2.json';
      const v1Schema = createEventSchema(v1Ref, 1);
      const v2Schema = createEventSchema(v2Ref, 2);

      v2Schema.required.push('note');
      v2Schema.properties.note = { type: 'string' };

      await writeJson(baseRoot, v1Ref, v1Schema);
      await writeJson(headRoot, v1Ref, v1Schema);
      await writeJson(headRoot, v2Ref, v2Schema);

      const missingEvidence = validateEventSchemaCompatibility({
        baseArchitectureRoot: baseRoot,
        headArchitectureRoot: headRoot
      });

      expect(missingEvidence).toHaveLength(1);
      expect(missingEvidence[0]).toMatchObject({
        ruleId: 'ZDP-EVENT-005',
        file: v2Ref,
        path: 'schema.x-zdp-compatibility'
      });

      v2Schema['x-zdp-compatibility'] = {
        classification: 'breaking',
        previous_schema_ref: v1Ref,
        consumer_migration_refs: ['docs/migrations/job-state-v2.md']
      };
      await writeJson(headRoot, v2Ref, v2Schema);
      await writeText(
        headRoot,
        'docs/migrations/job-state-v2.md',
        '# job-state v2 migration\n'
      );

      expect(validateEventSchemaCompatibility({
        baseArchitectureRoot: baseRoot,
        headArchitectureRoot: headRoot
      })).toEqual([]);
    });
  });
});

interface MutableEventSchema {
  readonly $schema: string;
  readonly $id: string;
  readonly type: 'object';
  readonly additionalProperties: false;
  readonly required: string[];
  readonly properties: {
    event_id: Record<string, unknown>;
    schema_version: Record<string, unknown>;
    state: { type: string; enum: string[] };
    [key: string]: Record<string, unknown>;
  };
  ['x-zdp-compatibility']?: Record<string, unknown>;
}

function createEventSchema(
  schemaRef: string,
  version: number
): MutableEventSchema {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: `https://zdp.zerodi.dev/${schemaRef}`,
    type: 'object',
    additionalProperties: false,
    required: ['event_id', 'schema_version', 'state'],
    properties: {
      event_id: { type: 'string' },
      schema_version: { type: 'integer', const: version },
      state: { type: 'string', enum: ['ready', 'done'] }
    }
  };
}

async function withSchemaRoots(
  callback: (roots: {
    readonly baseRoot: string;
    readonly headRoot: string;
  }) => Promise<void>
): Promise<void> {
  const baseRoot = await mkdtemp(join(tmpdir(), 'zdp-event-schema-base-'));
  const headRoot = await mkdtemp(join(tmpdir(), 'zdp-event-schema-head-'));

  try {
    await callback({ baseRoot, headRoot });
  } finally {
    await Promise.all([
      rm(baseRoot, { recursive: true, force: true }),
      rm(headRoot, { recursive: true, force: true })
    ]);
  }
}

async function writeJson(
  root: string,
  relativePath: string,
  value: unknown
): Promise<void> {
  await writeText(root, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeText(
  root: string,
  relativePath: string,
  source: string
): Promise<void> {
  const absolutePath = join(root, relativePath);

  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, source, 'utf8');
}
