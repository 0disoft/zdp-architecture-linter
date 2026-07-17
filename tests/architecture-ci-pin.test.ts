import { describe, expect, test } from 'bun:test';

import { assertPinnedLinterHead, readArchitectureLinterPin } from '../src/architecture-ci-pin.ts';

const PIN = 'dbfbc9cbb11eb0aafeaf28c9a811c5301c08c1e0';

function workflow(ref: string): string {
  return `
name: Validate architecture
jobs:
  validate:
    steps:
      - uses: actions/checkout@immutable
        with:
          repository: 0disoft/zdp-architecture-linter
          ref: ${ref}
`;
}

describe('architecture CI linter pin', () => {
  test('reads an immutable linter checkout ref and admits the same local HEAD', () => {
    const pinnedRef = readArchitectureLinterPin(workflow(PIN));

    expect(pinnedRef).toBe(PIN);
    expect(() => assertPinnedLinterHead(pinnedRef, PIN)).not.toThrow();
  });

  test('rejects mutable workflow refs before local validation starts', () => {
    expect(() => readArchitectureLinterPin(workflow('main'))).toThrow(
      'Architecture linter workflow ref must be a full 40-character Git SHA.',
    );
  });

  test('rejects a local linter checkout that differs from the workflow pin', () => {
    expect(() => assertPinnedLinterHead(PIN, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).toThrow(
      `Local architecture linter HEAD aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa does not match workflow pin ${PIN}.`,
    );
  });
});
