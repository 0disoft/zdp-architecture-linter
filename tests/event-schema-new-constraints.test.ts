import { describe, expect, test } from 'bun:test';
import { findBreakingChanges } from '../src/event-schema-comparison.ts';

const compare = (baseSchema: unknown, headSchema: unknown): readonly string[] => findBreakingChanges({ baseSchema, headSchema, ignoreVersionIdentity: false });

describe('new event schema constraints', () => {
  test('ignores nested required, type and enum ordering while preserving literal array order', () => {
    const base = { $defs: { payload: { type: ['object', 'null'], required: ['first', 'second'],
      properties: { state: { enum: ['ready', 'done'] } } } } };
    const head = { $defs: { payload: { type: ['null', 'object'], required: ['second', 'first'],
      properties: { state: { enum: ['done', 'ready'] } } } } };
    for (const key of ['$defs', 'definitions', 'dependentSchemas']) {
      expect(compare({ [key]: base.$defs }, { [key]: head.$defs })).toEqual([]);
    }
    expect(compare({ allOf: [base] }, { allOf: [head] })).toEqual([]);
    expect(compare({ allOf: [{ const: ['first', 'second'] }] },
      { allOf: [{ const: ['second', 'first'] }] })).toContain('schema.allOf changed');
    expect(compare({ allOf: [{ enum: [['first', 'second']] }] },
      { allOf: [{ enum: [['second', 'first']] }] })).toContain('schema.allOf changed');
  });

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
test('dependentRequired field lists are unordered constraints, including nested schemas', () => {
  const before = { dependentRequired: { credit: ['billing', 'address'] } };
  const reordered = { dependentRequired: { credit: ['address', 'billing'] } };
  expect(compare(before, reordered)).toEqual([]);
  expect(compare({ allOf: [before] }, { allOf: [reordered] })).toEqual([]);
  expect(compare(before, { dependentRequired: { credit: ['address'] } })).toContain('schema.dependentRequired changed');
  expect(compare({ const: before }, { const: reordered }).length).toBeGreaterThan(0);
});
