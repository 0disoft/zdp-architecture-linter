import type { Diagnostic, DiagnosticSeverity } from './diagnostics.ts';

export const VALIDATION_RULE_GROUPS = [
  'schema',
  'catalog',
  'service',
  'fixture',
  'repository',
  'cross-cutting'
] as const;

export type ValidationRuleGroup = (typeof VALIDATION_RULE_GROUPS)[number];

export const VALIDATION_RULE_INPUTS = [
  'architecture',
  'repository-root',
  'repository-contract'
] as const;

export type ValidationRuleInput = (typeof VALIDATION_RULE_INPUTS)[number];
export type ValidationRuleDefaultSeverity = DiagnosticSeverity | 'mixed';

export interface ValidationRuleMetadata {
  readonly id: string;
  readonly group: ValidationRuleGroup;
  readonly defaultSeverity: ValidationRuleDefaultSeverity;
  readonly sourceProof: readonly string[];
  readonly appliesTo: readonly string[];
  readonly inputs: readonly ValidationRuleInput[];
  readonly description: string;
  readonly alwaysRun?: boolean;
}

const defineRule = <const T extends ValidationRuleMetadata>(metadata: T): T => metadata;

const repositoryContractRule = <const T extends string>(input: {
  readonly id: T;
  readonly sourceProof: readonly string[];
  readonly appliesTo: readonly string[];
  readonly description: string;
  readonly group?: ValidationRuleGroup;
  readonly defaultSeverity?: ValidationRuleDefaultSeverity;
}) =>
  defineRule({
    id: input.id,
    group: input.group ?? 'repository',
    defaultSeverity: input.defaultSeverity ?? 'mixed',
    sourceProof: input.sourceProof,
    appliesTo: input.appliesTo,
    inputs: ['architecture', 'repository-root', 'repository-contract'],
    description: input.description
  });

export const VALIDATION_RULE_REGISTRY = [
  defineRule({
    id: 'catalog.schema-preflight',
    group: 'schema',
    defaultSeverity: 'error',
    sourceProof: ['schemas/*.schema.json'],
    appliesTo: ['catalogs/**/*.yaml', 'rules/**/*.yaml'],
    inputs: ['architecture'],
    description: 'Validate architecture catalogs against their JSON Schema contracts.',
    alwaysRun: true
  }),
  defineRule({
    id: 'catalog.repositories',
    group: 'catalog',
    defaultSeverity: 'mixed',
    sourceProof: ['catalogs/repositories.yaml', 'rules/repository.rules.yaml'],
    appliesTo: [
      'catalogs/repositories.yaml',
      'ROADMAP.md',
      'docs/26-eighteen-month-roadmap.md'
    ],
    inputs: ['architecture'],
    description: 'Validate repository registration, area, lifecycle, roadmap, and AI inference placement.'
  }),
  defineRule({
    id: 'catalog.splits',
    group: 'catalog',
    defaultSeverity: 'mixed',
    sourceProof: ['catalogs/split-triggers.yaml', 'catalogs/repositories.yaml'],
    appliesTo: ['catalogs/split-triggers.yaml', 'catalogs/repositories.yaml'],
    inputs: ['architecture'],
    description: 'Validate split-trigger references and repository split candidates.'
  }),
  defineRule({
    id: 'catalog.data',
    group: 'catalog',
    defaultSeverity: 'error',
    sourceProof: ['catalogs/data-classes.yaml', 'catalogs/datastores.yaml'],
    appliesTo: ['catalogs/data-classes.yaml', 'catalogs/datastores.yaml'],
    inputs: ['architecture'],
    description: 'Validate data classes, datastore allowlists, and reciprocal references.'
  }),
  defineRule({
    id: 'catalog.events',
    group: 'catalog',
    defaultSeverity: 'error',
    sourceProof: ['catalogs/events.yaml', 'schemas/events/*.json'],
    appliesTo: ['catalogs/events.yaml', 'schemas/events/*.json'],
    inputs: ['architecture'],
    description: 'Validate event schemas, PII floors, ownership references, and deletion events.'
  }),
  defineRule({
    id: 'catalog.operations',
    group: 'catalog',
    defaultSeverity: 'mixed',
    sourceProof: ['catalogs/cost-budgets.yaml', 'catalogs/slo-tiers.yaml'],
    appliesTo: ['catalogs/cost-budgets.yaml', 'catalogs/slo-tiers.yaml'],
    inputs: ['architecture'],
    description: 'Validate cost budgets, automatic actions, SLO tiers, and service mappings.'
  }),
  defineRule({
    id: 'catalog.providers',
    group: 'catalog',
    defaultSeverity: 'error',
    sourceProof: ['catalogs/external-providers.yaml', 'rules/provider.rules.yaml'],
    appliesTo: ['catalogs/external-providers.yaml'],
    inputs: ['architecture'],
    description: 'Validate provider catalog contracts and webhook safety requirements.'
  }),
  defineRule({
    id: 'catalog.services',
    group: 'catalog',
    defaultSeverity: 'error',
    sourceProof: ['catalogs/services.yaml', 'catalogs/repositories.yaml'],
    appliesTo: ['catalogs/services.yaml'],
    inputs: ['architecture'],
    description: 'Validate service repository, dependency, datastore, and provider references.'
  }),
  defineRule({
    id: 'catalog.datastores',
    group: 'catalog',
    defaultSeverity: 'error',
    sourceProof: ['catalogs/datastores.yaml', 'catalogs/repositories.yaml'],
    appliesTo: ['catalogs/datastores.yaml'],
    inputs: ['architecture'],
    description: 'Validate datastore ownership and data-class references.'
  }),
  defineRule({
    id: 'service.data-access',
    group: 'service',
    defaultSeverity: 'error',
    sourceProof: ['rules/data-access.rules.yaml', 'catalogs/services.yaml'],
    appliesTo: ['catalogs/services.yaml'],
    inputs: ['architecture'],
    description: 'Validate service data ownership and direct datastore access boundaries.'
  }),
  defineRule({
    id: 'service.provider-references',
    group: 'service',
    defaultSeverity: 'error',
    sourceProof: ['catalogs/external-providers.yaml', 'catalogs/services.yaml'],
    appliesTo: ['catalogs/services.yaml'],
    inputs: ['architecture'],
    description: 'Validate service references to registered external providers.'
  }),
  defineRule({
    id: 'service.providers',
    group: 'service',
    defaultSeverity: 'error',
    sourceProof: ['rules/provider.rules.yaml', 'catalogs/services.yaml'],
    appliesTo: ['catalogs/services.yaml'],
    inputs: ['architecture'],
    description: 'Validate service provider contracts and webhook handling.'
  }),
  defineRule({
    id: 'service.chatgpt-apps',
    group: 'service',
    defaultSeverity: 'error',
    sourceProof: ['catalogs/services.yaml', 'catalogs/external-providers.yaml'],
    appliesTo: ['catalogs/services.yaml', 'catalogs/repositories.yaml'],
    inputs: ['architecture'],
    description: 'Validate ChatGPT Apps SDK gateway ownership and provider boundaries.'
  }),
  defineRule({
    id: 'service.ai',
    group: 'service',
    defaultSeverity: 'error',
    sourceProof: ['rules/ai-data-access.rules.yaml', 'catalogs/services.yaml'],
    appliesTo: ['catalogs/services.yaml'],
    inputs: ['architecture'],
    description: 'Validate AI user-data and sensitive-data handling contracts.'
  }),
  defineRule({
    id: 'service.datastore-boundaries',
    group: 'service',
    defaultSeverity: 'error',
    sourceProof: ['rules/data-access.rules.yaml', 'catalogs/services.yaml'],
    appliesTo: ['catalogs/services.yaml'],
    inputs: ['architecture'],
    description: 'Validate direct sensitive, ledger, AI, and edge datastore access boundaries.'
  }),
  defineRule({
    id: 'service.money',
    group: 'service',
    defaultSeverity: 'error',
    sourceProof: ['rules/money.rules.yaml', 'catalogs/services.yaml'],
    appliesTo: ['catalogs/services.yaml'],
    inputs: ['architecture'],
    description: 'Validate money movement, payment data, and credit monetization boundaries.'
  }),
  defineRule({
    id: 'service.tiers',
    group: 'service',
    defaultSeverity: 'mixed',
    sourceProof: ['rules/tier.rules.yaml', 'catalogs/services.yaml'],
    appliesTo: ['catalogs/services.yaml'],
    inputs: ['architecture'],
    description: 'Validate operational, critical-control, and risky-experiment tier contracts.'
  }),
  defineRule({
    id: 'service.api',
    group: 'service',
    defaultSeverity: 'error',
    sourceProof: ['rules/api.rules.yaml', 'catalogs/services.yaml'],
    appliesTo: ['catalogs/services.yaml'],
    inputs: ['architecture'],
    description: 'Validate public API versioning, OpenAPI, rate-limit, and deprecation contracts.'
  }),
  defineRule({
    id: 'service.token',
    group: 'service',
    defaultSeverity: 'error',
    sourceProof: ['rules/token.rules.yaml', 'catalogs/services.yaml'],
    appliesTo: ['catalogs/services.yaml'],
    inputs: ['architecture'],
    description: 'Validate raw-chain consumption, reconciliation, and token datastore boundaries.'
  }),
  defineRule({
    id: 'fixture.policy',
    group: 'fixture',
    defaultSeverity: 'error',
    sourceProof: ['fixtures/pass/**', 'fixtures/fail/**'],
    appliesTo: ['fixtures/pass/**', 'fixtures/fail/**'],
    inputs: ['architecture'],
    description: 'Validate catalog policy pass and fail fixtures.'
  }),
  defineRule({
    id: 'fixture.repository-service',
    group: 'fixture',
    defaultSeverity: 'error',
    sourceProof: ['fixtures/repository-service/**'],
    appliesTo: ['fixtures/repository-service/**'],
    inputs: ['architecture'],
    description: 'Validate repository service-contract reference fixtures.'
  }),
  defineRule({
    id: 'fixture.service-schema',
    group: 'fixture',
    defaultSeverity: 'error',
    sourceProof: ['schemas/service.schema.json', 'fixtures/service-schema/**'],
    appliesTo: ['fixtures/service-schema/**'],
    inputs: ['architecture'],
    description: 'Validate complete service.yaml schema fixtures.'
  }),
  defineRule({
    id: 'fixture.support-sources',
    group: 'fixture',
    defaultSeverity: 'error',
    sourceProof: ['catalogs/support-source-adapters.yaml', 'fixtures/support-sources/**'],
    appliesTo: ['fixtures/support-sources/**'],
    inputs: ['architecture'],
    description: 'Validate support-source adapter registration fixtures.'
  }),
  defineRule({
    id: 'repository.baseline',
    group: 'repository',
    defaultSeverity: 'mixed',
    sourceProof: ['catalogs/repositories.yaml'],
    appliesTo: ['.editorconfig', '.gitattributes', 'AGENTS.md', 'README.md'],
    inputs: ['architecture', 'repository-root'],
    description: 'Validate live repository baseline files without requiring service.yaml parsing.'
  }),
  defineRule({
    id: 'repository.markdown',
    group: 'repository',
    defaultSeverity: 'mixed',
    sourceProof: ['catalogs/repositories.yaml', 'service.yaml'],
    appliesTo: ['BOUNDARY.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'RUNBOOK.md', 'SECURITY.md'],
    inputs: ['architecture', 'repository-root', 'repository-contract'],
    description: 'Validate conditional repository Markdown contracts.'
  }),
  defineRule({
    id: 'repository.service-schema',
    group: 'repository',
    defaultSeverity: 'error',
    sourceProof: ['schemas/service.schema.json'],
    appliesTo: ['service.yaml'],
    inputs: ['architecture', 'repository-root', 'repository-contract'],
    description: 'Validate the live repository service.yaml schema.'
  }),
  defineRule({
    id: 'repository.service-references',
    group: 'repository',
    defaultSeverity: 'error',
    sourceProof: [
      'catalogs/repositories.yaml',
      'catalogs/services.yaml',
      'catalogs/data-classes.yaml',
      'catalogs/datastores.yaml',
      'catalogs/events.yaml',
      'catalogs/external-providers.yaml'
    ],
    appliesTo: ['service.yaml'],
    inputs: ['architecture', 'repository-root', 'repository-contract'],
    description: 'Validate live service.yaml references against architecture catalogs.'
  }),
  defineRule({
    id: 'repository.domain',
    group: 'repository',
    defaultSeverity: 'error',
    sourceProof: ['schemas/service.schema.json'],
    appliesTo: ['service.yaml'],
    inputs: ['architecture', 'repository-root', 'repository-contract'],
    description: 'Validate live repository service-domain invariants.'
  }),
  defineRule({
    id: 'repository.automation',
    group: 'repository',
    defaultSeverity: 'mixed',
    sourceProof: ['catalogs/repositories.yaml', 'service.yaml'],
    appliesTo: ['service.yaml', '.github/workflows/*.yml', '.github/workflows/*.yaml'],
    inputs: ['architecture', 'repository-root', 'repository-contract'],
    description: 'Validate CI, dependency update, ruleset, and automation ownership contracts.'
  }),
  defineRule({
    id: 'repository.service-data-access',
    group: 'repository',
    defaultSeverity: 'error',
    sourceProof: ['rules/data-access.rules.yaml', 'service.yaml'],
    appliesTo: ['service.yaml'],
    inputs: ['architecture', 'repository-root', 'repository-contract'],
    description: 'Apply service data-access policy to the live repository contract.'
  }),
  defineRule({
    id: 'repository.service-providers',
    group: 'repository',
    defaultSeverity: 'error',
    sourceProof: ['rules/provider.rules.yaml', 'service.yaml'],
    appliesTo: ['service.yaml'],
    inputs: ['architecture', 'repository-root', 'repository-contract'],
    description: 'Apply provider and webhook policy to the live repository contract.'
  }),
  defineRule({
    id: 'repository.service-ai',
    group: 'repository',
    defaultSeverity: 'error',
    sourceProof: ['rules/ai-data-access.rules.yaml', 'service.yaml'],
    appliesTo: ['service.yaml'],
    inputs: ['architecture', 'repository-root', 'repository-contract'],
    description: 'Apply AI data policy to the live repository contract.'
  }),
  defineRule({
    id: 'repository.service-money',
    group: 'repository',
    defaultSeverity: 'error',
    sourceProof: ['rules/money.rules.yaml', 'service.yaml'],
    appliesTo: ['service.yaml'],
    inputs: ['architecture', 'repository-root', 'repository-contract'],
    description: 'Apply money and payment-data policy to the live repository contract.'
  }),
  defineRule({
    id: 'repository.service-tiers',
    group: 'repository',
    defaultSeverity: 'mixed',
    sourceProof: ['rules/tier.rules.yaml', 'service.yaml'],
    appliesTo: ['service.yaml'],
    inputs: ['architecture', 'repository-root', 'repository-contract'],
    description: 'Apply tier policy to the live repository contract.'
  }),
  defineRule({
    id: 'repository.service-api',
    group: 'repository',
    defaultSeverity: 'error',
    sourceProof: ['rules/api.rules.yaml', 'service.yaml'],
    appliesTo: ['service.yaml'],
    inputs: ['architecture', 'repository-root', 'repository-contract'],
    description: 'Apply public API policy to the live repository contract.'
  }),
  defineRule({
    id: 'repository.service-token',
    group: 'repository',
    defaultSeverity: 'error',
    sourceProof: ['rules/token.rules.yaml', 'service.yaml'],
    appliesTo: ['service.yaml'],
    inputs: ['architecture', 'repository-root', 'repository-contract'],
    description: 'Apply token and raw-chain consumption policy to the live repository contract.'
  }),
  repositoryContractRule({
    id: 'repository.contract.agent-review-playbook',
    sourceProof: ['catalogs/repositories.yaml', 'service.yaml'],
    appliesTo: ['service.yaml', 'contracts/agent-review/**'],
    description: 'Validate agent-review playbook producer and reducer contracts.'
  }),
  repositoryContractRule({
    id: 'repository.contract.ai-platform',
    sourceProof: ['service.yaml', 'contracts/model-*.json'],
    appliesTo: ['service.yaml', 'contracts/**', 'schemas/**'],
    description: 'Validate AI platform evaluation, promotion, and adoption contracts.'
  }),
  repositoryContractRule({
    id: 'repository.contract.ai-inference',
    sourceProof: ['service.yaml', 'contracts/ai-inference/**'],
    appliesTo: ['service.yaml', 'contracts/**', 'schemas/**'],
    description: 'Validate the closed AI inference execution boundary.'
  }),
  repositoryContractRule({
    id: 'repository.contract.webpub',
    sourceProof: ['service.yaml', 'webpub.toml'],
    appliesTo: ['service.yaml', 'webpub.toml', 'robots.txt'],
    description: 'Validate public web publication and candidate-domain contracts.'
  }),
  repositoryContractRule({
    id: 'repository.contract.secret-exposure',
    group: 'cross-cutting',
    sourceProof: ['service.yaml'],
    appliesTo: ['llms.txt', 'sitemap.xml', 'robots.txt', '.well-known/**', '*.json'],
    description: 'Block secrets and private paths in public discovery artifacts.'
  }),
  repositoryContractRule({
    id: 'repository.contract.term-sheet',
    group: 'cross-cutting',
    sourceProof: ['service.yaml'],
    appliesTo: ['src/**', 'generated/**', 'contracts/**'],
    description: 'Validate glossary and Term Sheet identity and advertising boundaries.'
  }),
  repositoryContractRule({
    id: 'repository.contract.time',
    group: 'cross-cutting',
    sourceProof: ['service.yaml'],
    appliesTo: ['src/**', 'contracts/**', 'schemas/**'],
    description: 'Validate UTC storage and explicit timezone conversion contracts.'
  }),
  repositoryContractRule({
    id: 'repository.contract.error-envelope',
    group: 'cross-cutting',
    sourceProof: ['service.yaml'],
    appliesTo: ['src/**', 'contracts/**', 'schemas/**'],
    description: 'Validate public API error envelope contracts.'
  }),
  repositoryContractRule({
    id: 'repository.contract.i18n',
    group: 'cross-cutting',
    sourceProof: ['service.yaml'],
    appliesTo: ['src/**', 'contracts/**', 'locales/**'],
    description: 'Validate localization adoption and zero-fallback contracts.'
  }),
  repositoryContractRule({
    id: 'repository.contract.feed',
    group: 'cross-cutting',
    sourceProof: ['service.yaml'],
    appliesTo: ['src/**', 'contracts/**', 'schemas/**'],
    description: 'Validate feed publication and pagination contracts.'
  }),
  repositoryContractRule({
    id: 'repository.contract.color',
    group: 'cross-cutting',
    sourceProof: ['service.yaml'],
    appliesTo: ['src/**', 'contracts/**'],
    description: 'Validate design-token and semantic color contracts.'
  }),
  repositoryContractRule({
    id: 'repository.contract.accessibility',
    group: 'cross-cutting',
    sourceProof: ['service.yaml'],
    appliesTo: ['src/**', 'contracts/**'],
    description: 'Validate accessibility evidence and interaction contracts.'
  }),
  repositoryContractRule({
    id: 'repository.contract.performance',
    group: 'cross-cutting',
    defaultSeverity: 'mixed',
    sourceProof: ['service.yaml'],
    appliesTo: ['src/**', 'contracts/**'],
    description: 'Validate performance budgets and measurement evidence.'
  }),
  repositoryContractRule({
    id: 'repository.contract.security-headers',
    group: 'cross-cutting',
    sourceProof: ['service.yaml'],
    appliesTo: ['src/**', 'contracts/**', 'headers.*'],
    description: 'Validate browser security-header contracts.'
  }),
  repositoryContractRule({
    id: 'repository.contract.assets',
    group: 'cross-cutting',
    sourceProof: ['service.yaml'],
    appliesTo: ['src/**', 'public/**', 'contracts/**'],
    description: 'Validate asset size, format, and delivery contracts.'
  }),
  repositoryContractRule({
    id: 'repository.contract.llms',
    group: 'cross-cutting',
    sourceProof: ['service.yaml'],
    appliesTo: ['llms.txt', 'llms-full.txt', 'robots.txt'],
    description: 'Validate public LLM discovery artifacts.'
  }),
  repositoryContractRule({
    id: 'repository.contract.core',
    sourceProof: ['service.yaml', 'contracts/core/**'],
    appliesTo: ['service.yaml', 'contracts/**', 'schemas/**', 'src/**'],
    description: 'Validate core platform command, auth, audit, persistence, and outbox contracts.'
  }),
  repositoryContractRule({
    id: 'repository.contract.app-shell',
    sourceProof: ['service.yaml', 'contracts/app-shell/**'],
    appliesTo: ['service.yaml', 'contracts/**', 'src/**'],
    description: 'Validate app-shell routing and platform ownership boundaries.'
  }),
  repositoryContractRule({
    id: 'repository.contract.runtime',
    sourceProof: ['service.yaml', 'contracts/runtime/**'],
    appliesTo: ['service.yaml', 'contracts/**', 'src/**'],
    description: 'Validate runtime health, smoke, deployment, and rollback contracts.'
  }),
  repositoryContractRule({
    id: 'repository.contract.api-contracts',
    sourceProof: ['service.yaml', 'contracts/api/**'],
    appliesTo: ['service.yaml', 'contracts/**', 'schemas/**', 'src/**'],
    description: 'Validate API contract source and export-generation boundaries.'
  }),
  repositoryContractRule({
    id: 'repository.contract.libs',
    sourceProof: ['service.yaml', 'contracts/libs/**'],
    appliesTo: ['service.yaml', 'contracts/**', 'schemas/**', 'src/**'],
    description: 'Validate shared TypeScript library contract and export surfaces.'
  }),
  repositoryContractRule({
    id: 'repository.contract.localization',
    sourceProof: ['service.yaml', 'contracts/localization/**'],
    appliesTo: ['service.yaml', 'contracts/**', 'src/**'],
    description: 'Validate localization platform adoption and package boundaries.'
  }),
  repositoryContractRule({
    id: 'repository.contract.client-sdks',
    sourceProof: ['service.yaml', 'contracts/client-sdks/**'],
    appliesTo: ['service.yaml', 'contracts/**', 'schemas/**', 'src/**'],
    description: 'Validate SDK generation handoff and public client surfaces.'
  }),
  repositoryContractRule({
    id: 'repository.contract.edge',
    sourceProof: ['service.yaml', 'contracts/edge/**'],
    appliesTo: ['service.yaml', 'contracts/**', 'src/**'],
    description: 'Validate edge request, webhook, queue, and analytics ingress boundaries.'
  }),
  repositoryContractRule({
    id: 'repository.contract.observability',
    sourceProof: ['service.yaml', 'contracts/observability/**'],
    appliesTo: ['service.yaml', 'contracts/**', 'src/**'],
    description: 'Validate telemetry, dashboard, and alert contracts.'
  }),
  repositoryContractRule({
    id: 'repository.contract.infra',
    sourceProof: ['service.yaml', 'contracts/infra/**'],
    appliesTo: ['service.yaml', 'contracts/**', 'src/**'],
    description: 'Validate provider-neutral infrastructure, backup, and environment contracts.'
  }),
  repositoryContractRule({
    id: 'repository.contract.security',
    sourceProof: ['service.yaml', 'contracts/security/**'],
    appliesTo: ['service.yaml', 'contracts/**', 'src/**'],
    description: 'Validate security baseline, threat model, secret, and dependency contracts.'
  }),
  repositoryContractRule({
    id: 'repository.contract.token',
    sourceProof: ['service.yaml', 'contracts/token/**'],
    appliesTo: ['service.yaml', 'contracts/**', 'schemas/**', 'src/**'],
    description: 'Validate token authority, package, indexer, and custody contracts.'
  }),
  repositoryContractRule({
    id: 'repository.contract.data-platform',
    sourceProof: ['service.yaml', 'contracts/data-platform/**'],
    appliesTo: ['service.yaml', 'contracts/**', 'schemas/**', 'src/**'],
    description: 'Validate analytics ingestion, ClickHouse, deletion, and runtime contracts.'
  }),
  repositoryContractRule({
    id: 'repository.contract.growth-lab',
    sourceProof: ['service.yaml', 'contracts/growth-lab/**'],
    appliesTo: ['service.yaml', 'contracts/**', 'src/**'],
    description: 'Validate growth metric, experiment, and safety boundaries.'
  }),
  repositoryContractRule({
    id: 'repository.contract.privacy',
    sourceProof: ['service.yaml', 'contracts/privacy/**'],
    appliesTo: ['service.yaml', 'contracts/**', 'schemas/**', 'src/**'],
    description: 'Validate privacy broker capability, minimization, and access boundaries.'
  }),
  repositoryContractRule({
    id: 'repository.contract.credential-vault',
    sourceProof: ['service.yaml', 'contracts/credential-vault/**'],
    appliesTo: ['service.yaml', 'contracts/**', 'schemas/**', 'src/**'],
    description: 'Validate credential issuance, storage, audit, and secret boundaries.'
  }),
  repositoryContractRule({
    id: 'repository.contract.connectors',
    sourceProof: ['service.yaml', 'contracts/connectors/**'],
    appliesTo: ['service.yaml', 'contracts/**', 'schemas/**', 'src/**'],
    description: 'Validate connector provider, replay, sync-state, and capability boundaries.'
  }),
  repositoryContractRule({
    id: 'repository.contract.money-platform',
    sourceProof: ['service.yaml', 'contracts/money/**'],
    appliesTo: ['service.yaml', 'contracts/**', 'schemas/**', 'src/**'],
    description: 'Validate money command, ledger, webhook, entitlement, and persistence contracts.'
  })
] as const;

export type ValidationRuleId = (typeof VALIDATION_RULE_REGISTRY)[number]['id'];

export interface ValidationRuleSelectorInput {
  readonly ruleIds?: readonly string[];
  readonly groups?: readonly string[];
  readonly severities?: readonly string[];
}

export interface ValidationRuleSelection {
  readonly ruleIds: ReadonlySet<ValidationRuleId> | null;
  readonly severities: ReadonlySet<DiagnosticSeverity> | null;
}

const RULE_METADATA_BY_ID = new Map<string, ValidationRuleMetadata>(
  VALIDATION_RULE_REGISTRY.map((metadata) => [metadata.id, metadata])
);
const RULE_GROUP_SET = new Set<string>(VALIDATION_RULE_GROUPS);
const DIAGNOSTIC_SEVERITY_SET = new Set<string>(['error', 'warning']);


export function isValidationRuleId(value: string): value is ValidationRuleId {
  return RULE_METADATA_BY_ID.has(value);
}

function isDiagnosticSeverity(value: string): value is DiagnosticSeverity {
  return DIAGNOSTIC_SEVERITY_SET.has(value);
}

function metadataUsesInput(
  metadata: ValidationRuleMetadata,
  input: ValidationRuleInput
): boolean {
  return metadata.inputs.includes(input);
}

export function resolveValidationRuleSelection(
  input: ValidationRuleSelectorInput
): ValidationRuleSelection | null {
  const selectedRuleIds = new Set<ValidationRuleId>();
  const hasRuleSelector =
    (input.ruleIds?.length ?? 0) > 0 || (input.groups?.length ?? 0) > 0;

  for (const ruleId of input.ruleIds ?? []) {
    if (!isValidationRuleId(ruleId)) {
      return null;
    }

    selectedRuleIds.add(ruleId);
  }

  for (const group of input.groups ?? []) {
    if (!RULE_GROUP_SET.has(group)) {
      return null;
    }

    for (const metadata of VALIDATION_RULE_REGISTRY) {
      if (metadata.group === group) {
        selectedRuleIds.add(metadata.id);
      }
    }
  }

  const severities = new Set<DiagnosticSeverity>();
  for (const severity of input.severities ?? []) {
    if (!isDiagnosticSeverity(severity)) {
      return null;
    }

    severities.add(severity);
  }

  return {
    ruleIds: hasRuleSelector ? selectedRuleIds : null,
    severities: severities.size > 0 ? severities : null
  };
}

export function isValidationRuleSelected(
  ruleId: ValidationRuleId,
  selection: ValidationRuleSelection | undefined
): boolean {
  const metadata = RULE_METADATA_BY_ID.get(ruleId);
  if (metadata === undefined) {
    return false;
  }

  if (metadata.alwaysRun === true) {
    return true;
  }

  if (selection?.ruleIds !== null && selection?.ruleIds !== undefined) {
    if (!selection.ruleIds.has(ruleId)) {
      return false;
    }
  }

  if (
    selection?.severities !== null &&
    selection?.severities !== undefined &&
    metadata.defaultSeverity !== 'mixed' &&
    !selection.severities.has(metadata.defaultSeverity)
  ) {
    return false;
  }

  return true;
}

export function validationSelectionUsesInput(
  selection: ValidationRuleSelection | undefined,
  input: ValidationRuleInput
): boolean {
  return VALIDATION_RULE_REGISTRY.some(
    (metadata) =>
      metadataUsesInput(metadata, input) &&
      isValidationRuleSelected(metadata.id, selection)
  );
}

export function filterDiagnosticsForSelection(
  diagnostics: readonly Diagnostic[],
  selection: ValidationRuleSelection | undefined
): readonly Diagnostic[] {
  if (selection?.severities === null || selection?.severities === undefined) {
    return diagnostics;
  }

  return diagnostics.filter((diagnostic) =>
    selection.severities?.has(diagnostic.severity)
  );
}

export function getValidationRuleMetadata(
  ruleId: ValidationRuleId
): ValidationRuleMetadata {
  const metadata = RULE_METADATA_BY_ID.get(ruleId);
  if (metadata === undefined) {
    throw new Error(`Validation rule metadata is missing for ${ruleId}.`);
  }

  return metadata;
}
