import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "../config/load-config.js";
import {
  loadWikiSchema,
  assertHubCoverage,
} from "../schema/schema-validator.js";
import { OllamaClient } from "../ollama/client.js";
import { summarizeSourcesForPlanner, planWikiPaths } from "./wiki-planner.js";
import {
  serializeWikiPage,
  validateCompiledFrontmatter,
  assertSourceRefsResolvable,
} from "./frontmatter.js";
import { discoverMarkdown, relativeUnder } from "../fs/note-discovery.js";
import {
  runWikiWriteback,
  summarizeWikiWritebackDry,
  normalizeWikiWritebackTopic,
} from "../joplin/wiki-writeback.js";

/**
 * @param {{ ctx: { configPath: string, argv: string[], opts: Map<string, string> } }} args
 */
export async function runWikiCompileFlow(args) {
  const { ctx } = args;
  const cfg = await loadConfig(ctx.configPath);
  if (!cfg.wiki_root?.trim()) {
    const err = new Error("wiki_root required for wiki-compile");
    /** @type {Error & { code?: string }} */ (err).code = "CONFIG_INVALID";
    throw err;
  }
  if (!cfg.wiki_schema.path?.trim()) {
    const err = new Error("wiki_schema.path required for wiki-compile");
    /** @type {Error & { code?: string }} */ (err).code = "CONFIG_INVALID";
    throw err;
  }

  const dryRun = ctx.opts.get("dry-run") === "true";

  const wikiRoot = path.resolve(cfg.wiki_root);
  fs.mkdirSync(wikiRoot, { recursive: true });

  const schema = loadWikiSchema(cfg.wiki_schema.path);
  const ollama = new OllamaClient({
    baseUrl: cfg.ollama.base_url,
    embedModel: cfg.ollama.embed_model,
    chatModel: cfg.ollama.chat_model,
    timeoutMs: cfg.ollama.timeout_ms,
    embedBatchSize: cfg.ollama.embed_batch_size,
  });

  const notesSummary = await summarizeSourcesForPlanner(cfg);
  const plan = await planWikiPaths({
    cfg,
    schema,
    ollama,
    notesSummary,
  });

  let paths = plan.paths;
  let truncated = false;
  if (paths.length > cfg.wiki_ingest.max_pages_per_run) {
    truncated = true;
    paths = paths.slice(0, cfg.wiki_ingest.max_pages_per_run);
  }

  if (paths.length < cfg.wiki_ingest.min_pages_per_run) {
    console.error(
      JSON.stringify({
        warning: "PLAN_BELOW_MIN",
        planned: paths.length,
        min_soft: cfg.wiki_ingest.min_pages_per_run,
      }),
    );
  }

  const plannedSet = new Set(paths.map((p) => p.replace(/\\/g, "/")));
  if (cfg.wiki_schema.strict)
    assertHubCoverage(schema, plannedSet, wikiRoot);

  if (paths.length === 0) {
    console.log(JSON.stringify({ warning: "PLAN_EMPTY", paths: [] }));
    return { dryRun: dryRun === true, paths, truncated };
  }

  if (dryRun) {
    const dryPayload = {
      dry_run: true,
      paths,
      truncated,
      planner_raw: plan.raw?.slice(0, 2000),
    };
    if (cfg.joplin_wiki_writeback.enabled) {
      Object.assign(dryPayload, summarizeWikiWritebackDry(cfg, wikiRoot, paths));
    }
    console.log(JSON.stringify(dryPayload));
    return { dryRun: true, paths, truncated };
  }

  const revision = `karpathy-mvp-${new Date().toISOString()}`;
  const sourceRefs = await pickDefaultSourceRefs(cfg);

  for (const rel of paths) {
    const body = await writeWikiPageBody({
      cfg,
      ollama,
      relPath: rel,
      schema,
      notesSummary,
    });
    const meta = wikiListingMetaFromRelPath(rel);
    const pageData = {
      source_refs: sourceRefs,
      compiled_at: new Date().toISOString(),
      compiler_revision: revision,
      domain: meta.domain,
      title: meta.title,
    };
    validateCompiledFrontmatter(pageData);
    assertSourceRefsResolvable(pageData, cfg.notes_root);

    const outAbs = path.join(wikiRoot, rel);
    fs.mkdirSync(path.dirname(outAbs), { recursive: true });
    fs.writeFileSync(
      outAbs,
      serializeWikiPage(pageData, body.trimEnd() + "\n"),
      "utf8",
    );
  }

  /** Wiki compile output: paths written this run = planner `paths` after `max_pages_per_run` truncate (same array passed to `runWikiWriteback`). See design joplin-wiki-db-writeback Open Questions. */
  const compileSummary = {
    wiki_compile: "ok",
    pages_written: paths.length,
    truncated,
  };
  if (cfg.joplin_wiki_writeback.enabled) {
    Object.assign(
      compileSummary,
      await runWikiWriteback(cfg, wikiRoot, paths, { dryRun: false }),
    );
  }

  console.log(JSON.stringify(compileSummary));
  return { dryRun: false, paths, truncated };
}

/**
 * Derive `domain` / `title` frontmatter for Joplin writeback routing (`domain` = first path segment).
 *
 * @param {string} relPath
 */
function wikiListingMetaFromRelPath(relPath) {
  const norm = relPath.replace(/\\/g, "/");
  const parts = norm.split("/").filter(Boolean);
  const title = path.basename(norm, ".md");
  if (parts.length <= 1) {
    return { domain: "_uncategorized", title };
  }
  return {
    domain: normalizeWikiWritebackTopic(parts[0]),
    title,
  };
}

/**
 * @param {import('../config/load-config.js').AppConfig} cfg
 */
async function pickDefaultSourceRefs(cfg) {
  const root = path.resolve(cfg.notes_root);
  const files = await discoverMarkdown(root, cfg.notes_glob);
  const out = [];
  for (const abs of files.slice(0, 3)) {
    out.push(relativeUnder(root, abs));
  }
  if (out.length === 0) {
    const err = new Error("no source markdown files to anchor wiki page");
    /** @type {Error & { code?: string }} */ (err).code = "WIKI_COMPILE_ABORT";
    throw err;
  }
  return out;
}

/**
 * @param {{
 *   cfg: import('../config/load-config.js').AppConfig,
 *   ollama: import('../ollama/client.js').OllamaClient,
 *   relPath: string,
 *   schema: import('../schema/schema-validator.js').WikiSchema,
 *   notesSummary: string,
 * }} args
 */
async function writeWikiPageBody(args) {
  const { cfg, ollama, relPath, schema, notesSummary } = args;
  const excerpt = await readSourcesExcerpt(cfg);
  const prompt = `Write a concise Markdown wiki page for path "${relPath}".

Schema hubs: ${schema.required_hub_pages.join(", ")}

Use headings and bullet points where helpful. Do NOT include YAML frontmatter.

Sources digest:
${notesSummary}

Source excerpt (trimmed):
${excerpt}
`;

  const text = await ollama.chatComplete({
    prompt,
    jsonMode: false,
    timeoutMs: cfg.ollama.timeout_ms,
  });
  return text.trim().length ? text : `# ${relPath}\n\n_(empty generation)_\n`;
}

/**
 * @param {import('../config/load-config.js').AppConfig} cfg
 */
async function readSourcesExcerpt(cfg) {
  const root = path.resolve(cfg.notes_root);
  const files = await discoverMarkdown(root, cfg.notes_glob);
  const parts = [];
  let budget = 8000;
  for (const abs of files.slice(0, 5)) {
    const rel = relativeUnder(root, abs);
    const t = fs.readFileSync(abs, "utf8").slice(0, budget);
    budget -= t.length;
    parts.push(`### ${rel}\n\n${t}`);
    if (budget <= 0) break;
  }
  return parts.join("\n\n");
}
