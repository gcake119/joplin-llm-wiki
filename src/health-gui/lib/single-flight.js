/**
 * Returns an async runner that ignores overlapping calls while `fn` is in flight.
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {() => Promise<{ skipped: boolean, result?: T }>}
 */
export function createSingleFlight(fn) {
  let busy = false;
  return async () => {
    if (busy) return { skipped: true };
    busy = true;
    try {
      const result = await fn();
      return { skipped: false, result };
    } finally {
      busy = false;
    }
  };
}
