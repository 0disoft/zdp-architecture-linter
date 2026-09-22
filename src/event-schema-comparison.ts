const ANNOTATIONS = new Set(['$schema', '$id', '$comment', 'title', 'description', 'default', 'examples', 'deprecated', 'readOnly', 'writeOnly']);
const MINIMUM = ['minimum', 'exclusiveMinimum', 'minLength', 'minItems', 'minProperties'] as const;
const MAXIMUM = ['maximum', 'exclusiveMaximum', 'maxLength', 'maxItems', 'maxProperties'] as const;
const STRUCTURAL = ['$ref', '$dynamicRef', '$recursiveRef', 'pattern', 'format', 'oneOf', 'anyOf', 'allOf', 'not', 'if', 'then', 'else', 'contains', 'propertyNames', 'dependentRequired', 'dependentSchemas', 'prefixItems', 'patternProperties', 'unevaluatedItems', 'unevaluatedProperties', 'additionalItems', 'multipleOf', 'minContains', 'maxContains', '$defs', 'definitions'] as const;
const KNOWN = new Set<string>(['required', 'properties', 'type', 'enum', 'const', 'items', 'additionalProperties', 'uniqueItems', ...MINIMUM, ...MAXIMUM, ...STRUCTURAL]);
const SCHEMA_MAPS = new Set(['properties', 'patternProperties', '$defs', 'definitions', 'dependentSchemas']);
const SCHEMA_VALUES = new Set(['items', 'additionalProperties', 'additionalItems', 'unevaluatedItems', 'unevaluatedProperties', 'contains', 'propertyNames', 'not', 'if', 'then', 'else', 'contentSchema', 'oneOf', 'anyOf', 'allOf', 'prefixItems']);

interface Comparison {
  readonly base: Record<string, unknown>;
  readonly head: Record<string, unknown>;
  readonly path: string;
  readonly ignoreVersionIdentity: boolean;
  readonly changes: Set<string>;
}
interface NodeComparison extends Omit<Comparison, 'base' | 'head'> { readonly base: unknown; readonly head: unknown; }

export function findBreakingChanges(input: {
  readonly baseSchema: unknown;
  readonly headSchema: unknown;
  readonly ignoreVersionIdentity: boolean;
}): readonly string[] {
  const changes = new Set<string>();
  compareSchemaNodes({ base: input.baseSchema, head: input.headSchema, path: 'schema', ignoreVersionIdentity: input.ignoreVersionIdentity, changes });
  return [...changes].sort();
}

function compareSchemaNodes(input: NodeComparison): void {
  if (isUnrestricted(input.base) && isUnrestricted(input.head)) return;
  if (!isRecord(input.base) || !isRecord(input.head)) {
    if (!literalEqual(input.base, input.head)) input.changes.add(`${input.path} changed shape`);
    return;
  }
  const compared: Comparison = { ...input, base: input.base, head: input.head };
  compareRequired(compared);
  compareProperties(compared);
  compareType(compared);
  compareEnum(compared);
  compareConst(compared);
  compareConstraints(compared);
  compareStructuralKeywords(compared);
  compareItems(compared);
  compareAdditionalProperties(compared);
  for (const keyword of new Set([...Object.keys(compared.base), ...Object.keys(compared.head)])) {
    if (KNOWN.has(keyword) || ANNOTATIONS.has(keyword) || keyword.startsWith('x-')) continue;
    if (!literalEqual(compared.base[keyword], compared.head[keyword])) {
      compared.changes.add(`${compared.path}.${keyword} changed; compatibility is not proven for this keyword`);
    }
  }
}
function compareRequired(input: Comparison): void {
  const base = readStringSet(input.base.required) ?? new Set<string>();
  const head = readStringSet(input.head.required) ?? new Set<string>();
  const added = difference(head, base);
  const removed = difference(base, head);
  if (added.length > 0) input.changes.add(`${input.path}.required added ${formatInlineValues(added)}`);
  if (removed.length > 0) input.changes.add(`${input.path}.required removed ${formatInlineValues(removed)}`);
}
function compareProperties(input: Comparison): void {
  const base = isRecord(input.base.properties) ? input.base.properties : {};
  const head = isRecord(input.head.properties) ? input.head.properties : {};
  for (const [name, schema] of Object.entries(base)) {
    const path = `${input.path}.properties.${name}`;
    if (!Object.hasOwn(head, name)) { input.changes.add(`${path} was removed`); continue; }
    compareSchemaNodes({ ...input, base: schema, head: head[name], path });
  }
  // A new optional field constrains previously allowed arbitrary values when the object was open.
  if (input.base.additionalProperties !== false) {
    const additional = isRecord(input.base.additionalProperties) ? input.base.additionalProperties : {};
    for (const [name, schema] of Object.entries(head)) {
      if (!Object.hasOwn(base, name)) compareSchemaNodes({ ...input, base: additional, head: schema, path: `${input.path}.properties.${name}` });
    }
  }
}
function compareType(input: Comparison): void {
  const base = readTypeSet(input.base.type) ?? new Set<string>();
  const head = readTypeSet(input.head.type) ?? new Set<string>();
  if (base.size !== head.size || [...base].some((type) => !head.has(type))) {
    input.changes.add(`${input.path}.type changed from ${formatValue(input.base.type)} to ${formatValue(input.head.type)}`);
  }
}
function compareEnum(input: Comparison): void {
  const base = input.base.enum;
  const head = input.head.enum;
  if (!Array.isArray(base)) {
    if (head !== undefined && !literalEqual(base, head)) input.changes.add(`${input.path}.enum was introduced`);
    return;
  }
  if (!Array.isArray(head)) { input.changes.add(`${input.path}.enum was removed`); return; }
  const removed = base.filter((value) => !head.some((candidate) => literalEqual(candidate, value)));
  if (removed.length > 0) input.changes.add(`${input.path}.enum removed ${removed.map(formatValue).join(', ')}`);
}
function compareConst(input: Comparison): void {
  if (input.ignoreVersionIdentity && input.path === 'schema.properties.schema_version') return;
  if (!Object.hasOwn(input.base, 'const')) {
    if (Object.hasOwn(input.head, 'const')) input.changes.add(`${input.path}.const was introduced`);
    return;
  }
  if (!Object.hasOwn(input.head, 'const') || !literalEqual(input.base.const, input.head.const)) {
    input.changes.add(`${input.path}.const changed from ${formatValue(input.base.const)} to ${formatValue(input.head.const)}`);
  }
}
function compareConstraints(input: Comparison): void {
  for (const keyword of MINIMUM) {
    const base = finiteNumber(input.base[keyword]);
    const head = finiteNumber(input.head[keyword]);
    if (head !== null && (base === null || head > base)) input.changes.add(`${input.path}.${keyword} tightened from ${formatValue(input.base[keyword])} to ${head}`);
  }
  for (const keyword of MAXIMUM) {
    const base = finiteNumber(input.base[keyword]);
    const head = finiteNumber(input.head[keyword]);
    if (head !== null && (base === null || head < base)) input.changes.add(`${input.path}.${keyword} tightened from ${formatValue(input.base[keyword])} to ${head}`);
  }
  if (input.base.uniqueItems !== true && input.head.uniqueItems === true) input.changes.add(`${input.path}.uniqueItems tightened to true`);
}
function compareStructuralKeywords(input: Comparison): void {
  for (const keyword of STRUCTURAL) {
    if (!schemaValueEqual(keyword, input.base[keyword], input.head[keyword])) input.changes.add(`${input.path}.${keyword} changed`);
  }
}
function compareItems(input: Comparison): void {
  if (input.base.items === undefined) {
    if (input.head.items !== undefined) compareSchemaNodes({ ...input, base: {}, head: input.head.items, path: `${input.path}.items` });
    return;
  }
  if (input.head.items === undefined) { input.changes.add(`${input.path}.items was removed`); return; }
  compareSchemaNodes({ ...input, base: input.base.items, head: input.head.items, path: `${input.path}.items` });
}
function compareAdditionalProperties(input: Comparison): void {
  const base = input.base.additionalProperties;
  const head = input.head.additionalProperties;
  if (head === false && base !== false) { input.changes.add(`${input.path}.additionalProperties tightened to false`); return; }
  if (isRecord(head) && (base === undefined || base === true || isRecord(base))) {
    compareSchemaNodes({ ...input, base: isRecord(base) ? base : {}, head, path: `${input.path}.additionalProperties` });
  }
}

function isUnrestricted(value: unknown): boolean {
  return value === true || (isRecord(value) && Object.keys(value).every((key) => ANNOTATIONS.has(key) || key.startsWith('x-')));
}
function schemaValueEqual(keyword: string, left: unknown, right: unknown): boolean {
  const normalize = (value: unknown): unknown => {
    if (SCHEMA_MAPS.has(keyword) && isRecord(value)) return Object.fromEntries(Object.keys(value).sort().map((name) => [name, sortSchema(value[name])]));
    return SCHEMA_VALUES.has(keyword) ? sortSchema(value) : sortLiteral(value);
  };
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}
function sortSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortSchema);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).filter((key) => !ANNOTATIONS.has(key) && !key.startsWith('x-')).sort().map((key) => {
    const entry = value[key];
    if (SCHEMA_MAPS.has(key) && isRecord(entry)) return [key, Object.fromEntries(Object.keys(entry).sort().map((name) => [name, sortSchema(entry[name])]))];
    return [key, SCHEMA_VALUES.has(key) ? sortSchema(entry) : sortLiteral(entry)];
  }));
}
function sortLiteral(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortLiteral);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortLiteral(value[key])]));
}
function literalEqual(left: unknown, right: unknown): boolean { return JSON.stringify(sortLiteral(left)) === JSON.stringify(sortLiteral(right)); }
function readStringSet(value: unknown): Set<string> | null {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string') ? new Set(value as string[]) : null;
}
function readTypeSet(value: unknown): Set<string> | null { return typeof value === 'string' ? new Set([value]) : readStringSet(value); }
function difference(left: ReadonlySet<string>, right: ReadonlySet<string>): string[] { return [...left].filter((value) => !right.has(value)).sort(); }
function finiteNumber(value: unknown): number | null { return typeof value === 'number' && Number.isFinite(value) ? value : null; }
function formatInlineValues(values: readonly string[]): string { return values.map((value) => `\`${value}\``).join(', '); }
function formatValue(value: unknown): string { return value === undefined ? 'undefined' : JSON.stringify(value); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
