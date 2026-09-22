import type { ArchitectureCatalogs } from './catalog-loader.ts';
import type { Diagnostic } from './diagnostics.ts';

/** Validate interpreter inputs without prescribing policy values. */
export function validateRuleCatalogShapes(
  catalogs: ArchitectureCatalogs
): readonly Diagnostic[] {
  const inputs: ReadonlyArray<readonly [string, unknown, boolean]> = [
    ['money', catalogs.moneyRules, false],
    ['provider', catalogs.providerRules, false],
    ['ai-data-access', catalogs.aiDataAccessRules, false],
    ['data-access', catalogs.dataAccessRules, false],
    ['tier', catalogs.tierRules, false],
    ['ai-inference', catalogs.aiInferenceRules, true],
    ['api', catalogs.apiRules, true],
    ['token', catalogs.tokenRules, true]
  ];
  return inputs.flatMap(([name, value, optional]) =>
    optional && value === undefined ? [] : validateRuleCatalogShape(value, `rules/${name}.rules.yaml`)
  );
}

export function validateRuleCatalogShape(value: unknown, file: string): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const fail = (path: string, message: string): void => {
    diagnostics.push({ ruleId: 'ZDP-POLICY-000', severity: 'error', file, path, message });
  };
  if (!isRecord(value) || !Array.isArray(value.rules)) {
    fail('rules', 'Policy input must be an object with a rules array; use rules: [] for an explicitly empty policy.');
    return diagnostics;
  }
  const ids = new Set<string>();
  for (const [index, rule] of value.rules.entries()) {
    const path = `rules[${index}]`;
    if (!isRecord(rule) || typeof rule.id !== 'string' || rule.id.trim().length === 0) {
      fail(path, 'Each policy rule must be an object with a non-empty id.');
      continue;
    }
    const id = rule.id.trim();
    if (ids.has(id)) fail(`${path}.id`, 'Policy rule ids must be unique within a file.');
    ids.add(id);
    if (rule.assertions === undefined) {
      if (file === 'rules/money.rules.yaml' && /^ZDP-MONEY-00[123]$/.test(id)) {
        fail(`${path}.assertions`, 'An interpreted money rule must declare an assertions object.');
      }
      continue;
    }
    if (!isRecord(rule.assertions)) {
      fail(`${path}.assertions`, 'Rule assertions must be an object.');
      continue;
    }
    for (const field of ['require_values', 'require_any', 'forbid_values'] as const) {
      const assertions = rule.assertions[field];
      if (assertions === undefined) continue;
      if (!isRecord(assertions)) {
        fail(`${path}.assertions.${field}`, 'Assertion groups must be objects keyed by field path.');
        continue;
      }
      if (field !== 'require_values') {
        for (const [key, candidates] of Object.entries(assertions)) {
          if (!Array.isArray(candidates) || candidates.some((candidate) => typeof candidate !== 'string' || candidate.trim().length === 0)) {
            fail(`${path}.assertions.${field}.${key}`, 'Assertion choices must be an array of non-empty strings.');
          }
        }
      }
    }
    if (file === 'rules/money.rules.yaml' && id === 'ZDP-MONEY-001' && isRecord(rule.assertions.require_values)) {
      for (const [field, type] of [['service.tier', 'string'], ['audit.required', 'boolean'], ['idempotency.required', 'boolean']] as const) {
        const candidate = rule.assertions.require_values[field];
        if (candidate !== undefined && (typeof candidate !== type || (typeof candidate === 'string' && candidate.trim().length === 0))) {
          fail(`${path}.assertions.require_values.${field}`, `Money assertion must be a non-empty ${type} value.`);
        }
      }
    }
  }
  return diagnostics;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
