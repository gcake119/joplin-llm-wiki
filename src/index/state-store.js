import fs from "node:fs";
import path from "node:path";

/**
 * @typedef {{
 *   files: Record<string, { mtime_ms: number, chunks: Record<string, string> }>,
 * }} IndexState
 */

/**
 * @param {string} chromaPersistPath
 */
export function statePathForChroma(chromaPersistPath) {
  const dir = path.dirname(path.resolve(chromaPersistPath));
  return path.join(dir, "index-state.json");
}

/**
 * @param {string} p
 * @returns {IndexState}
 */
export function loadState(p) {
  try {
    const raw = fs.readFileSync(p, "utf8");
    const doc = JSON.parse(raw);
    if (!doc.files || typeof doc.files !== "object") return { files: {} };
    return { files: doc.files };
  } catch {
    return { files: {} };
  }
}

/**
 * @param {string} p
 * @param {IndexState} state
 */
export function saveState(p, state) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(state, null, 2), "utf8");
}

/**
 * @param {'source'|'wiki'} layer
 * @param {string} relativePath
 */
export function stateKey(layer, relativePath) {
  return `${layer}:${relativePath}`;
}
