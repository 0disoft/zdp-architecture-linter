import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { Diagnostic } from './diagnostics.ts';

const REPOSITORY = 'zdp-agent-review-playbooks';
const RULE_ID = 'ZDP-AGENT-REVIEW-001';
const SCHEMA_FILE = 'schemas/group-reducer-report.schema.json';
const TEMPLATE_FILE = 'templates/group-reducer-output.md';
const PROMPT_FILE = 'prompts/10-group-reducer.md';
const COMMIT_PATTERN = '^[0-9a-f]{40}$';
const MODEL_ID_PATTERN = '^[a-z0-9][a-z0-9._-]*(?:/[a-z0-9][a-z0-9._-]*)?$';
const MODEL_PROFILE_FILE = 'manifests/model-profiles.yaml';
const PROVIDER_MODELS_FILE = 'manifests/provider-models.json';
const MODEL_SURFACES = [
  ['raw_review', 'schemas/raw-review-manifest.schema.json', 'templates/raw-review-output.md', 'prompts/00-common-review-contract.md'],
  ['group_reducer', SCHEMA_FILE, TEMPLATE_FILE, PROMPT_FILE],
  ['final_reducer', 'schemas/final-report.schema.json', 'templates/final-top6-report.md', 'prompts/20-final-reducer.md']
] as const;

export async function validateRepositoryAgentReviewPlaybookContract(input: {
  readonly repositoryRoot: string | undefined;
  readonly repositoryServiceContract: unknown;
}): Promise<readonly Diagnostic[]> {
  if (
    input.repositoryRoot === undefined ||
    readPath(input.repositoryServiceContract, 'service.repo') !== REPOSITORY
  ) {
    return [];
  }

  const diagnostics: Diagnostic[] = [];
  const [schemaSource, templateSource, promptSource] = await Promise.all([
    readRequired(input.repositoryRoot, SCHEMA_FILE, diagnostics),
    readRequired(input.repositoryRoot, TEMPLATE_FILE, diagnostics),
    readRequired(input.repositoryRoot, PROMPT_FILE, diagnostics)
  ]);

  if (schemaSource !== null) {
    validateSchema(schemaSource, diagnostics);
  }
  if (templateSource !== null && !frontmatter(templateSource).includes('target_commits: {}')) {
    diagnostics.push(
      diagnostic(
        TEMPLATE_FILE,
        'frontmatter.target_commits',
        'Group reducer template frontmatter must expose the target_commits output field.'
      )
    );
  }
  if (promptSource !== null) {
    for (const [fragment, path, message] of [
      [
        'Markdown frontmatter `target_commits`에 non-empty map',
        'producer.markdown_target_commits',
        'Group reducer prompt must require non-empty Markdown target_commits.'
      ],
      [
        '`DONE_MARKER_FILE.target_commits`에도 Markdown frontmatter와 정확히 같은 map',
        'producer.marker_target_commits',
        'Group reducer prompt must require exact Markdown and marker target_commits parity.'
      ],
      [
        '`status: completed`를 쓰지 마라',
        'producer.completed_gate',
        'Group reducer prompt must block completed status when target_commits parity fails.'
      ]
    ] as const) {
      if (!promptSource.includes(fragment)) {
        diagnostics.push(diagnostic(PROMPT_FILE, path, message));
      }
    }
  }

  const modelFiles = [
    MODEL_PROFILE_FILE,
    PROVIDER_MODELS_FILE,
    ...MODEL_SURFACES.flatMap(([, schema, template, prompt]) => [schema, template, prompt])
  ];
  const modelSources = new Map<string, string | null>();
  await Promise.all(
    [...new Set(modelFiles)].map(async (file) => {
      modelSources.set(file, await readRequired(input.repositoryRoot!, file, diagnostics));
    })
  );
  validateModelProducerContract(modelSources, diagnostics);

  const requiredRules = readStringArray(
    readPath(input.repositoryServiceContract, 'policy_gates.required_linter_rules')
  );
  if (!requiredRules.includes(RULE_ID)) {
    diagnostics.push(
      diagnostic(
        'service.yaml',
        'policy_gates.required_linter_rules',
        `Agent review playbooks service contract must require ${RULE_ID}.`
      )
    );
  }

  return diagnostics;
}

function validateModelProducerContract(
  sources: ReadonlyMap<string, string | null>,
  diagnostics: Diagnostic[]
): void {
  const profileSource = sources.get(MODEL_PROFILE_FILE);
  const providerSource = sources.get(PROVIDER_MODELS_FILE);
  if (profileSource === null || profileSource === undefined || providerSource === null || providerSource === undefined) {
    return;
  }

  let profiles: unknown;
  let providers: unknown;
  try {
    profiles = parseYaml(profileSource);
    providers = JSON.parse(providerSource);
  } catch {
    diagnostics.push(diagnostic(MODEL_PROFILE_FILE, 'model_profiles', 'Model profile and provider model manifests must be parseable.'));
    return;
  }
  const providerIds = new Set(
    Array.isArray(readPath(providers, 'models'))
      ? (readPath(providers, 'models') as unknown[])
          .map((model) => readPath(model, 'model_id'))
          .filter((model): model is string => typeof model === 'string')
      : []
  );

  for (const [profile, schemaFile, templateFile, promptFile] of MODEL_SURFACES) {
    const preferredModel = readPath(profiles, `profiles.${profile}.preferred_model`);
    if (typeof preferredModel !== 'string' || !providerIds.has(preferredModel)) {
      diagnostics.push(diagnostic(MODEL_PROFILE_FILE, `profiles.${profile}.preferred_model`, `Model profile ${profile} must reference a canonical provider model id.`));
    }

    const schemaSource = sources.get(schemaFile);
    if (schemaSource !== null && schemaSource !== undefined) {
      try {
        const schema = JSON.parse(schemaSource);
        if (
          !readStringArray(readPath(schema, 'required')).includes('model_id') ||
          readPath(schema, 'properties.model_id.pattern') !== MODEL_ID_PATTERN
        ) {
          diagnostics.push(diagnostic(schemaFile, 'properties.model_id', `Review schema for ${profile} must require a canonical model_id token.`));
        }
      } catch {
        diagnostics.push(diagnostic(schemaFile, 'json', `Review schema for ${profile} must be valid JSON.`));
      }
    }

    const templateSource = sources.get(templateFile);
    if (templateSource !== null && templateSource !== undefined && !frontmatter(templateSource).includes('model_id: ""')) {
      diagnostics.push(diagnostic(templateFile, 'frontmatter.model_id', `Review template for ${profile} must expose model_id.`));
    }

    const promptSource = sources.get(promptFile);
    for (const [fragment, suffix] of [
      [`${profile}.preferred_model`, 'preferred_model'],
      ['DONE_MARKER_FILE.model_id', 'marker_model_id'],
      ['status: completed', 'completed_gate']
    ] as const) {
      if (promptSource !== null && promptSource !== undefined && !promptSource.includes(fragment)) {
        diagnostics.push(diagnostic(promptFile, `producer.${profile}.${suffix}`, `Review producer for ${profile} must enforce canonical model_id provenance.`));
      }
    }
  }
}

function validateSchema(source: string, diagnostics: Diagnostic[]): void {
  let schema: unknown;
  try {
    schema = JSON.parse(source);
  } catch {
    diagnostics.push(diagnostic(SCHEMA_FILE, 'json', 'Group reducer report schema must be valid JSON.'));
    return;
  }

  const required = readStringArray(readPath(schema, 'required'));
  const targetCommits = readPath(schema, 'properties.target_commits');
  if (!required.includes('target_commits')) {
    diagnostics.push(
      diagnostic(
        SCHEMA_FILE,
        'required',
        'Group reducer report schema must require target_commits.'
      )
    );
  }
  if (
    readPath(targetCommits, 'type') !== 'object' ||
    readPath(targetCommits, 'minProperties') !== 1 ||
    readPath(targetCommits, 'additionalProperties.pattern') !== COMMIT_PATTERN
  ) {
    diagnostics.push(
      diagnostic(
        SCHEMA_FILE,
        'properties.target_commits',
        'Group reducer target_commits must be a non-empty map of lowercase 40-character commit hashes.'
      )
    );
  }
}

async function readRequired(
  root: string,
  file: string,
  diagnostics: Diagnostic[]
): Promise<string | null> {
  try {
    return await readFile(join(root, file), 'utf8');
  } catch {
    diagnostics.push(diagnostic(file, 'repository.root', `Required review contract file is missing: ${file}`));
    return null;
  }
}

function frontmatter(source: string): string {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source);
  return match?.[1] ?? '';
}

function diagnostic(file: string, path: string, message: string): Diagnostic {
  return { ruleId: RULE_ID, severity: 'error', file, path, message };
}

function readPath(value: unknown, path: string): unknown {
  let current = value;
  for (const part of path.split('.')) {
    current = isRecord(current) ? current[part] : undefined;
  }
  return current;
}

function readStringArray(value: unknown): readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
