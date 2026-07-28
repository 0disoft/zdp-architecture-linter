import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import Ajv2020, { type AnySchema, type ValidateFunction } from 'ajv/dist/2020.js';
import type { Diagnostic } from './diagnostics.ts';

const RULE_ID = 'ZDP-AI-PLATFORM-001';
const MODEL_ARTIFACTS_FILE = 'contracts/model-artifacts.json';
const MODEL_ADOPTION_REVIEWS_FILE = 'contracts/model-adoption-reviews.json';
const MODEL_ADOPTION_REVIEW_SCHEMA_FILE = 'contracts/schemas/model-adoption-review.v1.schema.json';
const MODEL_ADOPTION_REVIEW_PASS_FILE = 'contracts/fixtures/model-adoption-review/pass.json';
const MODEL_ADOPTION_REVIEW_FAIL_LEGACY_FILE = 'contracts/fixtures/model-adoption-review/fail-legacy-boolean.json';
const MODEL_ADOPTION_REVIEW_FAIL_CONDITIONAL_FILE = 'contracts/fixtures/model-adoption-review/fail-conditional-without-controls.json';
const MODEL_PROMOTION_STATE_MACHINE_FILE = 'contracts/model-promotion-state-machine.json';
const EVALUATION_SCHEMA_FILE = 'contracts/schemas/evaluation-case.v1.schema.json';
const TRANSLATION_SUITE_FILE = 'contracts/evaluation-suites/translation-correction.v1.json';
const NOVEL_SUITE_FILE = 'contracts/evaluation-suites/novel-generation.v1.json';
const TRANSLATION_CASE_FILE = 'contracts/fixtures/evaluation/translation-correction.pass.json';
const NOVEL_CASE_FILE = 'contracts/fixtures/evaluation/novel-generation.pass.json';
const REQUIRED_DECISION_AXES = [
  'internal_execution',
  'output_commercial_use',
  'weight_redistribution',
  'hosted_inference',
  'training_data_provenance',
  'copyright_protection_risk'
] as const;
const PROMOTION_STATES_WITH_INTAKE = [
  'intake_pending',
  'registered',
  'experiment',
  'limited',
  'default_candidate',
  'default',
  'deprecated',
  'retired',
  'quarantined'
] as const;
const FORBIDDEN_DECISION_BOOLEANS = new Set([
  'promotionEligible',
  'commercial',
  'safeForSale'
]);

const EXECUTION_SURFACES = [
  {
    schema: 'contracts/schemas/inference-execution-request.v1.schema.json',
    pass: ['contracts/fixtures/inference/request.pass.json'],
    fail: [
      ['contracts/fixtures/inference/request.fail-unknown-field.json', 'unexpected'],
      ['contracts/fixtures/inference/request.fail-raw-engine-options.json', 'rawEngineOptions'],
      ['contracts/fixtures/inference/request.fail-model-url.json', 'modelUrl'],
      ['contracts/fixtures/inference/request.fail-provider-credential.json', 'providerCredential']
    ]
  },
  {
    schema: 'contracts/schemas/inference-execution-result.v1.schema.json',
    pass: ['contracts/fixtures/inference/result.pass.json'],
    fail: []
  },
  {
    schema: 'contracts/schemas/inference-execution-error.v1.schema.json',
    pass: ['contracts/fixtures/inference/error.pass.json'],
    fail: []
  },
  {
    schema: 'contracts/schemas/inference-serving-receipt.v1.schema.json',
    pass: ['contracts/fixtures/inference/receipt.pass.json'],
    fail: []
  }
] as const;

export async function validateAiPlatformContractFiles(
  repositoryRoot: string,
  promotionContract: unknown
): Promise<readonly Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
  const artifacts = await readJson(repositoryRoot, MODEL_ARTIFACTS_FILE, diagnostics);
  if (artifacts !== null) {
    diagnostics.push(...validateModelArtifactRegistryValue(artifacts));
  }

  const adoptionReviews = await readJson(repositoryRoot, MODEL_ADOPTION_REVIEWS_FILE, diagnostics);
  const adoptionReviewSchema = await readJson(repositoryRoot, MODEL_ADOPTION_REVIEW_SCHEMA_FILE, diagnostics);
  const promotionStateMachine = await readJson(repositoryRoot, MODEL_PROMOTION_STATE_MACHINE_FILE, diagnostics);
  if (adoptionReviews !== null) {
    diagnostics.push(...validateModelAdoptionReviewRegistryValue(adoptionReviews));
  }
  if (promotionStateMachine !== null) {
    diagnostics.push(...validatePromotionStateMachineValue(promotionStateMachine));
  }
  if (artifacts !== null && adoptionReviews !== null) {
    diagnostics.push(...validateArtifactAdoptionReviewLinks(artifacts, adoptionReviews));
    diagnostics.push(...validatePromotionCandidateLinks(promotionContract, artifacts, adoptionReviews));
  }
  if (adoptionReviewSchema !== null) {
    const validator = compileSchema(adoptionReviewSchema, MODEL_ADOPTION_REVIEW_SCHEMA_FILE, diagnostics);
    if (validator !== null) {
      if (adoptionReviews !== null && isRecord(adoptionReviews) && Array.isArray(adoptionReviews.records)) {
        adoptionReviews.records.forEach((record, index) =>
          validatePassFixture(validator, record, `${MODEL_ADOPTION_REVIEWS_FILE}#records[${index}]`, diagnostics)
        );
      }
      const passFixture = await readJson(repositoryRoot, MODEL_ADOPTION_REVIEW_PASS_FILE, diagnostics);
      if (passFixture !== null) validatePassFixture(validator, passFixture, MODEL_ADOPTION_REVIEW_PASS_FILE, diagnostics);
      const legacyFixture = await readJson(repositoryRoot, MODEL_ADOPTION_REVIEW_FAIL_LEGACY_FILE, diagnostics);
      if (legacyFixture !== null) {
        validateAdditionalPropertyFailure(
          validator,
          legacyFixture,
          MODEL_ADOPTION_REVIEW_FAIL_LEGACY_FILE,
          'promotionEligible',
          diagnostics
        );
      }
      const conditionalFixture = await readJson(repositoryRoot, MODEL_ADOPTION_REVIEW_FAIL_CONDITIONAL_FILE, diagnostics);
      if (conditionalFixture !== null) {
        validateFailureAtPath(
          validator,
          conditionalFixture,
          MODEL_ADOPTION_REVIEW_FAIL_CONDITIONAL_FILE,
          '/decisions/output_commercial_use/conditions',
          diagnostics
        );
      }
    }
  }

  const evaluationSchema = await readJson(repositoryRoot, EVALUATION_SCHEMA_FILE, diagnostics);
  const translationSuite = await readJson(repositoryRoot, TRANSLATION_SUITE_FILE, diagnostics);
  const novelSuite = await readJson(repositoryRoot, NOVEL_SUITE_FILE, diagnostics);
  const translationCase = await readJson(repositoryRoot, TRANSLATION_CASE_FILE, diagnostics);
  const novelCase = await readJson(repositoryRoot, NOVEL_CASE_FILE, diagnostics);

  if (translationSuite !== null) {
    diagnostics.push(
      ...validateEvaluationSuiteValue(translationSuite, {
        file: TRANSLATION_SUITE_FILE,
        id: 'suite.translation-correction.v1',
        useCase: 'translation_correction'
      })
    );
  }
  if (novelSuite !== null) {
    diagnostics.push(
      ...validateEvaluationSuiteValue(novelSuite, {
        file: NOVEL_SUITE_FILE,
        id: 'suite.novel-generation.v1',
        useCase: 'novel_generation'
      })
    );
    diagnostics.push(...validateNovelPublicationGateValue(novelSuite));
  }
  if (evaluationSchema !== null) {
    const validator = compileSchema(evaluationSchema, EVALUATION_SCHEMA_FILE, diagnostics);
    if (validator !== null && translationCase !== null) {
      validatePassFixture(validator, translationCase, TRANSLATION_CASE_FILE, diagnostics);
    }
    if (validator !== null && novelCase !== null) {
      validatePassFixture(validator, novelCase, NOVEL_CASE_FILE, diagnostics);
    }
  }

  for (const surface of EXECUTION_SURFACES) {
    const schema = await readJson(repositoryRoot, surface.schema, diagnostics);
    if (schema === null) continue;
    const validator = compileSchema(schema, surface.schema, diagnostics);
    if (validator === null) continue;
    for (const file of surface.pass) {
      const fixture = await readJson(repositoryRoot, file, diagnostics);
      if (fixture !== null) validatePassFixture(validator, fixture, file, diagnostics);
    }
    for (const [file, forbiddenProperty] of surface.fail) {
      const fixture = await readJson(repositoryRoot, file, diagnostics);
      if (fixture !== null) {
        validateAdditionalPropertyFailure(
          validator,
          fixture,
          file,
          forbiddenProperty,
          diagnostics
        );
      }
    }
  }

  return diagnostics;
}

export function validateModelArtifactRegistryValue(
  value: unknown
): readonly Diagnostic[] {
  if (!isRecord(value)) return [diagnostic(MODEL_ARTIFACTS_FILE, '', 'Artifact registry must be an object.')];
  const diagnostics: Diagnostic[] = [];
  requireExact(value, 'schemaVersion', 'zdp.ai.model-artifacts/v2', MODEL_ARTIFACTS_FILE, diagnostics);
  requireExact(value, 'status', 'research-only', MODEL_ARTIFACTS_FILE, diagnostics);
  requireExact(
    value,
    'weightManifestAlgorithm',
    'sha256-utf8-lines:path-colon-sha256-lf-sorted-by-path',
    MODEL_ARTIFACTS_FILE,
    diagnostics
  );
  const artifacts = value.artifacts;
  if (!Array.isArray(artifacts) || artifacts.length === 0) {
    return [...diagnostics, diagnostic(MODEL_ARTIFACTS_FILE, 'artifacts', 'Artifact registry must contain candidates.')];
  }
  const ids = new Set<string>();
  for (const [index, artifact] of artifacts.entries()) {
    const base = `artifacts[${index}]`;
    if (!isRecord(artifact)) {
      diagnostics.push(diagnostic(MODEL_ARTIFACTS_FILE, base, 'Artifact entry must be an object.'));
      continue;
    }
    const id = readString(artifact.id);
    if (id === '' || ids.has(id)) {
      diagnostics.push(diagnostic(MODEL_ARTIFACTS_FILE, `${base}.id`, 'Artifact id must be non-empty and unique.'));
    }
    ids.add(id);
    for (const field of [
      'requestedAlias',
      'modelRepository',
      'artifactFormat',
      'precision',
      'declaredLicense',
      'baseModelRepository',
      'adoptionReviewId'
    ]) {
      if (readString(artifact[field]) === '') {
        diagnostics.push(
          diagnostic(
            MODEL_ARTIFACTS_FILE,
            `${base}.${field}`,
            `${field} must be a non-empty string.`
          )
        );
      }
    }
    for (const field of ['modelRevision', 'tokenizerRevision', 'tokenizerSha256', 'chatTemplateSha256', 'weightManifestSha256']) {
      if (!isSha256Like(artifact[field], field.endsWith('Revision'))) {
        diagnostics.push(diagnostic(MODEL_ARTIFACTS_FILE, `${base}.${field}`, `${field} must be an immutable hexadecimal digest.`));
      }
    }
    const files = artifact.weightFiles;
    if (!Array.isArray(files) || files.length === 0 || files.some((file) => !isWeightFile(file))) {
      diagnostics.push(diagnostic(MODEL_ARTIFACTS_FILE, `${base}.weightFiles`, 'Weight files must carry path, positive sizeBytes, and SHA-256.'));
    }
    const revision = readString(artifact.modelRevision);
    const evidence = readString(artifact.licenseEvidenceRef);
    if (!evidence.startsWith('https://huggingface.co/') || !evidence.includes(`/blob/${revision}/`)) {
      diagnostics.push(diagnostic(MODEL_ARTIFACTS_FILE, `${base}.licenseEvidenceRef`, 'License evidence must be bound to the exact Hugging Face revision.'));
    }
    for (const forbiddenPath of findForbiddenBooleanPaths(artifact, base)) {
      diagnostics.push(
        diagnostic(
          MODEL_ARTIFACTS_FILE,
          forbiddenPath,
          'Single commercial or promotion booleans are forbidden; use the linked adoption review decision axes.'
        )
      );
    }
    const intakeStatus = readString(artifact.intakeStatus);
    if (intakeStatus !== 'intake_pending' && intakeStatus !== 'registered') {
      diagnostics.push(diagnostic(MODEL_ARTIFACTS_FILE, `${base}.intakeStatus`, 'Artifact intakeStatus must be intake_pending or registered.'));
    }
    const snapshotFields = [
      'modelCardSnapshotSha256',
      'licenseSnapshotSha256',
      'noticeSnapshotSha256'
    ] as const;
    if (intakeStatus === 'registered') {
      for (const field of snapshotFields) {
        if (!isSha256Like(artifact[field], false)) {
          diagnostics.push(diagnostic(MODEL_ARTIFACTS_FILE, `${base}.${field}`, `Registered artifacts require a ${field}.`));
        }
      }
      if (!isSha256Like(artifact.baseModelRevision, true)) {
        diagnostics.push(diagnostic(MODEL_ARTIFACTS_FILE, `${base}.baseModelRevision`, 'Registered artifacts require an exact base-model revision.'));
      }
    } else {
      for (const field of snapshotFields) {
        if (artifact[field] !== null && !isSha256Like(artifact[field], false)) {
          diagnostics.push(diagnostic(MODEL_ARTIFACTS_FILE, `${base}.${field}`, `${field} must be null or a SHA-256 during intake.`));
        }
      }
      if (artifact.baseModelRevision !== null && !isSha256Like(artifact.baseModelRevision, true)) {
        diagnostics.push(diagnostic(MODEL_ARTIFACTS_FILE, `${base}.baseModelRevision`, 'Base model revision must be null or an exact revision during intake.'));
      }
    }
  }
  return diagnostics;
}

export function validateEvaluationSuiteValue(
  value: unknown,
  expected: { readonly file: string; readonly id: string; readonly useCase: string }
): readonly Diagnostic[] {
  if (!isRecord(value)) return [diagnostic(expected.file, '', 'Evaluation suite must be an object.')];
  const diagnostics: Diagnostic[] = [];
  requireExact(value, 'schemaVersion', 'zdp.ai.evaluation-suite/v1', expected.file, diagnostics);
  requireExact(value, 'id', expected.id, expected.file, diagnostics);
  requireExact(value, 'useCase', expected.useCase, expected.file, diagnostics);
  requireExact(value, 'fixtureSchemaRef', EVALUATION_SCHEMA_FILE, expected.file, diagnostics);
  for (const path of [
    'pilotSlices.languageOrGenre',
    'pilotSlices.risk',
    'acceptedOutcome.deterministicChecks',
    'acceptedOutcome.humanRubric',
    'economics.include'
  ]) {
    const entries = readStringArray(readPath(value, path));
    if (entries.length === 0 || new Set(entries).size !== entries.length) {
      diagnostics.push(diagnostic(expected.file, path, `${path} must be a non-empty unique string array.`));
    }
  }
  for (const path of ['acceptedOutcome.falseAcceptDefinition', 'acceptedOutcome.abstainPolicy', 'economics.metric', 'reviewPolicy']) {
    if (readString(readPath(value, path)) === '') {
      diagnostics.push(diagnostic(expected.file, path, `${path} must be a non-empty string.`));
    }
  }
  requireExact(value, 'promotionThresholds.deterministicCheckPassRate', 1, expected.file, diagnostics);
  requireExact(value, 'economics.metric', 'cost_per_accepted_outcome', expected.file, diagnostics);
  return diagnostics;
}

export function validateModelAdoptionReviewRegistryValue(value: unknown): readonly Diagnostic[] {
  if (!isRecord(value)) {
    return [diagnostic(MODEL_ADOPTION_REVIEWS_FILE, '', 'Model adoption review registry must be an object.')];
  }
  const diagnostics: Diagnostic[] = [];
  requireExact(value, 'schemaVersion', 'zdp.ai.model-adoption-reviews/v1', MODEL_ADOPTION_REVIEWS_FILE, diagnostics);
  requireExact(value, 'status', 'contract-only', MODEL_ADOPTION_REVIEWS_FILE, diagnostics);
  requireExactList(value, 'decisionAxes', REQUIRED_DECISION_AXES, MODEL_ADOPTION_REVIEWS_FILE, diagnostics);
  const records = value.records;
  if (!Array.isArray(records) || records.length === 0) {
    return [...diagnostics, diagnostic(MODEL_ADOPTION_REVIEWS_FILE, 'records', 'Model adoption review registry must contain records.')];
  }
  const reviewIds = new Set<string>();
  const artifactIds = new Set<string>();
  for (const [index, record] of records.entries()) {
    const base = `records[${index}]`;
    if (!isRecord(record)) {
      diagnostics.push(diagnostic(MODEL_ADOPTION_REVIEWS_FILE, base, 'Model adoption review record must be an object.'));
      continue;
    }
    const reviewId = readString(record.review_id);
    const artifactId = readString(record.artifact_id);
    if (reviewId === '' || reviewIds.has(reviewId)) {
      diagnostics.push(diagnostic(MODEL_ADOPTION_REVIEWS_FILE, `${base}.review_id`, 'Review id must be non-empty and unique.'));
    }
    if (artifactId === '' || artifactIds.has(artifactId)) {
      diagnostics.push(diagnostic(MODEL_ADOPTION_REVIEWS_FILE, `${base}.artifact_id`, 'Artifact id must be non-empty and have one active review record.'));
    }
    reviewIds.add(reviewId);
    artifactIds.add(artifactId);
    for (const forbiddenPath of findForbiddenBooleanPaths(record, base)) {
      diagnostics.push(
        diagnostic(
          MODEL_ADOPTION_REVIEWS_FILE,
          forbiddenPath,
          'Single commercial or promotion booleans are forbidden; record the six decision axes independently.'
        )
      );
    }
    const commercialDecision = readPath(record, 'decisions.output_commercial_use');
    if (!isRecord(commercialDecision)) {
      diagnostics.push(diagnostic(MODEL_ADOPTION_REVIEWS_FILE, `${base}.decisions.output_commercial_use`, 'Output commercial use decision is required.'));
    } else if (
      commercialDecision.status === 'conditional' &&
      (readStringArray(commercialDecision.conditions).length === 0 ||
        readStringArray(commercialDecision.source_refs).length === 0)
    ) {
      diagnostics.push(
        diagnostic(
          MODEL_ADOPTION_REVIEWS_FILE,
          `${base}.decisions.output_commercial_use`,
          'Conditional output commercial use requires non-empty conditions and source_refs.'
        )
      );
    }
    const currentStatus = readPath(record, 'promotion.current_status');
    if (!PROMOTION_STATES_WITH_INTAKE.includes(currentStatus as (typeof PROMOTION_STATES_WITH_INTAKE)[number])) {
      diagnostics.push(diagnostic(MODEL_ADOPTION_REVIEWS_FILE, `${base}.promotion.current_status`, 'Promotion state is not recognized.'));
    }
    if (
      currentStatus === 'intake_pending' &&
      readStringArray(readPath(record, 'promotion.blocking_reasons')).length === 0
    ) {
      diagnostics.push(diagnostic(MODEL_ADOPTION_REVIEWS_FILE, `${base}.promotion.blocking_reasons`, 'intake_pending reviews must name blocking reasons.'));
    }
    if (currentStatus !== 'intake_pending' && record.review_status !== 'approved') {
      diagnostics.push(diagnostic(MODEL_ADOPTION_REVIEWS_FILE, `${base}.review_status`, 'Promotion beyond intake_pending requires an approved adoption review.'));
    }
  }
  return diagnostics;
}

export function validatePromotionStateMachineValue(value: unknown): readonly Diagnostic[] {
  if (!isRecord(value)) {
    return [diagnostic(MODEL_PROMOTION_STATE_MACHINE_FILE, '', 'Promotion state machine must be an object.')];
  }
  const diagnostics: Diagnostic[] = [];
  requireExact(value, 'schemaVersion', 'zdp.ai.model-promotion-state-machine/v1', MODEL_PROMOTION_STATE_MACHINE_FILE, diagnostics);
  requireExact(value, 'status', 'contract-only', MODEL_PROMOTION_STATE_MACHINE_FILE, diagnostics);
  requireExactList(value, 'states', PROMOTION_STATES_WITH_INTAKE, MODEL_PROMOTION_STATE_MACHINE_FILE, diagnostics);
  const expectedTransitions: Readonly<Record<string, readonly string[]>> = {
    intake_pending: ['registered', 'quarantined'],
    registered: ['experiment', 'deprecated', 'quarantined'],
    experiment: ['limited', 'deprecated', 'quarantined'],
    limited: ['default_candidate', 'deprecated', 'quarantined'],
    default_candidate: ['default', 'limited', 'deprecated', 'quarantined'],
    default: ['deprecated', 'quarantined'],
    deprecated: ['retired', 'quarantined'],
    retired: [],
    quarantined: ['intake_pending']
  };
  for (const [state, expected] of Object.entries(expectedTransitions)) {
    requireExactList(value, `transitions.${state}`, expected, MODEL_PROMOTION_STATE_MACHINE_FILE, diagnostics);
  }
  for (const state of PROMOTION_STATES_WITH_INTAKE.filter((state) => state !== 'intake_pending')) {
    if (readStringArray(readPath(value, `entryGuards.${state}`)).length === 0) {
      diagnostics.push(diagnostic(MODEL_PROMOTION_STATE_MACHINE_FILE, `entryGuards.${state}`, 'Every promotion state requires explicit entry guards.'));
    }
  }
  if (readStringArray(value.globalRules).length === 0) {
    diagnostics.push(diagnostic(MODEL_PROMOTION_STATE_MACHINE_FILE, 'globalRules', 'Promotion state machine requires fail-closed global rules.'));
  }
  return diagnostics;
}

function validateArtifactAdoptionReviewLinks(artifacts: unknown, reviews: unknown): readonly Diagnostic[] {
  if (!isRecord(artifacts) || !Array.isArray(artifacts.artifacts) || !isRecord(reviews) || !Array.isArray(reviews.records)) return [];
  const reviewById = new Map(
    reviews.records
      .filter(isRecord)
      .map((record) => [readString(record.review_id), record] as const)
      .filter(([id]) => id !== '')
  );
  return artifacts.artifacts.flatMap((artifact, index) => {
    if (!isRecord(artifact)) return [];
    const reviewId = readString(artifact.adoptionReviewId);
    const review = reviewById.get(reviewId);
    if (review === undefined || readString(review.artifact_id) !== readString(artifact.id)) {
      return [diagnostic(MODEL_ARTIFACTS_FILE, `artifacts[${index}].adoptionReviewId`, 'Artifact must link to its matching adoption review record.')];
    }
    if (readPath(review, 'promotion.current_status') !== artifact.intakeStatus) {
      return [diagnostic(MODEL_ARTIFACTS_FILE, `artifacts[${index}].intakeStatus`, 'Artifact intakeStatus must match the linked adoption review promotion state.')];
    }
    return [];
  });
}

function validatePromotionCandidateLinks(promotion: unknown, artifacts: unknown, reviews: unknown): readonly Diagnostic[] {
  if (!isRecord(promotion) || !isRecord(artifacts) || !Array.isArray(artifacts.artifacts) || !isRecord(reviews) || !Array.isArray(reviews.records)) return [];
  const artifactById = new Map(artifacts.artifacts.filter(isRecord).map((artifact) => [readString(artifact.id), artifact] as const));
  const reviewById = new Map(reviews.records.filter(isRecord).map((record) => [readString(record.review_id), record] as const));
  const candidates = promotion.researchCandidates;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return [diagnostic('contracts/model-evaluation-promotion.json', 'researchCandidates', 'Research candidates must link to artifacts and adoption reviews.')];
  }
  return candidates.flatMap((candidate, index) => {
    if (!isRecord(candidate)) {
      return [diagnostic('contracts/model-evaluation-promotion.json', `researchCandidates[${index}]`, 'Research candidate must be an object.')];
    }
    const artifact = artifactById.get(readString(candidate.resolvedArtifactId));
    const review = reviewById.get(readString(candidate.adoptionReviewId));
    if (
      artifact === undefined ||
      review === undefined ||
      artifact.adoptionReviewId !== candidate.adoptionReviewId ||
      review.artifact_id !== candidate.resolvedArtifactId ||
      readPath(review, 'promotion.current_status') !== candidate.currentState
    ) {
      return [diagnostic('contracts/model-evaluation-promotion.json', `researchCandidates[${index}]`, 'Research candidate artifact, adoption review, and state links must agree.')];
    }
    return [];
  });
}

function validateNovelPublicationGateValue(value: unknown): readonly Diagnostic[] {
  if (!isRecord(value)) return [];
  const diagnostics: Diagnostic[] = [];
  const requiredSlices = [
    'exact_match',
    'near_match',
    'continuation_memorization',
    'protected_universe',
    'author_imitation',
    'multi_seed_repetition',
    'long_context',
    'legal_and_safety',
    'human_review'
  ];
  requireExactList(value, 'publicationGate.requiredSlices', requiredSlices, NOVEL_SUITE_FILE, diagnostics);
  for (const path of [
    'publicationGate.criticalFailures',
    'publicationGate.corpusPolicy'
  ]) {
    if (readStringArray(readPath(value, path)).length === 0) {
      diagnostics.push(diagnostic(NOVEL_SUITE_FILE, path, `${path} must be a non-empty string array.`));
    }
  }
  requireExact(value, 'publicationGate.authorshipRecordSchemaVersion', 'zdp.content.ai-assisted-authorship-record/v1', NOVEL_SUITE_FILE, diagnostics);
  requireExact(value, 'publicationGate.productOwnsManuscriptAndAuthorship', true, NOVEL_SUITE_FILE, diagnostics);
  requireExact(value, 'publicationGate.humanReviewRequired', true, NOVEL_SUITE_FILE, diagnostics);
  requireExact(value, 'publicationGate.commercialDecisionDoesNotPromoteModel', true, NOVEL_SUITE_FILE, diagnostics);
  return diagnostics;
}

async function readJson(root: string, file: string, diagnostics: Diagnostic[]): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(join(root, file), 'utf8'));
  } catch (error) {
    diagnostics.push(
      diagnostic(
        file,
        '',
        error instanceof SyntaxError ? 'Contract must be valid JSON.' : 'Required AI platform contract file is missing.'
      )
    );
    return null;
  }
}

function compileSchema(value: unknown, file: string, diagnostics: Diagnostic[]): ValidateFunction | null {
  try {
    return new Ajv2020({ allErrors: true, strict: false }).compile(
      value as AnySchema
    );
  } catch (error) {
    diagnostics.push(diagnostic(file, '', `JSON Schema compilation failed: ${formatError(error)}`));
    return null;
  }
}

function validatePassFixture(validator: ValidateFunction, value: unknown, file: string, diagnostics: Diagnostic[]): void {
  if (!validator(value)) {
    diagnostics.push(diagnostic(file, '', `Pass fixture must satisfy its schema: ${formatAjvErrors(validator)}`));
  }
}

function validateAdditionalPropertyFailure(
  validator: ValidateFunction,
  value: unknown,
  file: string,
  property: string,
  diagnostics: Diagnostic[]
): void {
  const accepted = validator(value);
  const rejectedForProperty = validator.errors?.some(
    (error) =>
      error.keyword === 'additionalProperties' &&
      isRecord(error.params) &&
      error.params.additionalProperty === property
  );
  if (accepted || rejectedForProperty !== true) {
    diagnostics.push(diagnostic(file, property, `Fail fixture must be rejected specifically for forbidden property \`${property}\`.`));
  }
}

function validateFailureAtPath(
  validator: ValidateFunction,
  value: unknown,
  file: string,
  expectedPath: string,
  diagnostics: Diagnostic[]
): void {
  const accepted = validator(value);
  const rejectedAtPath = validator.errors?.some(
    (error) => error.instancePath === expectedPath
  );
  if (accepted || rejectedAtPath !== true) {
    diagnostics.push(diagnostic(file, expectedPath, `Fail fixture must be rejected at \`${expectedPath}\`.`));
  }
}

function requireExact(value: Record<string, unknown>, path: string, expected: unknown, file: string, diagnostics: Diagnostic[]): void {
  if (readPath(value, path) !== expected) {
    diagnostics.push(diagnostic(file, path, `\`${path}\` must equal \`${String(expected)}\`.`));
  }
}

function requireExactList(
  value: Record<string, unknown>,
  path: string,
  expected: readonly string[],
  file: string,
  diagnostics: Diagnostic[]
): void {
  const raw = readPath(value, path);
  if (!Array.isArray(raw) || raw.some((item) => typeof item !== 'string')) {
    diagnostics.push(diagnostic(file, path, `\`${path}\` must be a string array.`));
    return;
  }
  const actual = raw;
  if (actual.length !== expected.length || actual.some((item, index) => item !== expected[index])) {
    diagnostics.push(diagnostic(file, path, `\`${path}\` must equal the reviewed ordered contract.`));
  }
}

function isWeightFile(value: unknown): boolean {
  return isRecord(value) && readString(value.path) !== '' && typeof value.sizeBytes === 'number' && value.sizeBytes > 0 && isSha256Like(value.sha256, false);
}

function isSha256Like(value: unknown, revision: boolean): boolean {
  return typeof value === 'string' && new RegExp(revision ? '^[a-f0-9]{40}$' : '^[a-f0-9]{64}$').test(value);
}

function readPath(value: unknown, path: string): unknown {
  let current = value;
  for (const segment of path.split('.')) current = isRecord(current) ? current[segment] : undefined;
  return current;
}

function readString(value: unknown): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : '';
}

function readStringArray(value: unknown): readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string' && item.length > 0) ? value : [];
}

function findForbiddenBooleanPaths(value: unknown, path = ''): readonly string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findForbiddenBooleanPaths(item, `${path}[${index}]`));
  }
  if (!isRecord(value)) return [];
  const paths: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    const childPath = path === '' ? key : `${path}.${key}`;
    if (FORBIDDEN_DECISION_BOOLEANS.has(key)) paths.push(childPath);
    paths.push(...findForbiddenBooleanPaths(child, childPath));
  }
  return paths;
}

function diagnostic(file: string, path: string, message: string): Diagnostic {
  return { ruleId: RULE_ID, severity: 'error', file, path, message };
}

function formatAjvErrors(validator: ValidateFunction): string {
  return validator.errors?.map((error) => `${error.instancePath || '/'} ${error.message ?? error.keyword}`).join('; ') ?? 'unknown schema failure';
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown failure';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
