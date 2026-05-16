import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

/**
 * @typedef {{
 *   notes_root: string,
 *   notes_glob: string,
 *   wiki_root: string,
 *   wiki: { glob: string },
 *   wiki_schema: { path: string, strict: boolean },
 *   wiki_ingest: { max_pages_per_run: number, min_pages_per_run: number, max_planner_rounds: number },
 *   write_back: { sources_enabled: boolean },
 *   ollama: { base_url: string, embed_model: string, chat_model: string, timeout_ms: number, embed_batch_size: number },
 *   chroma: { persist_path: string, collection_sources: string, collection_wiki: string },
 *   chunk: { size_chars: number, overlap_chars: number },
 *   watch: { enabled: boolean, debounce_ms: number },
 *   rag: { top_k: number, max_context_chars: number, retrieve_mode: string },
 *   lint: {
 *     out_dir: string,
 *     duplicate_similarity_threshold: number,
 *     duplicate_scope: string,
 *     source_link_check: boolean,
 *     contradiction: { max_pairs: number, timeout_ms: number },
 *   },
 *   joplin_cli: { enabled: boolean, command: string, preflight_argv: string[], timeout_ms: number },
 * }} AppConfig
 */

/**
 * @param {string} configPath
 * @returns {Promise<AppConfig>}
 */
export async function loadConfig(configPath) {
  const abs = path.resolve(configPath);
  let rawText;
  try {
    rawText = fs.readFileSync(abs, "utf8");
  } catch {
    const err = new Error(`cannot read config: ${abs}`);
    /** @type {Error & { code?: string }} */ (err).code = "CONFIG_INVALID";
    throw err;
  }

  /** @type {Record<string, unknown>} */
  const doc = YAML.parse(rawText) ?? {};
  if (typeof doc !== "object" || doc === null) {
    const err = new Error("config root must be a mapping");
    /** @type {Error & { code?: string }} */ (err).code = "CONFIG_INVALID";
    throw err;
  }

  const cfgDir = path.dirname(abs);

  let notes_root = reqStr(doc, "notes_root");
  if (!path.isAbsolute(notes_root))
    notes_root = path.resolve(cfgDir, notes_root);

  const notes_glob = str(doc, "notes_glob", "**/*.md");

  const wiki_root_raw = str(doc, "wiki_root", "");
  const wiki_root =
    wiki_root_raw.trim() === ""
      ? ""
      : path.isAbsolute(wiki_root_raw)
        ? wiki_root_raw
        : path.resolve(cfgDir, wiki_root_raw);
  const wikiGlob =
    typeof doc.wiki === "object" && doc.wiki !== null && "glob" in doc.wiki
      ? str(/** @type {Record<string, unknown>} */ (doc.wiki), "glob", "**/*.md")
      : "**/*.md";

  let wiki_schema_path = str(
    typeof doc.wiki_schema === "object" && doc.wiki_schema !== null
      ? /** @type {Record<string, unknown>} */ (doc.wiki_schema)
      : {},
    "path",
    "",
  );
  if (wiki_schema_path && !path.isAbsolute(wiki_schema_path))
    wiki_schema_path = path.resolve(cfgDir, wiki_schema_path);

  const wiki_schema = {
    path: wiki_schema_path,
    strict: bool(
      typeof doc.wiki_schema === "object" && doc.wiki_schema !== null
        ? /** @type {Record<string, unknown>} */ (doc.wiki_schema)
        : {},
      "strict",
      true,
    ),
  };

  const wiki_ingest = {
    max_pages_per_run: num(
      nest(doc, "wiki_ingest"),
      "max_pages_per_run",
      15,
      { min: 1, max: 500 },
    ),
    min_pages_per_run: num(nest(doc, "wiki_ingest"), "min_pages_per_run", 10, {
      min: 0,
      max: 500,
    }),
    max_planner_rounds: num(nest(doc, "wiki_ingest"), "max_planner_rounds", 3, {
      min: 1,
      max: 50,
    }),
  };

  const write_back = {
    sources_enabled: bool(nest(doc, "write_back"), "sources_enabled", false),
  };

  const ollama = {
    base_url: str(nest(doc, "ollama"), "base_url", "http://127.0.0.1:11434"),
    embed_model: str(nest(doc, "ollama"), "embed_model", "bge-m3"),
    chat_model: str(nest(doc, "ollama"), "chat_model", "gemma2:2b"),
    timeout_ms: num(nest(doc, "ollama"), "timeout_ms", 120_000, {
      min: 1000,
      max: 3_600_000,
    }),
    embed_batch_size: num(nest(doc, "ollama"), "embed_batch_size", 16, {
      min: 1,
      max: 256,
    }),
  };

  const chromaPersistRaw = str(nest(doc, "chroma"), "persist_path", "data/chroma");
  const chromaPersist = path.isAbsolute(chromaPersistRaw)
    ? chromaPersistRaw
    : path.resolve(process.cwd(), chromaPersistRaw);

  const chroma = {
    persist_path: chromaPersist,
    collection_sources: str(
      nest(doc, "chroma"),
      "collection_sources",
      "joplin_sources_mvp",
    ),
    collection_wiki: str(
      nest(doc, "chroma"),
      "collection_wiki",
      "joplin_wiki_mvp",
    ),
  };

  const chunk = {
    size_chars: num(nest(doc, "chunk"), "size_chars", 1200, { min: 200, max: 50_000 }),
    overlap_chars: num(nest(doc, "chunk"), "overlap_chars", 200, {
      min: 0,
      max: 10_000,
    }),
  };

  const watch = {
    enabled: bool(nest(doc, "watch"), "enabled", false),
    debounce_ms: num(nest(doc, "watch"), "debounce_ms", 2000, {
      min: 50,
      max: 600_000,
    }),
  };

  const rag = {
    top_k: num(nest(doc, "rag"), "top_k", 5, { min: 1, max: 50 }),
    max_context_chars: num(nest(doc, "rag"), "max_context_chars", 6000, {
      min: 500,
      max: 200_000,
    }),
    retrieve_mode: ragMode(nest(doc, "rag")),
  };

  const lintOutRaw = str(nest(doc, "lint"), "out_dir", "reports");
  const lintOut = path.isAbsolute(lintOutRaw)
    ? lintOutRaw
    : path.resolve(cfgDir, lintOutRaw);

  const lint = {
    out_dir: lintOut,
    duplicate_similarity_threshold: num(
      nest(doc, "lint"),
      "duplicate_similarity_threshold",
      0.92,
      { min: 0, max: 1 },
    ),
    duplicate_scope: lintDupScope(nest(doc, "lint")),
    source_link_check: bool(nest(doc, "lint"), "source_link_check", true),
    contradiction: {
      max_pairs: num(nest(doc, "lint", "contradiction"), "max_pairs", 50, {
        min: 0,
        max: 10_000,
      }),
      timeout_ms: num(
        nest(doc, "lint", "contradiction"),
        "timeout_ms",
        180_000,
        { min: 1000, max: 3_600_000 },
      ),
    },
  };

  const joplin_cli = {
    enabled: bool(nest(doc, "joplin_cli"), "enabled", false),
    command: str(nest(doc, "joplin_cli"), "command", "joplin"),
    preflight_argv: strArr(nest(doc, "joplin_cli"), "preflight_argv", [
      "config",
      "version",
    ]),
    timeout_ms: num(nest(doc, "joplin_cli"), "timeout_ms", 30_000, {
      min: 1000,
      max: 600_000,
    }),
  };

  return {
    notes_root,
    notes_glob,
    wiki_root,
    wiki: { glob: wikiGlob },
    wiki_schema,
    wiki_ingest,
    write_back,
    ollama,
    chroma,
    chunk,
    watch,
    rag,
    lint,
    joplin_cli,
  };
}

/**
 * @param {Record<string, unknown>} doc
 * @param {...string} keys
 */
function nest(doc, ...keys) {
  let cur = doc;
  for (const k of keys) {
    if (typeof cur !== "object" || cur === null) return {};
    const next = /** @type {Record<string, unknown>} */ (cur)[k];
    if (typeof next !== "object" || next === null) return {};
    cur = /** @type {Record<string, unknown>} */ (next);
  }
  return /** @type {Record<string, unknown>} */ (cur);
}

/**
 * @param {Record<string, unknown>} doc
 * @param {string} key
 */
function reqStr(doc, key) {
  const v = doc[key];
  if (typeof v !== "string" || v.trim() === "") {
    const err = new Error(`missing required string: ${key}`);
    /** @type {Error & { code?: string }} */ (err).code = "CONFIG_INVALID";
    throw err;
  }
  return v;
}

/**
 * @param {Record<string, unknown>} doc
 * @param {string} key
 * @param {string} def
 */
function str(doc, key, def) {
  const v = doc[key];
  if (typeof v !== "string") return def;
  return v;
}

/**
 * @param {Record<string, unknown>} doc
 * @param {string} key
 * @param {boolean} def
 */
function bool(doc, key, def) {
  const v = doc[key];
  if (typeof v !== "boolean") return def;
  return v;
}

/**
 * @param {Record<string, unknown>} doc
 * @param {string} key
 * @param {number} def
 * @param {{ min: number, max: number }} bounds
 */
function num(doc, key, def, bounds) {
  const v = doc[key];
  if (typeof v !== "number" || Number.isNaN(v)) return def;
  if (v < bounds.min || v > bounds.max) return def;
  return v;
}

/**
 * @param {Record<string, unknown>} doc
 * @param {string} key
 * @param {string[]} def
 */
function strArr(doc, key, def) {
  const v = doc[key];
  if (!Array.isArray(v)) return def;
  const out = [];
  for (const item of v) {
    if (typeof item === "string") out.push(item);
  }
  return out.length ? out : def;
}

/**
 * @param {Record<string, unknown>} rag
 */
function ragMode(rag) {
  const v = rag.retrieve_mode;
  if (v === "wiki_first" || v === "sources_only" || v === "merged")
    return v;
  return "wiki_first";
}

/**
 * @param {Record<string, unknown>} lint
 */
function lintDupScope(lint) {
  const v = lint.duplicate_scope;
  if (v === "source" || v === "wiki" || v === "both") return v;
  return "both";
}
