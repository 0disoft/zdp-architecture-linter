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
  'core.account.restriction-cleared',
  'core.identity.email-verified',
  'core.identity.security-pin-changed',
  'core.identity.human-readiness-changed',
  'core.permission.role-assignment-changed',
  'core.access.api-key-changed',
  'core.consent.withdrawn'
] as const;

const REQUIRED_CORE_EVENT_OUTBOX_MONEY_RELEVANT_EVENTS = [
  'core.account.restricted',
  'core.account.restriction-cleared',
  'core.identity.email-verified',
  'core.identity.security-pin-changed',
  'core.identity.human-readiness-changed'
] as const;

const CORE_EVENT_OUTBOX_DEAD_LETTER_POLICY =
  'audit.core_event_delivery_attempts records failed delivery attempts before live dispatchers, consumer inboxes, replay workers, or money realtime sync exist';

const CORE_EVENT_DISPATCHER_CONSUMER_REPLAY_REVIEW_STATUS =
  'typed_dispatcher_consumer_replay_review_plan_no_worker';

const CORE_EVENT_DISPATCHER_CONSUMER_REPLAY_REVIEW_RECEIPT_STATUS =
  'typed_dispatcher_consumer_replay_review_receipt_no_worker';

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
  'replay_contract_required',
  'dead_letter_attempt_history_required',
  'dispatcher_consumer_replay_review_plan_required',
  'dispatcher_consumer_replay_review_receipt_required',
  'dispatcher_ref_required_for_delivery_attempts',
  'no_dispatcher_claim_until_worker_exists'
] as const;

const REQUIRED_CORE_EVENT_DISPATCHER_CONSUMER_REPLAY_PROMOTION_REVIEWS = [
  'dispatcher_worker_implementation_review',
  'consumer_inbox_contract_review',
  'replay_worker_contract_review',
  'dead_letter_replay_review',
  'money_realtime_sync_review',
  'product_route_unblock_review'
] as const;

const REQUIRED_CORE_EVENT_DISPATCHER_CONSUMER_REPLAY_CONTROLS = [
  'dispatcher_not_started',
  'consumer_inbox_not_started',
  'replay_worker_not_started',
  'dispatcher_claims_forbidden',
  'consumer_inbox_claims_forbidden',
  'replay_worker_claims_forbidden',
  'dead_letter_replay_review_required',
  'money_realtime_sync_review_required',
  'production_route_unblocked_false'
] as const;

const REQUIRED_CORE_EVENT_DISPATCHER_CONSUMER_REPLAY_RECEIPT_VALUES = [
  {
    path: 'dispatcher_consumer_replay_review_receipt.boundary_status',
    expected: CORE_EVENT_DISPATCHER_CONSUMER_REPLAY_REVIEW_RECEIPT_STATUS,
    message:
      `Core platform event outbox dispatcher/consumer/replay review receipt must keep boundary_status \`${CORE_EVENT_DISPATCHER_CONSUMER_REPLAY_REVIEW_RECEIPT_STATUS}\` until workers exist.`
  },
  {
    path: 'dispatcher_consumer_replay_review_receipt.dispatcher_review_checked',
    expected: true,
    message:
      'Core platform event outbox dispatcher/consumer/replay review receipt must check dispatcher review.'
  },
  {
    path: 'dispatcher_consumer_replay_review_receipt.consumer_inbox_contract_checked',
    expected: true,
    message:
      'Core platform event outbox dispatcher/consumer/replay review receipt must check consumer inbox contract.'
  },
  {
    path: 'dispatcher_consumer_replay_review_receipt.replay_worker_contract_checked',
    expected: true,
    message:
      'Core platform event outbox dispatcher/consumer/replay review receipt must check replay worker contract.'
  },
  {
    path: 'dispatcher_consumer_replay_review_receipt.dead_letter_replay_checked',
    expected: true,
    message:
      'Core platform event outbox dispatcher/consumer/replay review receipt must check dead-letter replay.'
  },
  {
    path: 'dispatcher_consumer_replay_review_receipt.money_realtime_sync_checked',
    expected: true,
    message:
      'Core platform event outbox dispatcher/consumer/replay review receipt must check money realtime sync.'
  },
  {
    path: 'dispatcher_consumer_replay_review_receipt.product_route_unblock_checked',
    expected: true,
    message:
      'Core platform event outbox dispatcher/consumer/replay review receipt must check product route unblock.'
  },
  {
    path: 'dispatcher_consumer_replay_review_receipt.dispatcher_worker_started',
    expected: false,
    message:
      'Core platform event outbox dispatcher/consumer/replay review receipt must keep dispatcher_worker_started false.'
  },
  {
    path: 'dispatcher_consumer_replay_review_receipt.consumer_inbox_enabled',
    expected: false,
    message:
      'Core platform event outbox dispatcher/consumer/replay review receipt must keep consumer_inbox_enabled false.'
  },
  {
    path: 'dispatcher_consumer_replay_review_receipt.replay_worker_enabled',
    expected: false,
    message:
      'Core platform event outbox dispatcher/consumer/replay review receipt must keep replay_worker_enabled false.'
  },
  {
    path: 'dispatcher_consumer_replay_review_receipt.money_realtime_sync_enabled',
    expected: false,
    message:
      'Core platform event outbox dispatcher/consumer/replay review receipt must keep money_realtime_sync_enabled false.'
  },
  {
    path: 'dispatcher_consumer_replay_review_receipt.product_route_unblocked',
    expected: false,
    message:
      'Core platform event outbox dispatcher/consumer/replay review receipt must keep product_route_unblocked false.'
  },
  {
    path: 'dispatcher_consumer_replay_review_receipt.review_status',
    expected: 'integration_review_pending',
    message:
      'Core platform event outbox dispatcher/consumer/replay review receipt must keep review_status `integration_review_pending`.'
  },
  {
    path: 'dispatcher_consumer_replay_review_receipt.promotion_blocker',
    expected: 'transaction_outbox_dispatcher_replay_review_pending',
    message:
      'Core platform event outbox dispatcher/consumer/replay review receipt must keep promotion blocker `transaction_outbox_dispatcher_replay_review_pending`.'
  }
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
      path: 'runtime.dispatcher_consumer_replay_review_plan_implemented',
      field: 'runtime.dispatcher_consumer_replay_review_plan_implemented',
      expected: true,
      message:
        'Core platform event outbox contract must keep dispatcher_consumer_replay_review_plan_implemented true so dispatcher, consumer inbox, and replay promotion stay review-gated.'
    }),
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
    ...validateExactValue({
      value,
      file: CORE_EVENT_OUTBOX_FILE,
      path: 'events.replay_required',
      field: 'events.replay_required',
      expected: true,
      message:
        'Core platform event outbox contract must require replay contract before production dispatch.'
    }),
    ...validateExactValue({
      value,
      file: CORE_EVENT_OUTBOX_FILE,
      path: 'events.dead_letter_required',
      field: 'events.dead_letter_required',
      expected: true,
      message:
        'Core platform event outbox contract must require dead-letter attempt history before production dispatch.'
    }),
    ...validateExactValue({
      value,
      file: CORE_EVENT_OUTBOX_FILE,
      path: 'events.dead_letter_policy',
      field: 'events.dead_letter_policy',
      expected: CORE_EVENT_OUTBOX_DEAD_LETTER_POLICY,
      message:
        `Core platform event outbox contract must keep events.dead_letter_policy \`${CORE_EVENT_OUTBOX_DEAD_LETTER_POLICY}\`.`
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
    ...validateExactValue({
      value,
      file: CORE_EVENT_OUTBOX_FILE,
      path: 'dispatcher_consumer_replay_review.boundary_status',
      field: 'dispatcher_consumer_replay_review.boundary_status',
      expected: CORE_EVENT_DISPATCHER_CONSUMER_REPLAY_REVIEW_STATUS,
      message:
        `Core platform event outbox contract must keep dispatcher_consumer_replay_review.boundary_status \`${CORE_EVENT_DISPATCHER_CONSUMER_REPLAY_REVIEW_STATUS}\` until workers exist.`
    }),
    ...validateExactValue({
      value,
      file: CORE_EVENT_OUTBOX_FILE,
      path: 'dispatcher_consumer_replay_review.dispatcher_ref',
      field: 'dispatcher_consumer_replay_review.dispatcher_ref',
      expected: 'dispatcher://core/not-implemented',
      message:
        'Core platform event outbox contract must keep dispatcher_ref `dispatcher://core/not-implemented` until dispatcher proof exists.'
    }),
    ...validateExactValue({
      value,
      file: CORE_EVENT_OUTBOX_FILE,
      path: 'dispatcher_consumer_replay_review.consumer_inbox_ref',
      field: 'dispatcher_consumer_replay_review.consumer_inbox_ref',
      expected: 'consumer-inbox://core/not-implemented',
      message:
        'Core platform event outbox contract must keep consumer_inbox_ref `consumer-inbox://core/not-implemented` until consumer inbox proof exists.'
    }),
    ...validateExactValue({
      value,
      file: CORE_EVENT_OUTBOX_FILE,
      path: 'dispatcher_consumer_replay_review.replay_worker_ref',
      field: 'dispatcher_consumer_replay_review.replay_worker_ref',
      expected: 'replay-worker://core/not-implemented',
      message:
        'Core platform event outbox contract must keep replay_worker_ref `replay-worker://core/not-implemented` until replay worker proof exists.'
    }),
    ...validateExactValue({
      value,
      file: CORE_EVENT_OUTBOX_FILE,
      path: 'dispatcher_consumer_replay_review.review_ref',
      field: 'dispatcher_consumer_replay_review.review_ref',
      expected: 'review://core/event-dispatcher-consumer-replay',
      message:
        'Core platform event outbox contract must keep review_ref `review://core/event-dispatcher-consumer-replay` for dispatcher, consumer inbox, and replay promotion review.'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: CORE_EVENT_OUTBOX_FILE,
      path: 'dispatcher_consumer_replay_review.required_before_promotion',
      field: 'dispatcher_consumer_replay_review.required_before_promotion',
      requiredEntries:
        REQUIRED_CORE_EVENT_DISPATCHER_CONSUMER_REPLAY_PROMOTION_REVIEWS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: CORE_EVENT_OUTBOX_FILE,
      path: 'dispatcher_consumer_replay_review.required_controls',
      field: 'dispatcher_consumer_replay_review.required_controls',
      requiredEntries: REQUIRED_CORE_EVENT_DISPATCHER_CONSUMER_REPLAY_CONTROLS
    }),
    ...REQUIRED_CORE_EVENT_DISPATCHER_CONSUMER_REPLAY_RECEIPT_VALUES.flatMap(
      (receiptValue) =>
        validateExactValue({
          value,
          file: CORE_EVENT_OUTBOX_FILE,
          path: receiptValue.path,
          expected: receiptValue.expected,
          message: receiptValue.message
        })
    ),
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
