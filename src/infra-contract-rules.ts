import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { Diagnostic } from './diagnostics.ts';
import {
  extractTestCallNames,
  stripCommentsAndStringLiterals
} from './source-proof.ts';

const INFRA_REPOSITORY_NAME = 'zdp-platform-infra';
const INFRA_CONTRACT_RULE_ID = 'ZDP-INFRA-001';

const RESOURCE_INVENTORY_FILE = 'contracts/resource-inventory.yaml';
const ENVIRONMENT_SCHEMA_FILE = 'contracts/environment.schema.yaml';
const BACKUP_RESTORE_FILE = 'contracts/backup-restore.yaml';
const DNS_RECORDS_FILE = 'contracts/dns-records.yaml';
const FIREWALL_RULES_FILE = 'contracts/firewall-rules.yaml';
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

const REQUIRED_CHECK_SCRIPT_FRAGMENTS = [
  'tsc --noEmit',
  'bun test',
  'bun run contracts:check',
  'bun run infra:plan'
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

const FORBIDDEN_SOURCE_PATTERNS = [
  {
    label: 'ssh private keys',
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/i
  },
  {
    label: 'server ips',
    pattern:
      /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/
  },
  {
    label: 'api tokens',
    pattern:
      /\b(?:api[_-]?token|api[_-]?key|secret[_-]?key|bearer)\b\s*[:=]\s*['"]?(?!redacted|placeholder|logical|none|false|null|not-set|example|future|manual)[A-Za-z0-9._-]{12,}/i
  },
  {
    label: 'account ids',
    pattern:
      /\b(?:account[_-]?id|account id)\b\s*[:=]\s*['"]?(?!redacted|placeholder|logical|none|false|null|not-set|example|future|manual)[A-Za-z0-9_-]{6,}/i
  },
  {
    label: 'dns challenge secrets',
    pattern:
      /\b(?:dns[_-]?challenge|challenge[_-]?secret|txt[_-]?value)\b\s*[:=]\s*['"]?(?!redacted|placeholder|logical|none|false|null|not-set|example|future|manual)[A-Za-z0-9._-]{12,}/i
  }
] as const;

const REQUIRED_RESTORE_EVIDENCE = [
  'backup snapshot identifier without secret values',
  'restore start and end time',
  'data integrity check result',
  'rollback notes'
] as const;

const REQUIRED_INFRA_TEST_NAMES = [
  'validates the committed infra contracts',
  'loads every required infra contract file',
  'reports all contract load failures together',
  'creates a provider-neutral dry-run plan without provider calls',
  'fails when repository contracts stop being the source of truth',
  'fails when local environment can access provider secrets',
  'fails when forbidden provider values are no longer forbidden',
  'fails when restore evidence is incomplete',
  'accepts restore drills without a service-specific id',
  'fails when pricing review is stale',
  'fails when latest pricing review is no longer required',
  'fails when contract source contains forbidden provider values',
  'fails when DNS or firewall contracts allow provider mutations',
  'fails when DNS or firewall entries appear before provider connection'
] as const;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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

  const [
    resourceInventory,
    environmentSchema,
    backupRestore,
    dnsRecords,
    firewallRules,
    packageJson
  ] = await Promise.all([
      readRequiredYamlContract(input.repositoryRoot, RESOURCE_INVENTORY_FILE),
      readRequiredYamlContract(input.repositoryRoot, ENVIRONMENT_SCHEMA_FILE),
      readRequiredYamlContract(input.repositoryRoot, BACKUP_RESTORE_FILE),
      readRequiredYamlContract(input.repositoryRoot, DNS_RECORDS_FILE),
      readRequiredYamlContract(input.repositoryRoot, FIREWALL_RULES_FILE),
      readRequiredJsonFile(input.repositoryRoot, PACKAGE_FILE)
    ]);

  return [
    ...resourceInventory.diagnostics,
    ...environmentSchema.diagnostics,
    ...backupRestore.diagnostics,
    ...dnsRecords.diagnostics,
    ...firewallRules.diagnostics,
    ...packageJson.diagnostics,
    ...validateForbiddenSourceValues([
      { file: RESOURCE_INVENTORY_FILE, source: resourceInventory.source },
      { file: ENVIRONMENT_SCHEMA_FILE, source: environmentSchema.source },
      { file: BACKUP_RESTORE_FILE, source: backupRestore.source },
      { file: DNS_RECORDS_FILE, source: dnsRecords.source },
      { file: FIREWALL_RULES_FILE, source: firewallRules.source }
    ]),
    ...(resourceInventory.value === null
      ? []
      : validateResourceInventoryContract(resourceInventory.value)),
    ...(environmentSchema.value === null
      ? []
      : validateEnvironmentSchemaContract(environmentSchema.value)),
    ...(backupRestore.value === null
      ? []
      : validateBackupRestoreContract(backupRestore.value)),
    ...(dnsRecords.value === null ? [] : validateDnsRecordsContract(dnsRecords.value)),
    ...(firewallRules.value === null
      ? []
      : validateFirewallRulesContract(firewallRules.value)),
    ...(packageJson.value === null ? [] : validatePackageScripts(packageJson.value)),
    ...(await validateInfraCheckerSurface(input.repositoryRoot))
  ];
}

async function readRequiredYamlContract(
  repositoryRoot: string,
  file: string
): Promise<{
  readonly value: unknown | null;
  readonly source: string | null;
  readonly diagnostics: readonly Diagnostic[];
}> {
  let source: string;

  try {
    source = await readFile(join(repositoryRoot, file), 'utf8');
  } catch (error) {
    if (isMissingPathError(error)) {
      return {
        value: null,
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

  try {
    const value = parse(source) as unknown;
    if (!isRecord(value)) {
      return {
        value: null,
        source,
        diagnostics: [
          createInfraDiagnostic(
            file,
            'yaml',
            `Infrastructure contract \`${file}\` must be a YAML object.`
          )
        ]
      };
    }

    return {
      value,
      source,
      diagnostics: []
    };
  } catch (error) {
    return {
      value: null,
      source,
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
    }),
    ...validatePricingReviewContract(value)
  ];
}

function validateEnvironmentSchemaContract(value: unknown): readonly Diagnostic[] {
  const environmentListDiagnostics = validateRecordArrayItems({
    value,
    file: ENVIRONMENT_SCHEMA_FILE,
    path: 'environments',
    allowEmpty: false,
    message:
      'Infrastructure contract `contracts/environment.schema.yaml` must declare non-empty object list `environments`.'
  });
  const environments = readRecordArrayPath(value, 'environments');
  const environmentByName = new Map<string, Record<string, unknown>>();

  for (const environment of environments) {
    const name = readStringField(environment, 'name');

    if (name !== null) {
      environmentByName.set(name, environment);
    }
  }

  return [
    ...environmentListDiagnostics,
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

function validateDnsRecordsContract(value: unknown): readonly Diagnostic[] {
  return [
    ...validateExactValue({
      value,
      file: DNS_RECORDS_FILE,
      path: 'dns_policy.source_of_truth',
      expected: 'repository-contract-first',
      message: 'Infrastructure DNS records must keep repository contracts first.'
    }),
    ...validateExactValue({
      value,
      file: DNS_RECORDS_FILE,
      path: 'dns_policy.provider_mutation_allowed',
      expected: false,
      message: 'Infrastructure DNS records must not allow provider mutation.'
    }),
    ...validateExactValue({
      value,
      file: DNS_RECORDS_FILE,
      path: 'dns_policy.secret_values_allowed',
      expected: false,
      message: 'Infrastructure DNS records must forbid secret values.'
    }),
    ...validateExactValue({
      value,
      file: DNS_RECORDS_FILE,
      path: 'dns_policy.actual_record_values_allowed',
      expected: false,
      message:
        'Infrastructure DNS records must not contain live record target values before provider connection.'
    }),
    ...validateEmptyArrayPath({
      value,
      file: DNS_RECORDS_FILE,
      path: 'records',
      message:
        'Infrastructure DNS record entries must stay empty until provider connection and live record value policy are reviewed.'
    })
  ];
}

function validateFirewallRulesContract(value: unknown): readonly Diagnostic[] {
  return [
    ...validateExactValue({
      value,
      file: FIREWALL_RULES_FILE,
      path: 'firewall_policy.source_of_truth',
      expected: 'repository-contract-first',
      message: 'Infrastructure firewall rules must keep repository contracts first.'
    }),
    ...validateExactValue({
      value,
      file: FIREWALL_RULES_FILE,
      path: 'firewall_policy.provider_mutation_allowed',
      expected: false,
      message: 'Infrastructure firewall rules must not allow provider mutation.'
    }),
    ...validateExactValue({
      value,
      file: FIREWALL_RULES_FILE,
      path: 'firewall_policy.secret_values_allowed',
      expected: false,
      message: 'Infrastructure firewall rules must forbid secret values.'
    }),
    ...validateExactValue({
      value,
      file: FIREWALL_RULES_FILE,
      path: 'firewall_policy.actual_server_ips_allowed',
      expected: false,
      message:
        'Infrastructure firewall rules must not contain live server IP values before provider connection.'
    }),
    ...validateEmptyArrayPath({
      value,
      file: FIREWALL_RULES_FILE,
      path: 'rules',
      message:
        'Infrastructure firewall rule entries must stay empty until provider connection and live server IP policy are reviewed.'
    })
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

  const checkScript = readPath(value, 'scripts.check');
  if (typeof checkScript === 'string') {
    for (const fragment of REQUIRED_CHECK_SCRIPT_FRAGMENTS) {
      if (checkScript.includes(fragment)) {
        continue;
      }

      diagnostics.push(
        createInfraDiagnostic(
          PACKAGE_FILE,
          'scripts.check',
          `Infrastructure package check script must run \`${fragment}\`.`
        )
      );
    }
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
            'backup-restore.yaml',
            'dns-records.yaml',
            'firewall-rules.yaml'
          ]
        })),
    ...(validator.source === null
      ? []
      : [
          ...validateSourceIncludes({
            file: INFRA_VALIDATOR_FILE,
            source: validator.source,
            requiredFragments: [
              'repository-contract-first',
              'backfill-contract-or-revert-dashboard',
              'least-privilege',
              'server ips',
              'rollback notes',
              'INFRA_PRICING_REVIEW_NOT_REQUIRED',
              'INFRA_PRICING_REVIEW_DATE_INVALID',
              'INFRA_PRICING_REVIEW_MAX_AGE_INVALID',
              'INFRA_FORBIDDEN_API_TOKEN',
              'INFRA_DNS_PROVIDER_MUTATION_ALLOWED',
              'INFRA_DNS_RECORDS_BEFORE_PROVIDER_CONNECTION',
              'INFRA_FIREWALL_ACTUAL_SERVER_IPS_ALLOWED',
              'INFRA_FIREWALL_RULES_BEFORE_PROVIDER_CONNECTION'
            ]
          }),
          ...validateSourceCodeIncludes({
            file: INFRA_VALIDATOR_FILE,
            source: validator.source,
            requiredFragments: [
              'export function validateInfrastructureContracts',
              'function validatePricingReview',
              'function validateForbiddenSourceValues',
              'function validateDnsRecords',
              'function validateFirewallRules'
            ]
          })
        ]),
    ...(plan.source === null
      ? []
      : [
          ...validateSourceIncludes({
            file: INFRA_PLAN_FILE,
            source: plan.source,
            requiredFragments: [
              'providerCalls: []',
              'terraform apply',
              'opentofu apply',
              'restore execution'
            ]
          }),
          ...validateSourceCodeIncludes({
            file: INFRA_PLAN_FILE,
            source: plan.source,
            requiredFragments: ['export function createInfrastructurePlan']
          })
        ]),
    ...(test.source === null
      ? []
      : [
          ...validateSourceIncludes({
            file: INFRA_TEST_FILE,
            source: test.source,
            requiredFragments: [
              'provider-neutral dry-run plan',
              'INFRA_SOURCE_OF_TRUTH_INVALID',
              'INFRA_ENVIRONMENT_SECRET_POLICY_INVALID',
              'INFRA_FORBIDDEN_VALUE_MISSING',
              'INFRA_RESTORE_EVIDENCE_FIELD_MISSING',
              'INFRA_PRICING_REVIEW_NOT_REQUIRED',
              'INFRA_PRICING_REVIEW_STALE',
              'INFRA_FORBIDDEN_API_TOKEN',
              'INFRA_DNS_PROVIDER_MUTATION_ALLOWED',
              'INFRA_DNS_RECORDS_BEFORE_PROVIDER_CONNECTION',
              'INFRA_FIREWALL_ACTUAL_SERVER_IPS_ALLOWED',
              'INFRA_FIREWALL_RULES_BEFORE_PROVIDER_CONNECTION'
            ]
          }),
          ...validateSourceCodeIncludes({
            file: INFRA_TEST_FILE,
            source: test.source,
            requiredFragments: [
              'expect(',
              'validateInfrastructureContracts',
              'loadInfrastructureContracts',
              'createInfrastructurePlan'
            ]
          }),
          ...validateSourceTestNames({
            file: INFRA_TEST_FILE,
            source: test.source,
            requiredTestNames: REQUIRED_INFRA_TEST_NAMES
          })
        ])
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
      createInfraDiagnostic(
        input.file,
        'source',
        `Infrastructure checker source must include code fragment \`${fragment}\`.`
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
      createInfraDiagnostic(
        input.file,
        'source',
        `Infrastructure checker source must include test case \`${testName}\`.`
      )
    );
  }

  return diagnostics;
}

function validatePricingReviewContract(value: unknown): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const latestPricingReviewDate = readPath(
    value,
    'inventory_policy.latest_pricing_review_date'
  );
  const pricingReviewMaxAgeDays = readPath(
    value,
    'inventory_policy.pricing_review_max_age_days'
  );

  if (
    typeof latestPricingReviewDate !== 'string' ||
    !ISO_DATE_PATTERN.test(latestPricingReviewDate)
  ) {
    diagnostics.push(
      createInfraDiagnostic(
        RESOURCE_INVENTORY_FILE,
        'inventory_policy.latest_pricing_review_date',
        'Infrastructure latest pricing review date must use YYYY-MM-DD format.'
      )
    );
  } else {
    const reviewDate = new Date(`${latestPricingReviewDate}T00:00:00.000Z`);
    if (
      Number.isNaN(reviewDate.getTime()) ||
      reviewDate.toISOString().slice(0, 10) !== latestPricingReviewDate
    ) {
      diagnostics.push(
        createInfraDiagnostic(
          RESOURCE_INVENTORY_FILE,
          'inventory_policy.latest_pricing_review_date',
          'Infrastructure latest pricing review date must be a real calendar date.'
        )
      );
    }
  }

  if (
    !Number.isInteger(pricingReviewMaxAgeDays) ||
    (pricingReviewMaxAgeDays as number) <= 0
  ) {
    diagnostics.push(
      createInfraDiagnostic(
        RESOURCE_INVENTORY_FILE,
        'inventory_policy.pricing_review_max_age_days',
        'Infrastructure pricing review max age must be a positive integer.'
      )
    );
  }

  return diagnostics;
}

function validateForbiddenSourceValues(
  contracts: readonly {
    readonly file: string;
    readonly source: string | null;
  }[]
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const contract of contracts) {
    if (contract.source === null) {
      continue;
    }

    for (const forbidden of FORBIDDEN_SOURCE_PATTERNS) {
      if (!forbidden.pattern.test(contract.source)) {
        continue;
      }

      diagnostics.push(
        createInfraDiagnostic(
          contract.file,
          '$',
          `Infrastructure contract source must not contain ${forbidden.label}.`
        )
      );
    }
  }

  return diagnostics;
}

function validateRestoreDrill(value: unknown): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [
    ...validateRecordArrayItems({
      value,
      file: BACKUP_RESTORE_FILE,
      path: 'restore_drills',
      allowEmpty: false,
      message:
        'Infrastructure backup contract must declare non-empty object list `restore_drills`.'
    })
  ];
  const drills = readRecordArrayPath(value, 'restore_drills');

  for (const [index, drill] of drills.entries()) {
    const drillId = readStringField(drill, 'id');

    if (drillId === null) {
      diagnostics.push(
        createInfraDiagnostic(
          BACKUP_RESTORE_FILE,
          `restore_drills[${index}].id`,
          `Infrastructure restore drill at index ${index} must declare string field \`id\`.`
        )
      );
    }

    for (const field of ['status', 'target'] as const) {
      if (readStringField(drill, field) !== null) {
        continue;
      }

      diagnostics.push(
        createInfraDiagnostic(
          BACKUP_RESTORE_FILE,
          `restore_drills[${index}].${field}`,
          `Infrastructure restore drill at index ${index} must declare string field \`${field}\`.`
        )
      );
    }

    diagnostics.push(
      ...validateRequiredStringArrayEntries({
        value: drill,
        file: BACKUP_RESTORE_FILE,
        path:
          drillId === null
            ? `restore_drills[${index}].expected_evidence`
            : `restore_drills.${drillId}.expected_evidence`,
        field: 'expected_evidence',
        requiredEntries: REQUIRED_RESTORE_EVIDENCE
      })
    );
  }

  return diagnostics;
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
  const diagnostics: Diagnostic[] = [
    ...validateStringArrayItems({
      value: input.value,
      file: input.file,
      path: input.path,
      field: input.field,
      message: `Infrastructure contract \`${input.file}\` must declare \`${input.field}\` as a non-empty string list.`
    })
  ];

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

function validateStringArrayItems(input: {
  readonly value: unknown;
  readonly file: string;
  readonly path: string;
  readonly field: string;
  readonly message: string;
}): readonly Diagnostic[] {
  const candidate = readPath(input.value, input.field);

  if (!Array.isArray(candidate)) {
    return [];
  }

  if (
    candidate.length > 0 &&
    candidate.every(
      (item) => typeof item === 'string' && item.trim().length > 0
    )
  ) {
    return [];
  }

  return [createInfraDiagnostic(input.file, input.path, input.message)];
}

function validateRecordArrayItems(input: {
  readonly value: unknown;
  readonly file: string;
  readonly path: string;
  readonly allowEmpty: boolean;
  readonly message: string;
}): readonly Diagnostic[] {
  const candidate = readPath(input.value, input.path);

  if (!Array.isArray(candidate)) {
    return [createInfraDiagnostic(input.file, input.path, input.message)];
  }

  if (
    (input.allowEmpty || candidate.length > 0) &&
    candidate.every((item) => isRecord(item))
  ) {
    return [];
  }

  return [createInfraDiagnostic(input.file, input.path, input.message)];
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

function validateEmptyArrayPath(input: {
  readonly value: unknown;
  readonly file: string;
  readonly path: string;
  readonly message: string;
}): readonly Diagnostic[] {
  const actual = readPath(input.value, input.path);

  if (Array.isArray(actual) && actual.length === 0) {
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
