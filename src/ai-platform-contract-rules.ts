import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Diagnostic } from './diagnostics.ts';
import { validateAiPlatformContractFiles } from './ai-platform-schema-contract-rules.ts';

const RULE_ID = 'ZDP-AI-PLATFORM-001';
const REPOSITORY = 'zdp-ai-platform';
const CONTRACT_FILE = 'contracts/model-evaluation-promotion.json';
const REQUIRED_EVALUATION_UNIT = [
  'artifactIdentity',
  'servingVariant',
  'taskProfile',
  'evaluationSuite'
] as const;
const REQUIRED_PROMOTION_KEY = [
  'useCase',
  'languageOrGenreSlice',
  'riskSlice'
] as const;
const REQUIRED_STATES = [
  'registered',
  'experiment',
  'limited',
  'default_candidate',
  'default',
  'deprecated',
  'retired',
  'quarantined'
] as const;

export async function validateRepositoryAiPlatformContract(input: {
  readonly repositoryRoot: string | undefined;
  readonly repositoryServiceContract: unknown;
}): Promise<readonly Diagnostic[]> {
  if (
    input.repositoryRoot === undefined ||
    readPath(input.repositoryServiceContract, 'service.repo') !== REPOSITORY
  ) {
    return [];
  }

  let value: unknown;
  try {
    value = JSON.parse(await readFile(join(input.repositoryRoot, CONTRACT_FILE), 'utf8'));
  } catch (error) {
    return [
      diagnostic(
        CONTRACT_FILE,
        error instanceof SyntaxError
          ? 'Model evaluation and promotion contract must be valid JSON.'
          : 'Model evaluation and promotion contract is required.'
      )
    ];
  }

  return [
    ...validateModelEvaluationPromotionValue(value),
    ...(await validateAiPlatformContractFiles(input.repositoryRoot, value)),
    ...validateServiceRuleRegistration(input.repositoryServiceContract)
  ];
}

export function validateModelEvaluationPromotionValue(
  value: unknown
): readonly Diagnostic[] {
  if (!isRecord(value)) return [diagnostic('', 'Contract must be a JSON object.')];
  const diagnostics: Diagnostic[] = [];
  requireExact(value, 'schemaVersion', 'zdp.ai.model-evaluation-promotion/v1', diagnostics);
  requireExact(value, 'status', 'contract-only', diagnostics);
  requireExact(value, 'ownership.evaluationAndPromotion', 'zdp-ai-platform', diagnostics);
  requireExact(value, 'ownership.execution', 'zdp-ai-inference', diagnostics);
  requireExact(value, 'ownership.providerLifecycle', 'zdp-platform-infra', diagnostics);
  requireExact(value, 'ownership.providerCredentials', 'zdp-privacy-credential-vault', diagnostics);
  requireExact(value, 'ownership.finalBillingTruth', 'zdp-money-platform', diagnostics);
  requireExact(value, 'executionContract.schemaVersion', 'zdp.inference.execution.v1', diagnostics);
  requireExact(value, 'executionContract.normalCaller', 'zdp-ai-platform', diagnostics);
  requireExact(value, 'executionContract.closedFields', true, diagnostics);
  requireExact(value, 'executionContract.rawEngineOptionPassthrough', false, diagnostics);
  requireExact(value, 'executionContract.selectionOwner', 'zdp-ai-platform', diagnostics);
  requireExact(value, 'artifactRegistryRef', 'contracts/model-artifacts.json', diagnostics);
  requireExactList(
    value,
    'evaluationSuiteRefs',
    [
      'contracts/evaluation-suites/translation-correction.v1.json',
      'contracts/evaluation-suites/novel-generation.v1.json'
    ],
    diagnostics
  );
  requireExactList(
    value,
    'executionSchemaRefs',
    [
      'contracts/schemas/inference-execution-request.v1.schema.json',
      'contracts/schemas/inference-execution-result.v1.schema.json',
      'contracts/schemas/inference-execution-error.v1.schema.json',
      'contracts/schemas/inference-serving-receipt.v1.schema.json'
    ],
    diagnostics
  );
  requireExactList(value, 'evaluationUnit', REQUIRED_EVALUATION_UNIT, diagnostics);
  requireExactList(value, 'promotionStates', REQUIRED_STATES, diagnostics);
  requireExactList(
    value,
    'promotionRequirements.promotionKeyFields',
    REQUIRED_PROMOTION_KEY,
    diagnostics
  );
  for (const path of [
    'promotionRequirements.immutableIdentity',
    'promotionRequirements.capableBaselineRequired',
    'promotionRequirements.externalOrDeterministicEvaluatorRequired',
    'promotionRequirements.falseAcceptMeasuredSeparately',
    'promotionRequirements.costPerAcceptedOutcomeRequired',
    'promotionRequirements.latencyEvidenceRequired',
    'promotionRequirements.outOfDistributionFallbackRequired',
    'promotionRequirements.sameTaskMixComparisonRequired',
    'promotionRequirements.humanApprovalRequiredForDefault'
  ]) {
    requireExact(value, path, true, diagnostics);
  }
  for (const path of [
    'artifactIdentityRequiredFields',
    'servingVariantRequiredFields',
    'evaluationSubjectRequiredFields',
    'activationRequirements'
  ]) {
    const list = readStringArray(readPath(value, path));
    if (list.length === 0 || new Set(list).size !== list.length) {
      diagnostics.push(diagnostic(path, `\`${path}\` must be a non-empty unique string array.`));
    }
  }
  const leads = readPath(value, 'researchLeads');
  if (!Array.isArray(leads) || leads.some((lead) => !isResearchOnlyLead(lead))) {
    diagnostics.push(
      diagnostic(
        'researchLeads',
        'Research leads must link to immutable artifacts and remain identity-pinned-provenance-blocked with promotionEligible=false.'
      )
    );
  }
  return diagnostics;
}

function validateServiceRuleRegistration(value: unknown): readonly Diagnostic[] {
  const rules = readStringArray(readPath(value, 'policy_gates.required_linter_rules'));
  return rules.includes(RULE_ID)
    ? []
    : [diagnostic('service.yaml', `service.yaml must require linter rule \`${RULE_ID}\`.`)];
}

function isResearchOnlyLead(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.requestedAlias === 'string' &&
    value.requestedAlias.length > 0 &&
    typeof value.resolvedArtifactId === 'string' &&
    value.resolvedArtifactId.length > 0 &&
    value.status === 'identity-pinned-provenance-blocked' &&
    value.promotionEligible === false
  );
}

function requireExact(
  value: Record<string, unknown>,
  path: string,
  expected: unknown,
  diagnostics: Diagnostic[]
): void {
  if (readPath(value, path) !== expected) {
    diagnostics.push(diagnostic(path, `\`${path}\` must equal \`${String(expected)}\`.`));
  }
}

function requireExactList(
  value: Record<string, unknown>,
  path: string,
  expected: readonly string[],
  diagnostics: Diagnostic[]
): void {
  const actual = readStringArray(readPath(value, path));
  if (actual.length !== expected.length || actual.some((item, index) => item !== expected[index])) {
    diagnostics.push(diagnostic(path, `\`${path}\` must equal the reviewed ordered contract.`));
  }
}

function diagnostic(path: string, message: string): Diagnostic {
  return { ruleId: RULE_ID, severity: 'error', file: CONTRACT_FILE, path, message };
}

function readPath(value: unknown, path: string): unknown {
  let current = value;
  for (const segment of path.split('.')) {
    current = isRecord(current) ? current[segment] : undefined;
  }
  return current;
}

function readStringArray(value: unknown): readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? value
    : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
