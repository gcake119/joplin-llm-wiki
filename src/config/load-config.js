import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

/**
 * @typedef {{
 *   raw: string,
 *   raw_glob: string,
 *   wiki: string,
 *   wiki_glob: string,
 *   wiki_schema: { path: string, strict: boolean },
 *   wiki_ingest: {
 *     max_pages_per_run: number,
 *     min_pages_per_run: number,
 *     min_topic_pages_per_run: number,
 *     planner_reject_source_paths: boolean,
 *     max_planner_rounds: number,
 *     corpus_mode_enabled: boolean,
 *     corpus_digest_max_files: number,
 *     corpus_digest_offset: number,
 *     corpus_writer_excerpt_mode: string,
 *     corpus_auto_sweep: {
 *       enabled: boolean,
 *       max_windows_per_invocation: number,
 *       step_files: number,
 *       state_path: string,
 *       advance_state_on_dry_run: boolean,
 *       run_until_cycle_complete: boolean,
 *       max_total_windows_per_invocation: number,
 *     },
 *   },
 *   write_back: { sources_enabled: boolean },
 *   ollama: { base_url: string, chat_model: string, timeout_ms: number },
 *   lint: {
 *     out_dir: string,
 *     duplicate_similarity_threshold: number,
 *     duplicate_scope: string,
 *     source_link_check: boolean,
 *     contradiction: { max_pairs: number, timeout_ms: number },
 *   },
 *   joplin_cli: { enabled: boolean, command: string, preflight_argv: string[], timeout_ms: number },
 *   joplin_data_api: { base_url: string, token: string, timeout_ms: number },
 *   joplin_wiki_writeback: {
 *     enabled: boolean,
 *     parent_notebook_title: string,
 *     wiki_notebook_title: string,
 *     brainstorming_notebook_title: string,
 *     artifacts_notebook_title: string,
 *     artifacts_project_notebook_title: string,
 *     topic_frontmatter_key: string,
 *     note_title_key: string,
 *     max_cli_attempts: number,
 *   },
 *   joplin_sqlite_sync: {
 *     enabled: boolean,
 *     database_path: string,
 *     export_root: string,
 *     reconcile_mode: string,
 *     busy_timeout_ms: number,
 *     max_export_attempts: number,
 *     notebook_filter: {
 *       enabled: boolean,
 *       include_notebook_ids: string[],
 *       include_notebook_paths: string[],
 *       include_descendants: boolean,
 *       notebook_path_style: string,
 *       notebook_path_separator: string,
 *       source_filename: string,
 *     },
 *     pipeline: { run_wiki_compile: boolean, compile_mode: 'local' | 'agent' | 'off' },
 *     schedule: { every_seconds: number | null },
 *   },
 * }} AppConfig
 *
 * Resume stages (`wiki-compile --resume-stage concepts|writeback`) are CLI
 * recovery controls. They intentionally add no config keys and no Chroma,
 * embedding, or remote-service dependency beyond the existing local Ollama and
 * loopback Joplin Data API settings.
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

  rejectLegacyConfigKeys(doc);

  let raw = reqStr(doc, "raw");
  if (!path.isAbsolute(raw))
    raw = path.resolve(cfgDir, raw);

  const raw_glob = str(doc, "raw_glob", "**/*.md");

  const wiki_raw = reqStr(doc, "wiki");
  const wiki = path.isAbsolute(wiki_raw) ? wiki_raw : path.resolve(cfgDir, wiki_raw);
  const wiki_glob = str(doc, "wiki_glob", "**/*.md");

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

  const ingestNest = nest(doc, "wiki_ingest");
  const corpus_writer_excerpt_mode_raw = str(
    ingestNest,
    "corpus_writer_excerpt_mode",
    "filesystem_slice",
  );
  if (
    corpus_writer_excerpt_mode_raw !== "filesystem_slice"
  ) {
    const err = new Error(
      `wiki_ingest.corpus_writer_excerpt_mode must be "filesystem_slice"`,
    );
    /** @type {Error & { code?: string }} */ (err).code = "CONFIG_INVALID";
    throw err;
  }

  const corpus_digest_max_files = wikiIngestInt(ingestNest, "corpus_digest_max_files", 500, {
    min: 40,
    max: 1000,
  });

  const max_pages_per_run = num(ingestNest, "max_pages_per_run", 15, {
    min: 1,
    max: 500,
  });

  let min_topic_pages_per_run = num(ingestNest, "min_topic_pages_per_run", 0, {
    min: 0,
    max: 500,
  });
  if (min_topic_pages_per_run > max_pages_per_run) {
    min_topic_pages_per_run = max_pages_per_run;
  }

  const wiki_ingest = {
    max_pages_per_run,
    min_pages_per_run: num(ingestNest, "min_pages_per_run", 10, {
      min: 0,
      max: 500,
    }),
    min_topic_pages_per_run,
    planner_reject_source_paths: bool(
      ingestNest,
      "planner_reject_source_paths",
      true,
    ),
    max_planner_rounds: num(ingestNest, "max_planner_rounds", 3, {
      min: 1,
      max: 50,
    }),
    corpus_mode_enabled: readCorpusModeEnabled(ingestNest),
    corpus_digest_max_files,
    corpus_digest_offset: wikiIngestInt(ingestNest, "corpus_digest_offset", 0, {
      min: 0,
      max: 10_000_000,
    }),
    corpus_writer_excerpt_mode: corpus_writer_excerpt_mode_raw,
    corpus_auto_sweep: readCorpusAutoSweep(ingestNest, corpus_digest_max_files, cfgDir),
  };

  const write_back = {
    sources_enabled: bool(nest(doc, "write_back"), "sources_enabled", false),
  };

  const ollama = {
    base_url: str(nest(doc, "ollama"), "base_url", "http://127.0.0.1:11434"),
    chat_model: str(nest(doc, "ollama"), "chat_model", "gemma2:2b"),
    timeout_ms: num(nest(doc, "ollama"), "timeout_ms", 120_000, {
      min: 1000,
      max: 3_600_000,
    }),
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
      "version",
    ]),
    timeout_ms: num(nest(doc, "joplin_cli"), "timeout_ms", 30_000, {
      min: 1000,
      max: 600_000,
    }),
  };

  const apiNest = nest(doc, "joplin_data_api");
  const joplin_data_api_base_url = str(
    apiNest,
    "base_url",
    "http://127.0.0.1:41184",
  ).trim();
  const joplin_data_api_token = str(apiNest, "token", "").trim();
  const joplin_data_api_timeout_ms = readJoplinDataApiTimeoutMs(apiNest);

  const wbNest =
    typeof doc.joplin_wiki_writeback === "object" &&
    doc.joplin_wiki_writeback !== null
      ? /** @type {Record<string, unknown>} */ (doc.joplin_wiki_writeback)
      : {};
  const parent_notebook_title = str(
    wbNest,
    "parent_notebook_title",
    "@llm-wiki",
  ).trim();
  if (!parent_notebook_title) {
    const err = new Error(
      "joplin_wiki_writeback.parent_notebook_title must be non-empty",
    );
    /** @type {Error & { code?: string }} */ (err).code = "CONFIG_INVALID";
    throw err;
  }

  const joplin_wiki_writeback = {
    enabled: bool(wbNest, "enabled", true),
    parent_notebook_title,
    wiki_notebook_title: str(wbNest, "wiki_notebook_title", "wiki").trim() || "wiki",
    brainstorming_notebook_title:
      str(wbNest, "brainstorming_notebook_title", "brainstorming").trim() ||
      "brainstorming",
    artifacts_notebook_title:
      str(wbNest, "artifacts_notebook_title", "artifacts").trim() ||
      "artifacts",
    artifacts_project_notebook_title: str(
      wbNest,
      "artifacts_project_notebook_title",
      "",
    ).trim(),
    topic_frontmatter_key: str(wbNest, "topic_frontmatter_key", "domain"),
    note_title_key: str(wbNest, "note_title_key", "title"),
    max_cli_attempts: num(wbNest, "max_cli_attempts", 3, {
      min: 1,
      max: 100,
    }),
  };

  const joplin_data_api = {
    base_url: joplin_data_api_base_url,
    token: joplin_data_api_token,
    timeout_ms: joplin_data_api_timeout_ms,
  };

  if (joplin_wiki_writeback.enabled) {
    assertLoopbackJoplinDataApiUrl(joplin_data_api.base_url);
    if (!joplin_data_api.token) {
      const err = new Error(
        "joplin_data_api.token must be non-empty when joplin_wiki_writeback.enabled",
      );
      /** @type {Error & { code?: string }} */ (err).code = "CONFIG_INVALID";
      throw err;
    }
  }

  const syncNest =
    typeof doc.joplin_sqlite_sync === "object" && doc.joplin_sqlite_sync !== null
      ? /** @type {Record<string, unknown>} */ (doc.joplin_sqlite_sync)
      : {};
  const syncEnabled = bool(syncNest, "enabled", false);
  let database_path = str(syncNest, "database_path", "").trim();
  if (database_path && !path.isAbsolute(database_path))
    database_path = path.resolve(cfgDir, database_path);

  const export_root_raw = str(syncNest, "export_root", "").trim();
  let export_root =
    export_root_raw === ""
      ? raw
      : path.isAbsolute(export_root_raw)
        ? export_root_raw
        : path.resolve(cfgDir, export_root_raw);

  const reconcile_raw = str(syncNest, "reconcile_mode", "mirror");
  if (reconcile_raw !== "mirror" && reconcile_raw !== "leave") {
    const err = new Error("joplin_sqlite_sync.reconcile_mode must be mirror or leave");
    /** @type {Error & { code?: string }} */ (err).code = "CONFIG_INVALID";
    throw err;
  }
  /** @type {'mirror' | 'leave'} */
  const reconcile_mode = reconcile_raw;

  const busy_timeout_ms = num(syncNest, "busy_timeout_ms", 5000, {
    min: 0,
    max: 600_000,
  });
  const max_export_attempts = num(syncNest, "max_export_attempts", 5, {
    min: 1,
    max: 100,
  });

  const notebook_filter = readNotebookFilter(syncNest);

  const pipeNest = nest(doc, "joplin_sqlite_sync", "pipeline");
  const run_wiki_compile = bool(pipeNest, "run_wiki_compile", true);
  const compile_mode = readSqliteSyncCompileMode(pipeNest, run_wiki_compile);
  const pipeline = {
    run_wiki_compile,
    compile_mode,
  };

  const schedNest = nest(doc, "joplin_sqlite_sync", "schedule");
  const every_seconds = readOptionalPositiveIntOrNull(schedNest, "every_seconds");

  if (syncEnabled) {
    if (!database_path) {
      const err = new Error("joplin_sqlite_sync.database_path required when enabled");
      /** @type {Error & { code?: string }} */ (err).code = "CONFIG_INVALID";
      throw err;
    }
    const nr = path.normalize(raw);
    const er = path.normalize(export_root);
    if (er !== nr) {
      const err = new Error(
        "joplin_sqlite_sync.export_root must equal raw (resolved paths)",
      );
      /** @type {Error & { code?: string }} */ (err).code = "CONFIG_INVALID";
      throw err;
    }
  }

  const joplin_sqlite_sync = {
    enabled: syncEnabled,
    database_path,
    export_root,
    reconcile_mode,
    busy_timeout_ms,
    max_export_attempts,
    notebook_filter,
    pipeline,
    schedule: { every_seconds },
  };

  return {
    raw,
    raw_glob,
    wiki,
    wiki_glob,
    wiki_schema,
    wiki_ingest,
    write_back,
    ollama,
    lint,
    joplin_cli,
    joplin_data_api,
    joplin_wiki_writeback,
    joplin_sqlite_sync,
  };
}

/** @param {Record<string, unknown>} syncNest */
function readNotebookFilter(syncNest) {
  const nf = nest(syncNest, "notebook_filter");
  const notebook_path_style = str(nf, "notebook_path_style", "joined_slug");
  if (notebook_path_style !== "joined_slug") {
    const err = new Error(
      'joplin_sqlite_sync.notebook_filter.notebook_path_style must be "joined_slug"',
    );
    /** @type {Error & { code?: string }} */ (err).code = "CONFIG_INVALID";
    throw err;
  }
  const source_filename = str(nf, "source_filename", "title");
  if (source_filename !== "title") {
    const err = new Error(
      'joplin_sqlite_sync.notebook_filter.source_filename must be "title"',
    );
    /** @type {Error & { code?: string }} */ (err).code = "CONFIG_INVALID";
    throw err;
  }
  const sep = str(nf, "notebook_path_separator", "-");
  if (!sep || sep.includes("/") || sep.includes("\\") || sep.length > 8) {
    const err = new Error(
      "joplin_sqlite_sync.notebook_filter.notebook_path_separator must be 1-8 chars without path separators",
    );
    /** @type {Error & { code?: string }} */ (err).code = "CONFIG_INVALID";
    throw err;
  }
  return {
    enabled: bool(nf, "enabled", false),
    include_notebook_ids: strArr(nf, "include_notebook_ids", []),
    include_notebook_paths: strArr(nf, "include_notebook_paths", []),
    include_descendants: bool(nf, "include_descendants", true),
    notebook_path_style,
    notebook_path_separator: sep,
    source_filename,
  };
}

/**
 * @param {Record<string, unknown>} pipeNest
 * @param {boolean} runWikiCompile
 * @returns {'local' | 'agent' | 'off'}
 */
function readSqliteSyncCompileMode(pipeNest, runWikiCompile) {
  if (!Object.prototype.hasOwnProperty.call(pipeNest, "compile_mode")) {
    return runWikiCompile ? "local" : "off";
  }
  const v = pipeNest.compile_mode;
  if (v === "local" || v === "agent" || v === "off") return v;
  const err = new Error("joplin_sqlite_sync.pipeline.compile_mode must be local, agent, or off");
  /** @type {Error & { code?: string }} */ (err).code = "CONFIG_INVALID";
  throw err;
}

/**
 * @param {Record<string, unknown>} apiNest
 */
function readJoplinDataApiTimeoutMs(apiNest) {
  if (!Object.prototype.hasOwnProperty.call(apiNest, "timeout_ms")) return 30_000;
  const v = apiNest.timeout_ms;
  if (typeof v !== "number" || !Number.isFinite(v) || Math.trunc(v) !== v) {
    const err = new Error("joplin_data_api.timeout_ms must be an integer");
    /** @type {Error & { code?: string }} */ (err).code = "CONFIG_INVALID";
    throw err;
  }
  if (v < 1000 || v > 600_000) {
    const err = new Error(
      "joplin_data_api.timeout_ms must be between 1000 and 600000 inclusive",
    );
    /** @type {Error & { code?: string }} */ (err).code = "CONFIG_INVALID";
    throw err;
  }
  return v;
}

/**
 * @param {Record<string, unknown>} doc
 */
function rejectLegacyConfigKeys(doc) {
  const legacy = [];
  for (const key of [
    "notes_root",
    "notes_glob",
    "wiki_root",
    "rag",
    "chroma",
    "chunk",
    "watch",
  ]) {
    if (Object.prototype.hasOwnProperty.call(doc, key)) legacy.push(key);
  }
  if (
    typeof doc.wiki === "object" &&
    doc.wiki !== null &&
    Object.prototype.hasOwnProperty.call(
      /** @type {Record<string, unknown>} */ (doc.wiki),
      "glob",
    )
  ) {
    legacy.push("wiki.glob");
  }
  const ollama = nest(doc, "ollama");
  for (const key of ["embed_model", "embed_batch_size"]) {
    if (Object.prototype.hasOwnProperty.call(ollama, key)) {
      legacy.push(`ollama.${key}`);
    }
  }
  const ingest = nest(doc, "wiki_ingest");
  for (const key of ["corpus_chroma_top_k"]) {
    if (Object.prototype.hasOwnProperty.call(ingest, key)) {
      legacy.push(`wiki_ingest.${key}`);
    }
  }
  const pipe = nest(doc, "joplin_sqlite_sync", "pipeline");
  if (Object.prototype.hasOwnProperty.call(pipe, "run_index")) {
    legacy.push("joplin_sqlite_sync.pipeline.run_index");
  }
  if (legacy.length === 0) return;
  const err = new Error(
    `legacy config keys are no longer supported: ${legacy.join(", ")}; use raw, raw_glob, wiki, and wiki_glob`,
  );
  /** @type {Error & { code?: string }} */ (err).code = "CONFIG_INVALID";
  throw err;
}

/**
 * @param {string} baseUrlRaw
 */
function assertLoopbackJoplinDataApiUrl(baseUrlRaw) {
  /** @type {URL} */
  let u;
  try {
    u = new URL(baseUrlRaw);
  } catch {
    const err = new Error(
      "joplin_data_api.base_url must be a valid absolute HTTP(S) URL",
    );
    /** @type {Error & { code?: string }} */ (err).code = "CONFIG_INVALID";
    throw err;
  }
  const scheme = u.protocol.replace(/:$/, "").toLowerCase();
  if (scheme !== "http" && scheme !== "https") {
    const err = new Error(
      "joplin_data_api.base_url scheme must be http or https",
    );
    /** @type {Error & { code?: string }} */ (err).code = "CONFIG_INVALID";
    throw err;
  }
  const host = u.hostname.toLowerCase();
  if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
    const err = new Error(
      "joplin_data_api.base_url hostname must be 127.0.0.1, localhost, or ::1",
    );
    /** @type {Error & { code?: string }} */ (err).code = "CONFIG_INVALID";
    throw err;
  }
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
 * @returns {number | null}
 */
function readOptionalPositiveIntOrNull(doc, key) {
  if (!(key in doc)) return null;
  const v = doc[key];
  if (v === null || v === undefined) return null;
  if (typeof v !== "number" || !Number.isInteger(v) || v <= 0) {
    const err = new Error(`${key} must be a positive integer or null`);
    /** @type {Error & { code?: string }} */ (err).code = "CONFIG_INVALID";
    throw err;
  }
  return v;
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
 * @param {Record<string, unknown>} ingestNest wiki_ingest mapping
 */
function readCorpusModeEnabled(ingestNest) {
  if (!Object.prototype.hasOwnProperty.call(ingestNest, "corpus_mode_enabled"))
    return true;
  const v = ingestNest.corpus_mode_enabled;
  if (typeof v !== "boolean") {
    const err = new Error("wiki_ingest.corpus_mode_enabled must be a boolean");
    /** @type {Error & { code?: string }} */ (err).code = "CONFIG_INVALID";
    throw err;
  }
  return v;
}

/**
 * @param {Record<string, unknown>} sweepNest
 * @param {string} key
 * @param {number} def
 * @param {{ min: number, max: number }} bounds
 */
function wikiSweepInt(sweepNest, key, def, bounds) {
  if (!Object.prototype.hasOwnProperty.call(sweepNest, key)) return def;
  const v = sweepNest[key];
  if (typeof v !== "number" || !Number.isFinite(v) || Math.trunc(v) !== v) {
    const err = new Error(
      `wiki_ingest.corpus_auto_sweep.${key} must be an integer`,
    );
    /** @type {Error & { code?: string }} */ (err).code = "CONFIG_INVALID";
    throw err;
  }
  const iv = Math.trunc(/** @type {number} */ (v));
  if (iv < bounds.min || iv > bounds.max) {
    const err = new Error(
      `wiki_ingest.corpus_auto_sweep.${key} must be between ${bounds.min} and ${bounds.max} inclusive`,
    );
    /** @type {Error & { code?: string }} */ (err).code = "CONFIG_INVALID";
    throw err;
  }
  return iv;
}

/**
 * @param {Record<string, unknown>} ingestNest
 * @param {number} corpusDigestMaxFiles
 * @param {string} cfgDir
 */
function readCorpusAutoSweep(ingestNest, corpusDigestMaxFiles, cfgDir) {
  const sn = nest(ingestNest, "corpus_auto_sweep");
  const enabled = bool(sn, "enabled", false);
  const max_windows_per_invocation = wikiSweepInt(
    sn,
    "max_windows_per_invocation",
    20,
    { min: 1, max: 500 },
  );

  let step_files = corpusDigestMaxFiles;
  if (Object.prototype.hasOwnProperty.call(sn, "step_files")) {
    step_files = wikiSweepInt(sn, "step_files", corpusDigestMaxFiles, {
      min: 1,
      max: corpusDigestMaxFiles,
    });
  }

  const state_path_raw = str(sn, "state_path", "");
  let state_path = "";
  if (state_path_raw.trim() !== "") {
    state_path = path.isAbsolute(state_path_raw)
      ? state_path_raw
      : path.resolve(cfgDir, state_path_raw);
  }

  const advance_state_on_dry_run = bool(sn, "advance_state_on_dry_run", false);
  const run_until_cycle_complete = bool(sn, "run_until_cycle_complete", false);
  const max_total_windows_per_invocation = wikiSweepInt(
    sn,
    "max_total_windows_per_invocation",
    500,
    { min: 1, max: 500 },
  );

  const corpus_mode_enabled = readCorpusModeEnabled(ingestNest);
  if (enabled && !corpus_mode_enabled) {
    const err = new Error(
      "wiki_ingest.corpus_auto_sweep.enabled requires wiki_ingest.corpus_mode_enabled true",
    );
    /** @type {Error & { code?: string }} */ (err).code = "CONFIG_INVALID";
    throw err;
  }

  return {
    enabled,
    max_windows_per_invocation,
    step_files,
    state_path,
    advance_state_on_dry_run,
    run_until_cycle_complete,
    max_total_windows_per_invocation,
  };
}

/**
 * @param {Record<string, unknown>} doc
 * @param {string} key
 * @param {number} def
 * @param {{ min: number, max: number }} bounds
 */
function wikiIngestInt(doc, key, def, bounds) {
  if (!Object.prototype.hasOwnProperty.call(doc, key)) return def;
  const v = doc[key];
  if (typeof v !== "number" || !Number.isFinite(v) || Math.trunc(v) !== v) {
    const err = new Error(`wiki_ingest.${key} must be an integer`);
    /** @type {Error & { code?: string }} */ (err).code = "CONFIG_INVALID";
    throw err;
  }
  const iv = /** @type {number} */ (v);
  if (iv < bounds.min || iv > bounds.max) {
    const err = new Error(
      `wiki_ingest.${key} must be between ${bounds.min} and ${bounds.max} inclusive`,
    );
    /** @type {Error & { code?: string }} */ (err).code = "CONFIG_INVALID";
    throw err;
  }
  return iv;
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
 * @param {Record<string, unknown>} lint
 */
function lintDupScope(lint) {
  const v = lint.duplicate_scope;
  if (v === "source" || v === "wiki" || v === "both") return v;
  return "both";
}
