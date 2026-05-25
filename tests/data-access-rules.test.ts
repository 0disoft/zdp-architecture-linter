import { describe, expect, test } from 'bun:test';
import { validateEdgeRuntimeDirectDatastoreAccess } from '../src/data-access-rules.ts';
import { buildDatastoreIndex } from '../src/datastore-rules.ts';

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
