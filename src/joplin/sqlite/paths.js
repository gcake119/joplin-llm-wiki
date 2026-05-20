import path from "node:path";
import crypto from "node:crypto";
import { safePathSegment } from "./notebooks.js";

const NOTE_ID_RE = /^[a-f0-9]{32}$/i;
const MAX_MARKDOWN_FILENAME_BYTES = 240;
const HASH_BYTES = 8;

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
    const suffix = n === 1 ? "" : `-${n}`;
    const name = markdownFilename(base, suffix);
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

/**
 * @param {string} base
 * @param {string} suffix
 */
function markdownFilename(base, suffix) {
  const ext = ".md";
  const budget = MAX_MARKDOWN_FILENAME_BYTES - Buffer.byteLength(`${suffix}${ext}`, "utf8");
  return `${truncateUtf8Segment(base, budget)}${suffix}${ext}`;
}

/**
 * @param {string} s
 * @param {number} maxBytes
 */
function truncateUtf8Segment(s, maxBytes) {
  if (Buffer.byteLength(s, "utf8") <= maxBytes) return s;
  const hash = crypto.createHash("sha1").update(s).digest("hex").slice(0, HASH_BYTES);
  const marker = `-${hash}`;
  const prefixBudget = Math.max(1, maxBytes - Buffer.byteLength(marker, "utf8"));
  let out = "";
  for (const ch of s) {
    if (Buffer.byteLength(out + ch, "utf8") > prefixBudget) break;
    out += ch;
  }
  return `${out.replace(/[. ]+$/g, "") || "untitled"}${marker}`;
}
