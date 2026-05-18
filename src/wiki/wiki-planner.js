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

/**
 * @param {import('../config/load-config.js').AppConfig} cfg
 */
export async function summarizeSourcesForPlanner(cfg) {
  const root = path.resolve(cfg.notes_root);
  const files = await discoverMarkdown(root, cfg.notes_glob);
  const ingest = cfg.wiki_ingest;

  /** @type {string[]} */
  let digestAbs;
  if (!ingest.corpus_mode_enabled) {
    digestAbs = files.slice(0, Math.min(files.length, 40));
  } else {
    const maxTake = Math.min(files.length, ingest.corpus_digest_max_files);
    digestAbs = rotatedSlice(files, ingest.corpus_digest_offset, maxTake);
  }

  const lines = [];
  for (const abs of digestAbs) {
    const rel = relativeUnder(root, abs);
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
  };
}

/**
 * @param {{
 *   cfg: import('../config/load-config.js').AppConfig,
 *   schema: import('../schema/schema-validator.js').WikiSchema,
 *   ollama: import('../ollama/client.js').OllamaClient,
 *   notesSummary: { summary: string, sourceFileCount: number, digest_paths_in_prompt_count: number },
 * }} args
 * @returns {Promise<{ paths: string[], raw: string }>}
 */
export async function planWikiPaths(args) {
  const { cfg, schema, ollama, notesSummary } = args;
  const maxRun = cfg.wiki_ingest.max_pages_per_run;
  const minSoft = cfg.wiki_ingest.min_pages_per_run;
  const srcCount = notesSummary.sourceFileCount;
  const digestCount = notesSummary.digest_paths_in_prompt_count;

  const system =
    "You output ONLY compact JSON with key paths (string array). No prose.";
  const prompt = `Plan wiki pages to update for Karpathy ingest.

Required hub pages from schema: ${JSON.stringify(schema.required_hub_pages)}
Page type ids: ${schema.page_types.map((p) => p.id).join(", ")}

Sources digest (relative paths + mtimes):
${notesSummary.summary}

Constraints:
- Return between 0 and ${maxRun} paths (relative to wiki_root, use forward slashes).
- Prefer hubs that are missing or stale.
- The notes library has ${srcCount} markdown files; this digest lists ${digestCount} of them (metadata only). When ${srcCount} is large, prefer returning at least ${minSoft} diverse wiki paths that synthesize or refresh coverage from that corpus—unless you deliberately scope a tiny edit (never exceed ${maxRun}).
- JSON shape strictly: {"paths":["foo.md","bar/b.md"]}`;

  /** @type {string | undefined} */
  let text;
  let lastErr;
  const rounds = cfg.wiki_ingest.max_planner_rounds;
  for (let r = 0; r < rounds; r++) {
    try {
      text = await ollama.chatComplete({
        system,
        prompt:
          r === 0
            ? prompt
            : `${prompt}\nPrevious invalid output; emit valid JSON only.`,
        jsonMode: true,
        timeoutMs: cfg.ollama.timeout_ms,
      });
      const parsed = extractJsonObject(text);
      const paths = normalizePaths(parsed.paths);
      return { paths, raw: text };
    } catch (e) {
      lastErr = e;
    }
  }
  const err = new Error(
    `Wiki planner failed after ${rounds} rounds: ${lastErr?.message ?? lastErr}`,
  );
  /** @type {Error & { code?: string }} */ (err).code = "WIKI_COMPILE_ABORT";
  throw err;
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

/**
 * @param {unknown} pathsVal
 * @returns {string[]}
 */
function normalizePaths(pathsVal) {
  if (!Array.isArray(pathsVal)) return [];
  const out = [];
  for (const p of pathsVal) {
    if (typeof p !== "string") continue;
    const norm = p.replace(/\\/g, "/").replace(/^\/+/, "");
    if (!norm || norm.includes("..")) continue;
    out.push(norm);
  }
  return out;
}
