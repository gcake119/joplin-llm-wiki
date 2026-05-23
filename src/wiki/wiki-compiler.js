import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "../config/load-config.js";
import {
  loadWikiSchema,
  assertHubCoverage,
} from "../schema/schema-validator.js";
import { OllamaClient } from "../ollama/client.js";
import {
  summarizeSourcesForPlanner,
  planWikiPaths,
  planCanonicalConceptsFromSummaries,
} from "./wiki-planner.js";
import { isTopicWikiPath } from "./topic-path-heuristic.js";
import { rotatedSlice } from "./corpus-slice.js";
import {
  serializeWikiPage,
  parseWikiMarkdownLenient,
  validateCompiledFrontmatter,
  assertSourceRefsResolvable,
} from "./frontmatter.js";
import { discoverMarkdown, relativeUnder } from "../fs/note-discovery.js";
import {
  runWikiWriteback,
  summarizeWikiWritebackDry,
} from "../joplin/wiki-writeback.js";

/**
 * @param {Record<string, unknown>} payload
 * @param {import('../config/load-config.js').AppConfig} cfg
 * @param {{ digest_paths_in_prompt_count?: number }} notesBundle
 */
function attachCorpusTelemetry(payload, cfg, notesBundle) {
  const wi = cfg.wiki_ingest;
  payload.corpus_mode = wi.corpus_mode_enabled === true;
  if (wi.corpus_mode_enabled) {
    payload.corpus_digest_paths_in_prompt_count =
      notesBundle.digest_paths_in_prompt_count ?? 0;
  }
}

/**
 * @param {Record<string, unknown>} payload
 * @param {{
 *   windowIndex: number,
 *   maxWindows: number,
 *   statePath: string,
 *   windowsExecuted: number,
 *   truncated?: boolean,
 *   cycleComplete?: boolean,
 * } | undefined} sweepContext
 */
function attachSweepTelemetry(payload, sweepContext) {
  if (!sweepContext) return;
  payload.corpus_sweep = {
    window_index: sweepContext.windowIndex,
    max_windows_per_invocation: sweepContext.maxWindows,
    state_path: sweepContext.statePath,
    windows_executed: sweepContext.windowsExecuted,
    truncated: sweepContext.truncated ?? false,
    cycle_complete: sweepContext.cycleComplete ?? false,
  };
}

/**
 * Wiki-compile flow: planner uses **Ollama chat only** for JSON paths (`planWikiPaths`);
 * excerpts rotate over raw/ markdown and never use the removed vector/RAG pipeline.
 *
 * @param {{
 *   ctx: { configPath: string, argv: string[], opts: Map<string, string> },
 *   cfg?: import('../config/load-config.js').AppConfig,
 *   sweepContext?: {
 *     windowIndex: number,
 *     maxWindows: number,
 *     statePath: string,
 *     windowsExecuted: number,
 *     truncated?: boolean,
 *     cycleComplete?: boolean,
 *   },
 * }} args
 */
export async function runWikiCompileFlow(args) {
  const { ctx, cfg: injectedCfg, sweepContext } = args;
  const cfg = injectedCfg ?? (await loadConfig(ctx.configPath));
  if (!cfg.wiki?.trim()) {
    const err = new Error("wiki required for wiki-compile");
    /** @type {Error & { code?: string }} */ (err).code = "CONFIG_INVALID";
    throw err;
  }
  if (!cfg.wiki_schema.path?.trim()) {
    const err = new Error("wiki_schema.path required for wiki-compile");
    /** @type {Error & { code?: string }} */ (err).code = "CONFIG_INVALID";
    throw err;
  }

  const dryRun = ctx.opts.get("dry-run") === "true";
  const resumeStage = ctx.opts.get("resume-stage") ?? "";

  const wikiRoot = path.resolve(cfg.wiki);
  fs.mkdirSync(wikiRoot, { recursive: true });

  if (resumeStage === "concepts") {
    return await runConceptResumeFlow({
      cfg,
      wikiRoot,
      dryRun,
      changedSummaryPaths: parseRelPathList(ctx.opts.get("changed-summary-paths")),
    });
  }
  if (resumeStage === "writeback") {
    return await runWritebackResumeFlow({ cfg, wikiRoot, dryRun });
  }

  const schema = loadWikiSchema(cfg.wiki_schema.path);
  const ollama = new OllamaClient({
    baseUrl: cfg.ollama.base_url,
    embedModel: cfg.ollama.embed_model,
    chatModel: cfg.ollama.chat_model,
    timeoutMs: cfg.ollama.timeout_ms,
    embedBatchSize: cfg.ollama.embed_batch_size,
  });

  const notesBundle = await summarizeSourcesForPlanner(cfg);
  if (notesBundle.sourceFileCount === 0) {
    const hint =
      "no markdown files under raw matching raw_glob; add .md files or run sqlite-sync export before wiki-compile";
    if (dryRun) {
      const noSrc = {
        dry_run: true,
        warning: "NO_SOURCE_MARKDOWN",
        message: hint,
        paths: [],
        raw: cfg.raw,
        raw_glob: cfg.raw_glob,
      };
      attachSweepTelemetry(noSrc, sweepContext);
      console.log(JSON.stringify(noSrc));
      return { dryRun: true, paths: [], truncated: false };
    }
    const err = new Error(hint);
    /** @type {Error & { code?: string }} */ (err).code = "WIKI_COMPILE_ABORT";
    throw err;
  }

  const plan = await planWikiPaths({
    cfg,
    schema,
    ollama,
    notesSummary: notesBundle,
  });

  let paths = filterAllowedWikiKnowledgePaths(
    plan.paths.map((p) => p.replace(/\\/g, "/")),
  );
  let truncated = false;
  if (paths.length > cfg.wiki_ingest.max_pages_per_run) {
    truncated = true;
    paths = prioritizeTopicsBeforeTruncate(
      paths,
      schema,
      cfg.wiki_ingest.max_pages_per_run,
    );
  }
  if (plan.meta?.heuristicTopUp) {
    console.error(
      JSON.stringify({
        warning: "PLANNER_META",
        topic_count: plan.meta.topicCount,
        alias_key: plan.meta.aliasKeyUsed,
        heuristic_top_up: true,
      }),
    );
  }

  if (paths.length === 0) {
    const fb = pathsFromRequiredHubPages(
      schema,
      cfg.wiki_ingest.max_pages_per_run,
    );
    if (fb.length > 0) {
      paths = fb;
      console.error(
        JSON.stringify({
          warning: "PLAN_EMPTY_USING_SCHEMA_HUBS",
          message:
            "planner emitted zero usable paths; falling back to wiki_schema.required_hub_pages",
          paths,
          planner_raw_preview: (plan.raw ?? "").slice(0, 900),
          chat_model: cfg.ollama.chat_model,
        }),
      );
    }
  }

  if (
    paths.length > 0 &&
    paths.length < cfg.wiki_ingest.min_pages_per_run &&
    Array.isArray(schema.required_hub_pages) &&
    schema.required_hub_pages.length > 0
  ) {
    const hubFb = pathsFromRequiredHubPages(
      schema,
      cfg.wiki_ingest.max_pages_per_run,
    );
    const seen = new Set(paths.map((p) => p.replace(/\\/g, "/")));
    const before = paths.length;
    for (const h of hubFb) {
      if (paths.length >= cfg.wiki_ingest.min_pages_per_run) break;
      if (paths.length >= cfg.wiki_ingest.max_pages_per_run) break;
      const hn = h.replace(/\\/g, "/");
      if (!seen.has(hn)) {
        seen.add(hn);
        paths.push(h);
      }
    }
    if (paths.length > before) {
      console.error(
        JSON.stringify({
          warning: "PLAN_BELOW_MIN_TOPUP_HUBS",
          message:
            "planner returned fewer paths than wiki_ingest.min_pages_per_run; merged wiki_schema.required_hub_pages",
          before,
          after: paths.length,
          min_soft: cfg.wiki_ingest.min_pages_per_run,
        }),
      );
    }
    if (paths.length > cfg.wiki_ingest.max_pages_per_run) {
      truncated = true;
      paths = prioritizeTopicsBeforeTruncate(
        paths,
        schema,
        cfg.wiki_ingest.max_pages_per_run,
      );
    }
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
    const emptyPlan = {
      warning: "PLAN_EMPTY",
      paths: [],
      planner_raw_preview: (plan.raw ?? "").slice(0, 1200),
      hint:
        (schema.required_hub_pages?.length ?? 0) === 0
          ? "Ollama planner returned no usable paths. Add wiki_schema.required_hub_pages to enable automatic hub fallback when the model outputs an empty list. See planner_raw_preview."
          : "Ollama returned no usable paths and required_hub_pages did not yield compilable paths after filtering. Inspect planner_raw_preview.",
      chat_model: cfg.ollama.chat_model,
    };
    attachCorpusTelemetry(emptyPlan, cfg, notesBundle);
    attachSweepTelemetry(emptyPlan, sweepContext);
    console.log(JSON.stringify(emptyPlan));
    return { dryRun: dryRun === true, paths, truncated };
  }

  if (dryRun) {
    const dryPayload = {
      dry_run: true,
      paths,
      truncated,
      planner_raw: plan.raw?.slice(0, 2000),
    };
    attachCorpusTelemetry(dryPayload, cfg, notesBundle);
    attachSweepTelemetry(dryPayload, sweepContext);
    if (cfg.joplin_wiki_writeback.enabled) {
      Object.assign(
        dryPayload,
        summarizeWikiWritebackDry(cfg, wikiRoot, paths),
      );
    }
    console.log(JSON.stringify(dryPayload));
    return { dryRun: true, paths, truncated };
  }

  const revision = `karpathy-mvp-${new Date().toISOString()}`;
  const rawRootResolved = path.resolve(cfg.raw);
  const allNoteAbs = await discoverMarkdown(rawRootResolved, cfg.raw_glob);
  if (allNoteAbs.length === 0) {
    const err = new Error(
      "no markdown files under raw matching raw_glob (required for wiki source_refs)",
    );
    /** @type {Error & { code?: string }} */ (err).code = "WIKI_COMPILE_ABORT";
    throw err;
  }

  for (const rel of paths) {
    const wikiNorm = rel.replace(/\\/g, "/");
    const writerSliceAbs = writerNoteSliceForPage(cfg, wikiNorm, allNoteAbs);
    const sourceRefs = sourceRefsFromWriterSlice(
      wikiNorm,
      writerSliceAbs,
      rawRootResolved,
    );

    const body = await writeWikiPageBody({
      cfg,
      ollama,
      relPath: rel,
      schema,
      notesSummary: notesBundle.summary,
      writerSliceAbs,
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
    assertSourceRefsResolvable(pageData, cfg.raw);

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
  attachCorpusTelemetry(compileSummary, cfg, notesBundle);
  attachSweepTelemetry(compileSummary, sweepContext);
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
 * @param {{
 *   cfg: import('../config/load-config.js').AppConfig,
 *   wikiRoot: string,
 *   dryRun: boolean,
 * }} args
 */
async function runWritebackResumeFlow(args) {
  const { cfg, wikiRoot, dryRun } = args;
  const relPaths = await discoverDownstreamWritebackPaths(wikiRoot);
  const payload = {
    dry_run: dryRun,
    compile_adapter: "local",
    resume_stage: "writeback",
    writeback_relpaths: relPaths,
    writeback_created_count: 0,
    writeback_updated_count: 0,
    writeback_trashed_count: 0,
    writeback_collision_count: 0,
    writeback_orphan_candidate_count: 0,
  };

  if (cfg.joplin_wiki_writeback.enabled) {
    Object.assign(
      payload,
      dryRun
        ? summarizeWikiWritebackDry(cfg, wikiRoot, relPaths)
        : await runWikiWriteback(cfg, wikiRoot, relPaths, { dryRun: false }),
    );
  }

  console.log(JSON.stringify(payload));
  return { dryRun, paths: relPaths, truncated: false, resumeStage: "writeback" };
}

/** @param {string} wikiRoot */
async function discoverDownstreamWritebackPaths(wikiRoot) {
  const concepts = await discoverMarkdown(wikiRoot, "concepts/*.md");
  const out = concepts.map((abs) => relativeUnder(wikiRoot, abs));
  const allConcepts = path.join(wikiRoot, "indexes", "All-Concepts.md");
  if (fs.existsSync(allConcepts)) out.push("indexes/All-Concepts.md");
  return out;
}

/**
 * @param {{
 *   cfg: import('../config/load-config.js').AppConfig,
 *   wikiRoot: string,
 *   dryRun: boolean,
 *   changedSummaryPaths?: string[],
 * }} args
 */
async function runConceptResumeFlow(args) {
  const { cfg, wikiRoot, dryRun } = args;
  const summaryInventory = await readSummaryInventory(wikiRoot);
  const summaryPaths = summaryInventory.map((item) => item.path);
  const changedSummaryPaths = normalizeChangedSummaryPaths(
    args.changedSummaryPaths ?? [],
    summaryPaths,
  );

  if (summaryPaths.length === 0) {
    const err = new Error(
      "concept resume requires existing wiki/summaries/*.md files",
    );
    /** @type {Error & { code?: string }} */ (err).code = "WIKI_COMPILE_ABORT";
    throw err;
  }

  const ollama = new OllamaClient({
    baseUrl: cfg.ollama.base_url,
    embedModel: cfg.ollama.embed_model,
    chatModel: cfg.ollama.chat_model,
    timeoutMs: cfg.ollama.timeout_ms,
    embedBatchSize: cfg.ollama.embed_batch_size,
  });
  const conceptPlanRaw = await planCanonicalConceptsFromSummaries({
    cfg,
    ollama,
    summaries: summaryInventory,
  });
  const concepts = filterConceptsByChangedSummaryScope(
    conceptPlanRaw.concepts,
    summaryInventory,
    changedSummaryPaths,
  );
  const conceptPlan = {
    ...conceptPlanRaw,
    concepts,
  };

  const payload = {
    dry_run: dryRun,
    compile_adapter: "local",
    resume_stage: "concepts",
    summary_paths_read: summaryPaths,
    changed_summary_paths: changedSummaryPaths,
    concept_paths_planned: conceptPlan.concepts.map((item) => item.path),
    concept_paths_written: [],
    index_paths_written: [],
    canonical_merge_count: conceptPlan.canonical_merge_count,
    semantic_decision_count: conceptPlan.semantic_decision_count,
    low_confidence_semantic_decision_count:
      conceptPlan.low_confidence_semantic_decision_count,
    concept_collision_count: 0,
    writeback_relpaths: [],
    writeback_created_count: 0,
    writeback_updated_count: 0,
    writeback_trashed_count: 0,
    writeback_collision_count: 0,
    writeback_orphan_candidate_count: 0,
    writeback_deferred: true,
  };
  const downstreamRelPaths =
    conceptPlan.concepts.length > 0
      ? [
          ...conceptPlan.concepts.map((item) => item.path),
          "indexes/All-Concepts.md",
        ]
      : [];

  if (!dryRun) {
    const revision = `concept-resume-${new Date().toISOString()}`;
    const conceptPathsWritten = writeCanonicalConcepts({
      cfg,
      wikiRoot,
      concepts: conceptPlan.concepts,
      revision,
    });
    const indexPathsWritten = writeAllConceptsIndex({
      wikiRoot,
      concepts: conceptPlan.concepts,
      revision,
    });
    payload.concept_paths_written = conceptPathsWritten;
    payload.index_paths_written = indexPathsWritten;
    payload.writeback_relpaths = [...conceptPathsWritten, ...indexPathsWritten];
  }
  if (dryRun && cfg.joplin_wiki_writeback.enabled) {
    payload.writeback_relpaths = downstreamRelPaths;
    Object.assign(payload, summarizeWikiWritebackDry(cfg, wikiRoot, downstreamRelPaths));
  }
  console.log(JSON.stringify(payload));
  return {
    dryRun,
    paths: payload.concept_paths_written,
    truncated: false,
    resumeStage: "concepts",
  };
}

/**
 * @param {string} wikiRoot
 */
async function readSummaryInventory(wikiRoot) {
  const summaryAbs = await discoverMarkdown(wikiRoot, "summaries/*.md");
  return summaryAbs.map((abs) => {
    const rel = relativeUnder(wikiRoot, abs);
    const parsed = parseWikiMarkdownLenient(fs.readFileSync(abs, "utf8"));
    const data = parsed.data;
    return {
      path: rel,
      title: String(data.title ?? path.basename(rel, ".md")),
      domain: String(data.domain ?? "_uncategorized"),
      source_refs: Array.isArray(data.source_refs)
        ? data.source_refs.map((x) => String(x)).filter(Boolean)
        : [],
      body_excerpt: parsed.body.trim().slice(0, 1600),
    };
  });
}

/**
 * @param {string | undefined} raw
 */
function parseRelPathList(raw) {
  if (!raw) return [];
  return raw
    .split(",")
    .map((item) => item.trim().replace(/\\/g, "/"))
    .filter(Boolean);
}

/**
 * @param {string[]} requested
 * @param {string[]} existing
 */
function normalizeChangedSummaryPaths(requested, existing) {
  const existingSet = new Set(existing);
  return dedupePathsPreserveOrder(
    requested
      .map((rel) => rel.replace(/\\/g, "/"))
      .filter((rel) => rel.startsWith("summaries/") && existingSet.has(rel)),
  );
}

/**
 * @param {import('./wiki-planner.js').CanonicalConceptPlanItem[]} concepts
 * @param {Awaited<ReturnType<typeof readSummaryInventory>>} summaries
 * @param {string[]} changedSummaryPaths
 */
function filterConceptsByChangedSummaryScope(concepts, summaries, changedSummaryPaths) {
  if (changedSummaryPaths.length === 0) return concepts;
  const changed = new Set(changedSummaryPaths);
  const changedSources = new Set(
    summaries
      .filter((summary) => changed.has(summary.path))
      .flatMap((summary) => summary.source_refs),
  );
  return concepts.filter((concept) => {
    if (concept.summary_refs.some((ref) => changed.has(ref))) return true;
    return concept.source_refs.some((ref) => changedSources.has(ref));
  });
}

/**
 * @param {{
 *   cfg: import('../config/load-config.js').AppConfig,
 *   wikiRoot: string,
 *   concepts: import('./wiki-planner.js').CanonicalConceptPlanItem[],
 *   revision: string,
 * }} args
 */
function writeCanonicalConcepts(args) {
  const { cfg, wikiRoot, concepts, revision } = args;
  /** @type {string[]} */
  const written = [];
  for (const concept of concepts) {
    const data = {
      source_refs: concept.source_refs,
      compiled_at: new Date().toISOString(),
      compiler_revision: revision,
      domain: "concepts",
      title: concept.title,
      summary_refs: concept.summary_refs,
      merged_from: concept.merged_from,
    };
    validateCompiledFrontmatter(data);
    assertSourceRefsResolvable(data, cfg.raw);
    const body = conceptBody(concept);
    const outAbs = path.join(wikiRoot, concept.path);
    fs.mkdirSync(path.dirname(outAbs), { recursive: true });
    fs.writeFileSync(outAbs, serializeWikiPage(data, body), "utf8");
    written.push(concept.path);
  }
  return written;
}

/**
 * @param {{
 *   wikiRoot: string,
 *   concepts: import('./wiki-planner.js').CanonicalConceptPlanItem[],
 *   revision: string,
 * }} args
 */
function writeAllConceptsIndex(args) {
  const { wikiRoot, concepts, revision } = args;
  const rel = "indexes/All-Concepts.md";
  const sourceRefs = dedupePathsPreserveOrder(
    concepts.flatMap((concept) => concept.source_refs),
  );
  const lines = [
    "# All Concepts",
    "",
    ...concepts.map(
      (concept) => `- [${concept.title}](../${concept.path})`,
    ),
    "",
  ];
  const data = {
    source_refs: sourceRefs,
    compiled_at: new Date().toISOString(),
    compiler_revision: revision,
    domain: "indexes",
    title: "All Concepts",
  };
  validateCompiledFrontmatter(data);
  const outAbs = path.join(wikiRoot, rel);
  fs.mkdirSync(path.dirname(outAbs), { recursive: true });
  fs.writeFileSync(outAbs, serializeWikiPage(data, lines.join("\n")), "utf8");
  return [rel];
}

/**
 * @param {import('./wiki-planner.js').CanonicalConceptPlanItem} concept
 */
function conceptBody(concept) {
  const lines = [
    `# ${concept.title}`,
    "",
    "## 關鍵證據",
    "",
    ...concept.summary_refs.map((ref) => `- [${ref}](../${ref})`),
    "",
    "## 來源",
    "",
    ...concept.source_refs.map((ref) => `- ${ref}`),
    "",
  ];
  return lines.join("\n");
}

/**
 * Derive `domain` / `title` frontmatter. Joplin writeback routes by path section.
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
    domain: parts[0],
    title,
  };
}

/**
 * Fallback path list when the LLM emits no usable wiki paths (`PLAN_EMPTY` guardrail).
 *
 * @param {import('../schema/schema-validator.js').WikiSchema} schema
 * @param {number} maxPages
 */
function pathsFromRequiredHubPages(schema, maxPages) {
  const hubs = schema.required_hub_pages;
  if (!Array.isArray(hubs) || hubs.length === 0) return [];
  const norm = hubs
    .map((h) =>
      String(h).replace(/\\/g, "/").replace(/^\/+/, "").trim(),
    )
    .filter((p) => p && !p.includes(".."));
  return filterAllowedWikiKnowledgePaths(dedupePathsPreserveOrder(norm)).slice(
    0,
    Math.max(0, Math.trunc(maxPages)),
  );
}

/**
 * @param {import('../schema/schema-validator.js').WikiSchema} schema
 */
function hubPathSetFromSchema(schema) {
  const hubs = schema.required_hub_pages ?? [];
  return new Set(
    hubs.map((h) =>
      String(h).replace(/\\/g, "/").replace(/^\/+/, "").trim(),
    ),
  );
}

/**
 * When over page budget, keep topic note paths before hubs and misc.
 *
 * @param {string[]} paths
 * @param {import('../schema/schema-validator.js').WikiSchema} schema
 * @param {number} maxPages
 */
function prioritizeTopicsBeforeTruncate(paths, schema, maxPages) {
  const hubs = hubPathSetFromSchema(schema);
  /** @type {string[]} */
  const topics = [];
  /** @type {string[]} */
  const hubPaths = [];
  /** @type {string[]} */
  const other = [];
  for (const p of paths) {
    const n = p.replace(/\\/g, "/");
    if (hubs.has(n)) hubPaths.push(p);
    else if (isTopicWikiPath(n, hubs)) topics.push(p);
    else other.push(p);
  }
  const merged = [...topics, ...other, ...hubPaths];
  return merged.slice(0, Math.max(0, maxPages));
}

/** @param {string[]} paths */
function filterAllowedWikiKnowledgePaths(paths) {
  return paths.filter(isAllowedWikiKnowledgePath);
}

/** @param {string} p */
function isAllowedWikiKnowledgePath(p) {
  const parts = p.replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.length !== 2) return false;
  if (!["summaries", "concepts", "indexes"].includes(parts[0])) return false;
  if (!parts[1].endsWith(".md")) return false;
  if (parts[0] === "indexes") {
    return parts[1] === "All-Sources.md" || parts[1] === "All-Concepts.md";
  }
  return true;
}

/** @param {string[]} plannerPaths normalized forward slashes */
function dedupePathsPreserveOrder(plannerPaths) {
  const seen = new Set();
  const out = [];
  for (const p of plannerPaths) {
    if (!p || p.includes("..")) continue;
    if (seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  return out;
}

/**
 * Sorted note paths that feed the trimmed writer excerpt for `wikiRelNorm`.
 *
 * - Non-corpus: rotating window (`max 5`) over all markdown.
 * - Corpus + `filesystem_slice`: fixed planner digest alignment (tests pin excerpt content).
 *
 * @param {import('../config/load-config.js').AppConfig} cfg
 * @param {string} wikiRelNorm
 * @param {string[]} noteFilesAbsSorted
 */
function writerNoteSliceForPage(cfg, wikiRelNorm, noteFilesAbsSorted) {
  const candidates = noteFilesAbsSorted;
  const n = candidates.length;
  if (n === 0) return [];
  const ingest = cfg.wiki_ingest;

  if (!ingest.corpus_mode_enabled) {
    const maxSlice = Math.min(n, 5);
    const off = digestOffsetFromRel(wikiRelNorm, n);
    return rotatedSlice(candidates, off, maxSlice);
  }

  const maxTake = Math.min(n, ingest.corpus_digest_max_files);

  if (ingest.corpus_writer_excerpt_mode === "filesystem_slice") {
    return rotatedSlice(candidates, ingest.corpus_digest_offset, maxTake);
  }

  return rotatedSlice(candidates, ingest.corpus_digest_offset, maxTake);
}

/**
 * Up to three raw-relative refs, each corresponding to raw bodies inside
 * {@link writerNoteSliceForPage} (possibly truncated by excerpt byte budget later).
 *
 * @param {string} wikiRelNorm
 * @param {string[]} writerSliceAbs abs paths matching writer excerpt slice order
 * @param {string} rawRootResolved
 */
function sourceRefsFromWriterSlice(
  wikiRelNorm,
  writerSliceAbs,
  rawRootResolved,
) {
  const m = writerSliceAbs.length;
  if (m === 0) return [];
  const k = Math.min(3, m);
  const off = digestOffsetFromRel(wikiRelNorm, m);
  const picks = rotatedSlice(writerSliceAbs, off, k);
  return picks.map((abs) => relativeUnder(rawRootResolved, abs));
}

/**
 * Stable [0,n) offset from wiki path hash (XOR-split digest words to reduce modulo collisions).
 *
 * @param {string} wikiRelNormalized
 * @param {number} modulus
 */
function digestOffsetFromRel(wikiRelNormalized, modulus) {
  if (modulus <= 0) return 0;
  if (modulus === 1) return 0;
  const digest = crypto
    .createHash("sha256")
    .update(wikiRelNormalized, "utf8")
    .digest();
  /** XOR first four big-endian UInt32 lanes for a fuller mix than `readUInt32BE(0)` alone. */
  const mix =
    digest.readUInt32BE(0) ^
    digest.readUInt32BE(4) ^
    digest.readUInt32BE(8) ^
    digest.readUInt32BE(12);
  return (mix >>> 0) % modulus;
}

/**
 * @param {{
 *   cfg: import('../config/load-config.js').AppConfig,
 *   ollama: import('../ollama/client.js').OllamaClient,
 *   relPath: string,
 *   schema: import('../schema/schema-validator.js').WikiSchema,
 *   notesSummary: string,
 *   writerSliceAbs: string[],
 * }} args
 */
async function writeWikiPageBody(args) {
  const {
    cfg,
    ollama,
    relPath,
    schema,
    notesSummary,
    writerSliceAbs,
  } = args;
  const wikiNorm = relPath.replace(/\\/g, "/");
  const excerpt = await buildExcerptMarkdown(cfg, ollama, wikiNorm, writerSliceAbs);
  const prompt = `Write a concise Markdown wiki page for path "${relPath}".

Schema hubs: ${schema.required_hub_pages.join(", ")}

Language: Traditional Chinese.
Write all human-readable content in Traditional Chinese. Keep technical proper nouns
and source filenames in their original language when clearer.

Use Traditional Chinese headings and bullet points where helpful. Choose the
section structure based on the actual topic and source evidence; do not force a
universal template. Useful optional headings include: 核心結論, 關鍵證據, 背景,
方法, 步驟, 決策紀錄, 實踐經驗, 我的實踐, 外部觀點, 疑點, 待追蹤, 術語,
張力與缺口. Omit sections such as 術語 or 張力與缺口 when they are not useful
for this topic.
Path contract:
- summaries/*.md: write one summary for one raw source. Identify the source clearly and avoid synthesis beyond that source.
- concepts/*.md: write a concept entry that synthesizes sources and cross-references related summaries/concepts with Markdown links.
- indexes/All-Sources.md: list source summaries and their raw evidence.
- indexes/All-Concepts.md: list concept entries and important cross-links.
- Never imply there are subfolders below summaries/, concepts/, or indexes/.
Do NOT include YAML frontmatter.

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
 * @param {import('../ollama/client.js').OllamaClient} ollama
 * @param {string} wikiRelNorm
 * @param {string[]} sliceAbs precomputed writer slice (`writerNoteSliceForPage`)
 */
async function buildExcerptMarkdown(cfg, ollama, wikiRelNorm, sliceAbs) {
  const root = path.resolve(cfg.raw);

  const parts = [];
  let budget = 8000;
  for (const abs of sliceAbs) {
    const rel = relativeUnder(root, abs);
    let t = fs.readFileSync(abs, "utf8");
    if (budget <= 0) break;
    t = t.slice(0, budget);
    budget -= t.length;
    parts.push(`### ${rel}\n\n${t}`);
  }
  let out = parts.join("\n\n");

  return out;
}
