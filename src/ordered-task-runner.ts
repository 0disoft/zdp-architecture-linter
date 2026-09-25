export type OrderedTask<T> = () => T | Promise<T>;

/**
 * Runs independent tasks concurrently while preserving their declaration order.
 * If multiple tasks reject, the earliest declared failure is rethrown after every
 * task settles so timing cannot change the observable error contract.
 */
export async function runTasksInOrder<T>(
  tasks: readonly OrderedTask<T>[]
): Promise<readonly T[]> {
  const settled = await Promise.allSettled(
    tasks.map((task) => Promise.resolve().then(task))
  );
  const values: T[] = [];

  for (const result of settled) {
    if (result.status === 'rejected') {
      throw result.reason;
    }

    values.push(result.value);
  }

  return values;
}
