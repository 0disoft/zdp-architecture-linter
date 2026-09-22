import { describe, expect, test } from 'bun:test';
import { findBreakingChanges } from '../src/event-schema-comparison.ts';

const compare = (baseSchema: unknown, headSchema: unknown): readonly string[] => findBreakingChanges({ baseSchema, headSchema, ignoreVersionIdentity: false });

describe('new event schema constraints', () => {
  test('detects introduced enum, const, items and additionalProperties schemas', () => {
    for (const [base, head, keyword] of [
      [{ type: 'string' }, { type: 'string', enum: ['a'] }, 'enum'],
      [{ type: 'string' }, { type: 'string', const: 'a' }, 'const'],
      [{ type: 'array' }, { type: 'array', items: { type: 'string' } }, 'items'],
      [{ type: 'array' }, { type: 'array', items: false }, 'items'],
      [{ type: 'object' }, { type: 'object', additionalProperties: { type: 'string' } }, 'additionalProperties'],
      [{ type: 'object', additionalProperties: true }, { type: 'object', additionalProperties: { enum: ['a'] } }, 'additionalProperties']
    ] as const) {
      expect(compare(base, head).some((change) => change.includes(keyword))).toBe(true);
    }
  });
  test('keeps unrestricted items and annotation-only changes compatible', () => {
    expect(compare({ type: 'array' }, { type: 'array', items: true })).toEqual([]);
    expect(compare({ type: 'array' }, { type: 'array', items: { description: 'Anything' } })).toEqual([]);
    expect(compare({ allOf: [{ type: 'string', description: 'old' }] }, { allOf: [{ type: 'string', description: 'new' }] })).toEqual([]);
  });
  test('does not treat literal enum or const payload keys as schema annotations', () => {
    expect(compare({ const: { description: 'a' } }, { const: { description: 'b' } }).length).toBeGreaterThan(0);
    expect(compare({ enum: [{ 'x-value': 'a' }] }, { enum: [{ 'x-value': 'b' }] }).length).toBeGreaterThan(0);
    expect(compare({ allOf: [{ properties: { description: { type: 'string' } } }] }, { allOf: [{ properties: { description: { type: 'number' } } }] }).length).toBeGreaterThan(0);
  });
  test('does not silently approve unsupported keyword changes', () => {
    expect(compare({}, { customValidationKeyword: 3 }).some((change) => change.includes('not proven'))).toBe(true);
    expect(compare({}, { multipleOf: 2 }).some((change) => change.includes('multipleOf'))).toBe(true);
    expect(compare({}, { 'x-review-note': 'metadata' })).toEqual([]);
  });
  test('allows optional additions to a closed object and enum expansion', () => {
    expect(compare({ type: 'object', additionalProperties: false, properties: {} }, { type: 'object', additionalProperties: false, properties: { note: { type: 'string' } } })).toEqual([]);
    expect(compare({ enum: ['a'] }, { enum: ['a', 'b'] })).toEqual([]);
  });
});
