/**
 * Sources digest for planner prompts. When `wiki_ingest.corpus_mode_enabled`
 * defaults true (or key omitted), digest uses rotated lex order window (REQ-WCC-002).
 * Explicit `corpus_mode_enabled: false` keeps legacy forty-file digest (design Decision:
 * `wiki_ingest.corpus_mode_enabled` 預設 true).
 */
import { discoverMarkdown, relativeUnder } from "../fs/note-discovery.js";
import path from "node:path";
import fs from "node:fs";
import { rotatedSlice } from "./corpus-slice.js";
import { heuristicTopicPaths, isTopicWikiPath } from "./topic-path-heuristic.js";

/**
 * @param {import('../config/load-config.js').AppConfig} cfg
 */
export async function summarizeSourcesForPlanner(cfg) {
  const root = path.resolve(cfg.raw);
  const files = await discoverMarkdown(root, cfg.raw_glob);
  const ingest = cfg.wiki_ingest;

  /** @type {string[]} */
  let digestAbs;
  if (!ingest.corpus_mode_enabled) {
    digestAbs = files.slice(0, Math.min(files.length, 40));
  } else {
    const maxTake = Math.min(files.length, ingest.corpus_digest_max_files);
    digestAbs = rotatedSlice(files, ingest.corpus_digest_offset, maxTake);
  }

  const digestRelPaths = [];
  const lines = [];
  for (const abs of digestAbs) {
    const rel = relativeUnder(root, abs);
    digestRelPaths.push(rel);
    const st = fs.statSync(abs);
    lines.push(`${rel} mtime_ms=${Math.trunc(st.mtimeMs)}`);
  }
  if (!ingest.corpus_mode_enabled) {
    if (files.length > 40) lines.push(`… ${files.length - 40} more files`);
  } else if (digestAbs.length < files.length) {
    lines.push(`… ${files.length - digestAbs.length} more files`);
  }

  return {
    summary: lines.join("\n"),
    sourceFileCount: files.length,
    digest_paths_in_prompt_count: digestAbs.length,
    digestRelPaths,
    notebookSlugs: [],
  };
}

/**
 * @param {import('../schema/schema-validator.js').WikiSchema} schema
 */
function hubPathSet(schema) {
  const hubs = schema.required_hub_pages ?? [];
  return new Set(
    hubs.map((h) =>
      String(h).replace(/\\/g, "/").replace(/^\/+/, "").trim(),
    ),
  );
}

/**
 * @param {unknown} obj
 * @param {{ rejectSourcePaths: boolean }} opts
 * @returns {{ paths: string[], aliasKey?: string }}
 */
export function extractPathsFromModelJson(obj, opts) {
  if (!obj || typeof obj !== "object") return { paths: [] };

  const record = /** @type {Record<string, unknown>} */ (obj);
  const candidates = [
    ["paths", record.paths],
    ["items", record.items],
    ["answer", record.answer],
    ["files", record.files],
    ["plan", record.plan],
  ];

  for (const [key, val] of candidates) {
    const fromArr = pathsFromArray(val, opts);
    if (fromArr.length > 0) return { paths: fromArr, aliasKey: key };
  }

  if (Array.isArray(record.json)) {
    const fromJson = pathsFromObjectArray(record.json, opts);
    if (fromJson.length > 0) return { paths: fromJson, aliasKey: "json" };
  }

  return { paths: [] };
}

/**
 * @param {unknown} val
 * @param {{ rejectSourcePaths: boolean }} opts
 */
function pathsFromArray(val, opts) {
  if (!Array.isArray(val)) return [];
  const out = [];
  for (const item of val) {
    if (typeof item === "string") {
      const n = normalizeOnePath(item, opts);
      if (n) out.push(n);
    } else if (item && typeof item === "object" && "path" in item) {
      const p = /** @type {{ path?: unknown }} */ (item).path;
      if (typeof p === "string") {
        const n = normalizeOnePath(p, opts);
        if (n) out.push(n);
      }
    }
  }
  return dedupePathsPreserveOrder(out);
}

/**
 * @param {unknown} val
 * @param {{ rejectSourcePaths: boolean }} opts
 */
function pathsFromObjectArray(val, opts) {
  if (!Array.isArray(val)) return [];
  const out = [];
  for (const item of val) {
    if (item && typeof item === "object" && "path" in item) {
      const p = /** @type {{ path?: unknown }} */ (item).path;
      if (typeof p === "string") {
        const n = normalizeOnePath(p, opts);
        if (n) out.push(n);
      }
    }
  }
  return dedupePathsPreserveOrder(out);
}

/**
 * @param {string} p
 * @param {{ rejectSourcePaths: boolean }} opts
 */
function normalizeOnePath(p, opts) {
  const norm = p.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!norm || norm.includes("..")) return "";
  if (!isFlatWikiKnowledgePath(norm)) return "";
  return norm;
}

/** @param {string} rel */
function isFlatWikiKnowledgePath(rel) {
  const parts = rel.split("/").filter(Boolean);
  if (parts.length !== 2) return false;
  if (!["summaries", "concepts", "indexes"].includes(parts[0])) return false;
  if (!parts[1].endsWith(".md")) return false;
  if (parts[0] === "indexes") {
    return parts[1] === "All-Sources.md" || parts[1] === "All-Concepts.md";
  }
  return true;
}

/** @param {string[]} plannerPaths */
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
 * @param {string[]} paths
 * @param {Set<string>} hubs
 */
function countTopicPaths(paths, hubs) {
  let n = 0;
  for (const p of paths) {
    if (isTopicWikiPath(p, hubs)) n++;
  }
  return n;
}

/**
 * @param {boolean} hubOnly
 * @param {number} topicCount
 * @param {number} minTopic
 */
function plannerNeedsRetry(hubOnly, topicCount, minTopic) {
  if (minTopic <= 0) return false;
  if (hubOnly) return true;
  return topicCount < minTopic;
}

/**
 * @param {{
 *   cfg: import('../config/load-config.js').AppConfig,
 *   schema: import('../schema/schema-validator.js').WikiSchema,
 *   ollama: import('../ollama/client.js').OllamaClient,
 *   notesSummary: {
 *     summary: string,
 *     sourceFileCount: number,
 *     digest_paths_in_prompt_count: number,
 *     digestRelPaths: string[],
 *     notebookSlugs?: string[],
 *   },
 * }} args
 * @returns {Promise<{
 *   paths: string[],
 *   raw: string,
 *   meta?: {
 *     aliasKeyUsed?: string,
 *     hubOnly?: boolean,
 *     topicCount?: number,
 *     heuristicTopUp?: boolean,
 *   },
 * }>}
 */
export async function planWikiPaths(args) {
  const { cfg, schema, ollama, notesSummary } = args;
  const maxRun = cfg.wiki_ingest.max_pages_per_run;
  const minTopic = cfg.wiki_ingest.min_topic_pages_per_run;
  const maxTopic = Math.max(0, maxRun - 1);
  const srcCount = notesSummary.sourceFileCount;
  const digestCount = notesSummary.digest_paths_in_prompt_count;
  const hubs = hubPathSet(schema);
  const rejectSource = cfg.wiki_ingest.planner_reject_source_paths;
  const effectiveOffset = cfg.wiki_ingest.corpus_digest_offset;

  const system =
    "You output ONLY compact JSON with key paths (string array). No prose.";
  const fewShot = `Example valid output:
{"paths":["summaries/source-title.md","concepts/knowledge-management.md","indexes/All-Sources.md","indexes/All-Concepts.md"]}`;

  const basePrompt = `Plan wiki pages to update for Karpathy ingest.

Required hub pages (include only if they need refresh): ${JSON.stringify(schema.required_hub_pages)}
Page type ids: ${schema.page_types.map((p) => p.id).join(", ")}

${fewShot}

Sources digest (relative paths + mtimes from raw/ — do NOT copy these as wiki paths):
${notesSummary.summary}

Constraints:
- Return between 1 and ${maxRun} paths relative to wiki/ (forward slashes only).
- Allowed paths are ONLY flat files directly under summaries/, concepts/, or indexes/.
- summaries/*.md: one summary page per raw source that needs a refreshed source-level summary.
- concepts/*.md: concept entries that synthesize and cross-reference summaries/concepts.
- indexes/All-Sources.md and indexes/All-Concepts.md: the only index files.
- Do NOT create subdirectories below summaries/, concepts/, or indexes/.
- Do NOT create notebook-slug folders, topic folders, index.md, or opaque cluster ids.
- You MUST return at least ${minTopic} concepts/*.md paths when there is enough material.
- Cluster digest files by semantic topic first, then filename prefix or mtime; use short readable slugs.
- Never return bare source filenames like "abc123....md" as wiki paths.
- The notes library has ${srcCount} files; this digest lists ${digestCount} of them (metadata only).
- JSON shape strictly: {"paths":["summaries/source-title.md","concepts/content-topic.md","indexes/All-Sources.md"]}`;

  /** @type {string | undefined} */
  let text = "";
  let lastErr;
  let lastPaths = [];
  let lastAlias;
  let sawHubOnly = false;
  const rounds = cfg.wiki_ingest.max_planner_rounds;

  for (let r = 0; r < rounds; r++) {
    try {
      let retrySuffix = "";
      if (r > 0) {
        const topicN = countTopicPaths(lastPaths, hubs);
        retrySuffix =
          `\nPrevious invalid or insufficient output (${lastAlias ?? "parse"}). ` +
          `Emit valid JSON only with key "paths". Need at least ${minTopic} content-topic wiki paths; ` +
          `had ${topicN} topic path(s). Do not return hub pages or index.md only.`;
      }
      text = await ollama.chatComplete({
        system,
        prompt: basePrompt + retrySuffix,
        jsonMode: true,
        timeoutMs: cfg.ollama.timeout_ms,
      });
      const parsed = extractJsonObject(text);
      const extracted = extractPathsFromModelJson(parsed, {
        rejectSourcePaths: rejectSource,
      });
      lastPaths = extracted.paths;
      lastAlias = extracted.aliasKey;

      const topicCount = countTopicPaths(lastPaths, hubs);
      const nonEmpty = lastPaths.length > 0;
      const hubOnly =
        nonEmpty && lastPaths.every((p) => hubs.has(p));
      if (hubOnly) sawHubOnly = true;

      if (
        !nonEmpty ||
        plannerNeedsRetry(hubOnly, topicCount, minTopic)
      ) {
        if (r < rounds - 1) continue;
      } else {
        return finishPlan({
          paths: lastPaths,
          raw: text,
          hubs,
          minTopic,
          maxTopic,
          digestRelPaths: notesSummary.digestRelPaths,
          effectiveOffset,
          aliasKey: lastAlias,
          sawHubOnly,
          heuristicTopUp: false,
        });
      }
    } catch (e) {
      lastErr = e;
    }
  }

  if (lastErr && lastPaths.length === 0 && !text) {
    const err = new Error(
      `Wiki planner failed after ${rounds} rounds: ${lastErr?.message ?? lastErr}`,
    );
    /** @type {Error & { code?: string }} */ (err).code = "WIKI_COMPILE_ABORT";
    throw err;
  }

  return finishPlan({
    paths: lastPaths,
    raw: text || "{}",
    hubs,
    minTopic,
    maxTopic,
    digestRelPaths: notesSummary.digestRelPaths,
    effectiveOffset,
    aliasKey: lastAlias,
    sawHubOnly,
    heuristicTopUp: false,
    forceHeuristic: true,
  });
}

/**
 * @typedef {{
 *   path: string,
 *   title: string,
 *   domain: string,
 *   source_refs: string[],
 *   body_excerpt: string,
 * }} SummaryInventoryItem
 *
 * @typedef {{
 *   slug: string,
 *   title: string,
 *   path: string,
 *   source_refs: string[],
 *   summary_refs: string[],
 *   merged_from: string[],
 *   semantic_decisions: Array<Record<string, unknown>>,
 * }} CanonicalConceptPlanItem
 */

/**
 * Ask the local LLM to produce canonical concept identities from summary
 * inventory. Slug/title similarity is deliberately not used as the merge
 * decision; the model must emit the same_topic/distinct_topic decision data.
 *
 * @param {{
 *   cfg: import('../config/load-config.js').AppConfig,
 *   ollama: import('../ollama/client.js').OllamaClient,
 *   summaries: SummaryInventoryItem[],
 * }} args
 * @returns {Promise<{
 *   concepts: CanonicalConceptPlanItem[],
 *   raw: string,
 *   canonical_merge_count: number,
 *   semantic_decision_count: number,
 *   low_confidence_semantic_decision_count: number,
 * }>}
 */
export async function planCanonicalConceptsFromSummaries(args) {
  const { cfg, ollama, summaries } = args;
  const prompt = `Plan canonical concept pages from compiled summary inventory.

Return ONLY compact JSON with this shape:
{
  "concepts": [
    {
      "slug": "stable-readable-slug",
      "title": "Traditional Chinese canonical title",
      "source_refs": ["raw/source.md"],
      "summary_refs": ["summaries/source-summary.md"],
      "merged_from": ["old or alias title"],
      "semantic_decisions": [
        {"relation":"same_topic","confidence":"high","reason":"..."}
      ]
    }
  ]
}

Rules:
- Use Traditional Chinese titles.
- Determine concept identity by semantic topic judgment from summaries/source_refs.
- Do not merge concepts merely because titles or slugs look similar.
- If a candidate is merged, include the semantic_decisions entry.
- Use low confidence only when the semantic relation is uncertain.

Summary inventory:
${JSON.stringify(summaries, null, 2)}`;

  const raw = await ollama.chatComplete({
    prompt,
    jsonMode: true,
    timeoutMs: cfg.ollama.timeout_ms,
  });
  const parsed = parsePlannerJson(raw);
  const conceptsRaw = Array.isArray(parsed.concepts) ? parsed.concepts : [];
  const concepts = conceptsRaw
    .map(normalizeConceptPlanItem)
    .filter(/** @returns {x is CanonicalConceptPlanItem} */ (x) => x !== null);

  let canonicalMergeCount = 0;
  let semanticDecisionCount = 0;
  let lowConfidenceSemanticDecisionCount = 0;
  for (const concept of concepts) {
    if (hasSameTopicDecision(concept.semantic_decisions)) {
      canonicalMergeCount += concept.merged_from.length;
    }
    semanticDecisionCount += concept.semantic_decisions.length;
    for (const decision of concept.semantic_decisions) {
      const confidence = String(decision.confidence ?? "").toLowerCase();
      if (confidence === "low") lowConfidenceSemanticDecisionCount += 1;
    }
  }

  return {
    concepts,
    raw,
    canonical_merge_count: canonicalMergeCount,
    semantic_decision_count: semanticDecisionCount,
    low_confidence_semantic_decision_count:
      lowConfidenceSemanticDecisionCount,
  };
}

/**
 * @param {Array<Record<string, unknown>>} decisions
 */
function hasSameTopicDecision(decisions) {
  return decisions.some(
    (decision) => String(decision.relation ?? "") === "same_topic",
  );
}

/**
 * @param {string} raw
 * @returns {Record<string, unknown>}
 */
function parsePlannerJson(raw) {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object"
      ? /** @type {Record<string, unknown>} */ (parsed)
      : {};
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        const parsed = JSON.parse(raw.slice(start, end + 1));
        return parsed && typeof parsed === "object"
          ? /** @type {Record<string, unknown>} */ (parsed)
          : {};
      } catch {
        return {};
      }
    }
    return {};
  }
}

/**
 * @param {unknown} item
 * @returns {CanonicalConceptPlanItem | null}
 */
function normalizeConceptPlanItem(item) {
  if (!item || typeof item !== "object") return null;
  const record = /** @type {Record<string, unknown>} */ (item);
  const title = String(record.title ?? "").trim();
  const rawSlug = String(record.slug ?? "").trim();
  const slug = normalizeSlug(rawSlug || title);
  if (!title || !slug) return null;
  const sourceRefs = stringArray(record.source_refs);
  const summaryRefs = stringArray(record.summary_refs).filter((p) =>
    p.startsWith("summaries/"),
  );
  const semanticDecisions = Array.isArray(record.semantic_decisions)
    ? record.semantic_decisions.filter(
        (d) => d && typeof d === "object",
      ).map((d) => /** @type {Record<string, unknown>} */ (d))
    : record.semantic_decision && typeof record.semantic_decision === "object"
      ? [/** @type {Record<string, unknown>} */ (record.semantic_decision)]
      : [];

  return {
    slug,
    title,
    path: `concepts/${slug}.md`,
    source_refs: sourceRefs,
    summary_refs: summaryRefs,
    merged_from: stringArray(record.merged_from),
    semantic_decisions: semanticDecisions,
  };
}

/**
 * @param {unknown} val
 * @returns {string[]}
 */
function stringArray(val) {
  if (!Array.isArray(val)) return [];
  return val.map((x) => String(x).trim()).filter(Boolean);
}

/**
 * @param {string} input
 */
function normalizeSlug(input) {
  return input
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

/**
 * @param {{
 *   paths: string[],
 *   raw: string,
 *   hubs: Set<string>,
 *   minTopic: number,
 *   maxTopic: number,
 *   digestRelPaths: string[],
 *   effectiveOffset: number,
 *   aliasKey?: string,
 *   sawHubOnly: boolean,
 *   heuristicTopUp: boolean,
 *   forceHeuristic?: boolean,
 * }} args
 */
function finishPlan(args) {
  let paths = [...args.paths];
  const topicCountBefore = countTopicPaths(paths, args.hubs);
  let heuristicTopUp = args.heuristicTopUp;

  const needsHeuristic =
    args.minTopic > 0 &&
    (args.forceHeuristic ||
      topicCountBefore < args.minTopic);

  if (needsHeuristic) {
    const topUp = heuristicTopicPaths({
      digestRelPaths: args.digestRelPaths,
      effectiveOffset: args.effectiveOffset,
      minTopic: args.minTopic,
      maxTopic: args.maxTopic,
    });
    const seen = new Set(paths);
    for (const t of topUp) {
      if (!seen.has(t)) {
        seen.add(t);
        paths.push(t);
      }
    }
    if (topUp.length > 0) {
      heuristicTopUp = true;
      console.error(
        JSON.stringify({
          warning: "PLAN_TOPIC_TOPUP_HEURISTIC",
          topic_paths: topUp,
          effective_offset: args.effectiveOffset,
          topic_count_before: topicCountBefore,
        }),
      );
    }
  }

  const topicCount = countTopicPaths(paths, args.hubs);
  if (args.sawHubOnly && topicCount >= args.minTopic) {
    console.error(
      JSON.stringify({
        warning: "PLAN_HUB_ONLY_RECOVERED",
        message: "planner returned hub-only in an earlier round; final plan includes topics",
        topic_count: topicCount,
      }),
    );
  }

  return {
    paths,
    raw: args.raw,
    meta: {
      aliasKeyUsed: args.aliasKey,
      hubOnly: topicCount === 0 && paths.length > 0,
      topicCount,
      heuristicTopUp,
    },
  };
}

/**
 * @param {string} text
 */
function extractJsonObject(text) {
  const t = text.trim();
  try {
    return JSON.parse(t);
  } catch {
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("no json object");
    return JSON.parse(t.slice(start, end + 1));
  }
}
