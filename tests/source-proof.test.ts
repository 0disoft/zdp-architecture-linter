import { expect, test } from 'bun:test';
import {
  extractTestCallNames,
  stripCommentsAndStringLiterals
} from '../src/source-proof.ts';

test('preserves code after nested template literals', () => {
  const source = [
    "const message = `${items.map((value) => `${value}`).join(', ')}.`;",
    'function isRuntimeContractEnforcement(value: string): boolean {',
    '  return true;',
    '}',
    'const data = Bun.YAML.parse(source);'
  ].join('\n');

  const stripped = stripCommentsAndStringLiterals(source);

  expect(stripped).toContain('function isRuntimeContractEnforcement');
  expect(stripped).toContain('Bun.YAML.parse');
});

test('removes string and comment proof fragments without removing code', () => {
  const source = [
    "'export function fakeProof() {}';",
    '// function hiddenInComment() {}',
    'export function realProof(): void {}'
  ].join('\n');

  const stripped = stripCommentsAndStringLiterals(source);

  expect(stripped).not.toContain('fakeProof');
  expect(stripped).not.toContain('hiddenInComment');
  expect(stripped).toContain('export function realProof');
});

test('extracts test and it call names while ignoring literal lists', () => {
  const source = [
    "const fakeProof = ['real case', 'other case'];",
    "test('real case', () => {});",
    "it('other case', () => {});"
  ].join('\n');

  expect(extractTestCallNames(source)).toEqual(['real case', 'other case']);
});
