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
  validateModelAdoptionReviewRegistryValue,
  validateModelArtifactRegistryValue,
  validatePromotionStateMachineValue
} from '../src/ai-platform-schema-contract-rules.ts';

function validContract(): Record<string, unknown> {
  return {
    schemaVersion: 'zdp.ai.model-evaluation-promotion/v2',
    status: 'contract-only',
    ownership: {
      evaluationAndPromotion: 'zdp-ai-platform',
      execution: 'zdp-ai-inference',
      providerLifecycle: 'zdp-platform-infra',
      providerCredentials: 'zdp-privacy-credential-vault',
      publicationContentAndAuthorship: 'product-repository',
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
    adoptionReviewRegistryRef: 'contracts/model-adoption-reviews.json',
    promotionStateMachineRef: 'contracts/model-promotion-state-machine.json',
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
    artifactIdentityRequiredFields: ['modelRevision', 'adoptionReviewId'],
    servingVariantRequiredFields: ['quantization'],
    evaluationSubjectRequiredFields: ['useCase'],
    promotionStates: [
      'registered', 'experiment', 'limited', 'default_candidate', 'default',
      'deprecated', 'retired', 'quarantined'
    ],
    promotionRequirements: {
      immutableIdentity: true,
      adoptionReviewRequired: true,
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
    researchCandidates: [
      {
        requestedAlias: 'org/model',
        resolvedArtifactId: 'artifact.example',
        adoptionReviewId: 'model-review.example.v1',
        currentState: 'intake_pending'
      }
    ],
    activationRequirements: ['pin immutable revisions']
  };
}

describe('AI platform model evaluation contract', () => {
  test('passes the reviewed contract shape', () => {
    expect(validateModelEvaluationPromotionValue(validContract())).toEqual([]);
  });

  test('rejects legacy promotion booleans instead of interpreting them as sale prohibition', () => {
    const contract = validContract();
    contract.researchCandidates = [
      { requestedAlias: 'org/model:latest', status: 'default', promotionEligible: true }
    ];
    expect(
      validateModelEvaluationPromotionValue(contract).some(
        (diagnostic) => diagnostic.path.includes('promotionEligible')
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

  test('passes an immutable artifact that remains intake pending', () => {
    const revision = 'a'.repeat(40);
    const sha256 = 'b'.repeat(64);
    expect(
      validateModelArtifactRegistryValue({
        schemaVersion: 'zdp.ai.model-artifacts/v2',
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
            modelCardSnapshotSha256: null,
            licenseSnapshotSha256: null,
            noticeSnapshotSha256: null,
            baseModelRepository: 'org/base-model',
            baseModelRevision: null,
            intakeStatus: 'intake_pending',
            adoptionReviewId: 'model-review.example.v1'
          }
        ]
      })
    ).toEqual([]);
  });

  test('rejects legacy booleans and registered artifacts without snapshot evidence', () => {
    const diagnostics = validateModelArtifactRegistryValue({
      schemaVersion: 'zdp.ai.model-artifacts/v2',
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
          modelCardSnapshotSha256: null,
          licenseSnapshotSha256: null,
          noticeSnapshotSha256: null,
          baseModelRepository: 'org/base-model',
          baseModelRevision: null,
          intakeStatus: 'registered',
          adoptionReviewId: 'model-review.example.v1',
          promotionEligible: true
        }
      ]
    });
    expect(diagnostics.some((diagnostic) => diagnostic.path.endsWith('promotionEligible'))).toBe(true);
    expect(diagnostics.some((diagnostic) => diagnostic.path.endsWith('modelRevision'))).toBe(true);
    expect(diagnostics.some((diagnostic) => diagnostic.path.endsWith('licenseSnapshotSha256'))).toBe(true);
  });

  test('requires conditional commercial-output controls and forbids legacy booleans', () => {
    const validDecision = {
      status: 'conditional',
      scopes: ['offline'],
      conditions: ['review required'],
      source_refs: ['https://example.invalid/source']
    };
    const validRecord = {
      review_id: 'model-review.example.v1',
      artifact_id: 'artifact.example',
      review_status: 'draft',
      decisions: {
        internal_execution: validDecision,
        output_commercial_use: {
          ...validDecision,
          jurisdictions: ['unresolved'],
          sales_channels: ['unresolved']
        },
        weight_redistribution: validDecision,
        hosted_inference: validDecision,
        training_data_provenance: {
          status: 'blocked',
          known_sources: [],
          unresolved_sources: ['dataset'],
          pii_review: 'unknown',
          conditions: ['resolve dataset'],
          source_refs: ['https://example.invalid/source']
        },
        copyright_protection_risk: {
          status: 'high',
          scopes: ['publication'],
          human_authorship_requirements: ['planning evidence'],
          conditions: ['human review'],
          source_refs: ['https://example.invalid/source']
        }
      },
      promotion: {
        current_status: 'intake_pending',
        blocking_reasons: ['review incomplete']
      }
    };
    const registry = {
      schemaVersion: 'zdp.ai.model-adoption-reviews/v1',
      status: 'contract-only',
      decisionAxes: [
        'internal_execution',
        'output_commercial_use',
        'weight_redistribution',
        'hosted_inference',
        'training_data_provenance',
        'copyright_protection_risk'
      ],
      records: [validRecord]
    };
    expect(validateModelAdoptionReviewRegistryValue(registry)).toEqual([]);
    validRecord.decisions.output_commercial_use.conditions = [];
    (validRecord as Record<string, unknown>).safeForSale = true;
    const diagnostics = validateModelAdoptionReviewRegistryValue(registry);
    expect(diagnostics.some((diagnostic) => diagnostic.path.includes('safeForSale'))).toBe(true);
    expect(diagnostics.some((diagnostic) => diagnostic.path.endsWith('output_commercial_use'))).toBe(true);
  });

  test('requires the reviewed fail-closed promotion transition graph', () => {
    const stateMachine = {
      schemaVersion: 'zdp.ai.model-promotion-state-machine/v1',
      status: 'contract-only',
      states: [
        'intake_pending', 'registered', 'experiment', 'limited', 'default_candidate',
        'default', 'deprecated', 'retired', 'quarantined'
      ],
      transitions: {
        intake_pending: ['registered', 'quarantined'],
        registered: ['experiment', 'deprecated', 'quarantined'],
        experiment: ['limited', 'deprecated', 'quarantined'],
        limited: ['default_candidate', 'deprecated', 'quarantined'],
        default_candidate: ['default', 'limited', 'deprecated', 'quarantined'],
        default: ['deprecated', 'quarantined'],
        deprecated: ['retired', 'quarantined'],
        retired: [],
        quarantined: ['intake_pending']
      },
      entryGuards: Object.fromEntries(
        ['registered', 'experiment', 'limited', 'default_candidate', 'default', 'deprecated', 'retired', 'quarantined']
          .map((state) => [state, ['guard']])
      ),
      globalRules: ['unknown transition fails closed']
    };
    expect(validatePromotionStateMachineValue(stateMachine)).toEqual([]);
    stateMachine.transitions.intake_pending = ['default'];
    expect(
      validatePromotionStateMachineValue(stateMachine).some(
        (diagnostic) => diagnostic.path === 'transitions.intake_pending'
      )
    ).toBe(true);
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
