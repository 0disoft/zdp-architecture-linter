import { describe, expect, test } from 'bun:test';
import {
  buildAiUserDataPolicy,
  validateAiUserDataContracts
} from '../src/ai-contract-rules.ts';
import {
  buildPublicApiContractPolicy,
  validatePublicApiContracts
} from '../src/api-rules.ts';
import {
  buildMoneyMovementPolicy,
  validateMoneyMovementContracts
} from '../src/money-rules.ts';
import {
  buildLedgerDatastoreDependencyPolicy,
  validateAiDirectNonOwnedDatastoreAccess,
  validateEdgeRuntimeDirectDatastoreAccess,
  validateLedgerDatastoreDependencyAccess,
  validateProductLikeDirectSensitiveDatastoreAccess
} from '../src/data-access-rules.ts';
import { buildDatastoreIndex } from '../src/datastore-rules.ts';
import {
  buildProviderContractPolicy,
  buildProviderWebhookPolicy,
  validateServiceProviderContracts,
  validateServiceProviderWebhooks
} from '../src/provider-rules.ts';
import { buildRepositoryIndex } from '../src/repository-rules.ts';
import {
  buildRepositoryServiceContractCatalog,
  mapServiceCatalogDiagnosticsToRepositoryServiceContract
} from '../src/rules/index.ts';
import {
  buildTierOperationalContractPolicy,
  validateTierOperationalContracts
} from '../src/tier-rules.ts';

describe('repository service contract policy rules', () => {
  test('reuses service catalog policy checks against service.yaml', () => {
    const catalog = buildRepositoryServiceContractCatalog({
      service: {
        id: 'money-api',
        repo: 'zdp-money-platform',
        tier: 'tier3'
      },
      domain: {
        money_movement: true,
        public_api: true
      },
      data: {
        ai_user_data: true
      },
      access: {
        permission_model: 'none'
      },
      audit: {
        required: false
      },
      idempotency: {
        required: false
      },
      dependencies: {
        services: []
      },
      providers: [
        {
          id: 'stripe',
          webhook: {
            enabled: true
          }
        }
      ],
      api: {
        exposure: 'public',
        openapi_required: false
      },
      reliability: {
        backup_required: false
      }
    });

    const diagnostics = mapServiceCatalogDiagnosticsToRepositoryServiceContract([
      ...validateMoneyMovementContracts(
        catalog,
        buildMoneyMovementPolicy({
          rules: [
            {
              id: 'ZDP-MONEY-001',
              assertions: {
                require_values: {
                  'service.tier': 'tier0',
                  'audit.required': true,
                  'idempotency.required': true
                },
                require_any: {
                  'dependencies.services': ['zdp-money-platform']
                }
              }
            }
          ]
        })
      ),
      ...validateServiceProviderContracts(
        catalog,
        buildProviderContractPolicy({
          rules: [
            {
              id: 'ZDP-PROVIDER-001',
              assertions: {
                require_fields: [
                  'providers[].data_sent',
                  'providers[].secret_owner',
                  'providers[].allowed_envs'
                ]
              }
            }
          ]
        })
      ),
      ...validateServiceProviderWebhooks(
        catalog,
        buildProviderWebhookPolicy({
          rules: [
            {
              id: 'ZDP-PROVIDER-002',
              assertions: {
                require_fields: [
                  'providers[].webhook.signature_required',
                  'providers[].webhook.replay_supported'
                ]
              }
            }
          ]
        })
      ),
      ...validateAiUserDataContracts(
        catalog,
        buildAiUserDataPolicy({
          rules: [
            {
              id: 'ZDP-AI-001',
              assertions: {
                require_values: {
                  'audit.required': true
                },
                require_any: {
                  'dependencies.services': ['zdp-privacy-access-broker']
                },
                forbid_values: {
                  'access.permission_model': ['none']
                }
              }
            }
          ]
        })
      ),
      ...validateTierOperationalContracts(
        catalog,
        buildTierOperationalContractPolicy({
          rules: [
            {
              id: 'ZDP-TIER-001',
              condition: {
                expression: 'service.tier in [tier3]'
              },
              assertions: {
                require_fields: ['service.runbook_url'],
                require_values: {
                  'reliability.backup_required': true
                }
              }
            }
          ]
        })
      ),
      ...validatePublicApiContracts(
        catalog,
        buildPublicApiContractPolicy({
          rules: [
            {
              id: 'ZDP-API-001',
              condition: {
                expression:
                  'domain.public_api == true or api.exposure in [partner,public]'
              },
              assertions: {
                require_fields: ['api.versioning'],
                require_values: {
                  'api.openapi_required': true
                }
              }
            }
          ]
        })
      )
    ]);

    expect(diagnostics.every((diagnostic) => diagnostic.file === 'service.yaml')).toBe(
      true
    );
    expect(new Set(diagnostics.map((diagnostic) => diagnostic.ruleId))).toEqual(
      new Set([
        'ZDP-MONEY-001',
        'ZDP-PROVIDER-001',
        'ZDP-PROVIDER-002',
        'ZDP-AI-001',
        'ZDP-TIER-001',
        'ZDP-API-001'
      ])
    );
    expect(diagnostics.map((diagnostic) => diagnostic.path)).toEqual(
      expect.arrayContaining([
        'service.tier',
        'providers[0].data_sent',
        'providers[0].webhook.signature_required',
        'access.permission_model',
        'service.runbook_url',
        'api.versioning'
      ])
    );
  });

  test('maps service.yaml runtime and data datastores into data access checks', () => {
    const repositoryIndex = buildRepositoryIndex({
      repositories: [
        { name: 'zdp-web-apps', area: 'frontend' },
        { name: 'zdp-money-ledger', area: 'money' },
        { name: 'zdp-privacy-credential-vault', area: 'privacy' }
      ]
    });
    const datastoreIndex = buildDatastoreIndex({
      datastores: [
        {
          id: 'ledger_postgres',
          kind: 'postgresql',
          owner_repo: 'zdp-money-ledger'
        },
        {
          id: 'privacy_credential_vault',
          kind: 'secure-storage',
          owner_repo: 'zdp-privacy-credential-vault'
        }
      ]
    });
    const catalog = buildRepositoryServiceContractCatalog({
      service: {
        id: 'app-console',
        repo: 'zdp-web-apps'
      },
      runtime: {
        edge: 'cloudflare-workers'
      },
      data: {
        datastores: ['privacy_credential_vault']
      },
      dependencies: {
        datastores: ['ledger_postgres']
      }
    });

    const diagnostics = mapServiceCatalogDiagnosticsToRepositoryServiceContract([
      ...validateProductLikeDirectSensitiveDatastoreAccess(
        catalog,
        repositoryIndex,
        datastoreIndex
      ),
      ...validateLedgerDatastoreDependencyAccess(
        catalog,
        buildLedgerDatastoreDependencyPolicy({
          rules: [
            {
              id: 'ZDP-DATA-002',
              condition: {
                all: [
                  'service.repo in [zdp-web-apps, zdp-web-public, zdp-products-lab]',
                  'dependencies.datastores contains ledger_postgres'
                ]
              },
              assertions: {
                forbid_values: {
                  'dependencies.datastores': ['ledger_postgres']
                }
              }
            }
          ]
        })
      ),
      ...validateEdgeRuntimeDirectDatastoreAccess(catalog, datastoreIndex)
    ]);

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-DATA-001',
        severity: 'error',
        file: 'service.yaml',
        path: 'direct_datastore_access[0]',
        message:
          'Service in `frontend` repository `zdp-web-apps` must not directly access `privacy` datastore `privacy_credential_vault`.'
      },
      {
        ruleId: 'ZDP-DATA-002',
        severity: 'error',
        file: 'service.yaml',
        path: 'dependencies.datastores[0]',
        message:
          'Service `app-console` in repository `zdp-web-apps` must not depend directly on datastore `ledger_postgres`.'
      },
      {
        ruleId: 'ZDP-DATA-004',
        severity: 'error',
        file: 'service.yaml',
        path: 'direct_datastore_access[0]',
        message:
          'Service with runtime `cloudflare-workers` must not directly access `secure-storage` datastore `privacy_credential_vault`.'
      }
    ]);
  });

  test('does not trust service.yaml component for AI datastore ownership checks', () => {
    const catalog = buildRepositoryServiceContractCatalog({
      service: {
        id: 'ai-answer-engine',
        repo: 'zdp-ai-platform',
        component: 'zdp-ai-retrieval'
      },
      data: {
        datastores: ['vector_qdrant']
      }
    });

    const diagnostics = mapServiceCatalogDiagnosticsToRepositoryServiceContract(
      validateAiDirectNonOwnedDatastoreAccess(
        catalog,
        buildRepositoryIndex({
          repositories: [
            { name: 'zdp-ai-platform', area: 'ai' },
            { name: 'zdp-ai-answer-engine', area: 'ai' },
            { name: 'zdp-ai-retrieval', area: 'ai' }
          ]
        }),
        buildDatastoreIndex({
          datastores: [
            {
              id: 'vector_qdrant',
              kind: 'vector-database',
              owner_repo: 'zdp-ai-retrieval'
            }
          ]
        })
      )
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-AI-003',
        severity: 'error',
        file: 'service.yaml',
        path: 'direct_datastore_access[0]',
        message:
          'AI service `ai-answer-engine` must not directly access datastore `vector_qdrant` owned by `zdp-ai-retrieval`.'
      }
    ]);
  });
});
