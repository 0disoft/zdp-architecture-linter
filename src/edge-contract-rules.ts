import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { Diagnostic } from './diagnostics.ts';

const EDGE_REPOSITORY_NAME = 'zdp-edge-workers';
const EDGE_CONTRACT_RULE_ID = 'ZDP-EDGE-001';

const REQUEST_BOUNDARY_FILE = 'contracts/request-boundary.yaml';
const WEBHOOK_INGRESS_FILE = 'contracts/webhook-ingress.yaml';
const QUEUE_ENVELOPE_FILE = 'contracts/queue-envelope.yaml';

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

  const [requestBoundary, webhookIngress, queueEnvelope] = await Promise.all([
    readRequiredYamlContract(input.repositoryRoot, REQUEST_BOUNDARY_FILE),
    readRequiredYamlContract(input.repositoryRoot, WEBHOOK_INGRESS_FILE),
    readRequiredYamlContract(input.repositoryRoot, QUEUE_ENVELOPE_FILE)
  ]);

  return [
    ...requestBoundary.diagnostics,
    ...webhookIngress.diagnostics,
    ...queueEnvelope.diagnostics,
    ...(requestBoundary.value === null
      ? []
      : validateRequestBoundaryContract(requestBoundary.value)),
    ...(webhookIngress.value === null
      ? []
      : validateWebhookIngressContract(webhookIngress.value)),
    ...(queueEnvelope.value === null
      ? []
      : validateQueueEnvelopeContract(queueEnvelope.value))
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
