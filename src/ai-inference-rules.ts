import type { Diagnostic } from './diagnostics.ts';

const REPOSITORIES_FILE = 'catalogs/repositories.yaml';
const RULE_ID = 'ZDP-AI-INFERENCE-001';

export interface AiInferencePolicy {
  readonly enabled: boolean;
  readonly selectorKind: string;
  readonly requiredValues: ReadonlyMap<string, unknown>;
  readonly requiredExactLists: ReadonlyMap<string, readonly string[]>;
  readonly sameValues: ReadonlyMap<string, string>;
  readonly requiredFields: readonly string[];
  readonly requiredOwnedData: readonly string[];
  readonly forbiddenOwnedData: readonly string[];
  readonly forbiddenOwnedDataKeywords: readonly string[];
}

const EMPTY_POLICY: AiInferencePolicy = {
  enabled: false,
  selectorKind: '',
  requiredValues: new Map(),
  requiredExactLists: new Map(),
  sameValues: new Map(),
  requiredFields: [],
  requiredOwnedData: [],
  forbiddenOwnedData: [],
  forbiddenOwnedDataKeywords: []
};

export function buildAiInferencePolicy(value: unknown): AiInferencePolicy {
  if (!isRecord(value) || !Array.isArray(value.rules)) return EMPTY_POLICY;
  const rule = value.rules.find(
    (candidate) => isRecord(candidate) && candidate.id === RULE_ID
  );
  if (!isRecord(rule)) return EMPTY_POLICY;
  const selector = isRecord(rule.selector) ? rule.selector : {};
  const assertions = isRecord(rule.assertions) ? rule.assertions : {};

  return {
    enabled: true,
    selectorKind: readString(selector['execution_plane.kind']),
    requiredValues: readUnknownMap(assertions.require_values),
    requiredExactLists: readStringArrayMap(assertions.require_exact_lists),
    sameValues: readStringMap(assertions.require_same_values),
    requiredFields: readStringArray(assertions.require_fields),
    requiredOwnedData: readStringArray(assertions.require_owned_data),
    forbiddenOwnedData: readStringArray(assertions.forbid_owned_data),
    forbiddenOwnedDataKeywords: readStringArray(assertions.forbid_owned_data_keywords)
  };
}

export function validateAiInferenceRepositories(
  value: unknown,
  policy: AiInferencePolicy
): readonly Diagnostic[] {
  if (!policy.enabled) return [];
  if (!isRecord(value) || !Array.isArray(value.repositories)) {
    return [diagnostic('repositories', '`repositories` must be a YAML array.')];
  }

  return value.repositories.flatMap((repository, index) => {
    if (
      !isRecord(repository) ||
      readValue(repository, 'execution_plane.kind') !== policy.selectorKind
    ) {
      return [];
    }

    const name = readString(repository.name) || `index-${index}`;
    const base = `repositories[${index}:${name}]`;
    const diagnostics: Diagnostic[] = [];

    for (const [path, expected] of policy.requiredValues) {
      if (readValue(repository, path) !== expected) {
        diagnostics.push(
          diagnostic(
            `${base}.${path}`,
            `AI inference repository \`${name}\` must set \`${path}\` to \`${String(expected)}\`.`
          )
        );
      }
    }
    for (const [path, expected] of policy.requiredExactLists) {
      const actual = readStringArray(readValue(repository, path));
      if (
        actual.length !== expected.length ||
        actual.some((entry, entryIndex) => entry !== expected[entryIndex])
      ) {
        diagnostics.push(
          diagnostic(
            `${base}.${path}`,
            `AI inference repository \`${name}\` must set \`${path}\` to the reviewed exact list: ${expected.join(', ')}.`
          )
        );
      }
    }
    for (const [path, referencePath] of policy.sameValues) {
      if (readValue(repository, path) !== readValue(repository, referencePath)) {
        diagnostics.push(
          diagnostic(
            `${base}.${path}`,
            `AI inference repository \`${name}\` must keep \`${path}\` equal to \`${referencePath}\`.`
          )
        );
      }
    }
    for (const path of policy.requiredFields) {
      const actual = readValue(repository, path);
      if (typeof actual !== 'string' || actual.trim().length === 0) {
        diagnostics.push(
          diagnostic(`${base}.${path}`, `AI inference repository \`${name}\` must define \`${path}\`.`)
        );
      }
    }

    const ownedData = readStringArray(repository.owns_data);
    for (const required of policy.requiredOwnedData) {
      if (!ownedData.includes(required)) {
        diagnostics.push(
          diagnostic(
            `${base}.owns_data`,
            `AI inference repository \`${name}\` must own execution evidence \`${required}\`.`
          )
        );
      }
    }
    for (const forbidden of policy.forbiddenOwnedData) {
      if (ownedData.includes(forbidden)) {
        diagnostics.push(
          diagnostic(
            `${base}.owns_data`,
            `AI inference repository \`${name}\` must not own control-plane data \`${forbidden}\`.`
          )
        );
      }
    }
    for (const keyword of policy.forbiddenOwnedDataKeywords) {
      const matched = ownedData.find((entry) => entry.toLowerCase().includes(keyword.toLowerCase()));
      if (matched !== undefined) {
        diagnostics.push(
          diagnostic(
            `${base}.owns_data`,
            `AI inference repository \`${name}\` must not own product content or authorship data \`${matched}\` matched by \`${keyword}\`.`
          )
        );
      }
    }
    return diagnostics;
  });
}

function diagnostic(path: string, message: string): Diagnostic {
  return { ruleId: RULE_ID, severity: 'error', file: REPOSITORIES_FILE, path, message };
}

function readValue(value: Record<string, unknown>, path: string): unknown {
  let current: unknown = value;
  for (const segment of path.split('.')) {
    const match = /^(.*)\[(\d+)\]$/.exec(segment);
    if (match) {
      if (!isRecord(current)) return undefined;
      const list = current[match[1]];
      current = Array.isArray(list) ? list[Number(match[2])] : undefined;
    } else {
      current = isRecord(current) ? current[segment] : undefined;
    }
  }
  return current;
}

function readUnknownMap(value: unknown): ReadonlyMap<string, unknown> {
  return isRecord(value) ? new Map(Object.entries(value)) : new Map();
}

function readStringMap(value: unknown): ReadonlyMap<string, string> {
  if (!isRecord(value)) return new Map();
  return new Map(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
  );
}

function readStringArrayMap(value: unknown): ReadonlyMap<string, readonly string[]> {
  if (!isRecord(value)) return new Map();
  return new Map(
    Object.entries(value).map(([key, item]) => [key, readStringArray(item)] as const)
  );
}

function readStringArray(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
