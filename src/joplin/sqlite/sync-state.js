import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const SQLITE_SYNC_STATE_SCHEMA_VERSION = 1;

/**
 * @typedef {{
 *   schema_version: number,
 *   updated_at_ms: number,
 *   export_root: string,
 *   files: Record<string, { joplin_note_id: string, sha256: string }>,
 * }} SyncSnapshot
 *
 * @typedef {{
 *   added: number,
 *   updated: number,
 *   deleted: number,
 * }} ChangeCounts
 *
 * @typedef {{
 *   raw_changed: boolean,
 *   change_detection: 'baseline' | 'changed' | 'unchanged' | 'dry_run',
 *   changed_files: ChangeCounts,
 * }} SnapshotComparison
 */

/** @returns {ChangeCounts} */
export function emptyChangeCounts() {
  return { added: 0, updated: 0, deleted: 0 };
}

/**
 * @param {string} exportRootAbs
 * @param {string[]} markdownFilesAbs
 * @param {number} [updatedAtMs]
 * @returns {SyncSnapshot}
 */
export function buildSnapshotFromMarkdown(
  exportRootAbs,
  markdownFilesAbs,
  updatedAtMs = Date.now(),
) {
  const root = path.resolve(exportRootAbs);
  /** @type {SyncSnapshot['files']} */
  const files = {};
  for (const absRaw of markdownFilesAbs.slice().sort()) {
    const abs = path.resolve(absRaw);
    const rel = path.relative(root, abs).split(path.sep).join("/");
    if (!rel || rel.startsWith("../") || path.isAbsolute(rel)) {
      const err = new Error(`markdown file outside export root: ${abs}`);
      /** @type {Error & { code?: string }} */ (err).code = "SQLITE_SYNC_STATE_IO";
      throw err;
    }
    const content = fs.readFileSync(abs, "utf8");
    files[rel] = {
      joplin_note_id: extractJoplinNoteId(content),
      sha256: crypto.createHash("sha256").update(content, "utf8").digest("hex"),
    };
  }
  return {
    schema_version: SQLITE_SYNC_STATE_SCHEMA_VERSION,
    updated_at_ms: updatedAtMs,
    export_root: root,
    files,
  };
}

/**
 * @param {SyncSnapshot | null} previous
 * @param {SyncSnapshot} current
 * @param {{ dryRun?: boolean }} [options]
 * @returns {SnapshotComparison}
 */
export function compareSnapshots(previous, current, options = {}) {
  const changed_files = emptyChangeCounts();
  if (!previous) {
    return {
      raw_changed: false,
      change_detection: options.dryRun ? "dry_run" : "baseline",
      changed_files,
    };
  }

  for (const [rel, cur] of Object.entries(current.files)) {
    const prev = previous.files[rel];
    if (!prev) {
      changed_files.added++;
      continue;
    }
    if (
      prev.sha256 !== cur.sha256 ||
      prev.joplin_note_id !== cur.joplin_note_id
    ) {
      changed_files.updated++;
    }
  }
  for (const rel of Object.keys(previous.files)) {
    if (!Object.prototype.hasOwnProperty.call(current.files, rel)) {
      changed_files.deleted++;
    }
  }
  const raw_changed =
    changed_files.added > 0 ||
    changed_files.updated > 0 ||
    changed_files.deleted > 0;
  return {
    raw_changed,
    change_detection: options.dryRun
      ? "dry_run"
      : raw_changed
        ? "changed"
        : "unchanged",
    changed_files,
  };
}

/**
 * @param {string} statePath
 * @returns {{ snapshot: SyncSnapshot | null, warning?: { code: string, message: string } }}
 */
export function readSnapshotState(statePath) {
  if (!fs.existsSync(statePath)) return { snapshot: null };
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, "utf8"));
    if (!isSnapshot(parsed)) {
      return {
        snapshot: null,
        warning: {
          code: "SQLITE_SYNC_STATE_MALFORMED",
          message: `malformed snapshot state: ${statePath}`,
        },
      };
    }
    return { snapshot: parsed };
  } catch {
    return {
      snapshot: null,
      warning: {
        code: "SQLITE_SYNC_STATE_MALFORMED",
        message: `malformed snapshot state: ${statePath}`,
      },
    };
  }
}

/**
 * @param {string} statePath
 * @param {SyncSnapshot} snapshot
 */
export function writeSnapshotStateAtomic(statePath, snapshot) {
  const abs = path.resolve(statePath);
  const dir = path.dirname(abs);
  const tmp = path.join(
    dir,
    `.${path.basename(abs)}.${process.pid}.${Date.now()}.tmp`,
  );
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(tmp, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    fs.renameSync(tmp, abs);
  } catch (e) {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore cleanup */
    }
    const err = new Error(
      `write snapshot state ${abs}: ${/** @type {Error} */ (e).message}`,
    );
    /** @type {Error & { code?: string }} */ (err).code = "SQLITE_SYNC_STATE_IO";
    throw err;
  }
}

/**
 * @param {string} content
 */
function extractJoplinNoteId(content) {
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(content);
  if (!match) return "";
  const line = match[1]
    .split(/\r?\n/)
    .find((l) => /^joplin_note_id\s*:/.test(l));
  if (!line) return "";
  return line.replace(/^joplin_note_id\s*:\s*/, "").trim().replace(/^["']|["']$/g, "");
}

/** @param {unknown} value */
function isSnapshot(value) {
  if (typeof value !== "object" || value === null) return false;
  const s = /** @type {SyncSnapshot} */ (value);
  if (s.schema_version !== SQLITE_SYNC_STATE_SCHEMA_VERSION) return false;
  if (typeof s.updated_at_ms !== "number") return false;
  if (typeof s.export_root !== "string") return false;
  if (typeof s.files !== "object" || s.files === null) return false;
  return Object.values(s.files).every(
    (f) =>
      typeof f === "object" &&
      f !== null &&
      typeof f.joplin_note_id === "string" &&
      typeof f.sha256 === "string",
  );
}
