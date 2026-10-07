import { isAlias, isMap, isScalar, isSeq, LineCounter, parseDocument } from 'yaml';

const TIMESTAMP_FIELD = /^(?:timestamp|created_at|updated_at|logged_at|occurred_at|available_at|expires_at|scheduled_at|next_run_at(?:_utc)?|event_time|log_time)$/;
const VALUE_FIELDS = new Set(['example', 'examples', 'default', 'const', 'enum', 'type', 'value']);
const TYPE_DESCRIPTORS = new Set(['string', 'datetime', 'timestamptz']);

/** Keep field values separate from sibling prose and retain locations for folded scalars and aliases. */
export function collectTimestampFieldValues(source: string): readonly { value: unknown; line: number; literal: boolean }[] {
  const lines = new LineCounter();
  const document = parseDocument(source, { lineCounter: lines });
  if (document.errors.length) return [];
  const result: { value: unknown; line: number; literal: boolean }[] = [];
  const ancestors = new WeakSet<object>();
  function visit(node: unknown, timestamp = false, location?: number, depth = 0, literal = true, schemaFields = false): void {
    if (node === null || typeof node !== 'object') return;
    if (depth > 128 || ancestors.has(node)) throw new Error('Invalid time contract graph.');
    ancestors.add(node);
    try {
      if (isAlias(node)) {
        visit(node.resolve(document), timestamp, location ?? node.range?.[0], depth + 1, literal, schemaFields);
      } else if (isScalar(node)) {
        if (timestamp) {
          result.push({ value: typeof node.value === 'string' ? node.value.replace(/\s*\r?\n\s*/g, ' ') : node.value,
            line: lines.linePos(location ?? node.range?.[0] ?? 0).line,
            literal: literal && !(schemaFields && typeof node.value === 'string' && TYPE_DESCRIPTORS.has(node.value)) });
        }
      } else if (isSeq(node)) {
        for (const item of node.items) visit(item, timestamp, undefined, depth + 1, literal, schemaFields);
      } else if (isMap(node)) {
        for (const pair of node.items) {
          const key = isScalar(pair.key) && typeof pair.key.value === 'string' ? pair.key.value : '';
          const normalized = key.replace(/([a-z])([A-Z])/g, '$1_$2').replace(/_example$/, '').toLowerCase();
          const isTimestamp = TIMESTAMP_FIELD.test(normalized) || (timestamp && VALUE_FIELDS.has(key));
          visit(pair.value, isTimestamp, isScalar(pair.key) ? pair.key.range?.[0] : undefined, depth + 1, key !== 'type',
            key === 'properties' || key === 'schema_field_types' || (schemaFields && !VALUE_FIELDS.has(key)));
        }
      }
    } finally { ancestors.delete(node); }
  }
  try { visit(document.contents); }
  catch { return []; } // The recurring-schedule validator reports malformed/cyclic documents once.
  return result;
}
