import { describe, expect, test } from 'bun:test';
import { buildArchitectureGraph } from '../src/architecture-graph.ts';
import {
  createDiagnosticExplainReport,
  formatDiagnosticExplainReportText
} from '../src/diagnostic-explain-report.ts';

describe('diagnostic explain report', () => {
  test('adds related graph edges and nodes for matching diagnostic source paths', () => {
    const graph = buildArchitectureGraph({
      catalogs: {
        repositories: {
          repositories: [
            {
              name: 'zdp-ai-platform',
              repo_stage: 'deploy_unit',
              kind: 'deploy_unit',
              area: 'ai'
            }
          ]
        },
        splitTriggers: {
          split_triggers: []
        },
        services: {
          services: [
            {
              id: 'ai-answer-engine',
              repo: 'zdp-ai-platform'
            }
          ]
        },
        datastores: {
          datastores: [
            {
              id: 'comm_mail_postgres',
              kind: 'postgresql',
              owner_repo: 'zdp-comm-platform'
            }
          ]
        },
        dataClasses: {},
        events: {},
        externalProviders: {},
        repositoryRules: {},
        moneyRules: {},
        providerRules: {},
        aiDataAccessRules: {},
        dataAccessRules: {},
        tierRules: {}
      },
      repositoryServiceContract: {
        service: {
          id: 'ai-answer-engine',
          repo: 'zdp-ai-platform'
        },
        data: {
          datastores: ['comm_mail_postgres']
        }
      }
    });

    const report = createDiagnosticExplainReport({
      graph,
      validation: {
        diagnostics: [
          {
            ruleId: 'ZDP-DATA-003',
            severity: 'error',
            file: 'service.yaml',
            path: 'data.datastores[0]',
            message: 'AI 서비스는 비소유 데이터 저장소를 직접 접근할 수 없다.'
          }
        ]
      }
    });

    expect(report.diagnostics).toEqual([
      expect.objectContaining({
        ruleId: 'ZDP-DATA-003',
        relatedEdges: [
          {
            type: 'service-accesses-datastore',
            from: { kind: 'service', id: 'ai-answer-engine' },
            to: { kind: 'datastore', id: 'comm_mail_postgres' },
            file: 'service.yaml',
            path: 'data.datastores[0]',
            source: 'repository-service-contract'
          }
        ],
        relatedNodes: [
          {
            kind: 'service',
            node: {
              id: 'ai-answer-engine',
              file: 'service.yaml',
              path: 'service',
              source: 'repository-service-contract',
              repo: 'zdp-ai-platform',
              status: null
            }
          },
          {
            kind: 'datastore',
            node: {
              id: 'comm_mail_postgres',
              file: 'catalogs/datastores.yaml',
              path: 'datastores[0:comm_mail_postgres]',
              source: 'catalog',
              status: null,
              kind: 'postgresql',
              ownerRepo: 'zdp-comm-platform'
            }
          }
        ]
      })
    ]);
  });

  test('matches diagnostics to child graph paths by prefix', () => {
    const graph = buildArchitectureGraph({
      catalogs: {
        repositories: {},
        splitTriggers: {
          split_triggers: []
        },
        services: {},
        datastores: {
          datastores: [
            {
              id: 'core_postgres',
              kind: 'postgresql'
            }
          ]
        },
        dataClasses: {},
        events: {},
        externalProviders: {},
        repositoryRules: {},
        moneyRules: {},
        providerRules: {},
        aiDataAccessRules: {},
        dataAccessRules: {},
        tierRules: {}
      },
      repositoryServiceContract: {
        service: {
          id: 'core-api'
        },
        data: {
          datastores: ['core_postgres']
        }
      }
    });

    const report = createDiagnosticExplainReport({
      graph,
      validation: {
        diagnostics: [
          {
            ruleId: 'ZDP-REF-003',
            severity: 'error',
            file: 'service.yaml',
            path: 'data.datastores',
            message: '데이터 저장소 참조가 올바르지 않다.'
          }
        ]
      }
    });

    expect(report.diagnostics[0]?.relatedEdges.map((edge) => edge.path)).toEqual([
      'data.datastores[0]'
    ]);
  });

  test('matches normalized service contract diagnostics to original service.yaml paths', () => {
    const graph = buildArchitectureGraph({
      catalogs: {
        repositories: {},
        splitTriggers: {
          split_triggers: []
        },
        services: {},
        datastores: {
          datastores: [
            {
              id: 'privacy_credential_vault',
              kind: 'secure-storage'
            }
          ]
        },
        dataClasses: {},
        events: {},
        externalProviders: {},
        repositoryRules: {},
        moneyRules: {},
        providerRules: {},
        aiDataAccessRules: {},
        dataAccessRules: {},
        tierRules: {}
      },
      repositoryServiceContract: {
        service: {
          id: 'connectors-telegram-bot'
        },
        data: {
          datastores: ['privacy_credential_vault']
        }
      }
    });

    const report = createDiagnosticExplainReport({
      graph,
      validation: {
        diagnostics: [
          {
            ruleId: 'ZDP-DATA-004',
            severity: 'error',
            file: 'service.yaml',
            path: 'direct_datastore_access[0]',
            message: '엣지 런타임은 상태 저장소를 직접 접근할 수 없다.'
          }
        ]
      }
    });

    expect(report.diagnostics[0]?.relatedEdges.map((edge) => edge.path)).toEqual([
      'data.datastores[0]'
    ]);
  });

  test('keeps diagnostics without matching graph context explicit', () => {
    const graph = buildArchitectureGraph({
      catalogs: {
        repositories: {},
        splitTriggers: {
          split_triggers: []
        },
        services: {},
        datastores: {},
        dataClasses: {},
        events: {},
        externalProviders: {},
        repositoryRules: {},
        moneyRules: {},
        providerRules: {},
        aiDataAccessRules: {},
        dataAccessRules: {},
        tierRules: {}
      }
    });

    const report = createDiagnosticExplainReport({
      graph,
      validation: {
        diagnostics: [
          {
            ruleId: 'ZDP-REPO-001',
            severity: 'error',
            file: 'catalogs/repositories.yaml',
            path: 'repositories[0].owner',
            message: 'owner가 필요하다.'
          }
        ]
      }
    });

    expect(report.diagnostics[0]?.relatedEdges).toEqual([]);
    expect(report.diagnostics[0]?.relatedNodes).toEqual([]);
  });

  test('formats a compact text report', () => {
    expect(formatDiagnosticExplainReportText({ diagnostics: [] })).toBe(
      'zdp-arch: explanation passed'
    );
  });
});
