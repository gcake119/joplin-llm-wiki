import fs from "node:fs";
import path from "node:path";
import { parseWikiMarkdown } from "../wiki/frontmatter.js";
import { createJoplinDataApiClient } from "./data-api-client.js";

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
 * Write compiled wiki pages into Joplin via the Desktop Data API.
 *
 * @param {import('../config/load-config.js').AppConfig} cfg
 * @param {string} wikiRootAbs
 * @param {string[]} relPaths relative paths under `wiki_root` touched this run
 * @param {{ fetch?: typeof fetch, dryRun?: boolean }} [options]
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

  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
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

  const client = createJoplinDataApiClient(cfg, { fetch: fetchImpl });
  await client.pingWithRetries();

  const parentTitle = wb.parent_notebook_title;

  let rootFolders = await client.listRootFolders();
  let parent = rootFolders.find((f) => f.title === parentTitle);
  if (!parent) {
    await client.createFolder(parentTitle, "");
    rootFolders = await client.listRootFolders();
    parent = rootFolders.find((f) => f.title === parentTitle);
  }
  if (!parent?.id) {
    throw writePhaseFail(`failed to resolve parent notebook: ${parentTitle}`);
  }
  const parentId = parent.id;

  const topicsTouched = [...new Set(entries.map((e) => e.topic))];
  let notebooksCreated = 0;
  /** @type {Map<string, string>} topic title → notebook id */
  const topicNotebookIds = new Map();
  for (const topic of topicsTouched) {
    const { id, created } = await ensureTopicFolder(client, parentId, topic);
    if (created) notebooksCreated++;
    topicNotebookIds.set(topic, id);
  }

  let written = 0;
  for (const e of entries) {
    const topicId = topicNotebookIds.get(e.topic);
    if (!topicId)
      throw writePhaseFail(`internal: missing notebook id for topic: ${e.topic}`);
    await upsertNoteInTopic(client, topicId, e.noteTitle, e.body);
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
 * @param {ReturnType<typeof createJoplinDataApiClient>} client
 * @param {string} parentId
 * @param {string} topic
 * @returns {Promise<{ id: string, created: boolean }>}
 */
async function ensureTopicFolder(client, parentId, topic) {
  let subFolders = await client.listChildFolders(parentId);

  const existed = subFolders.some((f) => f.title === topic);
  if (!existed) {
    await client.createFolder(topic, parentId);
    subFolders = await client.listChildFolders(parentId);
  }
  const found = subFolders.find((f) => f.title === topic);
  const id =
    found && typeof found.id === "string" && found.id.trim() ?
      found.id
    : null;
  if (!id) throw writePhaseFail(`failed to resolve topic notebook: ${topic}`);

  return { id, created: !existed };
}

/**
 * @param {ReturnType<typeof createJoplinDataApiClient>} client
 * @param {string} topicNotebookId
 * @param {string} noteTitle
 * @param {string} body
 */
async function upsertNoteInTopic(client, topicNotebookId, noteTitle, body) {
  const notes = await client.listNotesInFolder(topicNotebookId);
  const matches = notes.filter((n) => n.title === noteTitle);
  if (matches.length > 1) {
    throw writePhaseFail(`duplicate note title in folder: ${noteTitle}`);
  }
  const bodyText = body.trimEnd() + "\n";
  if (matches.length === 1) {
    const id = matches[0].id;
    await client.updateNoteBody(id, bodyText);
    return;
  }
  await client.createNote(topicNotebookId, noteTitle, bodyText);
}

/**
 * @param {string} message
 */
function writePhaseFail(message) {
  const err = new Error(message);
  /** @type {Error & { code?: string }} */ (err).code = "JOPLIN_DATA_API_WRITE_FAILED";
  return err;
}
