import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Diagnostic } from './diagnostics.ts';

const REPOSITORY = 'zdp-agent-review-playbooks';
const RULE_ID = 'ZDP-AGENT-REVIEW-001';
const SCHEMA_FILE = 'schemas/group-reducer-report.schema.json';
const TEMPLATE_FILE = 'templates/group-reducer-output.md';
const PROMPT_FILE = 'prompts/10-group-reducer.md';
const COMMIT_PATTERN = '^[0-9a-f]{40}$';

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
