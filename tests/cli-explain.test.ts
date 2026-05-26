import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'bun:test';

const repoRoot = join(import.meta.dir, '..');

describe('explain CLI', () => {
  test('returns diagnostics with related graph context for a failing repository service contract', async () => {
    await withArchitectureAndRepository(
      {
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
  - name: zdp-connectors-platform
    status: active
    repo_stage: deploy_unit
    kind: deploy_unit
    area: connectors
    purpose: Connector platform.
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
  - id: connectors-telegram-bot
    repo: zdp-connectors-platform
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
        'repo/service.yaml': `
service:
  id: connectors-telegram-bot
  repo: zdp-connectors-platform
runtime:
  edge: cloudflare-workers
data:
  datastores:
    - privacy_credential_vault
`
      },
      async ({ architectureRoot, repositoryRoot }) => {
        const result = await runExplainCli(architectureRoot, repositoryRoot);

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
                from: { kind: 'service', id: 'connectors-telegram-bot' },
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
                  id: 'connectors-telegram-bot',
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

async function runExplainCli(
  architectureRoot: string,
  repositoryRoot: string
): Promise<{
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}> {
  const childProcess = Bun.spawn({
    cmd: [
      process.execPath,
      'src/cli.ts',
      'explain',
      '--architecture',
      architectureRoot,
      '--repository',
      repositoryRoot,
      '--json'
    ],
    cwd: repoRoot,
    stdout: 'pipe',
    stderr: 'pipe'
  });

  const [exitCode, stdout, stderr] = await Promise.all([
    childProcess.exited,
    new Response(childProcess.stdout).text(),
    new Response(childProcess.stderr).text()
  ]);

  return { exitCode, stdout, stderr };
}

async function withArchitectureAndRepository(
  files: Record<string, string>,
  callback: (paths: {
    readonly architectureRoot: string;
    readonly repositoryRoot: string;
  }) => Promise<void>
): Promise<void> {
  const architectureRoot = await mkdtemp(join(tmpdir(), 'zdp-cli-explain-'));

  try {
    for (const [relativePath, source] of Object.entries(files)) {
      const absolutePath = join(architectureRoot, relativePath);

      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, source.trimStart(), 'utf8');
    }

    await callback({
      architectureRoot,
      repositoryRoot: join(architectureRoot, 'repo')
    });
  } finally {
    await rm(architectureRoot, { recursive: true, force: true });
  }
}
