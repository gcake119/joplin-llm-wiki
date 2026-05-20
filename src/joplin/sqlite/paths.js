import path from "node:path";
import { safePathSegment } from "./notebooks.js";

const NOTE_ID_RE = /^[a-f0-9]{32}$/i;

/**
 * @param {string} noteId
 * @returns {boolean}
 */
export function isLikelyJoplinNoteId(noteId) {
  return NOTE_ID_RE.test(noteId);
}

/**
 * @param {string} exportRootAbs absolute export directory
 * @param {string} fileAbs absolute file path
 */
export function assertPathUnderExportRoot(exportRootAbs, fileAbs) {
  const root = path.resolve(exportRootAbs);
  const file = path.resolve(fileAbs);
  const rel = path.relative(root, file);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    const err = new Error("refuses path outside export_root");
    /** @type {Error & { code?: string }} */ (err).code = "SQLITE_EXPORT_FAILED";
    throw err;
  }
}

/**
 * @param {string} exportRootAbs
 * @param {string} noteId
 * @returns {string} absolute path to `{id}.md`
 */
export function markdownPathForNote(exportRootAbs, noteId) {
  if (!isLikelyJoplinNoteId(noteId)) {
    const err = new Error(`invalid note id for filename: ${noteId}`);
    /** @type {Error & { code?: string }} */ (err).code = "SQLITE_EXPORT_FAILED";
    throw err;
  }
  const out = path.join(path.resolve(exportRootAbs), `${noteId}.md`);
  assertPathUnderExportRoot(exportRootAbs, out);
  return out;
}

/**
 * @param {string} exportRootAbs
 * @param {string} notebookSlug
 * @param {string} title
 * @param {Set<string>} usedRelPaths
 * @returns {{ abs: string, rel: string }}
 */
export function markdownPathForNotebookTitle(
  exportRootAbs,
  notebookSlug,
  title,
  usedRelPaths,
) {
  const dir = safePathSegment(notebookSlug);
  const base = safePathSegment(title).replace(/[. ]+$/g, "") || "untitled";
  let n = 1;
  while (true) {
    const name = n === 1 ? `${base}.md` : `${base}-${n}.md`;
    const rel = `${dir}/${name}`;
    if (!usedRelPaths.has(rel)) {
      const abs = path.join(path.resolve(exportRootAbs), dir, name);
      assertPathUnderExportRoot(exportRootAbs, abs);
      usedRelPaths.add(rel);
      return { abs, rel };
    }
    n++;
  }
}
