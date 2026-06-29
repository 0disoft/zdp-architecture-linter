import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { buildDataClassIndex } from '../src/data-class-rules.ts';
import { buildDatastoreIndex } from '../src/datastore-rules.ts';
import { buildEventIndex } from '../src/event-rules.ts';
import { buildExternalProviderIndex } from '../src/provider-rules.ts';
import { validateRepositoryServiceFixtureExpectations } from '../src/repository-service-fixture-validation.ts';
import { buildRepositoryIndex } from '../src/repository-rules.ts';
import { buildServiceIndex } from '../src/service-rules.ts';

describe('repository service fixture expectations', () => {
  test('passes when repository service fixture outcomes match expected rule ids', async () => {
    await withArchitectureRoot(
      {
        'fixtures/repository-service/pass/registered.yaml': `
fixture:
  id: registered
  expect: pass
  expected_failures: []

service_contract:
  service:
    id: architecture-linter
    repo: zdp-architecture-linter
`,
        'fixtures/repository-service/fail/unregistered.yaml': `
fixture:
  id: unregistered
  expect: fail
  expected_failures:
    - ZDP-REF-009

service_contract:
  service:
    id: ghost-service
    repo: zdp-architecture-linter
`
      },
      async (architectureRoot) => {
        const diagnostics = await validateRepositoryServiceFixtureExpectations(
          createRepositoryServiceFixtureContext(architectureRoot)
        );

        expect(diagnostics).toEqual([]);
      }
    );
  });

  test('fails when a repository service fail fixture does not produce the expected rule', async () => {
    await withArchitectureRoot(
      {
        'fixtures/repository-service/fail/registered.yaml': `
fixture:
  id: registered
  expect: fail
  expected_failures:
    - ZDP-REF-009

service_contract:
  service:
    id: architecture-linter
    repo: zdp-architecture-linter
`
      },
      async (architectureRoot) => {
        const diagnostics = await validateRepositoryServiceFixtureExpectations(
          createRepositoryServiceFixtureContext(architectureRoot)
        );

        expect(diagnostics).toEqual([
          {
            ruleId: 'ZDP-FIXTURE-003',
            severity: 'error',
            file: 'fixtures/repository-service/fail/registered.yaml',
            path: 'fixture.expected_failures',
            message: 'missing expected failures: `ZDP-REF-009`'
          }
        ]);
      }
    );
  });
});

function createRepositoryServiceFixtureContext(architectureRoot: string) {
  return {
    architectureRoot,
    repositoryIndex: buildRepositoryIndex({
      repositories: [
        {
          name: 'zdp-architecture-linter',
          kind: 'deploy_unit',
          repo_stage: 'deploy_unit',
          owner: '0disoft',
          area: 'platform',
          risk_level: 'high'
        }
      ]
    }),
    serviceIndex: buildServiceIndex({
      services: [
        {
          id: 'architecture-linter',
          repo: 'zdp-architecture-linter'
        }
      ]
    }),
    dataClassIndex: buildDataClassIndex({ data_classes: [] }),
    datastoreIndex: buildDatastoreIndex({ datastores: [] }),
    eventIndex: buildEventIndex({ events: [] }),
    externalProviderIndex: buildExternalProviderIndex({ providers: [] })
  };
}

async function withArchitectureRoot(
  files: Record<string, string>,
  callback: (architectureRoot: string) => Promise<void>
): Promise<void> {
  const architectureRoot = await mkdtemp(
    join(tmpdir(), 'zdp-repository-service-fixtures-')
  );

  try {
    for (const [relativePath, source] of Object.entries(files)) {
      const absolutePath = join(architectureRoot, relativePath);
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, source.trimStart(), 'utf8');
    }

    await callback(architectureRoot);
  } finally {
    await rm(architectureRoot, { recursive: true, force: true });
  }
}
