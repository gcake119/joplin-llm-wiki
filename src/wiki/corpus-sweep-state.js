import fs from "node:fs";
import path from "node:path";

export const SWEEP_STATE_SCHEMA_VERSION = 1;
export const SWEEP_STATE_DIR = ".joplin-llm-wiki";
export const SWEEP_STATE_FILENAME = "corpus-sweep-state.json";

/**
 * @typedef {{
 *   schema_version: number,
 *   next_offset: number,
 *   markdown_file_count: number,
 *   step_files: number,
 *   updated_at_ms: number,
 * }} SweepState
 */

/**
 * @param {string} wikiRootResolved
 */
export function defaultSweepStatePath(wikiRootResolved) {
  return path.join(
    path.resolve(wikiRootResolved),
    SWEEP_STATE_DIR,
    SWEEP_STATE_FILENAME,
  );
}

/**
 * @param {import('../config/load-config.js').AppConfig} cfg
 */
export function resolveSweepStatePath(cfg) {
  const custom = cfg.wiki_ingest.corpus_auto_sweep.state_path?.trim?.();
  if (custom) return path.resolve(custom);
  return defaultSweepStatePath(cfg.wiki);
}

/**
 * @param {number} stepFiles
 * @returns {SweepState}
 */
export function initialSweepState(stepFiles) {
  return {
    schema_version: SWEEP_STATE_SCHEMA_VERSION,
    next_offset: 0,
    markdown_file_count: 0,
    step_files: stepFiles,
    updated_at_ms: 0,
  };
}

/**
 * @param {unknown} o
 * @returns {SweepState | null}
 */
function coerceSweepState(o) {
  if (typeof o !== "object" || o === null) return null;
  const r = /** @type {Record<string, unknown>} */ (o);
  if (Math.trunc(Number(r.schema_version)) !== SWEEP_STATE_SCHEMA_VERSION)
    return null;
  for (const k of ["next_offset", "markdown_file_count", "step_files", "updated_at_ms"]) {
    const v = r[k];
    if (typeof v !== "number" || !Number.isFinite(v) || Math.trunc(v) !== v)
      return null;
  }
  return {
    schema_version: SWEEP_STATE_SCHEMA_VERSION,
    next_offset: /** @type {number} */ (r.next_offset),
    markdown_file_count: /** @type {number} */ (r.markdown_file_count),
    step_files: /** @type {number} */ (r.step_files),
    updated_at_ms: /** @type {number} */ (r.updated_at_ms),
  };
}

/**
 * @param {string} statePath
 * @returns {SweepState | null}
 */
export function readSweepState(statePath) {
  try {
    const raw = fs.readFileSync(statePath, "utf8");
    const o = JSON.parse(raw);
    return coerceSweepState(o);
  } catch (e) {
    const code = /** @type {NodeJS.ErrnoException} */ (e).code;
    if (code === "ENOENT") return null;
    return null;
  }
}

/**
 * @param {SweepState | null} state
 * @param {number} markdownCount
 * @param {number} cfgStepFiles
 * @returns {{ state: SweepState, fingerprint_reset: boolean }}
 */
export function reconcileFingerprint(state, markdownCount, cfgStepFiles) {
  let s =
    state !== null ?
      { ...state }
    : initialSweepState(cfgStepFiles);
  let fingerprint_reset = false;
  if (markdownCount !== s.markdown_file_count) {
    s.next_offset = 0;
    s.markdown_file_count = markdownCount;
    fingerprint_reset = true;
  }
  s.step_files = cfgStepFiles;
  return { state: s, fingerprint_reset };
}

/**
 * @param {string} statePath
 * @param {SweepState} state
 */
export function writeSweepStateAtomic(statePath, state) {
  try {
    const dir = path.dirname(statePath);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${statePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state) + "\n", "utf8");
    fs.renameSync(tmp, statePath);
  } catch (e) {
    const err = new Error(
      `corpus sweep state write failed: ${statePath}: ${String(/** @type {Error} */ (e).message ?? e)}`,
    );
    /** @type {Error & { code?: string }} */ (err).code = "CORPUS_SWEEP_STATE_IO";
    throw err;
  }
}
