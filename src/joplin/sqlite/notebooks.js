import { FOLDER_COL, FOLDERS_TABLE } from "./joplin-schema.js";

/**
 * @typedef {{
 *   id: string,
 *   parent_id: string,
 *   title: string,
 *   path: string,
 *   slug: string,
 * }} NotebookInfo
 */

/**
 * @param {import('better-sqlite3').Database} db
 * @param {{ separator?: string }} [opts]
 * @returns {NotebookInfo[]}
 */
export function listNotebooksFromSqlite(db, opts = {}) {
  const sep = opts.separator ?? "-";
  const sql = `SELECT ${FOLDER_COL.id} AS id, ${FOLDER_COL.parent_id} AS parent_id, ${FOLDER_COL.title} AS title FROM ${FOLDERS_TABLE} WHERE IFNULL(${FOLDER_COL.deleted_time}, 0) = 0`;
  let rows;
  try {
    rows = /** @type {{ id: string, parent_id: string, title: string }[]} */ (
      db.prepare(sql).all()
    );
  } catch (e) {
    if (/no such table: folders/i.test(String(/** @type {Error} */ (e).message))) {
      return [];
    }
    throw e;
  }
  return buildNotebookTree(rows, sep);
}

/**
 * @param {{ id: string, parent_id: string, title: string }[]} rows
 * @param {string} sep
 * @returns {NotebookInfo[]}
 */
export function buildNotebookTree(rows, sep = "-") {
  const byId = new Map(rows.map((r) => [r.id, r]));
  /** @type {Map<string, string[]>} */
  const pathMemo = new Map();

  /** @param {string} id @param {Set<string>} seen */
  const titlePath = (id, seen = new Set()) => {
    const memo = pathMemo.get(id);
    if (memo) return memo;
    const row = byId.get(id);
    if (!row) return [];
    if (seen.has(id)) return [row.title || id];
    seen.add(id);
    const parent = row.parent_id ? titlePath(row.parent_id, seen) : [];
    const out = [...parent, row.title || id];
    pathMemo.set(id, out);
    return out;
  };

  return rows
    .map((r) => {
      const parts = titlePath(r.id);
      const path = parts.join("/");
      return {
        id: r.id,
        parent_id: r.parent_id ?? "",
        title: r.title,
        path,
        slug: safePathSegment(parts.join(sep)),
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * @param {NotebookInfo[]} notebooks
 * @param {{
 *   enabled: boolean,
 *   include_notebook_ids: string[],
 *   include_notebook_paths: string[],
 *   include_descendants: boolean,
 * }} filter
 * @returns {Set<string> | null} null means no filtering
 */
export function resolveIncludedNotebookIds(notebooks, filter) {
  if (!filter.enabled) return null;
  const byId = new Map(notebooks.map((n) => [n.id, n]));
  const selected = new Set(filter.include_notebook_ids);
  const pathSet = new Set(filter.include_notebook_paths);
  for (const nb of notebooks) {
    if (pathSet.has(nb.path)) selected.add(nb.id);
  }
  if (filter.include_descendants) {
    let changed = true;
    while (changed) {
      changed = false;
      for (const nb of notebooks) {
        if (selected.has(nb.id)) continue;
        let cur = nb.parent_id;
        while (cur) {
          if (selected.has(cur)) {
            selected.add(nb.id);
            changed = true;
            break;
          }
          cur = byId.get(cur)?.parent_id ?? "";
        }
      }
    }
  }
  return selected;
}

/**
 * Keep unicode titles readable while preventing path separators and troublesome
 * filesystem characters.
 * @param {string} s
 */
export function safePathSegment(s) {
  const cleaned = s
    .normalize("NFC")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^\.+$/, "")
    .trim();
  return cleaned || "untitled";
}
