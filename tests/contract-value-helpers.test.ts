import { describe, expect, it } from 'bun:test';
import {
  formatError,
  isMissingPathError,
  isRecord,
  readPath,
  readRepositoryName,
  readStringField
} from '../src/contract-value-helpers.ts';

describe('contract value helpers', () => {
  it('keeps record and dotted path semantics stable', () => {
    const contract = {
      service: { repo: ' zdp-example ' },
      nested: { enabled: false }
    };

    expect(isRecord(contract)).toBe(true);
    expect(isRecord(null)).toBe(false);
    expect(isRecord([])).toBe(false);
    expect(readPath(contract, 'nested.enabled')).toBe(false);
    expect(readPath(contract, 'nested.missing')).toBeUndefined();
    expect(readPath(contract, '')).toBeUndefined();
    expect(readPath(null, 'nested.enabled')).toBeUndefined();
    expect(readPath(undefined, 'nested.enabled')).toBeUndefined();
    expect(readPath([], '0')).toBeUndefined();
    expect(readPath({ nested: [] }, 'nested.value')).toBeUndefined();
  });

  it('reads only canonical service.repo and trims string fields', () => {
    expect(readRepositoryName({ service: { repo: ' zdp-example ' } })).toBe(
      'zdp-example'
    );
    expect(readRepositoryName({ repo: 'legacy-root-repo' })).toBeNull();
    expect(readRepositoryName({ service: [] })).toBeNull();
    expect(readRepositoryName({ service: { repo: '   ' } })).toBeNull();
    expect(readStringField({ value: ' ready ' }, 'value')).toBe('ready');
    expect(readStringField({ value: '   ' }, 'value')).toBeNull();
    expect(readStringField({ value: 42 }, 'value')).toBeNull();
  });

  it('preserves error formatting and ENOENT-only missing path policy', () => {
    const missing = Object.assign(new Error('missing'), { code: 'ENOENT' });
    const directory = Object.assign(new Error('directory'), { code: 'EISDIR' });

    expect(formatError(new Error('broken'))).toBe('broken');
    expect(formatError('broken')).toBe('broken');
    expect(isMissingPathError(missing)).toBe(true);
    expect(isMissingPathError(directory)).toBe(false);
    expect(isMissingPathError(new Error('ordinary'))).toBe(false);
    expect(isMissingPathError(null)).toBe(false);
    expect(isMissingPathError({ code: 'ENOENT' })).toBe(false);
  });
});
