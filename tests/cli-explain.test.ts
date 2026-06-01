import { describe, expect, test } from 'bun:test';
import {
  createMinimalArchitectureFiles,
  runCli,
  withArchitectureFiles
} from './cli-test-helpers.ts';

describe('explain CLI', () => {
  test('returns diagnostics with related graph context for a failing repository service contract', async () => {
    await withArchitectureFiles(
      createMinimalArchitectureFiles({
        'schemas/service.schema.json': JSON.stringify({
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'object',
          required: ['service'],
          properties: {
            service: {
              type: 'object',
              required: ['id', 'repo'],
              properties: {
                id: { type: 'string' },
                repo: { type: 'string' }
              },
              additionalProperties: true
            }
          },
          additionalProperties: true
        }),
        'catalogs/repositories.yaml': `
repositories:
  - name: zdp-test-edge
    status: active
    repo_stage: deploy_unit
    kind: deploy_unit
    area: platform
    purpose: Test edge worker.
    owner: 0disoft
    risk_level: medium
  - name: zdp-privacy-access-broker
    status: active
    repo_stage: deploy_unit
    kind: deploy_unit
    area: privacy
    purpose: Privacy access broker.
    owner: 0disoft
    risk_level: high
`,
        'catalogs/services.yaml': `
services:
  - id: test-edge-worker
    repo: zdp-test-edge
`,
        'catalogs/datastores.yaml': `
datastores:
  - id: privacy_credential_vault
    kind: secure-storage
    owner_repo: zdp-privacy-access-broker
`,
        'catalogs/data-classes.yaml': 'data_classes: []\n',
        'catalogs/events.yaml': 'events: []\n',
        'catalogs/external-providers.yaml': 'providers: []\n',
        'rules/repository.rules.yaml': 'repository_area_rules: {}\n',
        'rules/money.rules.yaml': 'rules: []\n',
        'rules/provider.rules.yaml': 'rules: []\n',
        'rules/ai-data-access.rules.yaml': 'rules: []\n',
        'rules/data-access.rules.yaml': 'rules: []\n',
        'rules/tier.rules.yaml': 'rules: []\n',
        'repo/.editorconfig': [
          'root = true',
          '',
          '[*]',
          'charset = utf-8',
          'end_of_line = lf',
          'insert_final_newline = true',
          'indent_style = space',
          'indent_size = 2',
          'trim_trailing_whitespace = true',
          ''
        ].join('\n'),
        'repo/.gitattributes': '* text=auto eol=lf\n',
        'repo/AGENTS.md': '# Agents\n',
        'repo/BOUNDARY.md': '# Boundary\n',
        'repo/README.md': '# Repository\n',
        'repo/service.yaml': `
service:
  id: test-edge-worker
  repo: zdp-test-edge
runtime:
  edge: cloudflare-workers
data:
  datastores:
    - privacy_credential_vault
`
      }),
      async ({ architectureRoot, repositoryRoot }) => {
        const result = await runCli([
          'explain',
          '--architecture',
          architectureRoot,
          '--repository',
          repositoryRoot,
          '--json'
        ]);

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toBe('');

        const report = JSON.parse(result.stdout) as ExplainCliReport;

        expect(report.diagnostics).toEqual([
          expect.objectContaining({
            ruleId: 'ZDP-DATA-004',
            severity: 'error',
            file: 'service.yaml',
            path: 'direct_datastore_access[0]',
            relatedEdges: [
              {
                type: 'service-accesses-datastore',
                from: { kind: 'service', id: 'test-edge-worker' },
                to: { kind: 'datastore', id: 'privacy_credential_vault' },
                file: 'service.yaml',
                path: 'data.datastores[0]',
                source: 'repository-service-contract'
              }
            ],
            relatedNodes: expect.arrayContaining([
              expect.objectContaining({
                kind: 'service',
                node: expect.objectContaining({
                  id: 'test-edge-worker',
                  file: 'service.yaml'
                })
              }),
              expect.objectContaining({
                kind: 'datastore',
                node: expect.objectContaining({
                  id: 'privacy_credential_vault',
                  file: 'catalogs/datastores.yaml'
                })
              })
            ])
          })
        ]);
      }
    );
  });
});

interface ExplainCliReport {
  readonly diagnostics: readonly unknown[];
}
