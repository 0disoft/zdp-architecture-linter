import { describe, expect, test } from 'bun:test';
import {
  validateEdgeRuntimeDirectDatastoreAccess,
  validateProductLikeDirectSensitiveDatastoreAccess
} from '../src/data-access-rules.ts';
import { buildDatastoreIndex } from '../src/datastore-rules.ts';
import { buildRepositoryIndex } from '../src/repository-rules.ts';

describe('product-like direct sensitive datastore access', () => {
  test('passes when a frontend service does not directly access sensitive datastores', () => {
    const diagnostics = validateProductLikeDirectSensitiveDatastoreAccess(
      {
        services: [
          {
            id: 'public-web',
            repo: 'zdp-web-public',
            direct_datastore_access: []
          }
        ]
      },
      buildRepositoryIndex({
        repositories: [
          { name: 'zdp-web-public', area: 'frontend' },
          { name: 'zdp-core-platform', area: 'core' }
        ]
      }),
      buildDatastoreIndex({
        datastores: [
          {
            id: 'core_postgres',
            kind: 'postgresql',
            owner_repo: 'zdp-core-platform'
          }
        ]
      })
    );

    expect(diagnostics).toEqual([]);
  });

  test('passes when a money service directly accesses money-owned datastores', () => {
    const diagnostics = validateProductLikeDirectSensitiveDatastoreAccess(
      {
        services: [
          {
            id: 'money-api',
            repo: 'zdp-money-platform',
            direct_datastore_access: ['ledger_postgres']
          }
        ]
      },
      buildRepositoryIndex({
        repositories: [
          { name: 'zdp-money-platform', area: 'money' },
          { name: 'zdp-money-ledger', area: 'money' }
        ]
      }),
      buildDatastoreIndex({
        datastores: [
          {
            id: 'ledger_postgres',
            kind: 'postgresql',
            owner_repo: 'zdp-money-ledger'
          }
        ]
      })
    );

    expect(diagnostics).toEqual([]);
  });

  test('fails when a frontend service directly accesses a money datastore', () => {
    const diagnostics = validateProductLikeDirectSensitiveDatastoreAccess(
      {
        services: [
          {
            id: 'app-console',
            repo: 'zdp-web-apps',
            direct_datastore_access: ['ledger_postgres']
          }
        ]
      },
      buildRepositoryIndex({
        repositories: [
          { name: 'zdp-web-apps', area: 'frontend' },
          { name: 'zdp-money-ledger', area: 'money' }
        ]
      }),
      buildDatastoreIndex({
        datastores: [
          {
            id: 'ledger_postgres',
            kind: 'postgresql',
            owner_repo: 'zdp-money-ledger'
          }
        ]
      })
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-DATA-001',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:app-console].direct_datastore_access[0]',
        message:
          'Service in `frontend` repository `zdp-web-apps` must not directly access `money` datastore `ledger_postgres`.'
      }
    ]);
  });

  test('fails when a lab service directly accesses the credential vault', () => {
    const diagnostics = validateProductLikeDirectSensitiveDatastoreAccess(
      {
        services: [
          {
            id: 'prototype-worker',
            repo: 'zdp-products-lab',
            direct_datastore_access: ['privacy_credential_vault']
          }
        ]
      },
      buildRepositoryIndex({
        repositories: [
          { name: 'zdp-products-lab', area: 'labs' },
          { name: 'zdp-privacy-credential-vault', area: 'privacy' }
        ]
      }),
      buildDatastoreIndex({
        datastores: [
          {
            id: 'privacy_credential_vault',
            kind: 'secure-storage',
            owner_repo: 'zdp-privacy-credential-vault'
          }
        ]
      })
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-DATA-001',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:prototype-worker].direct_datastore_access[0]',
        message:
          'Service in `labs` repository `zdp-products-lab` must not directly access `privacy` datastore `privacy_credential_vault`.'
      }
    ]);
  });

  test('skips unknown references so reference rules can report them once', () => {
    const diagnostics = validateProductLikeDirectSensitiveDatastoreAccess(
      {
        services: [
          {
            id: 'prototype-worker',
            repo: 'zdp-products-lab',
            direct_datastore_access: ['missing_postgres']
          }
        ]
      },
      buildRepositoryIndex({
        repositories: [{ name: 'zdp-products-lab', area: 'labs' }]
      }),
      buildDatastoreIndex({ datastores: [] })
    );

    expect(diagnostics).toEqual([]);
  });
});

describe('edge runtime direct datastore access', () => {
  test('passes when a Cloudflare Worker does not directly access stateful datastores', () => {
    const diagnostics = validateEdgeRuntimeDirectDatastoreAccess(
      {
        services: [
          {
            id: 'edge-webhook-ingress',
            runtime: 'cloudflare-workers',
            direct_datastore_access: []
          }
        ]
      },
      buildDatastoreIndex({
        datastores: [
          {
            id: 'privacy_credential_vault',
            kind: 'secure-storage',
            owner_repo: 'zdp-privacy-credential-vault'
          }
        ]
      })
    );

    expect(diagnostics).toEqual([]);
  });

  test('passes when an R2 service references an object-storage datastore', () => {
    const diagnostics = validateEdgeRuntimeDirectDatastoreAccess(
      {
        services: [
          {
            id: 'game-assets-cdn',
            runtime: 'cloudflare-r2',
            direct_datastore_access: ['media_r2']
          }
        ]
      },
      buildDatastoreIndex({
        datastores: [
          {
            id: 'media_r2',
            kind: 'object-storage',
            owner_repo: 'zdp-core-media'
          }
        ]
      })
    );

    expect(diagnostics).toEqual([]);
  });

  test('fails when a Cloudflare Worker directly accesses secure storage', () => {
    const diagnostics = validateEdgeRuntimeDirectDatastoreAccess(
      {
        services: [
          {
            id: 'connectors-telegram-bot',
            runtime: 'cloudflare-workers',
            direct_datastore_access: ['privacy_credential_vault']
          }
        ]
      },
      buildDatastoreIndex({
        datastores: [
          {
            id: 'privacy_credential_vault',
            kind: 'secure-storage',
            owner_repo: 'zdp-privacy-credential-vault'
          }
        ]
      })
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-DATA-004',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:connectors-telegram-bot].direct_datastore_access[0]',
        message:
          'Service with runtime `cloudflare-workers` must not directly access `secure-storage` datastore `privacy_credential_vault`.'
      }
    ]);
  });

  test('fails when a Durable Object directly accesses PostgreSQL', () => {
    const diagnostics = validateEdgeRuntimeDirectDatastoreAccess(
      {
        services: [
          {
            id: 'realtime-presence',
            runtime: 'cloudflare-durable-objects',
            direct_datastore_access: ['comm_messaging_postgres']
          }
        ]
      },
      buildDatastoreIndex({
        datastores: [
          {
            id: 'comm_messaging_postgres',
            kind: 'postgresql',
            owner_repo: 'zdp-comm-messaging-core'
          }
        ]
      })
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-DATA-004',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:realtime-presence].direct_datastore_access[0]',
        message:
          'Service with runtime `cloudflare-durable-objects` must not directly access `postgresql` datastore `comm_messaging_postgres`.'
      }
    ]);
  });
});
