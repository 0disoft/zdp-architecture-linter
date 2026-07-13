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

  test('passes when deploy owner and logical owner components reference valid repository boundaries', () => {
    const diagnostics = validateDatastoreOwnerReferences(
      {
        datastores: [
          {
            id: 'core_postgres',
            kind: 'postgresql',
            owner_repo: 'zdp-core-platform',
            deploy_owner_repo: 'zdp-core-platform',
            logical_owner_components: ['zdp-core-identity', 'zdp-core-access']
          }
        ]
      },
      buildRepositoryIndex({
        repositories: [
          createRepository({ name: 'zdp-core-platform', kind: 'deploy_unit' }),
          createRepository({
            name: 'zdp-core-identity',
            kind: 'logical_boundary',
            security_boundary: {
              db_schema: 'identity',
              db_role: 'core_identity_user'
            }
          }),
          createRepository({
            name: 'zdp-core-access',
            kind: 'logical_boundary',
            security_boundary: {
              db_schema: 'access',
              db_role: 'core_access_user'
            }
          })
        ]
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

  test('fails when a deploy owner repository is unknown', () => {
    const diagnostics = validateDatastoreOwnerReferences(
      {
        datastores: [
          {
            id: 'core_postgres',
            kind: 'postgresql',
            owner_repo: 'zdp-core-platform',
            deploy_owner_repo: 'zdp-ghost-platform'
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
        path: 'datastores[0:core_postgres].deploy_owner_repo',
        message:
          'Datastore references unknown deploy owner repository `zdp-ghost-platform`.'
      }
    ]);
  });

  test('fails when a deploy owner repository is not a deploy unit', () => {
    const diagnostics = validateDatastoreOwnerReferences(
      {
        datastores: [
          {
            id: 'core_postgres',
            kind: 'postgresql',
            owner_repo: 'zdp-core-identity',
            deploy_owner_repo: 'zdp-core-identity'
          }
        ]
      },
      buildRepositoryIndex({
        repositories: [
          createRepository({
            name: 'zdp-core-identity',
            kind: 'logical_boundary'
          })
        ]
      })
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-REF-003',
        severity: 'error',
        file: 'catalogs/datastores.yaml',
        path: 'datastores[0:core_postgres].deploy_owner_repo',
        message:
          'Datastore deploy owner repository `zdp-core-identity` must have repository kind `deploy_unit`, found `logical_boundary`.'
      }
    ]);
  });

  test('fails when a logical owner component is unknown', () => {
    const diagnostics = validateDatastoreOwnerReferences(
      {
        datastores: [
          {
            id: 'core_postgres',
            kind: 'postgresql',
            owner_repo: 'zdp-core-platform',
            logical_owner_component: 'zdp-core-ghost'
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
        path: 'datastores[0:core_postgres].logical_owner_component',
        message:
          'Datastore references unknown logical owner component `zdp-core-ghost`.'
      }
    ]);
  });

  test('fails when a logical owner component is not a logical boundary', () => {
    const diagnostics = validateDatastoreOwnerReferences(
      {
        datastores: [
          {
            id: 'core_postgres',
            kind: 'postgresql',
            owner_repo: 'zdp-core-platform',
            logical_owner_component: 'zdp-core-platform'
          }
        ]
      },
      buildRepositoryIndex({
        repositories: [
          createRepository({ name: 'zdp-core-platform', kind: 'deploy_unit' })
        ]
      })
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-REF-003',
        severity: 'error',
        file: 'catalogs/datastores.yaml',
        path: 'datastores[0:core_postgres].logical_owner_component',
        message:
          'Datastore logical owner component `zdp-core-platform` must have repository kind `logical_boundary`, found `deploy_unit`.'
      },
      {
        ruleId: 'ZDP-REF-003',
        severity: 'error',
        file: 'catalogs/datastores.yaml',
        path: 'datastores[0:core_postgres].logical_owner_component',
        message:
          'Datastore logical owner component `zdp-core-platform` must declare security_boundary.db_schema and security_boundary.db_role.'
      }
    ]);
  });

  test('fails when logical owner components are not an array', () => {
    const diagnostics = validateDatastoreOwnerReferences(
      {
        datastores: [
          {
            id: 'core_postgres',
            kind: 'postgresql',
            owner_repo: 'zdp-core-platform',
            logical_owner_components: 'zdp-core-identity'
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
        path: 'datastores[0:core_postgres].logical_owner_components',
        message: '`logical_owner_components` must be a YAML array when present.'
      }
    ]);
  });

  test('fails when logical owner component DB boundary fields are missing', () => {
    const diagnostics = validateDatastoreOwnerReferences(
      {
        datastores: [
          {
            id: 'core_postgres',
            kind: 'postgresql',
            owner_repo: 'zdp-core-platform',
            logical_owner_components: ['zdp-core-identity']
          }
        ]
      },
      buildRepositoryIndex({
        repositories: [
          createRepository({ name: 'zdp-core-platform', kind: 'deploy_unit' }),
          createRepository({
            name: 'zdp-core-identity',
            kind: 'logical_boundary',
            security_boundary: {
              db_schema: 'identity'
            }
          })
        ]
      })
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-REF-003',
        severity: 'error',
        file: 'catalogs/datastores.yaml',
        path: 'datastores[0:core_postgres].logical_owner_components[0]',
        message:
          'Datastore logical owner component `zdp-core-identity` must declare security_boundary.db_schema and security_boundary.db_role.'
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

  test('fails when direct datastore access contains a non-string entry', () => {
    const diagnostics = validateServiceDatastoreReferences(
      {
        services: [
          {
            id: 'core-api',
            direct_datastore_access: [42]
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
        message: 'Direct datastore access entry must be a non-empty datastore id.'
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
