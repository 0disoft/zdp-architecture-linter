import { expect, test } from 'bun:test';
import {
  extractTestCallNames,
  stripCommentsAndStringLiterals
} from '../src/source-proof.ts';

test('does not count test call syntax inside regular expressions as executable proof', () => {
  const source = [
    `const pattern = /test('hidden case')/;`,
    `const escaped = /it("also hidden")\\/tail/;`,
    `const ratio = total / count;`,
    `test('real case', () => {});`
  ].join('\n');
  expect(extractTestCallNames(source)).toEqual(['real case']);
});

test('masks nested template text while preserving every interpolation and source offset', () => {
  const source = 'const value = `outer ${`inner ${realProof()} hiddenInner`} hiddenOuter ${secondProof({ nested: true })}`;\nnextProof();';
  const stripped = stripCommentsAndStringLiterals(source);
  for (const name of ['realProof', 'secondProof', 'nextProof']) {
    expect(stripped.indexOf(name)).toBe(source.indexOf(name));
  }
  expect(stripped).not.toContain('hiddenInner');
  expect(stripped).not.toContain('hiddenOuter');
  expect(stripped).toContain('secondProof({ nested: true })');
  expect(stripped.length).toBe(source.length);
  expect(stripped.indexOf('\n')).toBe(source.indexOf('\n'));
});

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

test('removes regex literal proof fragments without removing division code', () => {
  const source = [
    'const fakePattern = /function hiddenInRegex\\(\\)|validateConnectorsContracts/;',
    'const ratio = total / count;',
    'export function realProof(): number {',
    '  return ratio;',
    '}'
  ].join('\n');

  const stripped = stripCommentsAndStringLiterals(source);

  expect(stripped).not.toContain('hiddenInRegex');
  expect(stripped).not.toContain('validateConnectorsContracts');
  expect(stripped).toContain('total / count');
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
