import type { Diagnostic } from './diagnostics.ts';

const RULE_ID = 'ZDP-CHATGPT-APP-001';
const REPOSITORIES_FILE = 'catalogs/repositories.yaml';
const SERVICES_FILE = 'catalogs/services.yaml';
const EXTERNAL_PROVIDERS_FILE = 'catalogs/external-providers.yaml';

const CHATGPT_GATEWAY_REPOSITORY = 'zdp-ai-chatgpt-gateway';
const CHATGPT_GATEWAY_SERVICE = 'chatgpt-mcp-gateway';
const OPENAI_PROVIDER = 'openai';

const REQUIRED_REPOSITORY_VALUES: readonly RequiredValue[] = [
  { path: 'status', expected: 'reserved' },
  { path: 'repo_stage', expected: 'conditional_deploy_unit' },
  { path: 'kind', expected: 'deploy_unit' },
  { path: 'area', expected: 'ai' },
  { path: 'created', expected: false },
  {
    path: 'current_location',
    expected: 'projects/zdp-platforms/edge/zdp-edge-workers/apps/chatgpt-mcp'
  },
  { path: 'risk_level', expected: 'critical' },
  { path: 'requires_latest_review', expected: true },
  { path: 'security_boundary.public_endpoint', expected: '/mcp' },
  { path: 'security_boundary.auth_required', expected: 'conditional' },
  { path: 'security_boundary.audit_required', expected: true },
  { path: 'security_boundary.secret_scope', expected: 'ai.chatgpt_gateway.*' },
  { path: 'security_boundary.raw_user_data_access', expected: 'forbidden' }
] as const;

const REQUIRED_REPOSITORY_STACK = [
  'TypeScript',
  'Hono',
  'Cloudflare Workers',
  'MCP TypeScript SDK',
  'Apps SDK UI resources'
] as const;

const REQUIRED_REPOSITORY_OWNS_DATA = [
  'chatgpt-app-tool-metadata',
  'mcp-session-metadata',
  'chatgpt-app-submission-artifacts'
] as const;

const REQUIRED_REPOSITORY_CREATE_WHEN_SNIPPETS = [
  'ChatGPT 앱을 공개 제출',
  'OAuth',
  '2개 이상 제품',
  'tool metadata',
  'ChatGPT 앱 장애'
] as const;

const REQUIRED_REPOSITORY_FORBIDDEN_SNIPPETS = [
  'OAuth refresh token',
  'prompt 원문',
  'structuredContent, content, _meta, widget state',
  '서버 측 권한 검사'
] as const;

const REQUIRED_REPOSITORY_SPLIT_TRIGGER_SNIPPETS = [
  '공개 MCP 계약',
  'OAuth scope',
  'ChatGPT tool 호출량'
] as const;

const REQUIRED_REPOSITORY_NOTE_SNIPPETS = [
  '새 Git 저장소를 바로 만들지 않는다',
  '직접 읽지 않고',
  'zdp-privacy-access-broker',
  'zdp-privacy-credential-vault',
  'OpenAI 공식 문서'
] as const;

const REQUIRED_SERVICE_VALUES: readonly RequiredValue[] = [
  { path: 'repo', expected: 'zdp-edge-workers' },
  { path: 'component', expected: CHATGPT_GATEWAY_REPOSITORY },
  { path: 'status', expected: 'reserved' },
  { path: 'runtime', expected: 'cloudflare-workers' },
  { path: 'framework', expected: 'hono-mcp-apps-sdk' },
  { path: 'risk_level', expected: 'critical' }
] as const;

const REQUIRED_SERVICE_DEPENDENCIES = [
  'ai-gateway-service',
  'privacy-broker',
  'credential-vault',
  'core-audit',
  'platform-observability'
] as const;

const REQUIRED_SERVICE_EXTERNAL_DEPENDENCIES = [OPENAI_PROVIDER] as const;

const REQUIRED_SERVICE_NOTE_SNIPPETS = [
  '공개 MCP endpoint',
  '/mcp',
  '새 Git 저장소를 바로 만들지 않고',
  '내부 서비스 API만 호출',
  '직접 읽지 않는다',
  'structuredContent, content, _meta, widget state',
  'privacy broker',
  'credential vault',
  'consent',
  'audit',
  'idempotency',
  'OpenAI 공식 문서'
] as const;

const REQUIRED_OPENAI_CATEGORIES = [
  'llm-provider',
  'chatgpt-app-host',
  'mcp-client',
  'oauth-client-platform'
] as const;

const REQUIRED_OPENAI_NOTE_SNIPPETS = [
  'LLM provider와 ChatGPT Apps SDK host 역할을 구분',
  '공개 MCP endpoint',
  'tool schema',
  'handler',
  'auth',
  'UI resource',
  'CSP',
  'structuredContent, content, _meta, widget state',
  'OpenAI 공식 문서'
] as const;

interface RequiredValue {
  readonly path: string;
  readonly expected: string | boolean;
}

export function validateChatgptAppsSdkGatewayContract(input: {
  readonly repositories: unknown;
  readonly services: unknown;
  readonly externalProviders: unknown;
}): readonly Diagnostic[] {
  if (!hasChatgptGatewayPlanningSignal(input)) {
    return [];
  }

  return [
    ...validateGatewayRepository(input.repositories),
    ...validateGatewayService(input.services),
    ...validateOpenAiProviderContract(input.externalProviders)
  ];
}

function hasChatgptGatewayPlanningSignal(input: {
  readonly repositories: unknown;
  readonly services: unknown;
  readonly externalProviders: unknown;
}): boolean {
  const repository = findNamedEntry({
    value: input.repositories,
    arrayField: 'repositories',
    idField: 'name',
    id: CHATGPT_GATEWAY_REPOSITORY
  });
  const service = findNamedEntry({
    value: input.services,
    arrayField: 'services',
    idField: 'id',
    id: CHATGPT_GATEWAY_SERVICE
  });
  const openai = findNamedEntry({
    value: input.externalProviders,
    arrayField: 'providers',
    idField: 'id',
    id: OPENAI_PROVIDER
  });

  return (
    repository.entry !== null ||
    service.entry !== null ||
    hasAnyStringArrayEntry(
      openai.entry,
      'categories',
      ['chatgpt-app-host', 'mcp-client', 'oauth-client-platform']
    ) ||
    hasAnyTextSnippet(openai.entry, 'notes', ['ChatGPT Apps SDK', 'MCP'])
  );
}

function validateGatewayRepository(value: unknown): readonly Diagnostic[] {
  const repository = findNamedEntry({
    value,
    arrayField: 'repositories',
    idField: 'name',
    id: CHATGPT_GATEWAY_REPOSITORY
  });

  if (repository.entry === null) {
    return [
      createDiagnostic(
        REPOSITORIES_FILE,
        'repositories',
        `Repository catalog must include \`${CHATGPT_GATEWAY_REPOSITORY}\` for ChatGPT Apps SDK/MCP planning.`
      )
    ];
  }

  return [
    ...validateRequiredValues({
      entry: repository.entry,
      basePath: repository.path,
      file: REPOSITORIES_FILE,
      requiredValues: REQUIRED_REPOSITORY_VALUES,
      subject: `Repository \`${CHATGPT_GATEWAY_REPOSITORY}\``
    }),
    ...validateRequiredStringArray({
      entry: repository.entry,
      basePath: repository.path,
      file: REPOSITORIES_FILE,
      field: 'primary_stack',
      requiredEntries: REQUIRED_REPOSITORY_STACK,
      subject: `Repository \`${CHATGPT_GATEWAY_REPOSITORY}\``
    }),
    ...validateRequiredStringArray({
      entry: repository.entry,
      basePath: repository.path,
      file: REPOSITORIES_FILE,
      field: 'owns_data',
      requiredEntries: REQUIRED_REPOSITORY_OWNS_DATA,
      subject: `Repository \`${CHATGPT_GATEWAY_REPOSITORY}\``
    }),
    ...validateRequiredTextSnippets({
      entry: repository.entry,
      basePath: repository.path,
      file: REPOSITORIES_FILE,
      field: 'create_when',
      requiredSnippets: REQUIRED_REPOSITORY_CREATE_WHEN_SNIPPETS,
      subject: `Repository \`${CHATGPT_GATEWAY_REPOSITORY}\``
    }),
    ...validateRequiredTextSnippets({
      entry: repository.entry,
      basePath: repository.path,
      file: REPOSITORIES_FILE,
      field: 'forbidden',
      requiredSnippets: REQUIRED_REPOSITORY_FORBIDDEN_SNIPPETS,
      subject: `Repository \`${CHATGPT_GATEWAY_REPOSITORY}\``
    }),
    ...validateRequiredTextSnippets({
      entry: repository.entry,
      basePath: repository.path,
      file: REPOSITORIES_FILE,
      field: 'split_trigger',
      requiredSnippets: REQUIRED_REPOSITORY_SPLIT_TRIGGER_SNIPPETS,
      subject: `Repository \`${CHATGPT_GATEWAY_REPOSITORY}\``
    }),
    ...validateRequiredTextSnippets({
      entry: repository.entry,
      basePath: repository.path,
      file: REPOSITORIES_FILE,
      field: 'notes',
      requiredSnippets: REQUIRED_REPOSITORY_NOTE_SNIPPETS,
      subject: `Repository \`${CHATGPT_GATEWAY_REPOSITORY}\``
    })
  ];
}

function validateGatewayService(value: unknown): readonly Diagnostic[] {
  const service = findNamedEntry({
    value,
    arrayField: 'services',
    idField: 'id',
    id: CHATGPT_GATEWAY_SERVICE
  });

  if (service.entry === null) {
    return [
      createDiagnostic(
        SERVICES_FILE,
        'services',
        `Service catalog must include \`${CHATGPT_GATEWAY_SERVICE}\` for the ChatGPT Apps SDK/MCP gateway.`
      )
    ];
  }

  return [
    ...validateRequiredValues({
      entry: service.entry,
      basePath: service.path,
      file: SERVICES_FILE,
      requiredValues: REQUIRED_SERVICE_VALUES,
      subject: `Service \`${CHATGPT_GATEWAY_SERVICE}\``
    }),
    ...validateRequiredEmptyArray({
      entry: service.entry,
      basePath: service.path,
      file: SERVICES_FILE,
      field: 'direct_datastore_access',
      subject: `Service \`${CHATGPT_GATEWAY_SERVICE}\``
    }),
    ...validateRequiredStringArray({
      entry: service.entry,
      basePath: service.path,
      file: SERVICES_FILE,
      field: 'dependencies',
      requiredEntries: REQUIRED_SERVICE_DEPENDENCIES,
      subject: `Service \`${CHATGPT_GATEWAY_SERVICE}\``
    }),
    ...validateRequiredStringArray({
      entry: service.entry,
      basePath: service.path,
      file: SERVICES_FILE,
      field: 'external_dependencies',
      requiredEntries: REQUIRED_SERVICE_EXTERNAL_DEPENDENCIES,
      subject: `Service \`${CHATGPT_GATEWAY_SERVICE}\``
    }),
    ...validateRequiredTextSnippets({
      entry: service.entry,
      basePath: service.path,
      file: SERVICES_FILE,
      field: 'notes',
      requiredSnippets: REQUIRED_SERVICE_NOTE_SNIPPETS,
      subject: `Service \`${CHATGPT_GATEWAY_SERVICE}\``
    })
  ];
}

function validateOpenAiProviderContract(value: unknown): readonly Diagnostic[] {
  const provider = findNamedEntry({
    value,
    arrayField: 'providers',
    idField: 'id',
    id: OPENAI_PROVIDER
  });

  if (provider.entry === null) {
    return [
      createDiagnostic(
        EXTERNAL_PROVIDERS_FILE,
        'providers',
        'External provider catalog must include `openai` for ChatGPT Apps SDK/MCP host boundaries.'
      )
    ];
  }

  return [
    ...validateRequiredStringArray({
      entry: provider.entry,
      basePath: provider.path,
      file: EXTERNAL_PROVIDERS_FILE,
      field: 'categories',
      requiredEntries: REQUIRED_OPENAI_CATEGORIES,
      subject: 'External provider `openai`'
    }),
    ...validateRequiredTextSnippets({
      entry: provider.entry,
      basePath: provider.path,
      file: EXTERNAL_PROVIDERS_FILE,
      field: 'notes',
      requiredSnippets: REQUIRED_OPENAI_NOTE_SNIPPETS,
      subject: 'External provider `openai`'
    })
  ];
}

function validateRequiredValues(input: {
  readonly entry: Record<string, unknown>;
  readonly basePath: string;
  readonly file: string;
  readonly requiredValues: readonly RequiredValue[];
  readonly subject: string;
}): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const requiredValue of input.requiredValues) {
    const actual = readPath(input.entry, requiredValue.path);

    if (actual !== requiredValue.expected) {
      diagnostics.push(
        createDiagnostic(
          input.file,
          `${input.basePath}.${requiredValue.path}`,
          `${input.subject} must set \`${requiredValue.path}\` to \`${String(requiredValue.expected)}\`.`
        )
      );
    }
  }

  return diagnostics;
}

function validateRequiredEmptyArray(input: {
  readonly entry: Record<string, unknown>;
  readonly basePath: string;
  readonly file: string;
  readonly field: string;
  readonly subject: string;
}): readonly Diagnostic[] {
  const value = readPath(input.entry, input.field);

  if (Array.isArray(value) && value.length === 0) {
    return [];
  }

  return [
    createDiagnostic(
      input.file,
      `${input.basePath}.${input.field}`,
      `${input.subject} must keep \`${input.field}\` as an empty array.`
    )
  ];
}

function validateRequiredStringArray(input: {
  readonly entry: Record<string, unknown>;
  readonly basePath: string;
  readonly file: string;
  readonly field: string;
  readonly requiredEntries: readonly string[];
  readonly subject: string;
}): readonly Diagnostic[] {
  const value = readPath(input.entry, input.field);
  const entries = readStringArray(value);

  if (entries === null) {
    return [
      createDiagnostic(
        input.file,
        `${input.basePath}.${input.field}`,
        `${input.subject} must declare \`${input.field}\` as a string array.`
      )
    ];
  }

  return input.requiredEntries.flatMap((requiredEntry) =>
    entries.includes(requiredEntry)
      ? []
      : [
          createDiagnostic(
            input.file,
            `${input.basePath}.${input.field}`,
            `${input.subject} must include \`${requiredEntry}\` in \`${input.field}\`.`
          )
        ]
  );
}

function validateRequiredTextSnippets(input: {
  readonly entry: Record<string, unknown>;
  readonly basePath: string;
  readonly file: string;
  readonly field: string;
  readonly requiredSnippets: readonly string[];
  readonly subject: string;
}): readonly Diagnostic[] {
  const value = readPath(input.entry, input.field);
  const entries = readStringArray(value);

  if (entries === null) {
    return [
      createDiagnostic(
        input.file,
        `${input.basePath}.${input.field}`,
        `${input.subject} must declare \`${input.field}\` as a string array.`
      )
    ];
  }

  return input.requiredSnippets.flatMap((requiredSnippet) =>
    entries.some((entry) => entry.includes(requiredSnippet))
      ? []
      : [
          createDiagnostic(
            input.file,
            `${input.basePath}.${input.field}`,
            `${input.subject} must include \`${requiredSnippet}\` in \`${input.field}\`.`
          )
        ]
  );
}

function findNamedEntry(input: {
  readonly value: unknown;
  readonly arrayField: string;
  readonly idField: string;
  readonly id: string;
}): { readonly entry: Record<string, unknown> | null; readonly path: string } {
  if (!isRecord(input.value)) {
    return { entry: null, path: input.arrayField };
  }

  const entries = input.value[input.arrayField];

  if (!Array.isArray(entries)) {
    return { entry: null, path: input.arrayField };
  }

  for (const [index, entry] of entries.entries()) {
    if (!isRecord(entry)) {
      continue;
    }

    const id = entry[input.idField];

    if (typeof id === 'string' && id.trim() === input.id) {
      return {
        entry,
        path: `${input.arrayField}[${index}:${input.id}]`
      };
    }
  }

  return { entry: null, path: input.arrayField };
}

function readPath(value: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (!isRecord(current)) {
      return undefined;
    }

    return current[segment];
  }, value);
}

function readStringArray(value: unknown): readonly string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const entries = value.filter((entry): entry is string => typeof entry === 'string');

  return entries.length === value.length ? entries : null;
}

function hasAnyStringArrayEntry(
  entry: Record<string, unknown> | null,
  field: string,
  expectedEntries: readonly string[]
): boolean {
  if (entry === null) {
    return false;
  }

  const values = readStringArray(readPath(entry, field));

  return values !== null && expectedEntries.some((expected) => values.includes(expected));
}

function hasAnyTextSnippet(
  entry: Record<string, unknown> | null,
  field: string,
  snippets: readonly string[]
): boolean {
  if (entry === null) {
    return false;
  }

  const values = readStringArray(readPath(entry, field));

  return (
    values !== null &&
    snippets.some((snippet) => values.some((value) => value.includes(snippet)))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function createDiagnostic(
  file: string,
  path: string,
  message: string
): Diagnostic {
  return {
    ruleId: RULE_ID,
    severity: 'error',
    file,
    path,
    message
  };
}
