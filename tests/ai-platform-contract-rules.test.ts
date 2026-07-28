import { describe, expect, test } from 'bun:test';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  validateModelEvaluationPromotionValue,
  validateRepositoryAiPlatformContract
} from '../src/ai-platform-contract-rules.ts';
import {
  validateEvaluationSuiteValue,
  validateModelArtifactRegistryValue
} from '../src/ai-platform-schema-contract-rules.ts';

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
    artifactRegistryRef: 'contracts/model-artifacts.json',
    evaluationSuiteRefs: [
      'contracts/evaluation-suites/translation-correction.v1.json',
      'contracts/evaluation-suites/novel-generation.v1.json'
    ],
    executionSchemaRefs: [
      'contracts/schemas/inference-execution-request.v1.schema.json',
      'contracts/schemas/inference-execution-result.v1.schema.json',
      'contracts/schemas/inference-execution-error.v1.schema.json',
      'contracts/schemas/inference-serving-receipt.v1.schema.json'
    ],
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
      {
        requestedAlias: 'org/model',
        resolvedArtifactId: 'artifact.example',
        status: 'identity-pinned-provenance-blocked',
        promotionEligible: false
      }
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
    expect(
      validateModelEvaluationPromotionValue(contract).some(
        (diagnostic) => diagnostic.path === 'researchLeads'
      )
    ).toBe(true);
  });

  test('reports required companion contract files when only the promotion file exists', async () => {
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
    expect(
      diagnostics.some(
        (diagnostic) => diagnostic.file === 'contracts/model-artifacts.json'
      )
    ).toBe(true);
  });

  test('passes a pinned but provenance-blocked artifact registry', () => {
    const revision = 'a'.repeat(40);
    const sha256 = 'b'.repeat(64);
    expect(
      validateModelArtifactRegistryValue({
        schemaVersion: 'zdp.ai.model-artifacts/v1',
        status: 'research-only',
        weightManifestAlgorithm: 'sha256-utf8-lines:path-colon-sha256-lf-sorted-by-path',
        artifacts: [
          {
            id: 'artifact.example',
            requestedAlias: 'org/model',
            modelRepository: 'org/model',
            modelRevision: revision,
            tokenizerRevision: revision,
            tokenizerSha256: sha256,
            chatTemplateSha256: sha256,
            weightManifestSha256: sha256,
            weightFiles: [{ path: 'model.safetensors', sizeBytes: 1, sha256 }],
            artifactFormat: 'safetensors',
            precision: 'bf16',
            declaredLicense: 'apache-2.0',
            licenseEvidenceRef: `https://huggingface.co/org/model/blob/${revision}/README.md`,
            baseModelRepository: 'org/base-model',
            baseModelRevision: null,
            provenanceReview: { status: 'blocked', reasons: ['unresolved evidence'] },
            promotionEligible: false
          }
        ]
      })
    ).toEqual([]);
  });

  test('rejects an artifact that claims promotion while provenance is blocked', () => {
    const diagnostics = validateModelArtifactRegistryValue({
      schemaVersion: 'zdp.ai.model-artifacts/v1',
      status: 'research-only',
      weightManifestAlgorithm: 'sha256-utf8-lines:path-colon-sha256-lf-sorted-by-path',
      artifacts: [
        {
          id: 'artifact.example',
          requestedAlias: 'org/model',
          modelRepository: 'org/model',
          modelRevision: 'not-a-revision',
          tokenizerRevision: 'not-a-revision',
          tokenizerSha256: 'bad',
          chatTemplateSha256: 'bad',
          weightManifestSha256: 'bad',
          weightFiles: [],
          artifactFormat: 'safetensors',
          precision: 'bf16',
          declaredLicense: 'apache-2.0',
          licenseEvidenceRef: 'https://huggingface.co/org/model',
          baseModelRepository: 'org/base-model',
          baseModelRevision: 'unverified',
          provenanceReview: { status: 'blocked', reasons: ['unresolved evidence'] },
          promotionEligible: true
        }
      ]
    });
    expect(diagnostics.some((diagnostic) => diagnostic.path.endsWith('promotionEligible'))).toBe(true);
    expect(diagnostics.some((diagnostic) => diagnostic.path.endsWith('modelRevision'))).toBe(true);
  });

  test('keeps deterministic suite gates at one hundred percent', () => {
    const suite = {
      schemaVersion: 'zdp.ai.evaluation-suite/v1',
      id: 'suite.translation-correction.v1',
      useCase: 'translation_correction',
      fixtureSchemaRef: 'contracts/schemas/evaluation-case.v1.schema.json',
      pilotSlices: { languageOrGenre: ['en>ko'], risk: ['general'] },
      acceptedOutcome: {
        deterministicChecks: ['preserve ids'],
        humanRubric: ['meaning'],
        falseAcceptDefinition: 'critical error admitted',
        abstainPolicy: 'use baseline'
      },
      promotionThresholds: { deterministicCheckPassRate: 1 },
      economics: { metric: 'cost_per_accepted_outcome', include: ['inference'] },
      reviewPolicy: 'calibrate subjective thresholds only'
    };
    expect(
      validateEvaluationSuiteValue(suite, {
        file: 'suite.json',
        id: 'suite.translation-correction.v1',
        useCase: 'translation_correction'
      })
    ).toEqual([]);
    suite.promotionThresholds.deterministicCheckPassRate = 0.99;
    expect(
      validateEvaluationSuiteValue(suite, {
        file: 'suite.json',
        id: 'suite.translation-correction.v1',
        useCase: 'translation_correction'
      }).some((diagnostic) => diagnostic.path === 'promotionThresholds.deterministicCheckPassRate')
    ).toBe(true);
  });
});
