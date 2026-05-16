import fs from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import Database from "better-sqlite3";
import { NOTE_COL, NOTES_TABLE } from "./joplin-schema.js";
import { assertPathUnderExportRoot, markdownPathForNote } from "./paths.js";

/**
 * @param {string} dbPath
 * @param {number} busyTimeoutMs
 * @param {number} maxAttempts
 * @returns {Promise<Database>}
 */
export async function openReadonlyDatabase(dbPath, busyTimeoutMs, maxAttempts) {
  let lastErr = new Error("sqlite open failed");
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return new Database(dbPath, {
        readonly: true,
        fileMustExist: true,
        timeout: busyTimeoutMs,
      });
    } catch (e) {
      lastErr = /** @type {Error} */ (e);
      const code = /** @type {NodeJS.ErrnoException} */ (e).code;
      const msg = String(e?.message ?? e);
      const busy =
        code === "SQLITE_BUSY" ||
        code === "SQLITE_LOCKED" ||
        /SQLITE_BUSY/i.test(msg) ||
        /database is locked/i.test(msg);
      if (!busy || attempt === maxAttempts) break;
      await delay(Math.min(1000, 50 * attempt));
    }
  }
  const err = new Error(
    `SQLITE_OPEN_FAILED: ${lastErr?.message ?? "cannot open database"}`,
  );
  /** @type {Error & { code?: string }} */ (err).code = "SQLITE_OPEN_FAILED";
  throw err;
}

/**
 * @param {{ db: Database }} args
 * @returns {number}
 */
export function countExportableNotes({ db }) {
  const sql = `SELECT COUNT(*) AS c FROM ${NOTES_TABLE} WHERE IFNULL(${NOTE_COL.deleted_time}, 0) = 0`;
  const row = /** @type {{ c: number }} */ (db.prepare(sql).get());
  return Number(row.c) || 0;
}

/**
 * @param {{
 *   databasePath: string,
 *   exportRootAbs: string,
 *   reconcileMode: 'mirror' | 'leave',
 *   busyTimeoutMs: number,
 *   maxExportAttempts: number,
 *   dryRun: boolean,
 * }} args
 * @returns {Promise<{
 *   exported_notes: number,
 *   written_files: number,
 *   skipped_notes: { id: string, reason: string }[],
 *   deleted_files: number,
 *   duration_ms: number,
 * }>}
 */
export async function exportNotesFromSqlite(args) {
  const t0 = Date.now();
  const skipped_notes = [];
  let db;
  try {
    db = await openReadonlyDatabase(
      args.databasePath,
      args.busyTimeoutMs,
      args.maxExportAttempts,
    );
  } catch (e) {
    if (/** @type {Error & { code?: string }} */ (e).code === "SQLITE_OPEN_FAILED")
      throw e;
    const wrapped = new Error(
      `SQLITE_OPEN_FAILED: ${/** @type {Error} */ (e).message}`,
    );
    /** @type {Error & { code?: string }} */ (wrapped).code = "SQLITE_OPEN_FAILED";
    throw wrapped;
  }

  try {
    const total = countExportableNotes({ db });
    if (args.dryRun) {
      return {
        exported_notes: total,
        written_files: 0,
        skipped_notes,
        deleted_files: 0,
        duration_ms: Date.now() - t0,
      };
    }

    if (!fs.existsSync(args.exportRootAbs)) {
      fs.mkdirSync(args.exportRootAbs, { recursive: true });
    }
    const stat = fs.statSync(args.exportRootAbs);
    if (!stat.isDirectory()) {
      const err = new Error("export_root is not a directory");
      /** @type {Error & { code?: string }} */ (err).code = "SQLITE_EXPORT_FAILED";
      throw err;
    }

    const sql = `SELECT ${NOTE_COL.id} AS id, ${NOTE_COL.title} AS title, ${NOTE_COL.body} AS body FROM ${NOTES_TABLE} WHERE IFNULL(${NOTE_COL.deleted_time}, 0) = 0`;
    const rows = /** @type {{ id: string, title: string, body: string | null }[]} */ (
      db.prepare(sql).all()
    );

    /** @type {Set<string>} */
    const exportedIds = new Set();
    let written_files = 0;

    for (const row of rows) {
      const id = row.id;
      const body = row.body ?? "";
      if (containsReplacementUtf8(body)) {
        skipped_notes.push({ id, reason: "INVALID_UTF8" });
        continue;
      }
      const outPath = markdownPathForNote(args.exportRootAbs, id);
      const header = noteFrontmatter(id);
      const content = header + body;
      try {
        fs.writeFileSync(outPath, content, "utf8");
        exportedIds.add(id);
        written_files++;
      } catch (e) {
        const err = new Error(
          `SQLITE_EXPORT_FAILED: write ${outPath}: ${/** @type {Error} */ (e).message}`,
        );
        /** @type {Error & { code?: string }} */ (err).code = "SQLITE_EXPORT_FAILED";
        throw err;
      }
    }

    let deleted_files = 0;
    if (args.reconcileMode === "mirror") {
      const entries = fs.readdirSync(args.exportRootAbs, { withFileTypes: true });
      for (const ent of entries) {
        if (!ent.isFile() || !ent.name.endsWith(".md")) continue;
        const stem = ent.name.slice(0, -3);
        if (!exportedIds.has(stem)) {
          const full = path.join(args.exportRootAbs, ent.name);
          assertPathUnderExportRoot(args.exportRootAbs, full);
          fs.unlinkSync(full);
          deleted_files++;
        }
      }
    }

    return {
      exported_notes: rows.length,
      written_files,
      skipped_notes,
      deleted_files,
      duration_ms: Date.now() - t0,
    };
  } finally {
    db.close();
  }
}

/**
 * @param {string} id
 */
function noteFrontmatter(id) {
  return `---\njoplin_note_id: ${id}\n---\n\n`;
}

function containsReplacementUtf8(s) {
  return /\uFFFD/.test(s);
}
