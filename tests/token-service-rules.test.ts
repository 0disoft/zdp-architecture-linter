import { describe, expect, test } from 'bun:test';
import { buildDatastoreIndex } from '../src/datastore-rules.ts';
import { buildRepositoryIndex } from '../src/repository-rules.ts';
import {
  buildTokenRawChainConsumptionPolicy,
  validateTokenRawChainConsumptionContracts
} from '../src/token-service-rules.ts';

const datastoreIndex = buildDatastoreIndex({
  datastores: [
    {
      id: 'onchain_events_store',
      owner_repo: 'zdp-token-indexer'
    },
    {
      id: 'ledger_postgres',
      owner_repo: 'zdp-money-platform'
    }
  ]
});

const tokenRawChainConsumptionPolicy = buildTokenRawChainConsumptionPolicy(
  {
    rules: [
      {
        id: 'ZDP-TOKEN-004',
        condition: {
          any: [
            'dependencies.datastores contains onchain_events_store',
            'direct_datastore_access contains onchain_events_store',
            'data.raw_chain_event == true'
          ]
        },
        assertions: {
          require_fields: [
            'token.reconciliation_policy',
            'token.idempotency_policy',
            'token.package_version_allowlist'
          ],
          forbid_values: {
            'token.raw_chain_event_direct_command': true
          }
        }
      }
    ]
  },
  datastoreIndex
);

const repositoryIndex = buildRepositoryIndex({
  repositories: [
    {
      name: 'zdp-money-platform',
      area: 'money'
    },
    {
      name: 'zdp-core-platform',
      area: 'core'
    },
    {
      name: 'zdp-products-lab',
      area: 'labs'
    },
    {
      name: 'zdp-token-indexer',
      area: 'token'
    }
  ]
});

describe('token raw chain consumption contracts', () => {
  test('passes when a money service gates token indexer datastore consumption', () => {
    const diagnostics = validateTokenRawChainConsumptionContracts(
      {
        services: [
          {
            id: 'token-reconciliation-adapter',
            repo: 'zdp-money-platform',
            dependencies: {
              datastores: ['onchain_events_store']
            },
            token: {
              reconciliation_policy: 'canonical_fact_reconciliation',
              idempotency_policy: 'canonical_fact_id',
              package_version_allowlist: ['original:0x1/latest:0x2'],
              raw_chain_event_direct_command: false
            }
          }
        ]
      },
      tokenRawChainConsumptionPolicy,
      repositoryIndex
    );

    expect(diagnostics).toEqual([]);
  });

  test('passes when token indexer reads its own onchain event store', () => {
    const diagnostics = validateTokenRawChainConsumptionContracts(
      {
        services: [
          {
            id: 'token-indexer',
            repo: 'zdp-token-indexer',
            direct_datastore_access: ['onchain_events_store'],
            data: {
              raw_chain_event: true
            }
          }
        ]
      },
      tokenRawChainConsumptionPolicy,
      repositoryIndex
    );

    expect(diagnostics).toEqual([]);
  });

  test('fails when a product service consumes raw chain events without gates', () => {
    const diagnostics = validateTokenRawChainConsumptionContracts(
      {
        services: [
          {
            id: 'entitlement-writer',
            repo: 'zdp-products-lab',
            dependencies: {
              datastores: ['onchain_events_store']
            },
            token: {
              raw_chain_event_direct_command: true
            }
          }
        ]
      },
      tokenRawChainConsumptionPolicy,
      repositoryIndex
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-TOKEN-004',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:entitlement-writer].token.reconciliation_policy',
        message:
          'Token raw chain consumer `entitlement-writer` must declare `token.reconciliation_policy` before consuming token indexer chain facts.'
      },
      {
        ruleId: 'ZDP-TOKEN-004',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:entitlement-writer].token.idempotency_policy',
        message:
          'Token raw chain consumer `entitlement-writer` must declare `token.idempotency_policy` before consuming token indexer chain facts.'
      },
      {
        ruleId: 'ZDP-TOKEN-004',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:entitlement-writer].token.package_version_allowlist',
        message:
          'Token raw chain consumer `entitlement-writer` must declare `token.package_version_allowlist` before consuming token indexer chain facts.'
      },
      {
        ruleId: 'ZDP-TOKEN-004',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path:
          'services[0:entitlement-writer].token.raw_chain_event_direct_command',
        message:
          'Token raw chain consumer `entitlement-writer` must not turn raw chain events into direct ledger, entitlement, or customer-right commands.'
      }
    ]);
  });

  test('fails when raw chain event marker or datastore list is malformed', () => {
    const diagnostics = validateTokenRawChainConsumptionContracts(
      {
        services: [
          {
            id: 'core-chain-importer',
            repo: 'zdp-core-platform',
            dependencies: {
              datastores: 'onchain_events_store'
            },
            data: {
              raw_chain_event: 'true'
            }
          }
        ]
      },
      tokenRawChainConsumptionPolicy,
      repositoryIndex
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-TOKEN-004',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:core-chain-importer].dependencies.datastores',
        message: '`dependencies.datastores` must be a YAML array when present.'
      },
      {
        ruleId: 'ZDP-TOKEN-004',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:core-chain-importer].data.raw_chain_event',
        message: '`data.raw_chain_event` must be a boolean when present.'
      }
    ]);
  });
});
