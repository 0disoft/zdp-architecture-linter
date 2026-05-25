import { describe, expect, test } from 'bun:test';
import {
  buildLedgerDatastoreDependencyPolicy,
  validateAiDirectNonOwnedDatastoreAccess,
  validateEdgeRuntimeDirectDatastoreAccess,
  validateLedgerDatastoreDependencyAccess,
  validateProductLikeDirectSensitiveDatastoreAccess
} from '../src/data-access-rules.ts';
import { buildDatastoreIndex } from '../src/datastore-rules.ts';
import { buildRepositoryIndex } from '../src/repository-rules.ts';

const ledgerDatastoreDependencyPolicy = buildLedgerDatastoreDependencyPolicy({
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
});

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

describe('ledger datastore dependency access', () => {
  test('passes when a frontend service depends on money APIs instead of ledger datastores', () => {
    const diagnostics = validateLedgerDatastoreDependencyAccess(
      {
        services: [
          {
            id: 'app-console',
            repo: 'zdp-web-apps',
            dependencies: {
              services: ['money-api']
            }
          }
        ]
      },
      ledgerDatastoreDependencyPolicy
    );

    expect(diagnostics).toEqual([]);
  });

  test('passes when a money service depends on ledger datastores', () => {
    const diagnostics = validateLedgerDatastoreDependencyAccess(
      {
        services: [
          {
            id: 'money-ledger-writer',
            repo: 'zdp-money-platform',
            dependencies: {
              datastores: ['ledger_postgres']
            }
          }
        ]
      },
      ledgerDatastoreDependencyPolicy
    );

    expect(diagnostics).toEqual([]);
  });

  test('fails when a web app depends directly on the ledger datastore', () => {
    const diagnostics = validateLedgerDatastoreDependencyAccess(
      {
        services: [
          {
            id: 'app-console',
            repo: 'zdp-web-apps',
            dependencies: {
              datastores: ['ledger_postgres']
            }
          }
        ]
      },
      ledgerDatastoreDependencyPolicy
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-DATA-002',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:app-console].dependencies.datastores[0]',
        message:
          'Service `app-console` in repository `zdp-web-apps` must not depend directly on datastore `ledger_postgres`.'
      }
    ]);
  });

  test('fails when a nested service repo uses the lab repository', () => {
    const diagnostics = validateLedgerDatastoreDependencyAccess(
      {
        services: [
          {
            id: 'lab-checkout',
            service: {
              repo: 'zdp-products-lab'
            },
            dependencies: {
              datastores: ['ledger_postgres']
            }
          }
        ]
      },
      ledgerDatastoreDependencyPolicy
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-DATA-002',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:lab-checkout].dependencies.datastores[0]',
        message:
          'Service `lab-checkout` in repository `zdp-products-lab` must not depend directly on datastore `ledger_postgres`.'
      }
    ]);
  });

  test('fails when datastore dependencies are not an array on a forbidden repo', () => {
    const diagnostics = validateLedgerDatastoreDependencyAccess(
      {
        services: [
          {
            id: 'public-web',
            repo: 'zdp-web-public',
            dependencies: {
              datastores: 'ledger_postgres'
            }
          }
        ]
      },
      ledgerDatastoreDependencyPolicy
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-DATA-002',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:public-web].dependencies.datastores',
        message: '`dependencies.datastores` must be a YAML array when present.'
      }
    ]);
  });
});

describe('AI direct non-owned datastore access', () => {
  test('passes when an AI component directly accesses its owned datastore', () => {
    const diagnostics = validateAiDirectNonOwnedDatastoreAccess(
      {
        services: [
          {
            id: 'ai-retrieval',
            repo: 'zdp-ai-platform',
            component: 'zdp-ai-retrieval',
            direct_datastore_access: ['vector_qdrant']
          }
        ]
      },
      buildRepositoryIndex({
        repositories: [
          { name: 'zdp-ai-platform', area: 'ai' },
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
    );

    expect(diagnostics).toEqual([]);
  });

  test('passes when an AI repository directly accesses a repository-owned datastore', () => {
    const diagnostics = validateAiDirectNonOwnedDatastoreAccess(
      {
        services: [
          {
            id: 'ai-platform-service',
            repo: 'zdp-ai-platform',
            direct_datastore_access: ['ai_platform_postgres']
          }
        ]
      },
      buildRepositoryIndex({
        repositories: [{ name: 'zdp-ai-platform', area: 'ai' }]
      }),
      buildDatastoreIndex({
        datastores: [
          {
            id: 'ai_platform_postgres',
            kind: 'postgresql',
            owner_repo: 'zdp-ai-platform'
          }
        ]
      })
    );

    expect(diagnostics).toEqual([]);
  });

  test('fails when an AI answer service directly accesses the retrieval index', () => {
    const diagnostics = validateAiDirectNonOwnedDatastoreAccess(
      {
        services: [
          {
            id: 'ai-answer-engine',
            repo: 'zdp-ai-platform',
            component: 'zdp-ai-answer-engine',
            direct_datastore_access: ['vector_qdrant']
          }
        ]
      },
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
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-AI-003',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:ai-answer-engine].direct_datastore_access[0]',
        message:
          'AI service `ai-answer-engine` must not directly access datastore `vector_qdrant` owned by `zdp-ai-retrieval`.'
      }
    ]);
  });

  test('fails when an AI service directly accesses communication source data', () => {
    const diagnostics = validateAiDirectNonOwnedDatastoreAccess(
      {
        services: [
          {
            id: 'ai-answer-engine',
            repo: 'zdp-ai-platform',
            component: 'zdp-ai-answer-engine',
            direct_datastore_access: ['comm_mail_postgres']
          }
        ]
      },
      buildRepositoryIndex({
        repositories: [
          { name: 'zdp-ai-platform', area: 'ai' },
          { name: 'zdp-ai-answer-engine', area: 'ai' },
          { name: 'zdp-comm-mail-core', area: 'comm' }
        ]
      }),
      buildDatastoreIndex({
        datastores: [
          {
            id: 'comm_mail_postgres',
            kind: 'postgresql',
            owner_repo: 'zdp-comm-mail-core'
          }
        ]
      })
    );

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-AI-003',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:ai-answer-engine].direct_datastore_access[0]',
        message:
          'AI service `ai-answer-engine` must not directly access datastore `comm_mail_postgres` owned by `zdp-comm-mail-core`.'
      }
    ]);
  });

  test('skips unknown AI datastore references so reference rules can report them once', () => {
    const diagnostics = validateAiDirectNonOwnedDatastoreAccess(
      {
        services: [
          {
            id: 'ai-answer-engine',
            repo: 'zdp-ai-platform',
            component: 'zdp-ai-answer-engine',
            direct_datastore_access: ['missing_vector']
          }
        ]
      },
      buildRepositoryIndex({
        repositories: [
          { name: 'zdp-ai-platform', area: 'ai' },
          { name: 'zdp-ai-answer-engine', area: 'ai' }
        ]
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
