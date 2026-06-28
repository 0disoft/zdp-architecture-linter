import type { Diagnostic } from '../../diagnostics.ts';
import {
  createCoreDiagnostic,
  hasRequiredBoundaryField,
  isRecord,
  readPath,
  readStringField,
  validateRequiredStringArrayEntries
} from './contract-helpers.ts';

export const CORE_CI_WORKFLOW_FILE = '.github/workflows/ci.yml';
export const CORE_BOUNDARIES_FILE = 'contracts/core-boundaries.yaml';
export const COMMAND_ENVELOPE_FILE = 'contracts/command-envelope.yaml';
export const AUDIT_EVENT_FILE = 'contracts/audit-event.yaml';
export const CONSENT_RECORD_FILE = 'contracts/consent-record.yaml';

export const REQUIRED_COMMAND_FIELDS = [
  'command_id',
  'actor_id',
  'tenant_id',
  'reason',
  'idempotency_key'
] as const;

export const REQUIRED_AUDIT_FORBIDDEN_VALUES = [
  'raw_secret',
  'token',
  'authorization_header',
  'raw_personal_payload'
] as const;

const REQUIRED_CORE_CI_WORKFLOW_SNIPPETS = [
  'actions/checkout@v7',
  'dtolnay/rust-toolchain@stable',
  'components: rustfmt',
  'cargo fmt --check',
  'cargo check --locked --all-targets',
  'cargo test --locked',
  'permissions:',
  'contents: read',
  'pull_request:',
  'timeout-minutes: 15'
] as const;

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

const REQUIRED_CONSENT_FIELDS = [
  'purpose',
  'scope',
  'withdrawal_record',
  'evidence_ref'
] as const;

export function validateCoreCiWorkflow(source: string): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const snippet of REQUIRED_CORE_CI_WORKFLOW_SNIPPETS) {
    if (source.includes(snippet)) {
      continue;
    }

    diagnostics.push(
      createCoreDiagnostic(
        CORE_CI_WORKFLOW_FILE,
        'ci.workflow',
        `Core platform CI workflow must include \`${snippet}\`.`
      )
    );
  }

  return diagnostics;
}

export function validateCoreBoundaries(value: unknown): readonly Diagnostic[] {
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

export function validateConsentRecordContract(
  value: unknown
): readonly Diagnostic[] {
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
