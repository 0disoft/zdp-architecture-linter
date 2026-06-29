import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { parse } from 'yaml';
import type { DataClassIndex } from './data-class-rules.ts';
import type { DatastoreIndex } from './datastore-rules.ts';
import type { Diagnostic } from './diagnostics.ts';
import type { EventIndex } from './event-rules.ts';
import type { ExternalProviderIndex } from './provider-rules.ts';
import type { RepositoryIndex } from './repository-rules.ts';
import {
  validateRepositoryServiceContractDataReferences,
  validateRepositoryServiceContractEventReferences,
  validateRepositoryServiceContractProviderReferences
} from './service-contract-reference-rules.ts';
import { validateRepositoryServiceDomainContract } from './rules/service-domain-rules.ts';
import {
  validateRepositoryServiceContractRepositoryReference,
  validateRepositoryServiceContractServiceCatalogReference,
  type ServiceIndex
} from './service-rules.ts';

const REPOSITORY_SERVICE_FIXTURE_PASS_DIRECTORY =
  'fixtures/repository-service/pass';
const REPOSITORY_SERVICE_FIXTURE_FAIL_DIRECTORY =
  'fixtures/repository-service/fail';
const FIXTURE_INVALID_RULE_ID = 'ZDP-FIXTURE-001';
const FIXTURE_PASS_RULE_ID = 'ZDP-FIXTURE-002';
const FIXTURE_FAIL_RULE_ID = 'ZDP-FIXTURE-003';

interface RepositoryServiceFixture {
  readonly file: string;
  readonly value: unknown;
  readonly folderExpectation: 'pass' | 'fail';
  readonly loadDiagnostics: readonly Diagnostic[];
}

export interface RepositoryServiceFixtureValidationContext {
  readonly architectureRoot: string;
  readonly repositoryIndex: RepositoryIndex;
  readonly serviceIndex: ServiceIndex;
  readonly dataClassIndex: DataClassIndex;
  readonly datastoreIndex: DatastoreIndex;
  readonly eventIndex: EventIndex;
  readonly externalProviderIndex: ExternalProviderIndex;
}

export async function validateRepositoryServiceFixtureExpectations(
  context: RepositoryServiceFixtureValidationContext
): Promise<readonly Diagnostic[]> {
  const fixtures = await loadRepositoryServiceFixtures(context.architectureRoot);

  return fixtures.flatMap((fixture) =>
    validateRepositoryServiceFixture(fixture, context)
  );
}

async function loadRepositoryServiceFixtures(
  architectureRoot: string
): Promise<readonly RepositoryServiceFixture[]> {
  const passFixtures = await loadRepositoryServiceFixturesFromDirectory(
    architectureRoot,
    REPOSITORY_SERVICE_FIXTURE_PASS_DIRECTORY,
    'pass'
  );
  const failFixtures = await loadRepositoryServiceFixturesFromDirectory(
    architectureRoot,
    REPOSITORY_SERVICE_FIXTURE_FAIL_DIRECTORY,
    'fail'
  );

  return [...passFixtures, ...failFixtures];
}

async function loadRepositoryServiceFixturesFromDirectory(
  architectureRoot: string,
  relativeDirectory: string,
  folderExpectation: 'pass' | 'fail'
): Promise<readonly RepositoryServiceFixture[]> {
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
      const file = relative(architectureRoot, absolutePath).replaceAll('\\', '/');

      try {
        return {
          file,
          value: parse(source) as unknown,
          folderExpectation,
          loadDiagnostics: []
        };
      } catch (error) {
        return {
          file,
          value: null,
          folderExpectation,
          loadDiagnostics: [
            createFixtureDiagnostic(
              FIXTURE_INVALID_RULE_ID,
              file,
              'fixture',
              `Repository service fixture YAML could not be parsed: ${formatError(error)}`
            )
          ]
        };
      }
    })
  );
}

function validateRepositoryServiceFixture(
  fixture: RepositoryServiceFixture,
  context: RepositoryServiceFixtureValidationContext
): readonly Diagnostic[] {
  if (fixture.loadDiagnostics.length > 0) {
    return fixture.loadDiagnostics;
  }

  if (!isRecord(fixture.value)) {
    return [
      createFixtureDiagnostic(
        FIXTURE_INVALID_RULE_ID,
        fixture.file,
        'fixture',
        'Repository service fixture file must be a YAML object.'
      )
    ];
  }

  const metadata = readFixtureMetadata(fixture.value, fixture.file);

  if (metadata.diagnostics.length > 0) {
    return metadata.diagnostics;
  }

  const serviceContract = fixture.value.service_contract;

  if (!isRecord(serviceContract)) {
    return [
      createFixtureDiagnostic(
        FIXTURE_INVALID_RULE_ID,
        fixture.file,
        'service_contract',
        'Repository service fixture must contain a `service_contract` YAML object.'
      )
    ];
  }

  const expectedResult = metadata.expectation ?? fixture.folderExpectation;
  const expectedFailures = metadata.expectedFailures;
  const actualDiagnostics = validateRepositoryServiceFixtureContract(
    serviceContract,
    context
  );
  const actualRuleIds = unique(
    actualDiagnostics.map((diagnostic) => diagnostic.ruleId)
  );

  if (expectedResult === 'pass') {
    return actualRuleIds.length === 0
      ? []
      : [
          createFixtureDiagnostic(
            FIXTURE_PASS_RULE_ID,
            fixture.file,
            'fixture.expected_failures',
            `Repository service pass fixture produced unexpected rule failures: ${formatRuleIds(actualRuleIds)}.`
          )
        ];
  }

  if (expectedFailures.length === 0) {
    return [
      createFixtureDiagnostic(
        FIXTURE_INVALID_RULE_ID,
        fixture.file,
        'fixture.expected_failures',
        'Repository service fail fixture must declare at least one expected rule id.'
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

function validateRepositoryServiceFixtureContract(
  serviceContract: Record<string, unknown>,
  context: RepositoryServiceFixtureValidationContext
): readonly Diagnostic[] {
  return [
    ...validateRepositoryServiceContractRepositoryReference(
      serviceContract,
      context.repositoryIndex
    ),
    ...validateRepositoryServiceContractServiceCatalogReference(
      serviceContract,
      context.serviceIndex
    ),
    ...validateRepositoryServiceContractDataReferences(
      serviceContract,
      context.dataClassIndex,
      context.datastoreIndex
    ),
    ...validateRepositoryServiceContractProviderReferences(
      serviceContract,
      context.externalProviderIndex
    ),
    ...validateRepositoryServiceContractEventReferences(
      serviceContract,
      context.eventIndex
    ),
    ...validateRepositoryServiceDomainContract(serviceContract)
  ];
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
          'Repository service fixture file is missing required `fixture` metadata.'
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

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function readStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) =>
    typeof entry === 'string' && entry.trim().length > 0 ? [entry.trim()] : []
  );
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
