import { isAlias, isMap, isScalar, isSeq, LineCounter, parseDocument } from 'yaml';

const TIMESTAMP_FIELD = /^(?:timestamp|created_at|updated_at|logged_at|occurred_at|available_at|expires_at|scheduled_at|next_run_at(?:_utc)?|event_time|log_time)$/;
const VALUE_FIELDS = new Set(['example', 'examples', 'default', 'const', 'enum', 'type', 'value']);

/** Keep field values separate from sibling prose and retain locations for folded scalars and aliases. */
export function collectTimestampFieldValues(source: string): readonly { value: string; line: number }[] {
  const lines = new LineCounter();
  const document = parseDocument(source, { lineCounter: lines });
  if (document.errors.length) return [];
  const result: { value: string; line: number }[] = [];
  const ancestors = new WeakSet<object>();
  function visit(node: unknown, timestamp = false, location?: number, depth = 0): void {
    if (node === null || typeof node !== 'object') return;
    if (depth > 128 || ancestors.has(node)) throw new Error('Invalid time contract graph.');
    ancestors.add(node);
    try {
      if (isAlias(node)) {
        visit(node.resolve(document), timestamp, location ?? node.range?.[0], depth + 1);
      } else if (isScalar(node)) {
        if (timestamp && typeof node.value === 'string') {
          result.push({ value: node.value.replace(/\s*\r?\n\s*/g, ' '),
            line: lines.linePos(location ?? node.range?.[0] ?? 0).line });
        }
      } else if (isSeq(node)) {
        for (const item of node.items) visit(item, timestamp, undefined, depth + 1);
      } else if (isMap(node)) {
        for (const pair of node.items) {
          const key = isScalar(pair.key) && typeof pair.key.value === 'string' ? pair.key.value : '';
          const normalized = key.replace(/([a-z])([A-Z])/g, '$1_$2').replace(/_example$/, '').toLowerCase();
          const isTimestamp = TIMESTAMP_FIELD.test(normalized) || (timestamp && VALUE_FIELDS.has(key));
          visit(pair.value, isTimestamp, isScalar(pair.key) ? pair.key.range?.[0] : undefined, depth + 1);
        }
      }
    } finally { ancestors.delete(node); }
  }
  try { visit(document.contents); }
  catch { return []; } // The recurring-schedule validator reports malformed/cyclic documents once.
  return result;
}
