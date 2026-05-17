/**
 * Return up to `maxTake` consecutive items from `items` starting at `offset` (wraps with modulo).
 *
 * @template T
 * @param {T[]} items
 * @param {number} offsetRaw
 * @param {number} maxTake
 * @returns {T[]}
 */
export function rotatedSlice(items, offsetRaw, maxTake) {
  const n = items.length;
  if (n === 0 || maxTake <= 0) return [];
  const offset = ((Math.trunc(offsetRaw) % n) + n) % n;
  const k = Math.min(n, Math.trunc(maxTake));
  const out = [];
  for (let i = 0; i < k; i++) {
    out.push(items[(offset + i) % n]);
  }
  return out;
}
