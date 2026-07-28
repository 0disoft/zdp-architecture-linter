import { describe, expect, test } from 'bun:test';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  validateModelEvaluationPromotionValue,
  validateRepositoryAiPlatformContract
} from '../src/ai-platform-contract-rules.ts';

function validContract(): Record<string, unknown> {
  return {
    schemaVersion: 'zdp.ai.model-evaluation-promotion/v1',
    status: 'contract-only',
    ownership: {
      evaluationAndPromotion: 'zdp-ai-platform',
      execution: 'zdp-ai-inference',
      providerLifecycle: 'zdp-platform-infra',
      providerCredentials: 'zdp-privacy-credential-vault',
      finalBillingTruth: 'zdp-money-platform'
    },
    executionContract: {
      schemaVersion: 'zdp.inference.execution.v1',
      normalCaller: 'zdp-ai-platform',
      closedFields: true,
      rawEngineOptionPassthrough: false,
      selectionOwner: 'zdp-ai-platform'
    },
    evaluationUnit: ['artifactIdentity', 'servingVariant', 'taskProfile', 'evaluationSuite'],
    artifactIdentityRequiredFields: ['modelRevision'],
    servingVariantRequiredFields: ['quantization'],
    evaluationSubjectRequiredFields: ['useCase'],
    promotionStates: [
      'registered', 'experiment', 'limited', 'default_candidate', 'default',
      'deprecated', 'retired', 'quarantined'
    ],
    promotionRequirements: {
      immutableIdentity: true,
      capableBaselineRequired: true,
      externalOrDeterministicEvaluatorRequired: true,
      falseAcceptMeasuredSeparately: true,
      costPerAcceptedOutcomeRequired: true,
      latencyEvidenceRequired: true,
      outOfDistributionFallbackRequired: true,
      sameTaskMixComparisonRequired: true,
      humanApprovalRequiredForDefault: true,
      promotionKeyFields: ['useCase', 'languageOrGenreSlice', 'riskSlice']
    },
    researchLeads: [
      { requestedAlias: 'org/model', status: 'revision-required', promotionEligible: false }
    ],
    activationRequirements: ['pin immutable revisions']
  };
}

describe('AI platform model evaluation contract', () => {
  test('passes the reviewed contract shape', () => {
    expect(validateModelEvaluationPromotionValue(validContract())).toEqual([]);
  });

  test('rejects mutable aliases promoted without immutable evidence', () => {
    const contract = validContract();
    contract.researchLeads = [
      { requestedAlias: 'org/model:latest', status: 'default', promotionEligible: true }
    ];
    expect(validateModelEvaluationPromotionValue(contract)).toContainEqual({
      ruleId: 'ZDP-AI-PLATFORM-001',
      severity: 'error',
      file: 'contracts/model-evaluation-promotion.json',
      path: 'researchLeads',
      message:
        'Research leads must remain revision-required and promotionEligible=false until immutable identity evidence exists.'
    });
  });

  test('validates the live repository contract and rule registration', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zdp-ai-platform-contract-'));
    await mkdir(join(root, 'contracts'));
    await writeFile(
      join(root, 'contracts', 'model-evaluation-promotion.json'),
      JSON.stringify(validContract())
    );
    const diagnostics = await validateRepositoryAiPlatformContract({
      repositoryRoot: root,
      repositoryServiceContract: {
        service: { repo: 'zdp-ai-platform' },
        policy_gates: { required_linter_rules: ['ZDP-AI-PLATFORM-001'] }
      }
    });
    expect(diagnostics).toEqual([]);
  });
});
