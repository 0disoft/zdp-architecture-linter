import { describe, expect, test } from 'bun:test';
import {
  buildDatastoreIndex,
  validateDatastoreOwnerReferences,
  validateServiceDatastoreReferences
} from '../src/datastore-rules.ts';
import { buildRepositoryIndex } from '../src/repository-rules.ts';

describe('datastore owner references', () => {
  test('passes when datastore owners reference known repositories', () => {
    const diagnostics = validateDatastoreOwnerReferences(
      {
        datastores: [
          {
            id: 'core_postgres',
            kind: 'postgresql',
            owner_repo: 'zdp-core-platform'
          }
        ]
      },
      buildRepositoryIndex({
        repositories: [createRepository({ name: 'zdp-core-platform' })]
      })
    );

    expect(diagnostics).toEqual([]);
  });

  test('fails when a datastore owner references an unknown repository', () => {
    const diagnostics = validateDatastoreOwnerReferences(
      {
        datastores: [
          {
            id: 'ghost_postgres',
            kind: 'postgresql',
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
        ruleId: 'ZDP-REF-003',
        severity: 'error',
        file: 'catalogs/datastores.yaml',
        path: 'datastores[0:ghost_postgres].owner_repo',
        message:
          'Datastore references unknown owner repository `zdp-ghost-platform`.'
      }
    ]);
  });

  test('fails when kind is missing', () => {
    const diagnostics = validateDatastoreOwnerReferences(
      {
        datastores: [
          {
            id: 'core_postgres',
            owner_repo: 'zdp-core-platform'
          }
        ]
      },
      buildRepositoryIndex({
        repositories: [createRepository({ name: 'zdp-core-platform' })]
      })
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-REF-003',
        severity: 'error',
        file: 'catalogs/datastores.yaml',
        path: 'datastores[0:core_postgres].kind',
        message: 'Datastore entry is missing required field `kind`.'
      }
    ]);
  });

  test('fails when kind is not a canonical value', () => {
    const diagnostics = validateDatastoreOwnerReferences(
      {
        datastores: [
          {
            id: 'core_postgres',
            kind: 'postgres',
            owner_repo: 'zdp-core-platform'
          }
        ]
      },
      buildRepositoryIndex({
        repositories: [createRepository({ name: 'zdp-core-platform' })]
      })
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-REF-003',
        severity: 'error',
        file: 'catalogs/datastores.yaml',
        path: 'datastores[0:core_postgres].kind',
        message:
          'Datastore kind must be one of: `clickhouse`, `postgresql`, `search-engine`, `secure-storage`, `object-storage`, `vector-database`.'
      }
    ]);
  });
});

describe('service datastore references', () => {
  test('passes when direct datastore access references known datastores', () => {
    const diagnostics = validateServiceDatastoreReferences(
      {
        services: [
          {
            id: 'core-api',
            direct_datastore_access: ['core_postgres']
          }
        ]
      },
      buildDatastoreIndex({
        datastores: [{ id: 'core_postgres', owner_repo: 'zdp-core-platform' }]
      })
    );

    expect(diagnostics).toEqual([]);
  });

  test('fails when direct datastore access references an unknown datastore', () => {
    const diagnostics = validateServiceDatastoreReferences(
      {
        services: [
          {
            id: 'core-api',
            direct_datastore_access: ['ghost_postgres']
          }
        ]
      },
      buildDatastoreIndex({
        datastores: [{ id: 'core_postgres', owner_repo: 'zdp-core-platform' }]
      })
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-REF-002',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:core-api].direct_datastore_access[0]',
        message: 'Service references unknown datastore `ghost_postgres`.'
      }
    ]);
  });
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
