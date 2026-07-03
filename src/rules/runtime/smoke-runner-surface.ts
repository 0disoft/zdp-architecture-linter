import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Diagnostic } from '../../diagnostics.ts';
import {
  extractTestCallNames,
  stripCommentsAndStringLiterals
} from '../../source-proof.ts';

const RUNTIME_CONTRACT_RULE_ID = 'ZDP-RUNTIME-001';
const SMOKE_RUNNER_SCRIPT_FILE = 'scripts/smoke-runner.ts';
const SMOKE_RUNNER_CONTRACT_FILE = 'src/smoke-runner/contract.ts';
const SMOKE_RUNNER_RUNNER_FILE = 'src/smoke-runner/runner.ts';
const SMOKE_RUNNER_TEST_FILE = 'tests/smoke-runner.test.ts';

const REQUIRED_SMOKE_RUNNER_FILES = [
  SMOKE_RUNNER_SCRIPT_FILE,
  SMOKE_RUNNER_CONTRACT_FILE,
  SMOKE_RUNNER_RUNNER_FILE,
  SMOKE_RUNNER_TEST_FILE
] as const;

export async function validateSmokeRunnerSurface(
  repositoryRoot: string
): Promise<readonly Diagnostic[]> {
  const [script, contractSource, runnerSource, testSource] = await Promise.all(
    REQUIRED_SMOKE_RUNNER_FILES.map((file) => readOptionalTextFile(repositoryRoot, file))
  );

  return [
    ...script.diagnostics,
    ...contractSource.diagnostics,
    ...runnerSource.diagnostics,
    ...testSource.diagnostics,
    ...(script.source === null
      ? []
      : validateSourceIncludes({
          file: SMOKE_RUNNER_SCRIPT_FILE,
          source: script.source,
          requiredFragments: ['runSmokeRunnerCli']
        })),
    ...(contractSource.source === null
      ? []
      : [
          ...validateSourceIncludes({
            file: SMOKE_RUNNER_CONTRACT_FILE,
            source: contractSource.source,
            requiredFragments: [
              'contracts/healthcheck.yaml',
              'contracts/smoke-targets.yaml',
              'contracts/deployment-template.yaml',
              'contracts/rollback.yaml',
              'smoke_targets',
              'targets',
              'blocked_production_when',
              'blocked_when',
              'enforced_by',
              'worker_process_optional'
            ]
          }),
          ...validateSourceCodeIncludes({
            file: SMOKE_RUNNER_CONTRACT_FILE,
            source: contractSource.source,
            requiredFragments: [
              'export function parseRuntimeContracts',
              'export function parseSmokeTargetsContract',
              'export function parseHealthcheckContract',
              'export function parseDeploymentTemplateContract',
              'export function parseRollbackContract',
              'function parseSmokeTargetsMetadata',
              'function parseTarget',
              'function parseContractCheck',
              'function requiredBlockedProductionConditionList',
              'function parseBlockedProductionCondition',
              'function isRuntimeContractEnforcement',
              'function assertStringListContains',
              'function requiredBoolean',
              'Bun.YAML.parse'
            ]
          })
        ]),
    ...(runnerSource.source === null
      ? []
      : [
          ...validateSourceIncludes({
            file: SMOKE_RUNNER_RUNNER_FILE,
            source: runnerSource.source,
            requiredFragments: [
              'base_url_not_provided',
              'x-request-id_not_propagated',
              'traceparent_not_propagated',
              'blockedProductionWhen'
            ]
          }),
          ...validateSourceCodeIncludes({
            file: SMOKE_RUNNER_RUNNER_FILE,
            source: runnerSource.source,
            requiredFragments: [
              'export function createSmokePlan',
              'export async function runSmokeTargets',
              'async function checkEndpoint',
              'export function parseBaseUrlPairs',
              'function validateJsonExpectation',
              'AbortSignal.timeout',
              'input.fetcher'
            ]
          })
        ]),
    ...(testSource.source === null
      ? []
      : [
          ...validateSourceTestNames({
            file: SMOKE_RUNNER_TEST_FILE,
            source: testSource.source,
            requiredTestNames: [
              'parses the committed runtime contract set before plan or run mode',
              'rejects runtime contract sets with missing smoke metadata',
              'rejects deployment and rollback contract drift before smoke execution',
              'fails closed when run mode has no base URL',
              'rejects blocked production conditions without enforcement owners'
            ]
          }),
          ...validateSourceIncludes({
            file: SMOKE_RUNNER_TEST_FILE,
            source: testSource.source,
            requiredFragments: [
              'base_url_not_provided',
              'platform-security-contracts',
              'platform-infra-contracts',
              'platform-observability-contracts',
              'data-platform-contracts',
              'is plan-only',
              'malformed_json_response',
              'money-api',
              'connectors-platform',
              'worker_process_optional',
              'blocked_when',
              'smoke_targets.production_promotion_requires'
            ]
          }),
          ...validateSourceCodeIncludes({
            file: SMOKE_RUNNER_TEST_FILE,
            source: testSource.source,
            requiredFragments: [
              'expect(',
              'parseRuntimeContracts',
              'parseSmokeTargetsContract',
              'createSmokePlan',
              'runSmokeTargets'
            ]
          })
        ])
  ];
}

async function readOptionalTextFile(
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
          createRuntimeDiagnostic(
            file,
            'repository.root',
            `Runtime repository must include \`${file}\`.`
          )
        ]
      };
    }

    throw error;
  }
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
      createRuntimeDiagnostic(
        input.file,
        'source',
        `Runtime smoke runner source must include \`${fragment}\`.`
      )
    );
  }

  return diagnostics;
}

function validateSourceTestNames(input: {
  readonly file: string;
  readonly source: string;
  readonly requiredTestNames: readonly string[];
}): readonly Diagnostic[] {
  const testNames = new Set(extractTestCallNames(input.source));
  const diagnostics: Diagnostic[] = [];

  for (const testName of input.requiredTestNames) {
    if (testNames.has(testName)) {
      continue;
    }

    diagnostics.push(
      createRuntimeDiagnostic(
        input.file,
        'source',
        `Runtime smoke runner source must include test case \`${testName}\`.`
      )
    );
  }

  return diagnostics;
}

function validateSourceCodeIncludes(input: {
  readonly file: string;
  readonly source: string;
  readonly requiredFragments: readonly string[];
}): readonly Diagnostic[] {
  const sourceWithoutCommentsOrStrings = stripCommentsAndStringLiterals(
    input.source
  );
  const diagnostics: Diagnostic[] = [];

  for (const fragment of input.requiredFragments) {
    if (sourceWithoutCommentsOrStrings.includes(fragment)) {
      continue;
    }

    diagnostics.push(
      createRuntimeDiagnostic(
        input.file,
        'source',
        `Runtime smoke runner source must include code fragment \`${fragment}\`.`
      )
    );
  }

  return diagnostics;
}

function createRuntimeDiagnostic(
  file: string,
  path: string,
  message: string
): Diagnostic {
  return {
    ruleId: RUNTIME_CONTRACT_RULE_ID,
    severity: 'error',
    file,
    path,
    message
  };
}

function isMissingPathError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}
