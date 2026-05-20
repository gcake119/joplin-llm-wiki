import fs from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import Database from "better-sqlite3";
import { NOTE_COL, NOTES_TABLE } from "./joplin-schema.js";
import {
  assertPathUnderExportRoot,
  markdownPathForNotebookTitle,
} from "./paths.js";
import {
  listNotebooksFromSqlite,
  resolveIncludedNotebookIds,
  safePathSegment,
} from "./notebooks.js";

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
 * @param {{ db: Database, notebookFilter: import('../../config/load-config.js').AppConfig['joplin_sqlite_sync']['notebook_filter'] }} args
 */
export function countExportableNotesWithFilter({ db, notebookFilter }) {
  const notebooks = listNotebooksFromSqlite(db, {
    separator: notebookFilter.notebook_path_separator,
  });
  const included = resolveIncludedNotebookIds(notebooks, notebookFilter);
  if (!included) return countExportableNotes({ db });
  if (included.size === 0) return 0;
  const placeholders = [...included].map(() => "?").join(",");
  const sql = `SELECT COUNT(*) AS c FROM ${NOTES_TABLE} WHERE IFNULL(${NOTE_COL.deleted_time}, 0) = 0 AND ${NOTE_COL.parent_id} IN (${placeholders})`;
  const row = /** @type {{ c: number }} */ (db.prepare(sql).get(...included));
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
 *   notebookFilter?: import('../../config/load-config.js').AppConfig['joplin_sqlite_sync']['notebook_filter'],
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
    const notebookFilter = args.notebookFilter ?? defaultNotebookFilter();
    const notebooks = listNotebooksFromSqlite(db, {
      separator: notebookFilter.notebook_path_separator,
    });
    const notebooksById = new Map(notebooks.map((n) => [n.id, n]));
    const includedNotebookIds = resolveIncludedNotebookIds(notebooks, notebookFilter);
    const total = countExportableNotesWithFilter({ db, notebookFilter });
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

    const where = [`IFNULL(${NOTE_COL.deleted_time}, 0) = 0`];
    /** @type {string[]} */
    const bind = [];
    if (includedNotebookIds) {
      if (includedNotebookIds.size === 0) {
        where.push("1 = 0");
      } else {
        where.push(`${NOTE_COL.parent_id} IN (${[...includedNotebookIds].map(() => "?").join(",")})`);
        bind.push(...includedNotebookIds);
      }
    }
    const sql = `SELECT ${NOTE_COL.id} AS id, ${NOTE_COL.parent_id} AS parent_id, ${NOTE_COL.title} AS title, ${NOTE_COL.body} AS body FROM ${NOTES_TABLE} WHERE ${where.join(" AND ")} ORDER BY ${NOTE_COL.parent_id}, ${NOTE_COL.title}, ${NOTE_COL.id}`;
    const rows = /** @type {{ id: string, title: string, body: string | null }[]} */ (
      db.prepare(sql).all(...bind)
    );

    /** @type {Set<string>} */
    const exportedIds = new Set();
    const exportedRelPaths = new Set();
    const usedRelPaths = new Set();
    let written_files = 0;

    for (const row of rows) {
      const id = row.id;
      const body = row.body ?? "";
      if (containsReplacementUtf8(body)) {
        skipped_notes.push({ id, reason: "INVALID_UTF8" });
        continue;
      }
      const parentId = /** @type {{ parent_id?: string }} */ (row).parent_id ?? "";
      const notebook = notebooksById.get(parentId);
      const notebookSlug = notebook?.slug ?? safePathSegment("_uncategorized");
      const picked = markdownPathForNotebookTitle(
        args.exportRootAbs,
        notebookSlug,
        row.title || id,
        usedRelPaths,
      );
      const outPath = picked.abs;
      const header = noteFrontmatter({
        id,
        notebookId: parentId,
        notebookPath: notebook?.path ?? "_uncategorized",
        notebookSlug,
      });
      const content = header + body;
      try {
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, content, "utf8");
        exportedIds.add(id);
        exportedRelPaths.add(picked.rel);
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
      deleted_files = mirrorDeleteStaleMarkdown(args.exportRootAbs, exportedRelPaths);
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
function noteFrontmatter(args) {
  return `---\njoplin_note_id: ${args.id}\njoplin_notebook_id: ${args.notebookId}\njoplin_notebook_path: ${JSON.stringify(args.notebookPath)}\njoplin_notebook_slug: ${JSON.stringify(args.notebookSlug)}\n---\n\n`;
}

function containsReplacementUtf8(s) {
  return /\uFFFD/.test(s);
}

function defaultNotebookFilter() {
  return {
    enabled: false,
    include_notebook_ids: [],
    include_notebook_paths: [],
    include_descendants: true,
    notebook_path_style: "joined_slug",
    notebook_path_separator: "-",
    source_filename: "title",
  };
}

/**
 * @param {string} root
 * @param {Set<string>} exportedRelPaths
 */
function mirrorDeleteStaleMarkdown(root, exportedRelPaths) {
  let deleted = 0;
  if (!fs.existsSync(root)) return deleted;
  /** @param {string} dir */
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      assertPathUnderExportRoot(root, full);
      if (ent.isDirectory()) {
        walk(full);
        continue;
      }
      if (!ent.isFile() || !ent.name.endsWith(".md")) continue;
      const rel = path.relative(root, full).split(path.sep).join("/");
      if (!exportedRelPaths.has(rel)) {
        fs.unlinkSync(full);
        deleted++;
      }
    }
  };
  walk(root);
  return deleted;
}
