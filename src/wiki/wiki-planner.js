import { discoverMarkdown, relativeUnder } from "../fs/note-discovery.js";
import path from "node:path";
import fs from "node:fs";

/**
 * @param {import('../config/load-config.js').AppConfig} cfg
 */
export async function summarizeSourcesForPlanner(cfg) {
  const root = path.resolve(cfg.notes_root);
  const files = await discoverMarkdown(root, cfg.notes_glob);
  const lines = [];
  for (const abs of files.slice(0, 40)) {
    const rel = relativeUnder(root, abs);
    const st = fs.statSync(abs);
    lines.push(`${rel} mtime_ms=${Math.trunc(st.mtimeMs)}`);
  }
  if (files.length > 40) lines.push(`… ${files.length - 40} more files`);
  return {
    summary: lines.join("\n"),
    sourceFileCount: files.length,
  };
}

/**
 * @param {{
 *   cfg: import('../config/load-config.js').AppConfig,
 *   schema: import('../schema/schema-validator.js').WikiSchema,
 *   ollama: import('../ollama/client.js').OllamaClient,
 *   notesSummary: { summary: string, sourceFileCount: number },
 * }} args
 * @returns {Promise<{ paths: string[], raw: string }>}
 */
export async function planWikiPaths(args) {
  const { cfg, schema, ollama, notesSummary } = args;
  const system =
    "You output ONLY compact JSON with key paths (string array). No prose.";
  const prompt = `Plan wiki pages to update for Karpathy ingest.

Required hub pages from schema: ${JSON.stringify(schema.required_hub_pages)}
Page type ids: ${schema.page_types.map((p) => p.id).join(", ")}

Sources digest (relative paths + mtimes):
${notesSummary.summary}

Constraints:
- Return between 0 and ${cfg.wiki_ingest.max_pages_per_run} paths (relative to wiki_root, use forward slashes).
- Prefer hubs that are missing or stale.
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
