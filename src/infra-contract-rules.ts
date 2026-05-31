import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { Diagnostic } from './diagnostics.ts';

const INFRA_REPOSITORY_NAME = 'zdp-platform-infra';
const INFRA_CONTRACT_RULE_ID = 'ZDP-INFRA-001';

const RESOURCE_INVENTORY_FILE = 'contracts/resource-inventory.yaml';
const ENVIRONMENT_SCHEMA_FILE = 'contracts/environment.schema.yaml';
const BACKUP_RESTORE_FILE = 'contracts/backup-restore.yaml';
const PACKAGE_FILE = 'package.json';
const INFRA_CHECK_SCRIPT_FILE = 'scripts/check-infra-contracts.ts';
const INFRA_PLAN_SCRIPT_FILE = 'scripts/infra-plan.ts';
const INFRA_PARSER_FILE = 'src/infra-contracts/parser.ts';
const INFRA_VALIDATOR_FILE = 'src/infra-contracts/validator.ts';
const INFRA_PLAN_FILE = 'src/infra-contracts/plan.ts';
const INFRA_TEST_FILE = 'tests/infra-contracts.test.ts';

const REQUIRED_PACKAGE_SCRIPTS = [
  'check',
  'test',
  'contracts:check',
  'infra:plan'
] as const;

const REQUIRED_INFRA_CHECKER_FILES = [
  INFRA_CHECK_SCRIPT_FILE,
  INFRA_PLAN_SCRIPT_FILE,
  INFRA_PARSER_FILE,
  INFRA_VALIDATOR_FILE,
  INFRA_PLAN_FILE,
  INFRA_TEST_FILE
] as const;

const REQUIRED_CLOUDFLARE_RESOURCES = [
  'dns_zones',
  'workers_routes',
  'r2_buckets',
  'queues',
  'waf_rules'
] as const;

const REQUIRED_HETZNER_RESOURCES = [
  'servers',
  'firewalls',
  'volumes',
  'backups'
] as const;

const REQUIRED_CONTRACTS = [
  'resource-inventory',
  'backup-restore',
  'dns-records',
  'firewall-rules'
] as const;

const FORBIDDEN_VALUES = [
  'api tokens',
  'ssh private keys',
  'account ids',
  'server ips',
  'dns challenge secrets'
] as const;

const REQUIRED_RESTORE_EVIDENCE = [
  'backup snapshot identifier without secret values',
  'restore start and end time',
  'data integrity check result',
  'rollback notes'
] as const;

export async function validateRepositoryInfraContract(input: {
  readonly repositoryRoot: string | undefined;
  readonly repositoryServiceContract: unknown;
}): Promise<readonly Diagnostic[]> {
  if (
    input.repositoryRoot === undefined ||
    readRepositoryName(input.repositoryServiceContract) !== INFRA_REPOSITORY_NAME
  ) {
    return [];
  }

  const [resourceInventory, environmentSchema, backupRestore, packageJson] =
    await Promise.all([
      readRequiredYamlContract(input.repositoryRoot, RESOURCE_INVENTORY_FILE),
      readRequiredYamlContract(input.repositoryRoot, ENVIRONMENT_SCHEMA_FILE),
      readRequiredYamlContract(input.repositoryRoot, BACKUP_RESTORE_FILE),
      readRequiredJsonFile(input.repositoryRoot, PACKAGE_FILE)
    ]);

  return [
    ...resourceInventory.diagnostics,
    ...environmentSchema.diagnostics,
    ...backupRestore.diagnostics,
    ...packageJson.diagnostics,
    ...(resourceInventory.value === null
      ? []
      : validateResourceInventoryContract(resourceInventory.value)),
    ...(environmentSchema.value === null
      ? []
      : validateEnvironmentSchemaContract(environmentSchema.value)),
    ...(backupRestore.value === null
      ? []
      : validateBackupRestoreContract(backupRestore.value)),
    ...(packageJson.value === null ? [] : validatePackageScripts(packageJson.value)),
    ...(await validateInfraCheckerSurface(input.repositoryRoot))
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
          createInfraDiagnostic(
            file,
            'repository.root',
            `Infrastructure repository must include \`${file}\`.`
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
        createInfraDiagnostic(
          file,
          'yaml',
          `Infrastructure contract \`${file}\` must be valid YAML: ${formatError(
            error
          )}`
        )
      ]
    };
  }
}

async function readRequiredJsonFile(
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
          createInfraDiagnostic(
            file,
            'repository.root',
            `Infrastructure repository must include \`${file}\`.`
          )
        ]
      };
    }

    throw error;
  }

  try {
    return {
      value: JSON.parse(source) as unknown,
      diagnostics: []
    };
  } catch (error) {
    return {
      value: null,
      diagnostics: [
        createInfraDiagnostic(
          file,
          'json',
          `Infrastructure contract \`${file}\` must be valid JSON: ${formatError(
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
          createInfraDiagnostic(
            file,
            'repository.root',
            `Infrastructure repository must include \`${file}\`.`
          )
        ]
      };
    }

    throw error;
  }
}

function validateResourceInventoryContract(value: unknown): readonly Diagnostic[] {
  return [
    ...validateRequiredArrayFields({
      value,
      file: RESOURCE_INVENTORY_FILE,
      basePath: 'resources.cloudflare',
      fields: REQUIRED_CLOUDFLARE_RESOURCES
    }),
    ...validateRequiredArrayFields({
      value,
      file: RESOURCE_INVENTORY_FILE,
      basePath: 'resources.hetzner',
      fields: REQUIRED_HETZNER_RESOURCES
    }),
    ...validateExactValue({
      value,
      file: RESOURCE_INVENTORY_FILE,
      path: 'inventory_policy.source_of_truth',
      expected: 'repository-contract-first',
      message:
        'Infrastructure resource inventory must keep repository contracts as source of truth.'
    }),
    ...validateExactValue({
      value,
      file: RESOURCE_INVENTORY_FILE,
      path: 'inventory_policy.dashboard_drift_action',
      expected: 'backfill-contract-or-revert-dashboard',
      message:
        'Infrastructure resource inventory must require dashboard drift to be backfilled or reverted.'
    }),
    ...validateExactValue({
      value,
      file: RESOURCE_INVENTORY_FILE,
      path: 'inventory_policy.latest_pricing_review_required',
      expected: true,
      message:
        'Infrastructure resource inventory must require latest pricing review before implementation.'
    })
  ];
}

function validateEnvironmentSchemaContract(value: unknown): readonly Diagnostic[] {
  const environments = readRecordArrayPath(value, 'environments');
  const environmentByName = new Map<string, Record<string, unknown>>();

  for (const environment of environments) {
    const name = readStringField(environment, 'name');

    if (name !== null) {
      environmentByName.set(name, environment);
    }
  }

  return [
    ...validateEnvironment({
      environment: environmentByName.get('local'),
      name: 'local',
      expectedSecretsAllowed: false,
      expectedProviderAccess: 'none'
    }),
    ...validateEnvironment({
      environment: environmentByName.get('manual'),
      name: 'manual',
      expectedSecretsAllowed: true,
      expectedProviderAccess: 'read-only-preferred'
    }),
    ...validateEnvironment({
      environment: environmentByName.get('production'),
      name: 'production',
      expectedSecretsAllowed: true,
      expectedProviderAccess: 'least-privilege'
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: ENVIRONMENT_SCHEMA_FILE,
      path: 'required_contracts',
      field: 'required_contracts',
      requiredEntries: REQUIRED_CONTRACTS
    }),
    ...validateRequiredStringArrayEntries({
      value,
      file: ENVIRONMENT_SCHEMA_FILE,
      path: 'forbidden_values',
      field: 'forbidden_values',
      requiredEntries: FORBIDDEN_VALUES
    })
  ];
}

function validateEnvironment(input: {
  readonly environment: Record<string, unknown> | undefined;
  readonly name: string;
  readonly expectedSecretsAllowed: boolean;
  readonly expectedProviderAccess: string;
}): readonly Diagnostic[] {
  if (input.environment === undefined) {
    return [
      createInfraDiagnostic(
        ENVIRONMENT_SCHEMA_FILE,
        `environments.${input.name}`,
        `Infrastructure environment schema must declare \`${input.name}\` environment.`
      )
    ];
  }

  return [
    ...validateExactValue({
      value: input.environment,
      file: ENVIRONMENT_SCHEMA_FILE,
      path: `environments.${input.name}.secrets_allowed`,
      field: 'secrets_allowed',
      expected: input.expectedSecretsAllowed,
      message: `Infrastructure \`${input.name}\` environment must set \`secrets_allowed: ${input.expectedSecretsAllowed}\`.`
    }),
    ...validateExactValue({
      value: input.environment,
      file: ENVIRONMENT_SCHEMA_FILE,
      path: `environments.${input.name}.provider_access`,
      field: 'provider_access',
      expected: input.expectedProviderAccess,
      message: `Infrastructure \`${input.name}\` environment must use provider access \`${input.expectedProviderAccess}\`.`
    })
  ];
}

function validateBackupRestoreContract(value: unknown): readonly Diagnostic[] {
  return [
    ...validateExactValue({
      value,
      file: BACKUP_RESTORE_FILE,
      path: 'backup_policy.required_before_stateful_launch',
      expected: true,
      message:
        'Infrastructure backup policy must require backups before stateful launch.'
    }),
    ...validateExactValue({
      value,
      file: BACKUP_RESTORE_FILE,
      path: 'backup_policy.restore_drill_required',
      expected: true,
      message: 'Infrastructure backup policy must require restore drills.'
    }),
    ...validateExactValue({
      value,
      file: BACKUP_RESTORE_FILE,
      path: 'backup_policy.evidence_required',
      expected: true,
      message: 'Infrastructure backup policy must require restore evidence.'
    }),
    ...validateExactValue({
      value,
      file: BACKUP_RESTORE_FILE,
      path: 'backup_policy.secret_values_allowed',
      expected: false,
      message: 'Infrastructure backup policy must forbid secret values in evidence.'
    }),
    ...validateRestoreDrill(value)
  ];
}

function validatePackageScripts(value: unknown): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const script of REQUIRED_PACKAGE_SCRIPTS) {
    const actual = readPath(value, `scripts.${script}`);

    if (typeof actual === 'string' && actual.trim().length > 0) {
      continue;
    }

    diagnostics.push(
      createInfraDiagnostic(
        PACKAGE_FILE,
        `scripts.${script}`,
        `Infrastructure package must declare \`${script}\` script.`
      )
    );
  }

  return diagnostics;
}

async function validateInfraCheckerSurface(
  repositoryRoot: string
): Promise<readonly Diagnostic[]> {
  const [checkScript, planScript, parser, validator, plan, test] =
    await Promise.all(
      REQUIRED_INFRA_CHECKER_FILES.map((file) =>
        readRequiredTextFile(repositoryRoot, file)
      )
    );

  return [
    ...checkScript.diagnostics,
    ...planScript.diagnostics,
    ...parser.diagnostics,
    ...validator.diagnostics,
    ...plan.diagnostics,
    ...test.diagnostics,
    ...(checkScript.source === null
      ? []
      : validateSourceIncludes({
          file: INFRA_CHECK_SCRIPT_FILE,
          source: checkScript.source,
          requiredFragments: ['runInfraContractCheckCli']
        })),
    ...(planScript.source === null
      ? []
      : validateSourceIncludes({
          file: INFRA_PLAN_SCRIPT_FILE,
          source: planScript.source,
          requiredFragments: ['runInfraPlanCli']
        })),
    ...(parser.source === null
      ? []
      : validateSourceIncludes({
          file: INFRA_PARSER_FILE,
          source: parser.source,
          requiredFragments: [
            'resource-inventory.yaml',
            'environment.schema.yaml',
            'backup-restore.yaml'
          ]
        })),
    ...(validator.source === null
      ? []
      : validateSourceIncludes({
          file: INFRA_VALIDATOR_FILE,
          source: validator.source,
          requiredFragments: [
            'repository-contract-first',
            'backfill-contract-or-revert-dashboard',
            'least-privilege',
            'server ips',
            'rollback notes'
          ]
        })),
    ...(plan.source === null
      ? []
      : validateSourceIncludes({
          file: INFRA_PLAN_FILE,
          source: plan.source,
          requiredFragments: [
            'providerCalls: []',
            'terraform apply',
            'opentofu apply',
            'restore execution'
          ]
        })),
    ...(test.source === null
      ? []
      : validateSourceIncludes({
          file: INFRA_TEST_FILE,
          source: test.source,
          requiredFragments: [
            'provider-neutral dry-run plan',
            'INFRA_SOURCE_OF_TRUTH_INVALID',
            'INFRA_ENVIRONMENT_SECRET_POLICY_INVALID',
            'INFRA_FORBIDDEN_VALUE_MISSING',
            'INFRA_RESTORE_EVIDENCE_FIELD_MISSING'
          ]
        }))
  ];
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
      createInfraDiagnostic(
        input.file,
        'source',
        `Infrastructure checker source must include \`${fragment}\`.`
      )
    );
  }

  return diagnostics;
}

function validateRestoreDrill(value: unknown): readonly Diagnostic[] {
  const drills = readRecordArrayPath(value, 'restore_drills');
  const drill = drills.find((candidate) => {
    return readStringField(candidate, 'id') === 'hello-origin-restore';
  });

  if (drill === undefined) {
    return [
      createInfraDiagnostic(
        BACKUP_RESTORE_FILE,
        'restore_drills.hello-origin-restore',
        'Infrastructure backup contract must declare `hello-origin-restore` restore drill.'
      )
    ];
  }

  return validateRequiredStringArrayEntries({
    value: drill,
    file: BACKUP_RESTORE_FILE,
    path: 'restore_drills.hello-origin-restore.expected_evidence',
    field: 'expected_evidence',
    requiredEntries: REQUIRED_RESTORE_EVIDENCE
  });
}

function validateRequiredArrayFields(input: {
  readonly value: unknown;
  readonly file: string;
  readonly basePath: string;
  readonly fields: readonly string[];
}): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const field of input.fields) {
    const path = `${input.basePath}.${field}`;
    const actual = readPath(input.value, path);

    if (Array.isArray(actual)) {
      continue;
    }

    diagnostics.push(
      createInfraDiagnostic(
        input.file,
        path,
        `Infrastructure contract \`${input.file}\` must declare array \`${path}\`.`
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
      createInfraDiagnostic(
        input.file,
        input.path,
        `Infrastructure contract \`${input.file}\` must include \`${requiredEntry}\` in \`${input.field}\`.`
      )
    );
  }

  return diagnostics;
}

function validateExactValue(input: {
  readonly value: unknown;
  readonly file: string;
  readonly path: string;
  readonly field?: string;
  readonly expected: unknown;
  readonly message: string;
}): readonly Diagnostic[] {
  const actual = readPath(input.value, input.field ?? input.path);

  if (actual === input.expected) {
    return [];
  }

  return [createInfraDiagnostic(input.file, input.path, input.message)];
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

function readRecordArrayPath(
  value: unknown,
  path: string
): readonly Record<string, unknown>[] {
  const candidate = readPath(value, path);

  if (!Array.isArray(candidate)) {
    return [];
  }

  return candidate.flatMap((entry) => (isRecord(entry) ? [entry] : []));
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

function createInfraDiagnostic(
  file: string,
  path: string,
  message: string
): Diagnostic {
  return {
    ruleId: INFRA_CONTRACT_RULE_ID,
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
