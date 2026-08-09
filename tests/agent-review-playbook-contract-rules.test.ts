import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { validateRepositoryAgentReviewPlaybookContract } from '../src/agent-review-playbook-contract-rules.ts';

const service = {
  service: { repo: 'zdp-agent-review-playbooks' },
  policy_gates: { required_linter_rules: ['ZDP-AGENT-REVIEW-001'] }
};

describe('agent review playbook repository contract', () => {
  test('accepts synchronized reducer target commit producer surfaces', async () => {
    expect(
      await validateRepositoryAgentReviewPlaybookContract({
        repositoryRoot: await repository(),
        repositoryServiceContract: service
      })
    ).toEqual([]);
  });

  test.each([
    ['schema required key', { schemaRequired: false }, 'required'],
    ['template frontmatter', { templateField: false }, 'frontmatter.target_commits'],
    ['marker parity prompt', { markerParity: false }, 'producer.marker_target_commits'],
    ['model id schema', { modelSchema: false }, 'properties.model_id'],
    ['model id template', { modelTemplate: false }, 'frontmatter.model_id'],
    ['model id producer gate', { modelPrompt: false }, 'producer.final_reducer.marker_model_id'],
    ['non-canonical model profile', { canonicalProfile: false }, 'profiles.final_reducer.preferred_model']
  ] as const)('rejects missing %s', async (_name, options, expectedPath) => {
    const diagnostics = await validateRepositoryAgentReviewPlaybookContract({
      repositoryRoot: await repository(options),
      repositoryServiceContract: service
    });

    expect(diagnostics.some((item) => item.path === expectedPath)).toBe(true);
  });

  test('skips unrelated repositories', async () => {
    expect(
      await validateRepositoryAgentReviewPlaybookContract({
        repositoryRoot: await repository(),
        repositoryServiceContract: { service: { repo: 'zdp-core-platform' } }
      })
    ).toEqual([]);
  });
});

async function repository(
  options: {
    readonly schemaRequired?: boolean;
    readonly templateField?: boolean;
    readonly markerParity?: boolean;
    readonly modelSchema?: boolean;
    readonly modelTemplate?: boolean;
    readonly modelPrompt?: boolean;
    readonly canonicalProfile?: boolean;
  } = {}
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'zdp-agent-review-playbooks-'));
  const required = [
    ...(options.schemaRequired === false ? [] : ['target_commits']),
    ...(options.modelSchema === false ? [] : ['model_id'])
  ];
  const modelProperty = options.modelSchema === false
    ? {}
    : { model_id: { type: 'string', pattern: '^[a-z0-9][a-z0-9._-]*(?:/[a-z0-9][a-z0-9._-]*)?$' } };
  const modelTemplate = options.modelTemplate === false ? '' : 'model_id: ""\n';
  const modelPrompt = (profile: string) => [
    `${profile}.preferred_model`,
    options.modelPrompt === false && profile === 'final_reducer' ? '' : 'DONE_MARKER_FILE.model_id',
    'status: completed'
  ].join('\n');
  const files = {
    'manifests/model-profiles.yaml': `profiles:\n  raw_review:\n    preferred_model: opencode-go/deepseek-v4-flash\n  group_reducer:\n    preferred_model: opencode-go/deepseek-v4-flash\n  final_reducer:\n    preferred_model: ${options.canonicalProfile === false ? 'deepseek/deepseek-v4-flash' : 'opencode-go/deepseek-v4-flash'}\n`,
    'manifests/provider-models.json': JSON.stringify({ models: [{ model_id: 'opencode-go/deepseek-v4-flash' }] }),
    'schemas/raw-review-manifest.schema.json': JSON.stringify({ type: 'object', required: ['model_id'], properties: modelProperty }),
    'schemas/group-reducer-report.schema.json': JSON.stringify({
      type: 'object',
      required,
      properties: {
        ...modelProperty,
        target_commits: {
          type: 'object',
          minProperties: 1,
          additionalProperties: { type: 'string', pattern: '^[0-9a-f]{40}$' }
        }
      }
    }),
    'schemas/final-report.schema.json': JSON.stringify({ type: 'object', required: ['model_id'], properties: modelProperty }),
    'templates/raw-review-output.md': `---\n${modelTemplate}---\n`,
    'templates/group-reducer-output.md': `---\nschema_version: zdp.agent-review.group-reducer.v1\n${modelTemplate}${options.templateField === false ? '' : 'target_commits: {}\n'}---\n`,
    'templates/final-top6-report.md': `---\n${modelTemplate}---\n`,
    'prompts/00-common-review-contract.md': modelPrompt('raw_review'),
    'prompts/10-group-reducer.md': [
      'Markdown frontmatter `target_commits`에 non-empty map',
      options.markerParity === false
        ? ''
        : '`DONE_MARKER_FILE.target_commits`에도 Markdown frontmatter와 정확히 같은 map',
      '`status: completed`를 쓰지 마라',
      modelPrompt('group_reducer')
    ].join('\n'),
    'prompts/20-final-reducer.md': modelPrompt('final_reducer')
  };

  for (const [file, source] of Object.entries(files)) {
    const path = join(root, file);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, source);
  }
  return root;
}
