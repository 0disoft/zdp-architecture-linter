import { describe, expect, test } from 'bun:test';
import { validateChatgptAppsSdkGatewayContract } from '../src/chatgpt-app-rules.ts';

describe('ChatGPT Apps SDK gateway catalog contract', () => {
  test('skips catalogs that do not declare a ChatGPT app gateway plan', () => {
    const diagnostics = validateChatgptAppsSdkGatewayContract({
      repositories: {
        repositories: [
          {
            name: 'zdp-edge-workers',
            status: 'reserved',
            repo_stage: 'deploy_unit'
          }
        ]
      },
      services: {
        services: [
          {
            id: 'edge-webhook-ingress',
            repo: 'zdp-edge-workers'
          }
        ]
      },
      externalProviders: {
        providers: [
          {
            id: 'openai',
            categories: ['llm-provider']
          }
        ]
      }
    });

    expect(diagnostics).toEqual([]);
  });

  test('passes when repository, service, and provider boundaries are declared', () => {
    const diagnostics = validateChatgptAppsSdkGatewayContract(
      createValidChatgptCatalogs()
    );

    expect(diagnostics).toEqual([]);
  });

  test('fails when the gateway is promoted to a standalone repo too early', () => {
    const catalogs = createValidChatgptCatalogs();
    catalogs.repositories.repositories[0].created = true;
    catalogs.repositories.repositories[0].repo_stage = 'deploy_unit';
    catalogs.repositories.repositories[0].requires_latest_review = false;

    const diagnostics = validateChatgptAppsSdkGatewayContract(catalogs);

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-CHATGPT-APP-001',
        severity: 'error',
        file: 'catalogs/repositories.yaml',
        path: 'repositories[0:zdp-ai-chatgpt-gateway].repo_stage',
        message:
          'Repository `zdp-ai-chatgpt-gateway` must set `repo_stage` to `conditional_deploy_unit`.'
      },
      {
        ruleId: 'ZDP-CHATGPT-APP-001',
        severity: 'error',
        file: 'catalogs/repositories.yaml',
        path: 'repositories[0:zdp-ai-chatgpt-gateway].created',
        message:
          'Repository `zdp-ai-chatgpt-gateway` must set `created` to `false`.'
      },
      {
        ruleId: 'ZDP-CHATGPT-APP-001',
        severity: 'error',
        file: 'catalogs/repositories.yaml',
        path: 'repositories[0:zdp-ai-chatgpt-gateway].requires_latest_review',
        message:
          'Repository `zdp-ai-chatgpt-gateway` must set `requires_latest_review` to `true`.'
      }
    ]);
  });

  test('fails when the MCP service can touch data stores or skips safety dependencies', () => {
    const catalogs = createValidChatgptCatalogs();
    catalogs.services.services[0].direct_datastore_access = ['ai-memory-store'];
    catalogs.services.services[0].dependencies = ['ai-gateway-service'];
    catalogs.services.services[0].external_dependencies = [];

    const diagnostics = validateChatgptAppsSdkGatewayContract(catalogs);

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-CHATGPT-APP-001',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:chatgpt-mcp-gateway].direct_datastore_access',
        message:
          'Service `chatgpt-mcp-gateway` must keep `direct_datastore_access` as an empty array.'
      },
      {
        ruleId: 'ZDP-CHATGPT-APP-001',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:chatgpt-mcp-gateway].dependencies',
        message:
          'Service `chatgpt-mcp-gateway` must include `privacy-broker` in `dependencies`.'
      },
      {
        ruleId: 'ZDP-CHATGPT-APP-001',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:chatgpt-mcp-gateway].dependencies',
        message:
          'Service `chatgpt-mcp-gateway` must include `credential-vault` in `dependencies`.'
      },
      {
        ruleId: 'ZDP-CHATGPT-APP-001',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:chatgpt-mcp-gateway].dependencies',
        message:
          'Service `chatgpt-mcp-gateway` must include `core-audit` in `dependencies`.'
      },
      {
        ruleId: 'ZDP-CHATGPT-APP-001',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:chatgpt-mcp-gateway].dependencies',
        message:
          'Service `chatgpt-mcp-gateway` must include `platform-observability` in `dependencies`.'
      },
      {
        ruleId: 'ZDP-CHATGPT-APP-001',
        severity: 'error',
        file: 'catalogs/services.yaml',
        path: 'services[0:chatgpt-mcp-gateway].external_dependencies',
        message:
          'Service `chatgpt-mcp-gateway` must include `openai` in `external_dependencies`.'
      }
    ]);
  });

  test('fails when OpenAI is only modeled as an LLM provider', () => {
    const catalogs = createValidChatgptCatalogs();
    catalogs.externalProviders.providers[0].categories = ['llm-provider'];
    catalogs.externalProviders.providers[0].notes = [
      'OpenAI는 모델 제공자로만 쓴다.'
    ];

    const diagnostics = validateChatgptAppsSdkGatewayContract(catalogs);

    expect(diagnostics).toEqual([
      {
        ruleId: 'ZDP-CHATGPT-APP-001',
        severity: 'error',
        file: 'catalogs/external-providers.yaml',
        path: 'providers[0:openai].categories',
        message:
          'External provider `openai` must include `chatgpt-app-host` in `categories`.'
      },
      {
        ruleId: 'ZDP-CHATGPT-APP-001',
        severity: 'error',
        file: 'catalogs/external-providers.yaml',
        path: 'providers[0:openai].categories',
        message:
          'External provider `openai` must include `mcp-client` in `categories`.'
      },
      {
        ruleId: 'ZDP-CHATGPT-APP-001',
        severity: 'error',
        file: 'catalogs/external-providers.yaml',
        path: 'providers[0:openai].categories',
        message:
          'External provider `openai` must include `oauth-client-platform` in `categories`.'
      },
      {
        ruleId: 'ZDP-CHATGPT-APP-001',
        severity: 'error',
        file: 'catalogs/external-providers.yaml',
        path: 'providers[0:openai].notes',
        message:
          'External provider `openai` must include `LLM provider와 ChatGPT Apps SDK host 역할을 구분` in `notes`.'
      },
      {
        ruleId: 'ZDP-CHATGPT-APP-001',
        severity: 'error',
        file: 'catalogs/external-providers.yaml',
        path: 'providers[0:openai].notes',
        message:
          'External provider `openai` must include `공개 MCP endpoint` in `notes`.'
      },
      {
        ruleId: 'ZDP-CHATGPT-APP-001',
        severity: 'error',
        file: 'catalogs/external-providers.yaml',
        path: 'providers[0:openai].notes',
        message:
          'External provider `openai` must include `tool schema` in `notes`.'
      },
      {
        ruleId: 'ZDP-CHATGPT-APP-001',
        severity: 'error',
        file: 'catalogs/external-providers.yaml',
        path: 'providers[0:openai].notes',
        message:
          'External provider `openai` must include `handler` in `notes`.'
      },
      {
        ruleId: 'ZDP-CHATGPT-APP-001',
        severity: 'error',
        file: 'catalogs/external-providers.yaml',
        path: 'providers[0:openai].notes',
        message:
          'External provider `openai` must include `auth` in `notes`.'
      },
      {
        ruleId: 'ZDP-CHATGPT-APP-001',
        severity: 'error',
        file: 'catalogs/external-providers.yaml',
        path: 'providers[0:openai].notes',
        message:
          'External provider `openai` must include `UI resource` in `notes`.'
      },
      {
        ruleId: 'ZDP-CHATGPT-APP-001',
        severity: 'error',
        file: 'catalogs/external-providers.yaml',
        path: 'providers[0:openai].notes',
        message:
          'External provider `openai` must include `CSP` in `notes`.'
      },
      {
        ruleId: 'ZDP-CHATGPT-APP-001',
        severity: 'error',
        file: 'catalogs/external-providers.yaml',
        path: 'providers[0:openai].notes',
        message:
          'External provider `openai` must include `structuredContent, content, _meta, widget state` in `notes`.'
      },
      {
        ruleId: 'ZDP-CHATGPT-APP-001',
        severity: 'error',
        file: 'catalogs/external-providers.yaml',
        path: 'providers[0:openai].notes',
        message:
          'External provider `openai` must include `OpenAI 공식 문서` in `notes`.'
      }
    ]);
  });
});

function createValidChatgptCatalogs(): {
  readonly repositories: {
    readonly repositories: Array<Record<string, unknown>>;
  };
  readonly services: {
    readonly services: Array<Record<string, unknown>>;
  };
  readonly externalProviders: {
    readonly providers: Array<Record<string, unknown>>;
  };
} {
  return {
    repositories: {
      repositories: [
        {
          name: 'zdp-ai-chatgpt-gateway',
          status: 'reserved',
          repo_stage: 'conditional_deploy_unit',
          kind: 'deploy_unit',
          area: 'ai',
          purpose:
            'ChatGPT Apps SDK와 MCP 기반으로 ZDP 기능을 ChatGPT 안에 노출하는 공개 앱 게이트웨이',
          owner: '0disoft',
          created: false,
          current_location:
            'projects/zdp-platforms/edge/zdp-edge-workers/apps/chatgpt-mcp',
          primary_stack: [
            'TypeScript',
            'Hono',
            'Cloudflare Workers',
            'MCP TypeScript SDK',
            'Apps SDK UI resources'
          ],
          owns_data: [
            'chatgpt-app-tool-metadata',
            'mcp-session-metadata',
            'chatgpt-app-submission-artifacts'
          ],
          create_when: [
            'ChatGPT 앱을 공개 제출하거나 외부 사용자가 접근한다.',
            'OAuth, 사용자 원본 데이터 접근, 쓰기 작업, 파일 처리, 결제 전환 중 하나라도 들어간다.',
            '2개 이상 제품이 같은 ChatGPT 앱 표면을 공유한다.',
            'tool metadata, UI bundle, 앱 심사 산출물이 zdp-edge-workers와 다른 배포 주기를 요구한다.',
            'ChatGPT 앱 장애가 다른 edge route와 독립 대응되어야 한다.'
          ],
          forbidden: [
            'OAuth refresh token, provider credential, webhook secret 원문 보관',
            'prompt 원문, source document, raw user data, payment data 직접 저장',
            'structuredContent, content, _meta, widget state에 secret, token, raw credential 포함',
            '서버 측 권한 검사, 사용자 확인, 멱등성 키, 감사 로그 없는 destructive write action 노출'
          ],
          security_boundary: {
            public_endpoint: '/mcp',
            auth_required: 'conditional',
            audit_required: true,
            secret_scope: 'ai.chatgpt_gateway.*',
            raw_user_data_access: 'forbidden'
          },
          split_trigger: [
            '공개 MCP 계약과 앱 심사 산출물이 별도 릴리즈 관리를 요구한다.',
            'OAuth scope, consent, audit, tool policy 변경이 독립 보안 리뷰를 요구한다.',
            'ChatGPT tool 호출량이 독립 rate limit, budget, SLO를 요구한다.'
          ],
          risk_level: 'critical',
          requires_latest_review: true,
          notes: [
            '새 Git 저장소를 바로 만들지 않는다. 초기 구현은 zdp-edge-workers/apps/chatgpt-mcp 안의 얇은 MCP route로 시작한다.',
            'Tool handler는 ZDP 데이터 저장소를 직접 읽지 않고 core, ai, privacy, credential vault 경계의 API만 호출한다.',
            '사용자 원본 데이터가 필요하면 zdp-privacy-access-broker의 짧은 수명 capability를 먼저 통과한다.',
            'OAuth token 또는 provider credential 저장이 필요하면 zdp-privacy-credential-vault가 원문 보관 경계를 소유한다.',
            'Apps SDK, MCP transport, ChatGPT 연결, OAuth, CSP, 앱 제출 정책은 구현 전 OpenAI 공식 문서로 다시 확인한다.'
          ]
        }
      ]
    },
    services: {
      services: [
        {
          id: 'chatgpt-mcp-gateway',
          repo: 'zdp-edge-workers',
          component: 'zdp-ai-chatgpt-gateway',
          status: 'reserved',
          runtime: 'cloudflare-workers',
          framework: 'hono-mcp-apps-sdk',
          direct_datastore_access: [],
          dependencies: [
            'ai-gateway-service',
            'privacy-broker',
            'credential-vault',
            'core-audit',
            'platform-observability'
          ],
          external_dependencies: ['openai'],
          risk_level: 'critical',
          notes: [
            'ChatGPT Apps SDK 연결을 위한 공개 MCP endpoint 후보이며 초기 경로는 /mcp다.',
            '새 Git 저장소를 바로 만들지 않고 zdp-edge-workers/apps/chatgpt-mcp의 얇은 edge adapter로 시작한다.',
            'MCP tool handler는 내부 서비스 API만 호출하며 AI memory, 메일, 메시지, 파일, 결제, 권한 저장소를 직접 읽지 않는다.',
            'structuredContent, content, _meta, widget state에는 secret, token, raw credential, 원본 사용자 데이터를 넣지 않는다.',
            'OAuth, 사용자 원본 데이터 접근, 파일 처리, 결제 전환, destructive write action이 들어가면 privacy broker, credential vault, consent, audit, idempotency 경계를 먼저 닫는다.',
            'Apps SDK, MCP server, OAuth, CSP, submission 정책은 구현 전 OpenAI 공식 문서로 다시 확인한다.'
          ]
        }
      ]
    },
    externalProviders: {
      providers: [
        {
          id: 'openai',
          status: 'candidate',
          categories: [
            'llm-provider',
            'chatgpt-app-host',
            'mcp-client',
            'oauth-client-platform'
          ],
          notes: [
            'LLM provider와 ChatGPT Apps SDK host 역할을 구분해서 다룬다.',
            'Apps SDK 앱은 ZDP가 공개 MCP endpoint, tool schema, handler, auth, UI resource, CSP, 로그와 장애 대응을 소유하는 외부 계약이다.',
            'structuredContent, content, _meta, widget state에는 secret, token, raw credential, 원본 사용자 데이터를 넣지 않는다.',
            'Apps SDK, MCP server, OAuth, CSP, app submission 정책은 구현 전 OpenAI 공식 문서로 다시 확인한다.'
          ]
        }
      ]
    }
  };
}
