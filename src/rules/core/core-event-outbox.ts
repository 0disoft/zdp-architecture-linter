import type { Diagnostic } from '../../diagnostics.ts';
import {
  createCoreDiagnostic,
  readPath,
  validateExactValue,
  validateRequiredStringArrayEntries
} from './contract-helpers.ts';
import { CORE_REPOSITORY_NAME } from './core-repository.ts';

export const CORE_EVENT_OUTBOX_FILE = 'contracts/core-event-outbox.yaml';

export const CORE_EVENT_OUTBOX_STATUS =
  'migration_shape_declared_no_dispatcher';

const REQUIRED_CORE_EVENT_OUTBOX_PRODUCED_EVENTS = [
  'core.account.restricted',
  'core.account.restriction_cleared',
  'core.identity.email_verified',
  'core.identity.security_pin_changed',
  'core.identity.human_readiness_changed',
  'core.permission.role_assignment_changed',
  'core.access.api_key_changed',
  'core.consent.withdrawn'
] as const;

const REQUIRED_CORE_EVENT_OUTBOX_MONEY_RELEVANT_EVENTS = [
  'core.account.restricted',
  'core.account.restriction_cleared',
  'core.identity.email_verified',
  'core.identity.security_pin_changed',
  'core.identity.human_readiness_changed'
] as const;

const REQUIRED_CORE_EVENT_OUTBOX_FIELDS = [
  'cloud_event_id',
  'cloud_event_source',
  'cloud_event_type',
  'schema_version',
  'aggregate_type',
  'aggregate_id',
  'tenant_id',
  'actor_id',
  'subject_ref',
  'payload_ref',
  'redacted_summary',
  'causation_command_id',
  'idempotency_key',
  'audit_event_ref',
  'trace_id',
  'occurred_at',
  'available_at'
] as const;

const REQUIRED_CORE_EVENT_OUTBOX_DELIVERY_ATTEMPT_FIELDS = [
  'core_event_outbox_id',
  'consumer_service_id',
  'attempt_number',
  'delivery_state',
  'dispatcher_ref',
  'attempted_at',
  'audit_event_ref',
  'trace_id'
] as const;

const REQUIRED_CORE_EVENT_OUTBOX_CONTROLS = [
  'outbox_rows_are_append_only',
  'delivery_attempt_rows_are_append_only',
  'cloud_event_id_unique',
  'schema_version_positive_integer',
  'event_type_aggregate_command_unique',
  'payload_reference_only',
  'redacted_summary_only',
  'audit_event_reference_required',
  'command_idempotency_reference_required',
  'trace_reference_required',
  'dispatcher_ref_required_for_delivery_attempts',
  'no_dispatcher_claim_until_worker_exists'
] as const;

const REQUIRED_CORE_EVENT_OUTBOX_FORBIDDEN_VALUES = [
  'raw_password',
  'password_plaintext',
  'security_pin_plaintext',
  'raw_email',
  'phone_number',
  'authorization_header',
  'cookie_header',
  'refresh_token_plaintext',
  'provider_secret',
  'raw_personal_payload'
] as const;

const REQUIRED_CORE_EVENT_OUTBOX_FORBIDDEN_CLAIMS = [
  'event_dispatcher_ready',
  'event_replay_ready',
  'money_platform_realtime_sync_ready',
  'product_route_unblocked'
] as const;

export function validateCoreEventOutboxContract(
  value: unknown
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (readPath(value, 'contract.status') !== CORE_EVENT_OUTBOX_STATUS) {
    diagnostics.push(
      createCoreDiagnostic(
        CORE_EVENT_OUTBOX_FILE,
        'contract.status',
        `Core platform event outbox contract must stay \`${CORE_EVENT_OUTBOX_STATUS}\` until dispatcher and replay workers exist.`
      )
    );
  }

  if (readPath(value, 'contract.owner') !== CORE_REPOSITORY_NAME) {
    diagnostics.push(
      createCoreDiagnostic(
        CORE_EVENT_OUTBOX_FILE,
        'contract.owner',
        `Core platform event outbox contract must keep owner \`${CORE_REPOSITORY_NAME}\`.`
      )
    );
  }

  diagnostics.push(
    ...validateExactValue({
      value,
      file: CORE_EVENT_OUTBOX_FILE,
      path: 'runtime.live_dispatcher_implemented',
      field: 'runtime.live_dispatcher_implemented',
      expected: false,
      message:
        'Core platform event outbox contract must keep live_dispatcher_implemented false until dispatcher proof exists.'
    }),
    ...validateExactValue({
      value,
      file: CORE_EVENT_OUTBOX_FILE,
      path: 'runtime.consumer_inbox_implemented',
      field: 'runtime.consumer_inbox_implemented',
      expected: false,
      message:
        'Core platform event outbox contract must keep consumer_inbox_implemented false until consumer inbox proof exists.'
    }),
    ...validateExactValue({
      value,
      file: CORE_EVENT_OUTBOX_FILE,
      path: 'runtime.replay_worker_implemented',
      field: 'runtime.replay_worker_implemented',
      expected: false,
      message:
        'Core platform event outbox contract must keep replay_worker_implemented false until replay worker proof exists.'
    }),
    ...validateExactValue({
      value,
      file: CORE_EVENT_OUTBOX_FILE,
      path: 'runtime.production_route_unblocked',
      field: 'runtime.production_route_unblocked',
      expected: false,
      message:
        'Core platform event outbox contract must keep production_route_unblocked false until dispatcher and consumer proof exist.'
    }),
    ...validateExactValue({
      value,
      file: CORE_EVENT_OUTBOX_FILE,
      path: 'events.cloud_events_required',
      field: 'events.cloud_events_required',
      expected: true,
      message:
        'Core platform event outbox contract must require CloudEvents-compatible records.'
    }),
    ...validateExactValue({
      value,
      file: CORE_EVENT_OUTBOX_FILE,
      path: 'events.source',
      field: 'events.source',
      expected: CORE_REPOSITORY_NAME,
      message:
        `Core platform event outbox contract must keep events.source \`${CORE_REPOSITORY_NAME}\`.`
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: CORE_EVENT_OUTBOX_FILE,
      path: 'events.produced',
      field: 'events.produced',
      requiredEntries: REQUIRED_CORE_EVENT_OUTBOX_PRODUCED_EVENTS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: CORE_EVENT_OUTBOX_FILE,
      path: 'events.money_relevant',
      field: 'events.money_relevant',
      requiredEntries: REQUIRED_CORE_EVENT_OUTBOX_MONEY_RELEVANT_EVENTS
    }),
    ...validateExactValue({
      value,
      file: CORE_EVENT_OUTBOX_FILE,
      path: 'storage.outbox_table',
      field: 'storage.outbox_table',
      expected: 'audit.core_event_outbox',
      message:
        'Core platform event outbox contract must keep storage.outbox_table `audit.core_event_outbox`.'
    }),
    ...validateExactValue({
      value,
      file: CORE_EVENT_OUTBOX_FILE,
      path: 'storage.delivery_attempt_table',
      field: 'storage.delivery_attempt_table',
      expected: 'audit.core_event_delivery_attempts',
      message:
        'Core platform event outbox contract must keep storage.delivery_attempt_table `audit.core_event_delivery_attempts`.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: CORE_EVENT_OUTBOX_FILE,
      path: 'storage.append_only_tables',
      field: 'storage.append_only_tables',
      requiredEntries: [
        'audit.core_event_outbox',
        'audit.core_event_delivery_attempts'
      ]
    }),
    ...validateExactValue({
      value,
      file: CORE_EVENT_OUTBOX_FILE,
      path: 'storage.payload_ref_only',
      field: 'storage.payload_ref_only',
      expected: true,
      message:
        'Core platform event outbox contract must keep payload_ref_only true.'
    }),
    ...validateExactValue({
      value,
      file: CORE_EVENT_OUTBOX_FILE,
      path: 'storage.inline_personal_payload_allowed',
      field: 'storage.inline_personal_payload_allowed',
      expected: false,
      message:
        'Core platform event outbox contract must keep inline_personal_payload_allowed false.'
    }),
    ...validateExactValue({
      value,
      file: CORE_EVENT_OUTBOX_FILE,
      path: 'storage.inline_secret_payload_allowed',
      field: 'storage.inline_secret_payload_allowed',
      expected: false,
      message:
        'Core platform event outbox contract must keep inline_secret_payload_allowed false.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: CORE_EVENT_OUTBOX_FILE,
      path: 'required_outbox_fields',
      field: 'required_outbox_fields',
      requiredEntries: REQUIRED_CORE_EVENT_OUTBOX_FIELDS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: CORE_EVENT_OUTBOX_FILE,
      path: 'required_delivery_attempt_fields',
      field: 'required_delivery_attempt_fields',
      requiredEntries: REQUIRED_CORE_EVENT_OUTBOX_DELIVERY_ATTEMPT_FIELDS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: CORE_EVENT_OUTBOX_FILE,
      path: 'controls',
      field: 'controls',
      requiredEntries: REQUIRED_CORE_EVENT_OUTBOX_CONTROLS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: CORE_EVENT_OUTBOX_FILE,
      path: 'forbidden_values',
      field: 'forbidden_values',
      requiredEntries: REQUIRED_CORE_EVENT_OUTBOX_FORBIDDEN_VALUES
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: CORE_EVENT_OUTBOX_FILE,
      path: 'forbidden_claims',
      field: 'forbidden_claims',
      requiredEntries: REQUIRED_CORE_EVENT_OUTBOX_FORBIDDEN_CLAIMS
    })
  );

  return diagnostics;
}
