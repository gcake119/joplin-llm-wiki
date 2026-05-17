import fs from "node:fs";
import path from "node:path";
import { parseWikiMarkdown } from "../wiki/frontmatter.js";
import { runJoplinCliPreflight, runJoplinCliProcess } from "./cli-runner.js";

/** Joplin item type: notebook */
const TYPE_FOLDER = 2;
/** Joplin item type: note */
const TYPE_NOTE = 1;

/**
 * Topic string for Joplin notebook title: NFC trim, strip path/control chars, max 128 units.
 *
 * @param {string} s
 */
export function normalizeWikiWritebackTopic(s) {
  let t = s.trim().normalize("NFC");
  t = t.replace(/[\u0000-\u001f\\/]/g, "_");
  if (t.length > 128) t = t.slice(0, 128);
  return t || "_uncategorized";
}

/**
 * @param {import('../config/load-config.js').AppConfig} cfg
 * @param {string} wikiRootAbs
 * @param {string[]} relPaths
 */
export function summarizeWikiWritebackDry(cfg, wikiRootAbs, relPaths) {
  const wb = cfg.joplin_wiki_writeback;
  if (!wb.enabled) {
    return {
      writeback_would_write: 0,
      writeback_would_create_notebooks: 0,
      writeback_collision_count: 0,
    };
  }
  if (relPaths.length === 0) {
    return {
      writeback_would_write: 0,
      writeback_would_create_notebooks: 0,
      writeback_collision_count: 0,
    };
  }
  const { entries, collisions } = readWikiEntries(cfg, wikiRootAbs, relPaths, true);
  const topics = new Set(entries.map((e) => e.topic));
  return {
    writeback_would_write: entries.length,
    writeback_would_create_notebooks: topics.size,
    writeback_collision_count: collisions,
  };
}

/**
 * Write compiled wiki pages into Joplin via the terminal CLI (notebook tree under `parent_notebook_title`).
 *
 * @param {import('../config/load-config.js').AppConfig} cfg
 * @param {string} wikiRootAbs
 * @param {string[]} relPaths relative paths under `wiki_root` touched this run
 * @param {{ runCli?: typeof defaultRunCli, dryRun?: boolean }} [options]
 */
export async function runWikiWriteback(cfg, wikiRootAbs, relPaths, options = {}) {
  const wb = cfg.joplin_wiki_writeback;
  if (!wb.enabled) {
    return {
      writeback_written: 0,
      writeback_skipped: 0,
      writeback_notebooks_ensured: 0,
      writeback_collision_count: 0,
    };
  }

  if (relPaths.length === 0) {
    return {
      writeback_written: 0,
      writeback_skipped: 0,
      writeback_notebooks_ensured: 0,
      writeback_collision_count: 0,
    };
  }

  const runCli = options.runCli ?? defaultRunCli;
  const { entries, collisions } = readWikiEntries(cfg, wikiRootAbs, relPaths, false);

  if (options.dryRun) {
    const topics = new Set(entries.map((e) => e.topic));
    return {
      writeback_written: 0,
      writeback_skipped: 0,
      writeback_would_write: entries.length,
      writeback_would_create_notebooks: topics.size,
      writeback_collision_count: collisions,
    };
  }

  await runJoplinCliPreflight(cfg);

  const parentTitle = wb.parent_notebook_title;

  let rootFolders = await listRootFolders(cfg, runCli);
  let parent = rootFolders.find((f) => f.title === parentTitle);
  if (!parent) {
    await joplinRetry(cfg, ["mkbook", parentTitle], runCli);
    rootFolders = await listRootFolders(cfg, runCli);
    parent = rootFolders.find((f) => f.title === parentTitle);
  }
  if (!parent?.id) {
    throw writePhaseFail(`failed to resolve parent notebook: ${parentTitle}`);
  }
  const parentId = parent.id;

  const topicsTouched = [...new Set(entries.map((e) => e.topic))];
  let notebooksCreated = 0;
  for (const topic of topicsTouched) {
    const created = await ensureTopicFolder(cfg, runCli, parentTitle, parentId, topic);
    if (created) notebooksCreated++;
  }

  let written = 0;
  for (const e of entries) {
    await upsertNoteInTopic(cfg, runCli, parentTitle, e.topic, e.noteTitle, e.body);
    written++;
  }

  return {
    writeback_written: written,
    writeback_skipped: 0,
    writeback_notebooks_ensured: topicsTouched.length,
    writeback_notebooks_created: notebooksCreated,
    writeback_collision_count: collisions,
  };
}

/**
 * @param {import('../config/load-config.js').AppConfig} cfg
 * @param {string} wikiRootAbs
 * @param {string[]} relPaths
 */
function readWikiEntries(cfg, wikiRootAbs, relPaths, allowMissing) {
  const wb = cfg.joplin_wiki_writeback;
  const topicKey = wb.topic_frontmatter_key;
  const noteTitleKey = wb.note_title_key;
  /** @type {{ rel: string, topic: string, noteTitle: string, body: string }[]} */
  const entries = [];
  for (const rel of relPaths) {
    const abs = path.join(wikiRootAbs, rel);
    if (!fs.existsSync(abs)) {
      if (!allowMissing) {
        const err = new Error(`wiki file missing for writeback: ${rel}`);
        /** @type {Error & { code?: string }} */ (err).code = "WIKI_COMPILE_ABORT";
        throw err;
      }
      entries.push(entryFromRelPathOnly(rel));
      continue;
    }
    const raw = fs.readFileSync(abs, "utf8");
    const { data, body } = parseWikiMarkdown(raw);
    const topicRaw = data[topicKey];
    let topic = "_uncategorized";
    if (typeof topicRaw === "string" && topicRaw.trim()) {
      topic = normalizeWikiWritebackTopic(topicRaw);
    }
    let noteTitle = path.basename(rel, ".md");
    const nt = data[noteTitleKey];
    if (typeof nt === "string" && nt.trim()) noteTitle = nt.trim();
    entries.push({ rel, topic, noteTitle, body });
  }

  const seen = new Map();
  let collisions = 0;
  for (const e of entries) {
    const k = `${e.topic}\0${e.noteTitle}`;
    if (seen.has(k)) collisions++;
    else seen.set(k, e.rel);
  }
  return { entries, collisions };
}

/**
 * Path-only estimate when the file is not on disk (e.g. wiki-compile --dry-run planner output).
 *
 * @param {string} rel
 */
function entryFromRelPathOnly(rel) {
  const norm = rel.replace(/\\/g, "/");
  const parts = norm.split("/").filter(Boolean);
  const title = path.basename(norm, ".md");
  let topic = "_uncategorized";
  if (parts.length > 1) {
    topic = normalizeWikiWritebackTopic(parts[0]);
  }
  let noteTitle = title;
  return { rel, topic, noteTitle, body: "" };
}

/**
 * @param {import('../config/load-config.js').AppConfig} cfg
 * @param {string[]} args
 * @param {(c: import('../config/load-config.js').AppConfig, a: string[]) => Promise<{ stdout: string, stderr: string }>} runCli
 */
async function joplinRetry(cfg, args, runCli) {
  const max = cfg.joplin_wiki_writeback.max_cli_attempts;
  /** @type {unknown} */
  let last = undefined;
  for (let i = 0; i < max; i++) {
    try {
      return await runCli(cfg, args);
    } catch (e) {
      last = e;
    }
  }
  const err = /** @type {Error} */ (last) ?? new Error("joplin cli failed");
  const code = /** @type {Error & { code?: string }} */ (err).code;
  if (code === "JOPLIN_CLI_FAILED") {
    const w = new Error(err.message);
    /** @type {Error & { code?: string }} */ (w).code = "JOPLIN_CLI_WRITE_FAILED";
    throw w;
  }
  throw err;
}

/**
 * @param {import('../config/load-config.js').AppConfig} cfg
 * @param {(c: import('../config/load-config.js').AppConfig, a: string[]) => Promise<{ stdout: string, stderr: string }>} runCli
 */
async function listRootFolders(cfg, runCli) {
  const { stdout } = await joplinRetry(cfg, ["ls", "/", "-f", "json"], runCli);
  /** @type {unknown} */
  let arr;
  try {
    arr = JSON.parse(stdout.trim());
  } catch {
    throw writePhaseFail("invalid JSON from joplin ls /");
  }
  if (!Array.isArray(arr)) return [];
  return arr.filter(
    (o) =>
      o &&
      typeof o === "object" &&
      /** @type {{ parent_id?: string, type_?: number, deleted_time?: number, title?: string, id?: string }} */ (
        o
      ).parent_id === "" &&
      /** @type {{ type_?: number }} */ (o).type_ === TYPE_FOLDER &&
      !(/** @type {{ deleted_time?: number }} */ (o).deleted_time > 0),
  );
}

/**
 * @returns {Promise<boolean>} true if mkbook was invoked
 */
async function ensureTopicFolder(cfg, runCli, parentTitle, parentId, topic) {
  await joplinRetry(cfg, ["use", parentTitle], runCli);
  const { stdout } = await joplinRetry(cfg, ["ls", "-f", "json"], runCli);
  /** @type {unknown} */
  let arr;
  try {
    arr = JSON.parse(stdout.trim());
  } catch {
    throw writePhaseFail("invalid JSON from joplin ls");
  }
  if (!Array.isArray(arr)) return false;
  const subFolders = arr.filter(
    (o) =>
      o &&
      typeof o === "object" &&
      /** @type {{ parent_id?: string, type_?: number, deleted_time?: number }} */ (
        o
      ).parent_id === parentId &&
      /** @type {{ type_?: number }} */ (o).type_ === TYPE_FOLDER &&
      !(/** @type {{ deleted_time?: number }} */ (o).deleted_time > 0),
  );
  if (subFolders.some(/** @param {any} */ (f) => f.title === topic)) return false;
  await joplinRetry(cfg, ["mkbook", topic], runCli);
  return true;
}

/**
 * @param {import('../config/load-config.js').AppConfig} cfg
 * @param {(c: import('../config/load-config.js').AppConfig, a: string[]) => Promise<{ stdout: string, stderr: string }>} runCli
 * @param {string} parentTitle
 * @param {string} topic
 * @param {string} noteTitle
 * @param {string} body
 */
async function upsertNoteInTopic(cfg, runCli, parentTitle, topic, noteTitle, body) {
  const usePath = `${parentTitle}/${topic}`;
  await joplinRetry(cfg, ["use", usePath], runCli);
  const { stdout } = await joplinRetry(cfg, ["ls", "-f", "json", "-t", "n"], runCli);
  /** @type {unknown} */
  let arr;
  try {
    arr = JSON.parse(stdout.trim());
  } catch {
    throw writePhaseFail("invalid JSON from joplin ls notes");
  }
  if (!Array.isArray(arr)) throw writePhaseFail("invalid ls for notes");
  const notes = arr.filter(
    (o) =>
      o &&
      typeof o === "object" &&
      /** @type {{ type_?: number, deleted_time?: number }} */ (o).type_ === TYPE_NOTE &&
      !(/** @type {{ deleted_time?: number }} */ (o).deleted_time > 0),
  );
  const matches = notes.filter(/** @param {any} */ (n) => n.title === noteTitle);
  if (matches.length > 1) {
    throw writePhaseFail(`duplicate note title in folder: ${noteTitle}`);
  }
  const bodyText = body.trimEnd() + "\n";
  if (matches.length === 1) {
    const id = /** @type {{ id: string }} */ (matches[0]).id;
    await joplinRetry(cfg, ["set", id, "body", bodyText], runCli);
    return;
  }
  await joplinRetry(cfg, ["mknote", noteTitle], runCli);
  const { stdout: out2 } = await joplinRetry(cfg, ["ls", "-f", "json", "-t", "n"], runCli);
  let arr2;
  try {
    arr2 = JSON.parse(out2.trim());
  } catch {
    throw writePhaseFail("invalid JSON after mknote");
  }
  const notes2 = Array.isArray(arr2)
    ? arr2.filter(
        (o) =>
          o &&
          typeof o === "object" &&
          /** @type {{ type_?: number, deleted_time?: number }} */ (o).type_ === TYPE_NOTE &&
          !(/** @type {{ deleted_time?: number }} */ (o).deleted_time > 0),
      )
    : [];
  const m2 = notes2.filter(/** @param {any} */ (n) => n.title === noteTitle);
  if (m2.length !== 1) {
    throw writePhaseFail(`could not resolve new note for title: ${noteTitle}`);
  }
  await joplinRetry(
    cfg,
    ["set", /** @type {{ id: string }} */ (m2[0]).id, "body", bodyText],
    runCli,
  );
}

/**
 * @param {import('../config/load-config.js').AppConfig} cfg
 * @param {string[]} args
 */
async function defaultRunCli(cfg, args) {
  return runJoplinCliProcess(cfg, args);
}

/**
 * @param {string} message
 */
function writePhaseFail(message) {
  const err = new Error(message);
  /** @type {Error & { code?: string }} */ (err).code = "JOPLIN_CLI_WRITE_FAILED";
  return err;
}
