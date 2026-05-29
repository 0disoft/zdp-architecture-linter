import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { Diagnostic } from './diagnostics.ts';

const CORE_REPOSITORY_NAME = 'zdp-core-platform';
const CORE_CONTRACT_RULE_ID = 'ZDP-CORE-001';

const CORE_BOUNDARIES_FILE = 'contracts/core-boundaries.yaml';
const COMMAND_ENVELOPE_FILE = 'contracts/command-envelope.yaml';
const AUDIT_EVENT_FILE = 'contracts/audit-event.yaml';
const CONSENT_RECORD_FILE = 'contracts/consent-record.yaml';

const REQUIRED_BOUNDARIES = [
  'identity',
  'accounts',
  'access',
  'consent',
  'audit'
] as const;

const REQUIRED_BOUNDARY_FIELDS = [
  'owns',
  'must_not_own',
  'db_schema',
  'db_role',
  'audit_required',
  'split_trigger'
] as const;

const REQUIRED_RBAC_ROLES = [
  'owner',
  'admin',
  'member',
  'viewer',
  'service_account'
] as const;

const REQUIRED_COMMAND_FIELDS = [
  'command_id',
  'actor_id',
  'tenant_id',
  'reason',
  'idempotency_key'
] as const;

const REQUIRED_AUDIT_FORBIDDEN_VALUES = [
  'raw_secret',
  'token',
  'authorization_header',
  'raw_personal_payload'
] as const;

const REQUIRED_CONSENT_FIELDS = [
  'purpose',
  'scope',
  'withdrawal_record',
  'evidence_ref'
] as const;

export async function validateRepositoryCoreContract(input: {
  readonly repositoryRoot: string | undefined;
  readonly repositoryServiceContract: unknown;
}): Promise<readonly Diagnostic[]> {
  if (
    input.repositoryRoot === undefined ||
    readRepositoryName(input.repositoryServiceContract) !== CORE_REPOSITORY_NAME
  ) {
    return [];
  }

  const [boundaries, commandEnvelope, auditEvent, consentRecord] =
    await Promise.all([
      readRequiredYamlContract(input.repositoryRoot, CORE_BOUNDARIES_FILE),
      readRequiredYamlContract(input.repositoryRoot, COMMAND_ENVELOPE_FILE),
      readRequiredYamlContract(input.repositoryRoot, AUDIT_EVENT_FILE),
      readRequiredYamlContract(input.repositoryRoot, CONSENT_RECORD_FILE)
    ]);

  return [
    ...boundaries.diagnostics,
    ...commandEnvelope.diagnostics,
    ...auditEvent.diagnostics,
    ...consentRecord.diagnostics,
    ...(boundaries.value === null ? [] : validateCoreBoundaries(boundaries.value)),
    ...(commandEnvelope.value === null
      ? []
      : validateRequiredStringArrayEntries({
          value: commandEnvelope.value,
          file: COMMAND_ENVELOPE_FILE,
          path: 'required_fields',
          field: 'required_fields',
          requiredEntries: REQUIRED_COMMAND_FIELDS
        })),
    ...(auditEvent.value === null
      ? []
      : validateRequiredStringArrayEntries({
          value: auditEvent.value,
          file: AUDIT_EVENT_FILE,
          path: 'forbidden_payload_values',
          field: 'forbidden_payload_values',
          requiredEntries: REQUIRED_AUDIT_FORBIDDEN_VALUES
        })),
    ...(consentRecord.value === null
      ? []
      : validateConsentRecordContract(consentRecord.value))
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
          createCoreDiagnostic(
            file,
            'repository.root',
            `Core platform repository must include \`${file}\`.`
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
        createCoreDiagnostic(
          file,
          'yaml',
          `Core platform contract \`${file}\` must be valid YAML: ${formatError(
            error
          )}`
        )
      ]
    };
  }
}

function validateCoreBoundaries(value: unknown): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  diagnostics.push(
    ...validateRequiredStringArrayEntries({
      value,
      file: CORE_BOUNDARIES_FILE,
      path: 'permission_model.roles',
      field: 'permission_model.roles',
      requiredEntries: REQUIRED_RBAC_ROLES
    })
  );

  if (readPath(value, 'authorization.final_decision_owner') !== 'access') {
    diagnostics.push(
      createCoreDiagnostic(
        CORE_BOUNDARIES_FILE,
        'authorization.final_decision_owner',
        'Core platform final authorization owner must be `access`.'
      )
    );
  }

  const boundaries = readPath(value, 'boundaries');

  if (!Array.isArray(boundaries)) {
    diagnostics.push(
      createCoreDiagnostic(
        CORE_BOUNDARIES_FILE,
        'boundaries',
        'Core platform boundaries contract must declare a `boundaries` array.'
      )
    );
    return diagnostics;
  }

  const boundaryById = new Map<string, Record<string, unknown>>();

  for (const boundary of boundaries) {
    if (!isRecord(boundary)) {
      continue;
    }

    const id = readStringField(boundary, 'id');

    if (id !== null) {
      boundaryById.set(id, boundary);
    }
  }

  for (const boundaryId of REQUIRED_BOUNDARIES) {
    const boundary = boundaryById.get(boundaryId);

    if (boundary === undefined) {
      diagnostics.push(
        createCoreDiagnostic(
          CORE_BOUNDARIES_FILE,
          `boundaries.${boundaryId}`,
          `Core platform boundaries contract must declare \`${boundaryId}\` boundary.`
        )
      );
      continue;
    }

    for (const field of REQUIRED_BOUNDARY_FIELDS) {
      if (hasRequiredBoundaryField(boundary, field)) {
        continue;
      }

      diagnostics.push(
        createCoreDiagnostic(
          CORE_BOUNDARIES_FILE,
          `boundaries.${boundaryId}.${field}`,
          `Core platform boundary \`${boundaryId}\` must declare non-empty \`${field}\`.`
        )
      );
    }
  }

  return diagnostics;
}

function validateConsentRecordContract(value: unknown): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  diagnostics.push(
    ...validateRequiredStringArrayEntries({
      value,
      file: CONSENT_RECORD_FILE,
      path: 'required_fields',
      field: 'required_fields',
      requiredEntries: REQUIRED_CONSENT_FIELDS.filter(
        (field) => field !== 'withdrawal_record'
      )
    })
  );

  if (!isRecord(readPath(value, 'withdrawal_record'))) {
    diagnostics.push(
      createCoreDiagnostic(
        CONSENT_RECORD_FILE,
        'withdrawal_record',
        'Core platform consent contract must declare `withdrawal_record`.'
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
      createCoreDiagnostic(
        input.file,
        input.path,
        `Core platform contract \`${input.file}\` must include \`${requiredEntry}\` in \`${input.field}\`.`
      )
    );
  }

  return diagnostics;
}

function hasRequiredBoundaryField(
  boundary: Record<string, unknown>,
  field: string
): boolean {
  const value = boundary[field];

  if (Array.isArray(value)) {
    return value.some(
      (entry) => typeof entry === 'string' && entry.trim().length > 0
    );
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  return typeof value === 'boolean';
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

function createCoreDiagnostic(
  file: string,
  path: string,
  message: string
): Diagnostic {
  return {
    ruleId: CORE_CONTRACT_RULE_ID,
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
