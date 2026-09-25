import type { Diagnostic } from './diagnostics.ts';
import { createStateTransitionDiagnostics as evaluateStateTransitions } from './state-transition-evidence.ts';

type StateTransitionInput = Parameters<typeof evaluateStateTransitions>[0];

/** A proposed policy must not exempt transitions in its own diff. */
export function createStateTransitionDiagnostics(input: StateTransitionInput): readonly Diagnostic[] {
  const observedAt = input.observedAt ?? new Date();
  const basePolicy = readPolicy(input.baseCatalogs.tierRules);
  const headPolicy = readPolicy(input.headCatalogs.tierRules);
  const diagnostics = [...evaluateStateTransitions({ ...input, observedAt })];
  if (basePolicy === undefined) return diagnostics;

  const weakening = findPolicyWeakening(basePolicy, headPolicy);
  if (weakening.length > 0) {
    diagnostics.unshift({
      ruleId: 'ZDP-STATE-TRANSITION-000',
      severity: 'error',
      file: 'rules/tier.rules.yaml',
      path: 'state_transition_evidence',
      message: `State transition policy removes existing protection: ${weakening.join('; ')}. Review the policy change separately; base policy still applies to this diff.`
    });
  }
  if (JSON.stringify(basePolicy) !== JSON.stringify(headPolicy)) {
    diagnostics.push(...evaluateStateTransitions({
      ...input,
      observedAt,
      headCatalogs: { ...input.headCatalogs, tierRules: input.baseCatalogs.tierRules }
    }));
  }
  const unique = new Map<string, Diagnostic>();
  for (const diagnostic of diagnostics) {
    const key = JSON.stringify([diagnostic.ruleId, diagnostic.file, diagnostic.path, diagnostic.message]);
    if (!unique.has(key)) unique.set(key, diagnostic);
  }
  return [...unique.values()];
}

function readPolicy(value: unknown): unknown {
  return isRecord(value) ? value.state_transition_evidence : undefined;
}

function findPolicyWeakening(base: unknown, head: unknown): readonly string[] {
  if (!isRecord(base)) return [];
  if (!isRecord(head)) return ['policy was removed or replaced with an invalid value'];
  const issues: string[] = [];
  for (const field of [
    'required_evidence_fields',
    'service_statuses_requiring_evidence',
    'operational_asset_statuses_requiring_evidence'
  ]) {
    const oldValues = base[field];
    const newValues = head[field];
    if (!Array.isArray(oldValues)) continue;
    const remaining = new Set(Array.isArray(newValues)
      ? newValues.filter((item): item is string => typeof item === 'string').map((item) => item.trim())
      : []);
    if (oldValues.some((item) => typeof item === 'string' && !remaining.has(item.trim()))) {
      issues.push(`${field} lost a previously required value`);
    }
  }
  if (typeof base.evidence_max_age_days === 'number' &&
      typeof head.evidence_max_age_days === 'number' &&
      head.evidence_max_age_days > base.evidence_max_age_days) {
    issues.push('evidence_max_age_days was increased');
  }
  return issues;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
