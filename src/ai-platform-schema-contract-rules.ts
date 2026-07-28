import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import Ajv2020, { type AnySchema, type ValidateFunction } from 'ajv/dist/2020.js';
import type { Diagnostic } from './diagnostics.ts';

const RULE_ID = 'ZDP-AI-PLATFORM-001';
const MODEL_ARTIFACTS_FILE = 'contracts/model-artifacts.json';
const EVALUATION_SCHEMA_FILE = 'contracts/schemas/evaluation-case.v1.schema.json';
const TRANSLATION_SUITE_FILE = 'contracts/evaluation-suites/translation-correction.v1.json';
const NOVEL_SUITE_FILE = 'contracts/evaluation-suites/novel-generation.v1.json';
const TRANSLATION_CASE_FILE = 'contracts/fixtures/evaluation/translation-correction.pass.json';
const NOVEL_CASE_FILE = 'contracts/fixtures/evaluation/novel-generation.pass.json';

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
    diagnostics.push(...validatePromotionArtifactLinks(promotionContract, artifacts));
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
  requireExact(value, 'schemaVersion', 'zdp.ai.model-artifacts/v1', MODEL_ARTIFACTS_FILE, diagnostics);
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
      'baseModelRepository'
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
    if (readPath(artifact, 'provenanceReview.status') !== 'blocked') {
      diagnostics.push(diagnostic(MODEL_ARTIFACTS_FILE, `${base}.provenanceReview.status`, 'Research candidates with unresolved evidence must remain blocked.'));
    }
    if (readStringArray(readPath(artifact, 'provenanceReview.reasons')).length === 0) {
      diagnostics.push(
        diagnostic(
          MODEL_ARTIFACTS_FILE,
          `${base}.provenanceReview.reasons`,
          'Blocked artifact must name at least one provenance reason.'
        )
      );
    }
    if (artifact.promotionEligible !== false) {
      diagnostics.push(diagnostic(MODEL_ARTIFACTS_FILE, `${base}.promotionEligible`, 'Blocked artifacts must set promotionEligible=false.'));
    }
    if (artifact.baseModelRevision !== null) {
      diagnostics.push(diagnostic(MODEL_ARTIFACTS_FILE, `${base}.baseModelRevision`, 'Initial research candidates must not claim an unverified base-model revision.'));
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

function validatePromotionArtifactLinks(promotion: unknown, registry: unknown): readonly Diagnostic[] {
  if (!isRecord(promotion) || !isRecord(registry) || !Array.isArray(registry.artifacts)) return [];
  const ids = new Set(
    registry.artifacts.filter(isRecord).map((artifact) => readString(artifact.id)).filter(Boolean)
  );
  const leads = promotion.researchLeads;
  if (!Array.isArray(leads) || leads.length === 0) {
    return [diagnostic('contracts/model-evaluation-promotion.json', 'researchLeads', 'Research leads must link to pinned artifacts.')];
  }
  return leads.flatMap((lead, index) => {
    if (
      !isRecord(lead) ||
      !ids.has(readString(lead.resolvedArtifactId)) ||
      lead.status !== 'identity-pinned-provenance-blocked' ||
      lead.promotionEligible !== false
    ) {
      return [diagnostic('contracts/model-evaluation-promotion.json', `researchLeads[${index}]`, 'Research lead must link to a pinned, provenance-blocked, non-promotable artifact.')];
    }
    return [];
  });
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

function requireExact(value: Record<string, unknown>, path: string, expected: unknown, file: string, diagnostics: Diagnostic[]): void {
  if (readPath(value, path) !== expected) {
    diagnostics.push(diagnostic(file, path, `\`${path}\` must equal \`${String(expected)}\`.`));
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
