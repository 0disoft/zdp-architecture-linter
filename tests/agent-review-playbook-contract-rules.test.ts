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
    ['marker parity prompt', { markerParity: false }, 'producer.marker_target_commits']
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
  } = {}
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'zdp-agent-review-playbooks-'));
  const required = options.schemaRequired === false ? [] : ['target_commits'];
  const files = {
    'schemas/group-reducer-report.schema.json': JSON.stringify({
      type: 'object',
      required,
      properties: {
        target_commits: {
          type: 'object',
          minProperties: 1,
          additionalProperties: { type: 'string', pattern: '^[0-9a-f]{40}$' }
        }
      }
    }),
    'templates/group-reducer-output.md': `---\nschema_version: zdp.agent-review.group-reducer.v1\n${options.templateField === false ? '' : 'target_commits: {}\n'}---\n`,
    'prompts/10-group-reducer.md': [
      'Markdown frontmatter `target_commits`에 non-empty map',
      options.markerParity === false
        ? ''
        : '`DONE_MARKER_FILE.target_commits`에도 Markdown frontmatter와 정확히 같은 map',
      '`status: completed`를 쓰지 마라'
    ].join('\n')
  };

  for (const [file, source] of Object.entries(files)) {
    const path = join(root, file);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, source);
  }
  return root;
}
