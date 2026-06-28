import type { Diagnostic } from '../../diagnostics.ts';
import {
  createCoreDiagnostic,
  validateExactValue,
  validateRequiredStringArrayEntries
} from './contract-helpers.ts';

export const CORE_DB_SCHEMA_FILE = 'contracts/core-db-schema.yaml';
export const CORE_FOUNDATION_MIGRATION_FILE =
  'migrations/postgresql/0001_core_foundation.sql';

export function validateCoreDbSchemaContract(
  value: unknown
): readonly Diagnostic[] {
  return [
    ...validateRequiredStringArrayEntries({
      value,
      file: CORE_DB_SCHEMA_FILE,
      path: 'contract.migration_files',
      field: 'contract.migration_files',
      requiredEntries: [CORE_FOUNDATION_MIGRATION_FILE]
    }),
    ...validateExactValue({
      value,
      file: CORE_DB_SCHEMA_FILE,
      path: 'core_events.schema_version_positive_integer_required',
      field: 'core_events.schema_version_positive_integer_required',
      expected: true,
      message:
        'Core DB schema contract must require core event outbox schema_version to be a positive integer.'
    }),
    ...validateExactValue({
      value,
      file: CORE_DB_SCHEMA_FILE,
      path: 'core_events.outbox_table',
      field: 'core_events.outbox_table',
      expected: 'audit.core_event_outbox',
      message:
        'Core DB schema contract must keep core_events.outbox_table `audit.core_event_outbox`.'
    }),
    ...validateExactValue({
      value,
      file: CORE_DB_SCHEMA_FILE,
      path: 'core_events.delivery_attempt_table',
      field: 'core_events.delivery_attempt_table',
      expected: 'audit.core_event_delivery_attempts',
      message:
        'Core DB schema contract must keep core_events.delivery_attempt_table `audit.core_event_delivery_attempts`.'
    })
  ];
}

export function validateCoreFoundationMigration(
  source: string
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const snippet of [
    'CREATE TABLE IF NOT EXISTS audit.core_event_outbox',
    'cloud_event_id text NOT NULL UNIQUE',
    'cloud_event_type text NOT NULL CHECK',
    'schema_version integer NOT NULL CHECK (schema_version > 0)',
    'payload_ref text NOT NULL',
    'available_at timestamptz NOT NULL',
    'CREATE TABLE IF NOT EXISTS audit.core_event_delivery_attempts',
    'audit.core_event_outbox is append-only',
    'audit.core_event_delivery_attempts is append-only'
  ]) {
    if (!source.includes(snippet)) {
      diagnostics.push(
        createCoreDiagnostic(
          CORE_FOUNDATION_MIGRATION_FILE,
          'core_event_outbox.migration_shape',
          `Core foundation migration must include \`${snippet}\` for the core event outbox contract.`
        )
      );
    }
  }

  return diagnostics;
}
