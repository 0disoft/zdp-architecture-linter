import { describe, expect, test } from 'bun:test';
import { runTasksInOrder } from '../src/ordered-task-runner.ts';

describe('ordered task runner', () => {
  test('starts every task before waiting and returns values in declaration order', async () => {
    const first = createDeferred();
    const second = createDeferred();
    const third = createDeferred();
    const started: string[] = [];

    const result = runTasksInOrder([
      async () => {
        started.push('first');
        await first.promise;
        return 'first';
      },
      async () => {
        started.push('second');
        await second.promise;
        return 'second';
      },
      async () => {
        started.push('third');
        await third.promise;
        return 'third';
      }
    ]);

    await Promise.resolve();
    expect(started).toEqual(['first', 'second', 'third']);

    third.resolve();
    second.resolve();
    first.resolve();

    expect(await result).toEqual(['first', 'second', 'third']);
  });

  test('rethrows the earliest declared failure after every task settles', async () => {
    const first = createDeferred();
    const second = createDeferred();
    const completed: string[] = [];

    const result = runTasksInOrder([
      async () => {
        await first.promise;
        completed.push('first');
        throw new Error('first failure');
      },
      async () => {
        await second.promise;
        completed.push('second');
        throw new Error('second failure');
      },
      async () => {
        completed.push('third');
        return 'third';
      }
    ]);

    await Promise.resolve();
    second.resolve();
    first.resolve();

    await expect(result).rejects.toThrow('first failure');
    expect([...completed].sort()).toEqual(['first', 'second', 'third']);
  });
});

function createDeferred(): {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
} {
  let resolvePromise: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve: () => {
      resolvePromise?.();
    }
  };
}
