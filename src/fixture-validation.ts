import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { parse } from 'yaml';
import {
  validateAiSensitiveDataContracts,
  validateAiUserDataContracts,
  type AiSensitiveDataPolicy,
  type AiUserDataPolicy
} from './ai-contract-rules.ts';
import {
  validatePublicApiContracts,
  type PublicApiContractPolicy
} from './api-rules.ts';
import {
  validateAiDirectNonOwnedDatastoreAccess,
  validateEdgeRuntimeDirectDatastoreAccess,
  validateLedgerDatastoreDependencyAccess,
  validateProductLikeDirectSensitiveDatastoreAccess,
  type LedgerDatastoreDependencyPolicy
} from './data-access-rules.ts';
import type { DatastoreIndex } from './datastore-rules.ts';
import type { Diagnostic } from './diagnostics.ts';
import {
  validateCreditMonetizationContracts,
  validateMoneyMovementContracts,
  validatePaymentDataFrontendContracts,
  type CreditMonetizationPolicy,
  type MoneyMovementPolicy,
  type PaymentDataFrontendPolicy
} from './money-rules.ts';
import {
  validateServiceProviderContracts,
  validateServiceProviderWebhooks,
  type ProviderContractPolicy,
  type ProviderWebhookPolicy
} from './provider-rules.ts';
import type { RepositoryIndex } from './repository-rules.ts';
import {
  validateTierCriticalControls,
  validateTierOperationalContracts,
  type TierCriticalControlsPolicy,
  type TierOperationalContractPolicy
} from './tier-rules.ts';

const FIXTURE_INVALID_RULE_ID = 'ZDP-FIXTURE-001';
const FIXTURE_PASS_RULE_ID = 'ZDP-FIXTURE-002';
const FIXTURE_FAIL_RULE_ID = 'ZDP-FIXTURE-003';

export interface FixtureValidationContext {
  readonly architectureRoot: string;
  readonly repositoryIndex: RepositoryIndex;
  readonly datastoreIndex: DatastoreIndex;
  readonly ledgerDatastoreDependencyPolicy: LedgerDatastoreDependencyPolicy;
  readonly aiUserDataPolicy: AiUserDataPolicy;
  readonly aiSensitiveDataPolicy: AiSensitiveDataPolicy;
  readonly moneyMovementPolicy: MoneyMovementPolicy;
  readonly paymentDataFrontendPolicy: PaymentDataFrontendPolicy;
  readonly creditMonetizationPolicy: CreditMonetizationPolicy;
  readonly providerContractPolicy: ProviderContractPolicy;
  readonly providerWebhookPolicy: ProviderWebhookPolicy;
  readonly tierOperationalContractPolicy: TierOperationalContractPolicy;
  readonly tierCriticalControlsPolicy: TierCriticalControlsPolicy;
  readonly publicApiContractPolicy: PublicApiContractPolicy;
}

interface FixtureRecord {
  readonly file: string;
  readonly value: unknown;
  readonly folderExpectation: 'pass' | 'fail';
}

export async function validateFixtureExpectations(
  context: FixtureValidationContext
): Promise<readonly Diagnostic[]> {
  const fixtures = await loadFixtureRecords(context.architectureRoot);

  return fixtures.flatMap((fixture) => validateFixtureRecord(fixture, context));
}

async function loadFixtureRecords(
  architectureRoot: string
): Promise<readonly FixtureRecord[]> {
  const passFixtures = await loadFixtureRecordsFromDirectory(
    architectureRoot,
    'fixtures/pass',
    'pass'
  );
  const failFixtures = await loadFixtureRecordsFromDirectory(
    architectureRoot,
    'fixtures/fail',
    'fail'
  );

  return [...passFixtures, ...failFixtures];
}

async function loadFixtureRecordsFromDirectory(
  architectureRoot: string,
  relativeDirectory: string,
  folderExpectation: 'pass' | 'fail'
): Promise<readonly FixtureRecord[]> {
  const directory = join(architectureRoot, relativeDirectory);
  let entries: readonly string[];

  try {
    entries = await readdir(directory);
  } catch (error) {
    if (isMissingPathError(error)) {
      return [];
    }

    throw error;
  }

  const fixtureFiles = entries
    .filter((entry) => entry.endsWith('.yaml') || entry.endsWith('.yml'))
    .sort((left, right) => left.localeCompare(right));

  return Promise.all(
    fixtureFiles.map(async (fileName) => {
      const absolutePath = join(directory, fileName);
      const source = await readFile(absolutePath, 'utf8');

      return {
        file: relative(architectureRoot, absolutePath).replaceAll('\\', '/'),
        value: parse(source) as unknown,
        folderExpectation
      };
    })
  );
}

function validateFixtureRecord(
  fixture: FixtureRecord,
  context: FixtureValidationContext
): readonly Diagnostic[] {
  if (!isRecord(fixture.value)) {
    return [
      createFixtureDiagnostic(
        FIXTURE_INVALID_RULE_ID,
        fixture.file,
        'fixture',
        'Fixture file must be a YAML object.'
      )
    ];
  }

  const metadata = readFixtureMetadata(fixture.value, fixture.file);

  if (metadata.diagnostics.length > 0) {
    return metadata.diagnostics;
  }

  const expectedResult = metadata.expectation ?? fixture.folderExpectation;
  const expectedFailures = metadata.expectedFailures;
  const serviceDiagnostics = validateFixtureService(fixture.value, context);
  const actualRuleIds = unique(serviceDiagnostics.map((diagnostic) => diagnostic.ruleId));

  if (expectedResult === 'pass') {
    return actualRuleIds.length === 0
      ? []
      : [
          createFixtureDiagnostic(
            FIXTURE_PASS_RULE_ID,
            fixture.file,
            'fixture.expected_failures',
            `Pass fixture produced unexpected rule failures: ${formatRuleIds(actualRuleIds)}.`
          )
        ];
  }

  if (expectedFailures.length === 0) {
    return [
      createFixtureDiagnostic(
        FIXTURE_INVALID_RULE_ID,
        fixture.file,
        'fixture.expected_failures',
        'Fail fixture must declare at least one expected rule id.'
      )
    ];
  }

  const missingFailures = expectedFailures.filter(
    (ruleId) => !actualRuleIds.includes(ruleId)
  );
  const unexpectedFailures = actualRuleIds.filter(
    (ruleId) => !expectedFailures.includes(ruleId)
  );

  if (missingFailures.length === 0 && unexpectedFailures.length === 0) {
    return [];
  }

  return [
    createFixtureDiagnostic(
      FIXTURE_FAIL_RULE_ID,
      fixture.file,
      'fixture.expected_failures',
      [
        missingFailures.length > 0
          ? `missing expected failures: ${formatRuleIds(missingFailures)}`
          : null,
        unexpectedFailures.length > 0
          ? `unexpected failures: ${formatRuleIds(unexpectedFailures)}`
          : null
      ]
        .filter((entry): entry is string => entry !== null)
        .join('; ')
    )
  ];
}

function validateFixtureService(
  value: Record<string, unknown>,
  context: FixtureValidationContext
): readonly Diagnostic[] {
  const service = normalizeFixtureService(value);
  const services = { services: [service] };

  return [
    ...validateProductLikeDirectSensitiveDatastoreAccess(
      services,
      context.repositoryIndex,
      context.datastoreIndex
    ),
    ...validateLedgerDatastoreDependencyAccess(
      services,
      context.ledgerDatastoreDependencyPolicy
    ),
    ...validateAiDirectNonOwnedDatastoreAccess(
      services,
      context.repositoryIndex,
      context.datastoreIndex
    ),
    ...validateEdgeRuntimeDirectDatastoreAccess(services, context.datastoreIndex),
    ...validateAiUserDataContracts(services, context.aiUserDataPolicy),
    ...validateAiSensitiveDataContracts(services, context.aiSensitiveDataPolicy),
    ...validateMoneyMovementContracts(services, context.moneyMovementPolicy),
    ...validatePaymentDataFrontendContracts(
      services,
      context.paymentDataFrontendPolicy
    ),
    ...validateCreditMonetizationContracts(
      services,
      context.creditMonetizationPolicy
    ),
    ...validateServiceProviderContracts(services, context.providerContractPolicy),
    ...validateServiceProviderWebhooks(services, context.providerWebhookPolicy),
    ...validateTierOperationalContracts(
      services,
      context.tierOperationalContractPolicy
    ),
    ...validateTierCriticalControls(services, context.tierCriticalControlsPolicy),
    ...validatePublicApiContracts(services, context.publicApiContractPolicy)
  ];
}

function normalizeFixtureService(value: Record<string, unknown>): Record<string, unknown> {
  const service = isRecord(value.service) ? value.service : {};

  return {
    ...value,
    id: readStringField(value, 'id') ?? readStringField(service, 'id') ?? undefined,
    repo: readStringField(value, 'repo') ?? readStringField(service, 'repo') ?? undefined,
    component:
      readStringField(value, 'component') ??
      readStringField(service, 'component') ??
      undefined,
    runtime:
      readStringField(value, 'runtime') ??
      readStringField(service, 'runtime') ??
      undefined,
    tier: readStringField(value, 'tier') ?? readStringField(service, 'tier') ?? undefined
  };
}

function readFixtureMetadata(
  value: Record<string, unknown>,
  file: string
): {
  readonly expectation: 'pass' | 'fail' | null;
  readonly expectedFailures: readonly string[];
  readonly diagnostics: readonly Diagnostic[];
} {
  const fixture = value.fixture;

  if (!isRecord(fixture)) {
    return {
      expectation: null,
      expectedFailures: [],
      diagnostics: [
        createFixtureDiagnostic(
          FIXTURE_INVALID_RULE_ID,
          file,
          'fixture',
          'Fixture file is missing required `fixture` metadata.'
        )
      ]
    };
  }

  const expectation = readStringField(fixture, 'expect');

  if (expectation !== 'pass' && expectation !== 'fail') {
    return {
      expectation: null,
      expectedFailures: [],
      diagnostics: [
        createFixtureDiagnostic(
          FIXTURE_INVALID_RULE_ID,
          file,
          'fixture.expect',
          '`fixture.expect` must be `pass` or `fail`.'
        )
      ]
    };
  }

  return {
    expectation,
    expectedFailures: readStringArray(fixture.expected_failures),
    diagnostics: []
  };
}

function createFixtureDiagnostic(
  ruleId: string,
  file: string,
  path: string,
  message: string
): Diagnostic {
  return {
    ruleId,
    severity: 'error',
    file,
    path,
    message
  };
}

function formatRuleIds(ruleIds: readonly string[]): string {
  return ruleIds.map((ruleId) => `\`${ruleId}\``).join(', ');
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function readStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) =>
    typeof entry === 'string' && entry.trim().length > 0 ? [entry.trim()] : []
  );
}

function readStringField(value: Record<string, unknown>, field: string): string | null {
  const candidate = value[field];

  return typeof candidate === 'string' && candidate.trim().length > 0
    ? candidate.trim()
    : null;
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
