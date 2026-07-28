import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Diagnostic } from './diagnostics.ts';

const RULE_ID = 'ZDP-AI-INFERENCE-REPO-001';
const FILE = 'contracts/consumed-contracts.json';
const REQUIRED_FILES = [
  'contracts/consumed-contracts.json',
  'contracts/runtime-profiles.json',
  'contracts/loaded-artifact-verification.json',
  'contracts/model-serving-receipts.json',
  'scripts/check-contracts.ts'
] as const;

export async function validateRepositoryAiInferenceContract(input: {
  readonly repositoryRoot: string | undefined;
  readonly repositoryServiceContract: unknown;
}): Promise<readonly Diagnostic[]> {
  if (input.repositoryRoot === undefined || readPath(input.repositoryServiceContract, 'service.repo') !== 'zdp-ai-inference') return [];
  const diagnostics: Diagnostic[] = [];
  for (const file of REQUIRED_FILES) {
    try { await readFile(join(input.repositoryRoot, file), 'utf8'); }
    catch { diagnostics.push(diagnostic(file, '', `Required inference contract file is missing: ${file}`)); }
  }
  let contract: unknown;
  try { contract = JSON.parse(await readFile(join(input.repositoryRoot, FILE), 'utf8')); }
  catch { return [...diagnostics, diagnostic(FILE, '', 'Consumed inference contract must be valid JSON.')]; }
  if (!isRecord(contract)) return [...diagnostics, diagnostic(FILE, '', 'Consumed inference contract must be an object.')];
  require(contract.schemaVersion === 'zdp.ai-inference.consumed-contracts/v1', 'schemaVersion', 'Consumed contract schema version must remain v1.', diagnostics);
  require(contract.normalCaller === 'zdp-ai-platform', 'normalCaller', 'Only zdp-ai-platform may be the normal caller.', diagnostics);
  require(contract.rawEngineOptionPassthrough === false, 'rawEngineOptionPassthrough', 'Raw engine option passthrough must remain false.', diagnostics);
  const contracts = Array.isArray(contract.contracts) ? contract.contracts : [];
  require(contracts.length === 4, 'contracts', 'All four execution request/result/error/receipt contracts are required.', diagnostics);
  require(contracts.every((item) => isRecord(item) && typeof item.sha256 === 'string' && /^[a-f0-9]{64}$/.test(item.sha256)), 'contracts', 'Every consumed contract requires an immutable SHA-256.', diagnostics);
  const rules = readStringArray(readPath(input.repositoryServiceContract, 'policy_gates.required_linter_rules'));
  require(rules.includes(RULE_ID), 'service.yaml', `service.yaml must require ${RULE_ID}.`, diagnostics);
  return diagnostics;
}

function require(condition: boolean, path: string, message: string, diagnostics: Diagnostic[]): void { if (!condition) diagnostics.push(diagnostic(FILE, path, message)); }
function diagnostic(file: string, path: string, message: string): Diagnostic { return { ruleId: RULE_ID, severity: 'error', file, path, message }; }
function readPath(value: unknown, path: string): unknown { let current=value; for(const part of path.split('.')) current=isRecord(current)?current[part]:undefined; return current; }
function readStringArray(value: unknown): readonly string[] { return Array.isArray(value) && value.every((item)=>typeof item==='string') ? value : []; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value==='object' && value!==null && !Array.isArray(value); }
