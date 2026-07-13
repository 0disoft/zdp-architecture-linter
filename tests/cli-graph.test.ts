import { describe, expect, test } from 'bun:test';
import {
  createMinimalArchitectureFiles,
  runCli,
  withArchitectureFiles
} from './cli-test-helpers.ts';

const MULTI_COMMAND_CLI_TEST_TIMEOUT_MS = 30_000;

describe('graph CLI', () => {
  test('blocks graph-based commands before output construction when a catalog violates its schema', async () => {
    await withArchitectureFiles(
      createMinimalArchitectureFiles({
        'schemas/data-class.schema.json': JSON.stringify({
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'object',
          required: ['data_classes'],
          properties: {
            data_classes: {
              type: 'array',
              items: {
                type: 'object',
                required: ['id', 'allowed_datastores']
              }
            }
          }
        }),
        'catalogs/data-classes.yaml': `
data_classes:
  - id: realtime-state
`
      }),
      async ({ architectureRoot }) => {
        const commands = [
          ['graph'],
          ['pack', '--repo', 'zdp-products-lab', '--task', 'Review'],
          ['list', 'repos'],
          ['normalize']
        ] as const;

        for (const command of commands) {
          const result = await runCli([
            ...command,
            '--architecture',
            architectureRoot,
            '--json'
          ]);

          expect(result.exitCode).toBe(1);
          expect(result.stderr).toBe('');
          expect(JSON.parse(result.stdout)).toEqual({
            diagnostics: [
              {
                ruleId: 'ZDP-DATA-007',
                severity: 'error',
                file: 'catalogs/data-classes.yaml',
                path: 'data_classes.0',
                message:
                  "Data class catalog violates `schemas/data-class.schema.json`: data_classes.0 must have required property 'allowed_datastores'"
              }
            ]
          });
        }
      }
    );
  }, MULTI_COMMAND_CLI_TEST_TIMEOUT_MS);
});
