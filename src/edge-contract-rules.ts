import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { Diagnostic } from './diagnostics.ts';

const EDGE_REPOSITORY_NAME = 'zdp-edge-workers';
const EDGE_CONTRACT_RULE_ID = 'ZDP-EDGE-001';

const REQUEST_BOUNDARY_FILE = 'contracts/request-boundary.yaml';
const WEBHOOK_INGRESS_FILE = 'contracts/webhook-ingress.yaml';
const QUEUE_ENVELOPE_FILE = 'contracts/queue-envelope.yaml';
const ANALYTICS_INGRESS_FILE = 'contracts/analytics-ingress.yaml';
const EDGE_ANALYTICS_SOURCE_FILE = 'src/analytics/ingress.ts';
const EDGE_APP_TEST_FILE = 'tests/app.test.ts';

const REQUIRED_FORBIDDEN_LOG_VALUES = [
  'authorization',
  'cookie',
  'webhook payload body',
  'signed url secret'
] as const;

const REQUIRED_EDGE_DECISIONS = [
  'malformed request',
  'route not found',
  'rate limit precheck',
  'webhook signature precheck'
] as const;

const REQUIRED_DELEGATED_DECISIONS = [
  'final authorization',
  'entitlement',
  'ledger or credit mutation',
  'privacy data access'
] as const;

const REQUIRED_WEBHOOK_CONTROLS = [
  'signature verification',
  'provider event id extraction',
  'idempotency key propagation',
  'retry-safe response mapping',
  'dead-letter handoff'
] as const;

const REQUIRED_WEBHOOK_FORBIDDEN_CONTROLS = [
  'payment finalization at edge',
  'ledger posting at edge',
  'credential vault direct read'
] as const;

const REQUIRED_QUEUE_FIELDS = [
  'job_id',
  'job_type',
  'schema_version',
  'idempotency_key',
  'created_at',
  'trace_id',
  'request_id',
  'payload_ref'
] as const;

const REQUIRED_QUEUE_FORBIDDEN_FIELDS = [
  'raw secrets',
  'authorization headers',
  'cookies',
  'payment payload bodies'
] as const;

const REQUIRED_ANALYTICS_EVENTS = [
  'web.page-viewed',
  'product.signup-started',
  'product.signup-completed',
  'product.activation-completed',
  'experiment.exposure-recorded',
  'billing.checkout-started'
] as const;

const REQUIRED_ANALYTICS_PRECHECKS = [
  'malformed request',
  'event name allowlist',
  'schema version present',
  'schema version pinned to numeric 1',
  'request id present',
  'trace id propagation',
  'idempotency key present',
  'idempotency key equals event_id'
] as const;

const REQUIRED_ANALYTICS_FIELDS = [
  'event_id',
  'event_name',
  'schema_version',
  'source',
  'product_id',
  'occurred_at',
  'request_id',
  'trace_id',
  'idempotency_key'
] as const;

const REQUIRED_ANALYTICS_FORBIDDEN_LOG_VALUES = [
  'raw customer payload',
  'form body',
  'prompt body',
  'authorization',
  'cookie',
  'secret',
  'token',
  'payment payload'
] as const;

const REQUIRED_ANALYTICS_FORBIDDEN_DECISIONS = [
  'final authorization',
  'entitlement',
  'ledger or credit mutation',
  'identity truth',
  'consent truth'
] as const;

const REQUIRED_ANALYTICS_ACTIVATION_GATES = [
  'configured Cloudflare Queue producer binding',
  'successful producer send',
  'downstream queue consumer',
  'durable downstream idempotency and conflict handling'
] as const;

export async function validateRepositoryEdgeContract(input: {
  readonly repositoryRoot: string | undefined;
  readonly repositoryServiceContract: unknown;
}): Promise<readonly Diagnostic[]> {
  if (
    input.repositoryRoot === undefined ||
    readRepositoryName(input.repositoryServiceContract) !== EDGE_REPOSITORY_NAME
  ) {
    return [];
  }

  const [requestBoundary, webhookIngress, queueEnvelope, analyticsIngress] =
    await Promise.all([
      readRequiredYamlContract(input.repositoryRoot, REQUEST_BOUNDARY_FILE),
      readRequiredYamlContract(input.repositoryRoot, WEBHOOK_INGRESS_FILE),
      readRequiredYamlContract(input.repositoryRoot, QUEUE_ENVELOPE_FILE),
      readRequiredYamlContract(input.repositoryRoot, ANALYTICS_INGRESS_FILE)
    ]);
  const [analyticsSource, appTestSource] = await Promise.all([
    readRequiredTextFile(input.repositoryRoot, EDGE_ANALYTICS_SOURCE_FILE),
    readRequiredTextFile(input.repositoryRoot, EDGE_APP_TEST_FILE)
  ]);

  return [
    ...requestBoundary.diagnostics,
    ...webhookIngress.diagnostics,
    ...queueEnvelope.diagnostics,
    ...analyticsIngress.diagnostics,
    ...analyticsSource.diagnostics,
    ...appTestSource.diagnostics,
    ...(requestBoundary.value === null
      ? []
      : validateRequestBoundaryContract(requestBoundary.value)),
    ...(webhookIngress.value === null
      ? []
      : validateWebhookIngressContract(webhookIngress.value)),
    ...(queueEnvelope.value === null
      ? []
      : validateQueueEnvelopeContract(queueEnvelope.value)),
    ...(analyticsIngress.value === null
      ? []
      : validateAnalyticsIngressContract(analyticsIngress.value)),
    ...(analyticsSource.source === null
      ? []
      : validateAnalyticsSourceSurface(analyticsSource.source)),
    ...(appTestSource.source === null
      ? []
      : validateAnalyticsTestSurface(appTestSource.source))
  ];
}

async function readRequiredYamlContract(
  repositoryRoot: string,
  file: string
): Promise<{
  readonly value: unknown | null;
  readonly diagnostics: readonly Diagnostic[];
}> {
  let source: string;

  try {
    source = await readFile(join(repositoryRoot, file), 'utf8');
  } catch (error) {
    if (isMissingPathError(error)) {
      return {
        value: null,
        diagnostics: [
          createEdgeDiagnostic(
            file,
            'repository.root',
            `Edge worker repository must include \`${file}\`.`
          )
        ]
      };
    }

    throw error;
  }

  try {
    return {
      value: parse(source) as unknown,
      diagnostics: []
    };
  } catch (error) {
    return {
      value: null,
      diagnostics: [
        createEdgeDiagnostic(
          file,
          'yaml',
          `Edge worker contract \`${file}\` must be valid YAML: ${formatError(
            error
          )}`
        )
      ]
    };
  }
}

async function readRequiredTextFile(
  repositoryRoot: string,
  file: string
): Promise<{
  readonly source: string | null;
  readonly diagnostics: readonly Diagnostic[];
}> {
  try {
    return {
      source: await readFile(join(repositoryRoot, file), 'utf8'),
      diagnostics: []
    };
  } catch (error) {
    if (isMissingPathError(error)) {
      return {
        source: null,
        diagnostics: [
          createEdgeDiagnostic(
            file,
            'repository.root',
            `Edge worker repository must include \`${file}\`.`
          )
        ]
      };
    }

    throw error;
  }
}

function validateRequestBoundaryContract(value: unknown): readonly Diagnostic[] {
  return [
    ...validateRequiredStringArrayEntries({
      value,
      file: REQUEST_BOUNDARY_FILE,
      path: 'edge_request_contract.required_headers',
      field: 'edge_request_contract.required_headers',
      requiredEntries: ['x-request-id']
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: REQUEST_BOUNDARY_FILE,
      path: 'edge_request_contract.propagated_headers',
      field: 'edge_request_contract.propagated_headers',
      requiredEntries: ['traceparent', 'x-request-id']
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: REQUEST_BOUNDARY_FILE,
      path: 'edge_request_contract.forbidden_in_logs',
      field: 'edge_request_contract.forbidden_in_logs',
      requiredEntries: REQUIRED_FORBIDDEN_LOG_VALUES
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: REQUEST_BOUNDARY_FILE,
      path: 'decisions.edge_can_decide',
      field: 'decisions.edge_can_decide',
      requiredEntries: REQUIRED_EDGE_DECISIONS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: REQUEST_BOUNDARY_FILE,
      path: 'decisions.edge_must_delegate',
      field: 'decisions.edge_must_delegate',
      requiredEntries: REQUIRED_DELEGATED_DECISIONS
    })
  ];
}

function validateWebhookIngressContract(value: unknown): readonly Diagnostic[] {
  return [
    ...validateExactValue({
      value,
      file: WEBHOOK_INGRESS_FILE,
      path: 'webhook_ingress.status',
      expected: 'contract-only',
      message: 'Edge webhook ingress must remain `contract-only` before Worker implementation.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: WEBHOOK_INGRESS_FILE,
      path: 'webhook_ingress.required_controls',
      field: 'webhook_ingress.required_controls',
      requiredEntries: REQUIRED_WEBHOOK_CONTROLS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: WEBHOOK_INGRESS_FILE,
      path: 'webhook_ingress.forbidden_controls',
      field: 'webhook_ingress.forbidden_controls',
      requiredEntries: REQUIRED_WEBHOOK_FORBIDDEN_CONTROLS
    })
  ];
}

function validateQueueEnvelopeContract(value: unknown): readonly Diagnostic[] {
  return [
    ...validateExactValue({
      value,
      file: QUEUE_ENVELOPE_FILE,
      path: 'queue_envelope.schema_version',
      expected: 1,
      message: 'Edge queue envelope schema version must be 1.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: QUEUE_ENVELOPE_FILE,
      path: 'queue_envelope.required_fields',
      field: 'queue_envelope.required_fields',
      requiredEntries: REQUIRED_QUEUE_FIELDS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: QUEUE_ENVELOPE_FILE,
      path: 'queue_envelope.forbidden_fields',
      field: 'queue_envelope.forbidden_fields',
      requiredEntries: REQUIRED_QUEUE_FORBIDDEN_FIELDS
    })
  ];
}

function validateAnalyticsIngressContract(value: unknown): readonly Diagnostic[] {
  return [
    ...validateExactValue({
      value,
      file: ANALYTICS_INGRESS_FILE,
      path: 'analytics_ingress.status',
      expected: 'contract-only',
      message:
        'Edge analytics ingress must remain `contract-only` before collector route implementation.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: ANALYTICS_INGRESS_FILE,
      path: 'analytics_ingress.accepted_events',
      field: 'analytics_ingress.accepted_events',
      requiredEntries: REQUIRED_ANALYTICS_EVENTS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: ANALYTICS_INGRESS_FILE,
      path: 'analytics_ingress.edge_prechecks',
      field: 'analytics_ingress.edge_prechecks',
      requiredEntries: REQUIRED_ANALYTICS_PRECHECKS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: ANALYTICS_INGRESS_FILE,
      path: 'analytics_ingress.required_fields',
      field: 'analytics_ingress.required_fields',
      requiredEntries: REQUIRED_ANALYTICS_FIELDS
    }),
    ...validateExactValue({
      value,
      file: ANALYTICS_INGRESS_FILE,
      path: 'analytics_ingress.handoff.target',
      expected: 'zdp-data-platform',
      message:
        'Edge analytics ingress must hand off analytics events to `zdp-data-platform`.'
    }),
    ...validateExactValue({
      value,
      file: ANALYTICS_INGRESS_FILE,
      path: 'analytics_ingress.handoff.service_id',
      expected: 'data-platform',
      message:
        'Edge analytics ingress must hand off analytics events to `data-platform` service.'
    }),
    ...validateExactValue({
      value,
      file: ANALYTICS_INGRESS_FILE,
      path: 'analytics_ingress.handoff.queue',
      expected: 'analytics-events',
      message:
        'Edge analytics ingress must enqueue accepted analytics events to `analytics-events`.'
    }),
    ...validateExactValue({
      value,
      file: ANALYTICS_INGRESS_FILE,
      path: 'analytics_ingress.handoff.dead_letter_queue',
      expected: 'analytics-events-dlq',
      message:
        'Edge analytics ingress must declare `analytics-events-dlq` as dead-letter handoff.'
    }),
    ...validateExactValue({
      value,
      file: ANALYTICS_INGRESS_FILE,
      path: 'analytics_ingress.handoff.runtime_validator',
      expected: 'zdp-data-platform/src/analytics-ingest/runtime.ts',
      message:
        'Edge analytics ingress must document the data-platform runtime validator handoff.'
    }),
    ...validateExactValue({
      value,
      file: ANALYTICS_INGRESS_FILE,
      path: 'analytics_ingress.runtime_activation.status',
      expected: 'blocked',
      message:
        'Edge analytics ingress runtime must remain blocked until producer and consumer durability are implemented.'
    }),
    ...validateExactValue({
      value,
      file: ANALYTICS_INGRESS_FILE,
      path: 'analytics_ingress.runtime_activation.current_response_status',
      expected: 503,
      message:
        'Edge analytics ingress must fail closed with 503 before durable queue handoff activation.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: ANALYTICS_INGRESS_FILE,
      path: 'analytics_ingress.runtime_activation.accepted_response_requires',
      field: 'analytics_ingress.runtime_activation.accepted_response_requires',
      requiredEntries: REQUIRED_ANALYTICS_ACTIVATION_GATES
    }),
    ...validateExactValue({
      value,
      file: ANALYTICS_INGRESS_FILE,
      path: 'analytics_ingress.direct_clickhouse_write',
      expected: 'forbidden',
      message:
        'Edge analytics ingress must forbid direct ClickHouse writes.'
    }),
    ...validateExactValue({
      value,
      file: ANALYTICS_INGRESS_FILE,
      path: 'analytics_ingress.final_truth_owner',
      expected: 'zdp-data-platform',
      message:
        'Edge analytics ingress must keep analytics truth ownership in `zdp-data-platform`.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: ANALYTICS_INGRESS_FILE,
      path: 'analytics_ingress.forbidden_in_logs',
      field: 'analytics_ingress.forbidden_in_logs',
      requiredEntries: REQUIRED_ANALYTICS_FORBIDDEN_LOG_VALUES
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: ANALYTICS_INGRESS_FILE,
      path: 'analytics_ingress.forbidden_decisions',
      field: 'analytics_ingress.forbidden_decisions',
      requiredEntries: REQUIRED_ANALYTICS_FORBIDDEN_DECISIONS
    })
  ];
}

function validateAnalyticsSourceSurface(source: string): readonly Diagnostic[] {
  return validateSourceIncludes({
    file: EDGE_ANALYTICS_SOURCE_FILE,
    source,
    requiredFragments: [
      'precheckAnalyticsIngress',
      'schema_version',
      'input.payload.schema_version !== 1',
      'invalid_schema_version',
      'idempotencyKey !== eventId',
      'idempotency_mismatch',
      'analytics.event.ingest',
      'analytics-event://',
      "target: 'zdp-data-platform'",
      "queue: 'analytics-events'"
    ]
  });
}

function validateAnalyticsTestSurface(source: string): readonly Diagnostic[] {
  return validateSourceIncludes({
    file: EDGE_APP_TEST_FILE,
    source,
    requiredFragments: [
      'fails closed for an allowlisted analytics event until durable queue handoff exists',
      'analytics_queue_unavailable',
      'rejects analytics events with schema_version that data runtime will reject',
      'rejects analytics events whose idempotency key would fail data runtime consistency',
      'invalid_schema_version',
      'idempotency_mismatch',
      'prechecks analytics events without owning final analytics storage'
    ]
  });
}

function validateSourceIncludes(input: {
  readonly file: string;
  readonly source: string;
  readonly requiredFragments: readonly string[];
}): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const fragment of input.requiredFragments) {
    if (input.source.includes(fragment)) {
      continue;
    }

    diagnostics.push(
      createEdgeDiagnostic(
        input.file,
        'source',
        `Edge worker source must include \`${fragment}\`.`
      )
    );
  }

  return diagnostics;
}

function validateRequiredStringArrayEntries(input: {
  readonly value: unknown;
  readonly file: string;
  readonly path: string;
  readonly field: string;
  readonly requiredEntries: readonly string[];
}): readonly Diagnostic[] {
  const entries = readStringArrayPath(input.value, input.field);
  const diagnostics: Diagnostic[] = [];

  for (const requiredEntry of input.requiredEntries) {
    if (entries.includes(requiredEntry)) {
      continue;
    }

    diagnostics.push(
      createEdgeDiagnostic(
        input.file,
        input.path,
        `Edge worker contract \`${input.file}\` must include \`${requiredEntry}\` in \`${input.field}\`.`
      )
    );
  }

  return diagnostics;
}

function validateExactValue(input: {
  readonly value: unknown;
  readonly file: string;
  readonly path: string;
  readonly expected: unknown;
  readonly message: string;
}): readonly Diagnostic[] {
  const actual = readPath(input.value, input.path);

  if (actual === input.expected) {
    return [];
  }

  return [createEdgeDiagnostic(input.file, input.path, input.message)];
}

function readRepositoryName(value: unknown): string | null {
  if (!isRecord(value) || !isRecord(value.service)) {
    return null;
  }

  return readStringField(value.service, 'repo');
}

function readStringArrayPath(value: unknown, path: string): readonly string[] {
  const candidate = readPath(value, path);

  if (!Array.isArray(candidate)) {
    return [];
  }

  return candidate.flatMap((entry) =>
    typeof entry === 'string' && entry.trim().length > 0 ? [entry.trim()] : []
  );
}

function readPath(value: unknown, path: string): unknown {
  let current = value;

  for (const segment of path.split('.')) {
    if (!isRecord(current)) {
      return undefined;
    }

    current = current[segment];
  }

  return current;
}

function readStringField(
  value: Record<string, unknown>,
  field: string
): string | null {
  const candidate = value[field];

  return typeof candidate === 'string' && candidate.trim().length > 0
    ? candidate.trim()
    : null;
}

function createEdgeDiagnostic(
  file: string,
  path: string,
  message: string
): Diagnostic {
  return {
    ruleId: EDGE_CONTRACT_RULE_ID,
    severity: 'error',
    file,
    path,
    message
  };
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isMissingPathError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
