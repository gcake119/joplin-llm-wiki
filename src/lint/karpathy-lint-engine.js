import fs from "node:fs";
import path from "node:path";
import { discoverMarkdown, relativeUnder } from "../fs/note-discovery.js";
import { loadWikiSchema } from "../schema/schema-validator.js";
import { parseWikiMarkdownLenient } from "../wiki/frontmatter.js";

/**
 * @param {{ cfg: import('../config/load-config.js').AppConfig }} args
 */
export async function runKarpathyLint(args) {
  const { cfg } = args;
  const wikiRoot = path.resolve(cfg.wiki);
  const wikiFiles = fs.existsSync(wikiRoot)
    ? await discoverMarkdown(wikiRoot, cfg.wiki_glob)
    : [];
  const wikiRel = wikiFiles.map((abs) => relativeUnder(wikiRoot, abs));

  const schema_gaps = [];
  schema_gaps.push(...flatWikiLayoutGaps(wikiRel));
  schema_gaps.push(...requiredIndexGaps(wikiRel));

  if (cfg.wiki_schema.path?.trim()) {
    const schema = loadWikiSchema(cfg.wiki_schema.path);
    schema_gaps.push(...(await wikiFrontmatterGaps(cfg, schema)));
  }

  const wiki_orphans = await wikiLinkGaps(wikiRoot, wikiFiles);
  const duplicates = duplicateBasenames(wikiRel);
  const skipped_notes = await scanUnreadableRaw(cfg);
  const brainstorming_followups = await brainstormingFollowups(process.cwd());

  return {
    duplicates,
    orphans: [],
    contradictions: [],
    wiki_orphans,
    schema_gaps,
    skipped_notes,
    brainstorming_followups,
  };
}

/** @param {string[]} wikiRel */
function flatWikiLayoutGaps(wikiRel) {
  const gaps = [];
  for (const rel of wikiRel) {
    const parts = rel.split("/").filter(Boolean);
    if (parts.length !== 2 || !["summaries", "concepts", "indexes"].includes(parts[0])) {
      gaps.push({ type: "wiki_layout_gap", path: rel, detail: "wiki files must be flat under summaries/, concepts/, or indexes/" });
    }
    if (parts[0] === "indexes" && parts[1] !== "All-Sources.md" && parts[1] !== "All-Concepts.md") {
      gaps.push({ type: "wiki_index_gap", path: rel, detail: "indexes only allows All-Sources.md and All-Concepts.md" });
    }
  }
  return gaps;
}

/** @param {string[]} wikiRel */
function requiredIndexGaps(wikiRel) {
  const set = new Set(wikiRel);
  const gaps = [];
  for (const rel of ["indexes/All-Sources.md", "indexes/All-Concepts.md"]) {
    if (!set.has(rel)) gaps.push({ type: "missing_index", path: rel });
  }
  return gaps;
}

/** @param {string[]} wikiRel */
function duplicateBasenames(wikiRel) {
  const seen = new Map();
  const dupes = [];
  for (const rel of wikiRel) {
    const base = path.posix.basename(rel).toLowerCase();
    const prev = seen.get(base);
    if (prev) dupes.push({ a: prev, b: rel, score: 1 });
    else seen.set(base, rel);
  }
  return dupes;
}

/**
 * @param {string} wikiRoot
 * @param {string[]} wikiFiles
 */
async function wikiLinkGaps(wikiRoot, wikiFiles) {
  const relSet = new Set(wikiFiles.map((abs) => relativeUnder(wikiRoot, abs)));
  const gaps = [];
  for (const abs of wikiFiles) {
    const rel = relativeUnder(wikiRoot, abs);
    const md = fs.readFileSync(abs, "utf8");
    const dir = path.posix.dirname(rel);
    for (const target of markdownLinks(md)) {
      if (/^[a-z]+:\/\//i.test(target)) continue;
      const clean = target.split("#")[0];
      if (!clean) continue;
      const joined = path.posix.normalize(dir === "." ? clean : `${dir}/${clean}`);
      const candidates = [joined, `${joined}.md`];
      if (!candidates.some((c) => relSet.has(c))) {
        gaps.push({ path: rel, reason: "broken_wiki_link", detail: target });
      }
    }
  }
  return gaps;
}

/** @param {string} md */
function markdownLinks(md) {
  const out = [];
  const re = /\[[^\]]*\]\(([^)]+)\)/g;
  let m;
  while ((m = re.exec(md))) out.push(m[1].trim());
  return out;
}

/**
 * @param {import('../config/load-config.js').AppConfig} cfg
 */
async function wikiFrontmatterGaps(cfg, schema) {
  const gaps = [];
  const wikiRoot = path.resolve(cfg.wiki);
  const files = await discoverMarkdown(wikiRoot, cfg.wiki_glob);
  const keys = new Set();
  for (const pt of schema.page_types)
    for (const k of pt.required_frontmatter_keys) keys.add(k);

  for (const abs of files) {
    const rel = relativeUnder(wikiRoot, abs);
    const raw = fs.readFileSync(abs, "utf8");
    const { data } = parseWikiMarkdownLenient(raw);
    for (const k of keys) {
      if (!(k in data))
        gaps.push({ type: "fm_gap", path: rel, detail: `missing ${k}` });
    }
  }
  return gaps;
}

/**
 * @param {import('../config/load-config.js').AppConfig} cfg
 */
async function scanUnreadableRaw(cfg) {
  const root = path.resolve(cfg.raw);
  const files = fs.existsSync(root) ? await discoverMarkdown(root, cfg.raw_glob) : [];
  const out = [];
  for (const abs of files) {
    try {
      const txt = fs.readFileSync(abs).toString("utf8");
      if (/\uFFFD/.test(txt))
        out.push({ path: relativeUnder(root, abs), reason: "INVALID_UTF8" });
    } catch {
      out.push({ path: relativeUnder(root, abs), reason: "READ_FAILED" });
    }
  }
  return out;
}

/** @param {string} workflowRoot */
async function brainstormingFollowups(workflowRoot) {
  const root = path.join(workflowRoot, "brainstorming", "chat");
  if (!fs.existsSync(root)) return [];
  const files = await discoverMarkdown(root, "**/*.md");
  return files.map((abs) => ({
    path: path.relative(root, abs).replace(/\\/g, "/"),
    reason: "candidate_for_future_ingest",
  }));
}
