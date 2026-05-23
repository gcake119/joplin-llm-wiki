import path from "node:path";
import fs from "node:fs";
import readline from "node:readline/promises";
import { setTimeout as delay } from "node:timers/promises";
import YAML from "yaml";
import { loadConfig } from "../config/load-config.js";
import {
  exportNotesFromSqlite,
  openReadonlyDatabase,
} from "../joplin/sqlite/exporter.js";
import { listNotebooksFromSqlite } from "../joplin/sqlite/notebooks.js";
import { runWikiCompile } from "./cmd-wiki-compile.js";
import { discoverMarkdown } from "../fs/note-discovery.js";
import {
  buildSnapshotFromMarkdown,
  compareSnapshots,
  readSnapshotState,
  writeSnapshotStateAtomic,
} from "../joplin/sqlite/sync-state.js";
import { runAgentCompile } from "./cmd-agent-compile.js";
import { runWikiWritebackPreflight } from "../joplin/wiki-writeback.js";

const defaultDeps = {
  loadConfig,
  exportNotesFromSqlite,
  openReadonlyDatabase,
  listNotebooksFromSqlite,
  discoverMarkdown,
  buildSnapshotFromMarkdown,
  compareSnapshots,
  readSnapshotState,
  writeSnapshotStateAtomic,
  /** @param {{ configPath: string, argv: string[], opts: Map<string, string> }} ctx */
  runWikiCompile: (ctx) => runWikiCompile(ctx),
  /** @param {{ configPath: string, argv: string[], opts: Map<string, string> }} ctx */
  runAgentCompile: (ctx) => runAgentCompile(ctx),
  /** @param {import('../config/load-config.js').AppConfig} cfg */
  runJoplinDataApiPreflight: (cfg) => runWikiWritebackPreflight(cfg),
};

/**
 * @param {{
 *   configPath: string,
 *   argv: string[],
 *   opts: Map<string, string>,
 * }} ctx
 * @param {typeof defaultDeps} [deps]
 * @returns {Promise<number>}
 */
export async function runSqliteSync(ctx, deps = defaultDeps) {
  deps = { ...defaultDeps, ...deps };
  let cfg = await deps.loadConfig(ctx.configPath);
  let sync = cfg.joplin_sqlite_sync;
  const exportOnlyCli = ctx.opts.get("export-only") === "true";
  const snapshotOnlyCli = ctx.opts.get("snapshot-only") === "true";
  const selectNotebooks = ctx.opts.get("select-notebooks") === "true";
  const listNotebooksJson = ctx.opts.get("list-notebooks-json") === "true";
  if (listNotebooksJson) {
    await printNotebooksJson(cfg, deps, ctx.opts.get("list-notebooks-json-out"));
    return 0;
  }
  if (selectNotebooks) {
    await runNotebookSelection(ctx.configPath, cfg, deps);
    if (ctx.opts.get("run") !== "true") {
      console.log(JSON.stringify({ notebook_filter: "updated" }));
      return 0;
    }
    cfg = await deps.loadConfig(ctx.configPath);
    sync = cfg.joplin_sqlite_sync;
  }
  if (snapshotOnlyCli) {
    const summary = await runSnapshotOnly(ctx, cfg, deps);
    console.log(JSON.stringify({ cycle: 1, ...summary }));
    return 0;
  }
  if (!sync.enabled) {
    console.log(
      JSON.stringify({
        status: "skipped",
        reason: "joplin_sqlite_sync.disabled",
      }),
    );
    return 0;
  }

  const dryRun = ctx.opts.get("dry-run") === "true";
  let intervalSec = sync.schedule.every_seconds;
  const everyCli = ctx.opts.get("every");
  if (everyCli !== undefined) {
    const n = parseInt(String(everyCli), 10);
    if (!Number.isFinite(n) || n <= 0) {
      const err = new Error("--every must be a positive integer");
      /** @type {Error & { code?: string }} */ (err).code = "CONFIG_INVALID";
      throw err;
    }
    intervalSec = n;
  }

  if (dryRun) {
    await runCycle(ctx, cfg, true, deps, exportOnlyCli, 1);
    return 0;
  }

  if (!intervalSec) {
    await runCycle(ctx, cfg, false, deps, exportOnlyCli, 1);
    return 0;
  }

  let shutdown = false;
  const onSig = () => {
    shutdown = true;
  };
  process.on("SIGINT", onSig);
  process.on("SIGTERM", onSig);

  try {
    let cycle = 0;
    while (!shutdown) {
      cycle++;
      await runCycle(ctx, cfg, false, deps, exportOnlyCli, cycle);
      if (shutdown) break;
      await delay(Number(intervalSec) * 1000);
    }
  } finally {
    process.off("SIGINT", onSig);
    process.off("SIGTERM", onSig);
  }

  return 0;
}

/**
 * @param {{ configPath: string, argv: string[], opts: Map<string, string> }} ctx
 * @param {import('../config/load-config.js').AppConfig} cfg
 * @param {boolean} dryRun
 * @param {typeof defaultDeps} deps
 * @param {boolean} exportOnlyCli
 * @param {number} cycle
 */
async function runCycle(ctx, cfg, dryRun, deps, exportOnlyCli, cycle) {
  try {
    const summary = await runOneExportAndOptionalPipeline(ctx, cfg, dryRun, deps, exportOnlyCli);
    console.log(JSON.stringify({ cycle, ...summary }));
  } catch (e) {
    const summary = /** @type {{ sqliteSyncSummary?: Record<string, unknown> }} */ (e).sqliteSyncSummary;
    if (summary) {
      console.log(JSON.stringify({ cycle, ...summary }));
    }
    throw e;
  }
}

/**
 * @param {{ configPath: string, argv: string[], opts: Map<string, string> }} ctx
 * @param {import('../config/load-config.js').AppConfig} cfg
 * @param {typeof defaultDeps} deps
 */
async function runSnapshotOnly(ctx, cfg, deps) {
  const rawRoot = path.resolve(cfg.raw);
  const files = await deps.discoverMarkdown(rawRoot, cfg.raw_glob);
  if (files.length === 0) {
    const err = new Error("NO_SOURCE_MARKDOWN: raw contains no matching markdown");
    /** @type {Error & { code?: string }} */ (err).code = "NO_SOURCE_MARKDOWN";
    throw err;
  }
  const snapshot = deps.buildSnapshotFromMarkdown(rawRoot, files);
  deps.writeSnapshotStateAtomic(resolveSqliteSyncStatePath(ctx.configPath), snapshot);
  return {
    exported_notes: 0,
    written_files: 0,
    skipped_notes: [],
    deleted_files: 0,
    duration_ms: 0,
    raw_changed: false,
    change_detection: "snapshot_created",
    changed_files: { added: files.length, updated: 0, deleted: 0 },
    compile_mode: cfg.joplin_sqlite_sync.pipeline.compile_mode,
    compile_triggered: false,
    snapshot_only: true,
  };
}

/**
 * @param {string} configPath
 */
function resolveSqliteSyncStatePath(configPath) {
  return path.join(path.dirname(path.resolve(configPath)), ".joplin-llm-wiki", "sqlite-sync-state.json");
}

/**
 * @param {{
 *   configPath: string,
 *   argv: string[],
 *   opts: Map<string, string>,
 * }} ctx
 * @param {import('../config/load-config.js').AppConfig} cfg
 * @param {boolean} dryRun
 * @param {typeof defaultDeps} deps
 * @param {boolean} exportOnlyCli — when true, skip config `pipeline` even if enabled (CLI `--export-only`)
 */
async function runOneExportAndOptionalPipeline(ctx, cfg, dryRun, deps, exportOnlyCli) {
  const sync = cfg.joplin_sqlite_sync;
  const summary = await deps.exportNotesFromSqlite({
    databasePath: sync.database_path,
    exportRootAbs: path.resolve(sync.export_root),
    reconcileMode: sync.reconcile_mode,
    busyTimeoutMs: sync.busy_timeout_ms,
    maxExportAttempts: sync.max_export_attempts,
    dryRun,
    notebookFilter: sync.notebook_filter,
  });
  const statePath = resolveSqliteSyncStatePath(ctx.configPath);
  const currentFiles = await deps.discoverMarkdown(path.resolve(sync.export_root), cfg.raw_glob);
  const currentSnapshot = deps.buildSnapshotFromMarkdown(
    path.resolve(sync.export_root),
    currentFiles,
  );
  const previousRead = deps.readSnapshotState(statePath);
  if (previousRead.warning) {
    console.error(JSON.stringify({ warning: previousRead.warning.code, message: previousRead.warning.message }));
  }
  const comparison = deps.compareSnapshots(previousRead.snapshot, currentSnapshot, { dryRun });
  const compileMode = sync.pipeline.compile_mode;
  const changedRawPaths = changedRawRelPaths(previousRead.snapshot, currentSnapshot);
  const baseSummary = {
    ...summary,
    ...comparison,
    compile_mode: compileMode,
    changed_raw_paths: changedRawPaths,
    compile_triggered: false,
    downstream_status: "skipped",
    writeback_preflight_status: "skipped",
  };
  const commitState = (reason) => {
    deps.writeSnapshotStateAtomic(statePath, currentSnapshot);
    return {
      state_committed: true,
      state_commit_reason: reason,
    };
  };
  if (dryRun) {
    return {
      ...baseSummary,
      dry_run: true,
      state_committed: false,
      state_commit_reason: "dry_run",
    };
  }
  if (exportOnlyCli) {
    return { ...baseSummary, export_only: true, ...commitState("export_only") };
  }
  if (comparison.change_detection === "baseline") {
    return { ...baseSummary, ...commitState("baseline") };
  }
  if (!comparison.raw_changed) {
    return { ...baseSummary, ...commitState("unchanged") };
  }
  if (compileMode === "off") {
    return { ...baseSummary, ...commitState("compile_mode_off") };
  }
  let writebackPreflightStatus = "skipped";
  if (cfg.joplin_wiki_writeback.enabled) {
    try {
      await deps.runJoplinDataApiPreflight(cfg);
      writebackPreflightStatus = "passed";
    } catch (e) {
      throw withSqliteSyncSummary(e, {
        ...baseSummary,
        writeback_preflight_status: "failed",
        downstream_status: "skipped",
        state_committed: false,
        state_commit_reason: "preflight_failed",
      });
    }
  }
  const downstreamCtx = {
    ...ctx,
    opts: new Map(ctx.opts),
  };
  downstreamCtx.opts.set("changed-raw-paths", changedRawPaths.join(","));
  if (compileMode === "agent") {
    let downstreamSummary = {};
    try {
      downstreamSummary = normalizeDownstreamSummary(
        await deps.runAgentCompile(downstreamCtx),
        "agent",
      );
    } catch (e) {
      throw withSqliteSyncSummary(e, {
        ...baseSummary,
        compile_triggered: true,
        writeback_preflight_status: writebackPreflightStatus,
        downstream_status: "failed",
        state_committed: false,
        state_commit_reason: "downstream_failed",
      });
    }
    return {
      ...baseSummary,
      ...downstreamSummary,
      compile_triggered: true,
      writeback_preflight_status: writebackPreflightStatus,
      downstream_status: "succeeded",
      ...commitState("downstream_succeeded"),
    };
  }
  if (compileMode === "local") {
    let downstreamSummary = {};
    try {
      downstreamSummary = normalizeDownstreamSummary(
        await deps.runWikiCompile(downstreamCtx),
        "local",
      );
    } catch (e) {
      throw withSqliteSyncSummary(e, {
        ...baseSummary,
        compile_triggered: true,
        writeback_preflight_status: writebackPreflightStatus,
        downstream_status: "failed",
        state_committed: false,
        state_commit_reason: "downstream_failed",
      });
    }
    return {
      ...baseSummary,
      ...downstreamSummary,
      compile_triggered: true,
      writeback_preflight_status: writebackPreflightStatus,
      downstream_status: "succeeded",
      ...commitState("downstream_succeeded"),
    };
  }
  return { ...baseSummary, ...commitState("compile_mode_unknown") };
}

/**
 * @param {import('../joplin/sqlite/sync-state.js').SyncSnapshot | null} previous
 * @param {import('../joplin/sqlite/sync-state.js').SyncSnapshot} current
 */
function changedRawRelPaths(previous, current) {
  if (!previous) return [];
  const out = [];
  for (const [rel, cur] of Object.entries(current.files)) {
    const prev = previous.files[rel];
    if (!prev || prev.sha256 !== cur.sha256 || prev.joplin_note_id !== cur.joplin_note_id) {
      out.push(rel);
    }
  }
  for (const rel of Object.keys(previous.files)) {
    if (!Object.prototype.hasOwnProperty.call(current.files, rel)) {
      out.push(rel);
    }
  }
  return [...new Set(out)].sort();
}

/**
 * @param {unknown} value
 * @param {"local" | "agent"} adapter
 */
function normalizeDownstreamSummary(value, adapter) {
  const out = { compile_adapter: adapter };
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  const src = /** @type {Record<string, unknown>} */ (value);
  for (const key of [
    "compile_adapter",
    "changed_summary_paths",
    "concept_paths_planned",
    "concept_paths_written",
    "writeback_relpaths",
  ]) {
    if (key in src) out[key] = src[key];
  }
  return out;
}

/**
 * @param {unknown} e
 * @param {Record<string, unknown>} summary
 */
function withSqliteSyncSummary(e, summary) {
  const err =
    e instanceof Error ? e : new Error(String(e ?? "sqlite-sync downstream failed"));
  err.sqliteSyncSummary = summary;
  return err;
}

export { defaultDeps };

/**
 * @param {import('../config/load-config.js').AppConfig} cfg
 * @param {typeof defaultDeps} deps
 */
async function printNotebooksJson(cfg, deps, outPath) {
  if (!cfg.joplin_sqlite_sync.enabled || !cfg.joplin_sqlite_sync.database_path) {
    const err = new Error("joplin_sqlite_sync must be enabled");
    /** @type {Error & { code?: string }} */ (err).code = "CONFIG_INVALID";
    throw err;
  }
  const db = await deps.openReadonlyDatabase(
    cfg.joplin_sqlite_sync.database_path,
    cfg.joplin_sqlite_sync.busy_timeout_ms,
    cfg.joplin_sqlite_sync.max_export_attempts,
  );
  try {
    const notebooks = deps.listNotebooksFromSqlite(db, {
      separator: cfg.joplin_sqlite_sync.notebook_filter.notebook_path_separator,
    });
    const payload = JSON.stringify({
      notebooks,
      selectedIds: cfg.joplin_sqlite_sync.notebook_filter.include_notebook_ids,
      enabled: cfg.joplin_sqlite_sync.notebook_filter.enabled,
    });
    if (outPath) {
      fs.writeFileSync(path.resolve(outPath), payload, "utf8");
    } else {
      console.log(payload);
    }
  } finally {
    db.close();
  }
}

/**
 * @param {string} configPath
 * @param {import('../config/load-config.js').AppConfig} cfg
 * @param {typeof defaultDeps} deps
 */
async function runNotebookSelection(configPath, cfg, deps) {
  const db = await deps.openReadonlyDatabase(
    cfg.joplin_sqlite_sync.database_path,
    cfg.joplin_sqlite_sync.busy_timeout_ms,
    cfg.joplin_sqlite_sync.max_export_attempts,
  );
  try {
    const notebooks = deps.listNotebooksFromSqlite(db, {
      separator: cfg.joplin_sqlite_sync.notebook_filter.notebook_path_separator,
    });
    if (notebooks.length === 0) {
      const err = new Error("no Joplin notebooks found in database");
      /** @type {Error & { code?: string }} */ (err).code = "SQLITE_EXPORT_FAILED";
      throw err;
    }
    for (let i = 0; i < notebooks.length; i++) {
      const nb = notebooks[i];
      console.log(`${i + 1}. ${nb.path} (${nb.id})`);
    }
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    let answer = "";
    try {
      answer = await rl.question(
        "Select notebooks to export (comma-separated numbers, or 'all'): ",
      );
    } finally {
      rl.close();
    }
    const selected =
      answer.trim().toLowerCase() === "all"
        ? notebooks
        : answer
            .split(",")
            .map((s) => Number.parseInt(s.trim(), 10))
            .filter((n) => Number.isInteger(n) && n >= 1 && n <= notebooks.length)
            .map((n) => notebooks[n - 1]);
    if (selected.length === 0) {
      const err = new Error("no notebooks selected");
      /** @type {Error & { code?: string }} */ (err).code = "CONFIG_INVALID";
      throw err;
    }
    writeNotebookFilterToConfig(configPath, selected.map((n) => n.id));
  } finally {
    db.close();
  }
}

/**
 * @param {string} configPath
 * @param {string[]} ids
 */
function writeNotebookFilterToConfig(configPath, ids) {
  const abs = path.resolve(configPath);
  const doc = YAML.parse(fs.readFileSync(abs, "utf8")) ?? {};
  const root = typeof doc === "object" && doc !== null ? doc : {};
  const sync =
    typeof root.joplin_sqlite_sync === "object" && root.joplin_sqlite_sync !== null
      ? root.joplin_sqlite_sync
      : {};
  sync.notebook_filter = {
    ...(typeof sync.notebook_filter === "object" && sync.notebook_filter !== null
      ? sync.notebook_filter
      : {}),
    enabled: true,
    include_notebook_ids: ids,
    include_notebook_paths: [],
    include_descendants: true,
    notebook_path_style: "joined_slug",
    notebook_path_separator: "-",
    source_filename: "title",
  };
  root.joplin_sqlite_sync = sync;
  fs.writeFileSync(abs, YAML.stringify(root), "utf8");
}
