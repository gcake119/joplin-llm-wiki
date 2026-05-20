import fs from "node:fs";
import path from "node:path";
import { parseWikiMarkdown, parseWikiMarkdownLenient } from "../wiki/frontmatter.js";
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
    writeback_would_create_notebooks: topics.size + (entries.length > 0 ? 1 : 0),
    writeback_collision_count: collisions,
  };
}

/**
 * Dry-run summary for the full llm-knowledge-flow writeback tree:
 * @llm-wiki/wiki, @llm-wiki/brainstorming, @llm-wiki/artifacts.
 *
 * @param {import('../config/load-config.js').AppConfig} cfg
 * @param {string} wikiRootAbs
 * @param {string[]} relPaths
 * @param {{ workflowRoot?: string }} [options]
 */
export function summarizeKnowledgeFlowWritebackDry(
  cfg,
  wikiRootAbs,
  relPaths,
  options = {},
) {
  const base = summarizeWikiWritebackDry(cfg, wikiRootAbs, relPaths);
  if (!cfg.joplin_wiki_writeback.enabled) return base;
  const workflow = readWorkflowMarkdownEntries(options.workflowRoot ?? process.cwd());
  return {
    writeback_would_write: base.writeback_would_write + workflow.entries.length,
    writeback_would_create_notebooks:
      base.writeback_would_create_notebooks +
      workflow.folderPaths.size +
      (workflow.entries.length > 0 ? 2 : 0),
    writeback_collision_count: base.writeback_collision_count + workflow.collisions,
    workflow_writeback_would_write: workflow.entries.length,
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
      writeback_would_create_notebooks: topics.size + (entries.length > 0 ? 1 : 0),
      writeback_collision_count: collisions,
    };
  }

  const client = createJoplinDataApiClient(cfg, { fetch: fetchImpl });
  await client.pingWithRetries();

  const parentTitle = wb.parent_notebook_title;

  const parentId = await ensureRootFolder(client, parentTitle);
  const { id: wikiSectionId, created: wikiSectionCreated } = await ensureChildFolder(
    client,
    parentId,
    wb.wiki_notebook_title,
  );

  const topicsTouched = [...new Set(entries.map((e) => e.topic))];
  let notebooksCreated = wikiSectionCreated ? 1 : 0;
  /** @type {Map<string, string>} topic title → notebook id */
  const topicNotebookIds = new Map();
  for (const topic of topicsTouched) {
    const { id, created } = await ensureTopicFolder(client, wikiSectionId, topic);
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
 * Write wiki, brainstorming, and artifacts markdown into the Joplin hierarchy.
 *
 * @param {import('../config/load-config.js').AppConfig} cfg
 * @param {string} wikiRootAbs
 * @param {string[]} wikiRelPaths
 * @param {{ fetch?: typeof fetch, dryRun?: boolean, workflowRoot?: string }} [options]
 */
export async function runKnowledgeFlowWriteback(
  cfg,
  wikiRootAbs,
  wikiRelPaths,
  options = {},
) {
  const wb = cfg.joplin_wiki_writeback;
  if (!wb.enabled) {
    return {
      writeback_written: 0,
      writeback_skipped: 0,
      writeback_notebooks_ensured: 0,
      writeback_collision_count: 0,
      workflow_writeback_written: 0,
    };
  }
  if (options.dryRun) {
    return summarizeKnowledgeFlowWritebackDry(cfg, wikiRootAbs, wikiRelPaths, options);
  }

  const wikiSummary = await runWikiWriteback(cfg, wikiRootAbs, wikiRelPaths, options);
  const workflow = readWorkflowMarkdownEntries(options.workflowRoot ?? process.cwd());
  if (workflow.entries.length === 0) {
    return {
      ...wikiSummary,
      workflow_writeback_written: 0,
      workflow_writeback_notebooks_ensured: 0,
    };
  }

  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  const client = createJoplinDataApiClient(cfg, { fetch: fetchImpl });
  await client.pingWithRetries();

  const parentId = await ensureRootFolder(client, wb.parent_notebook_title);
  let notebooksEnsured = 0;
  let written = 0;
  for (const e of workflow.entries) {
    const sectionTitle =
      e.section === "brainstorming" ?
        wb.brainstorming_notebook_title
      : wb.artifacts_notebook_title;
    const folderId = await ensureNestedFolders(client, parentId, [
      sectionTitle,
      ...e.folderParts,
    ]);
    notebooksEnsured += 1 + e.folderParts.length;
    await upsertNoteInTopic(client, folderId, e.noteTitle, e.body);
    written++;
  }

  return {
    ...wikiSummary,
    writeback_written: wikiSummary.writeback_written + written,
    writeback_notebooks_ensured:
      wikiSummary.writeback_notebooks_ensured + notebooksEnsured,
    writeback_collision_count:
      wikiSummary.writeback_collision_count + workflow.collisions,
    workflow_writeback_written: written,
    workflow_writeback_notebooks_ensured: notebooksEnsured,
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
  return ensureChildFolder(client, parentId, topic);
}

/**
 * @param {ReturnType<typeof createJoplinDataApiClient>} client
 * @param {string} title
 */
async function ensureRootFolder(client, title) {
  let rootFolders = await client.listRootFolders();
  let parent = rootFolders.find((f) => f.title === title);
  if (!parent) {
    await client.createFolder(title, "");
    rootFolders = await client.listRootFolders();
    parent = rootFolders.find((f) => f.title === title);
  }
  if (!parent?.id) {
    throw writePhaseFail(`failed to resolve parent notebook: ${title}`);
  }
  return parent.id;
}

/**
 * @param {ReturnType<typeof createJoplinDataApiClient>} client
 * @param {string} parentId
 * @param {string} title
 * @returns {Promise<{ id: string, created: boolean }>}
 */
async function ensureChildFolder(client, parentId, title) {
  let subFolders = await client.listChildFolders(parentId);

  const existed = subFolders.some((f) => f.title === title);
  if (!existed) {
    await client.createFolder(title, parentId);
    subFolders = await client.listChildFolders(parentId);
  }
  const found = subFolders.find((f) => f.title === title);
  const id =
    found && typeof found.id === "string" && found.id.trim() ?
      found.id
    : null;
  if (!id) throw writePhaseFail(`failed to resolve notebook: ${title}`);

  return { id, created: !existed };
}

/**
 * @param {ReturnType<typeof createJoplinDataApiClient>} client
 * @param {string} parentId
 * @param {string[]} titles
 */
async function ensureNestedFolders(client, parentId, titles) {
  let current = parentId;
  for (const rawTitle of titles) {
    const title = normalizeWikiWritebackTopic(rawTitle);
    const { id } = await ensureChildFolder(client, current, title);
    current = id;
  }
  return current;
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

/**
 * @param {string} workflowRoot
 */
function readWorkflowMarkdownEntries(workflowRoot) {
  /** @type {{ section: "brainstorming" | "artifacts", rel: string, folderParts: string[], noteTitle: string, body: string }[]} */
  const entries = [];
  for (const section of /** @type {const} */ (["brainstorming", "artifacts"])) {
    const root = path.resolve(workflowRoot, section);
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) continue;
    for (const abs of discoverMarkdownFiles(root)) {
      const rel = path.relative(root, abs).replace(/\\/g, "/");
      const parts = rel.split("/").filter(Boolean);
      const filename = parts.pop() ?? "untitled.md";
      const folderParts = parts.map(normalizeWikiWritebackTopic);
      const raw = fs.readFileSync(abs, "utf8");
      const { data, body } = parseWikiMarkdownLenient(raw);
      const titleRaw = data.title;
      const noteTitle =
        typeof titleRaw === "string" && titleRaw.trim() ?
          titleRaw.trim()
        : path.basename(filename, ".md");
      entries.push({ section, rel, folderParts, noteTitle, body });
    }
  }

  const seen = new Set();
  let collisions = 0;
  const folderPaths = new Set();
  for (const e of entries) {
    folderPaths.add(`${e.section}/${e.folderParts.join("/")}`);
    const k = `${e.section}\0${e.folderParts.join("/")}\0${e.noteTitle}`;
    if (seen.has(k)) collisions++;
    else seen.add(k);
  }
  return { entries, collisions, folderPaths };
}

/**
 * @param {string} root
 * @returns {string[]}
 */
function discoverMarkdownFiles(root) {
  /** @type {string[]} */
  const out = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    if (!dir) continue;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === "node_modules" || ent.name === ".git") continue;
        stack.push(abs);
      } else if (ent.isFile() && ent.name.toLowerCase().endsWith(".md")) {
        out.push(abs);
      }
    }
  }
  return out.sort();
}
