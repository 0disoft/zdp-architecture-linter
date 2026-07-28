import { describe, expect, test } from 'bun:test';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateRepositoryAiInferenceContract } from '../src/ai-inference-contract-rules.ts';

async function repository(rawOptions = false): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'zdp-ai-inference-'));
  await mkdir(join(root, 'contracts'), { recursive: true });
  await mkdir(join(root, 'scripts'), { recursive: true });
  const contract = { schemaVersion: 'zdp.ai-inference.consumed-contracts/v1', normalCaller: 'zdp-ai-platform', rawEngineOptionPassthrough: rawOptions, contracts: ['a','b','c','d'].map((name) => ({ schemaVersion: name, path: name, sha256: 'a'.repeat(64) })) };
  await writeFile(join(root, 'contracts/consumed-contracts.json'), JSON.stringify(contract));
  for (const file of ['runtime-profiles.json','loaded-artifact-verification.json','model-serving-receipts.json']) await writeFile(join(root, 'contracts', file), '{}');
  await writeFile(join(root, 'scripts/check-contracts.ts'), '');
  return root;
}

const service = { service: { repo: 'zdp-ai-inference' }, policy_gates: { required_linter_rules: ['ZDP-AI-INFERENCE-REPO-001'] } };

describe('AI inference repository contract', () => {
  test('accepts the closed consumed-contract manifest', async () => {
    expect(await validateRepositoryAiInferenceContract({ repositoryRoot: await repository(), repositoryServiceContract: service })).toEqual([]);
  });
  test('rejects raw engine option passthrough', async () => {
    expect((await validateRepositoryAiInferenceContract({ repositoryRoot: await repository(true), repositoryServiceContract: service })).some((d) => d.path === 'rawEngineOptionPassthrough')).toBe(true);
  });
});
