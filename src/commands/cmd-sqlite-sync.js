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

const defaultDeps = {
  loadConfig,
  exportNotesFromSqlite,
  openReadonlyDatabase,
  listNotebooksFromSqlite,
  /** @param {{ configPath: string, argv: string[], opts: Map<string, string> }} ctx */
  runWikiCompile: (ctx) => runWikiCompile(ctx),
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
  let cfg = await deps.loadConfig(ctx.configPath);
  let sync = cfg.joplin_sqlite_sync;
  const exportOnlyCli = ctx.opts.get("export-only") === "true";
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
    const summary = await runOneExportAndOptionalPipeline(ctx, cfg, true, deps, exportOnlyCli);
    console.log(JSON.stringify({ cycle: 1, ...summary }));
    return 0;
  }

  if (!intervalSec) {
    const summary = await runOneExportAndOptionalPipeline(ctx, cfg, false, deps, exportOnlyCli);
    console.log(JSON.stringify({ cycle: 1, ...summary }));
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
      const summary = await runOneExportAndOptionalPipeline(ctx, cfg, false, deps, exportOnlyCli);
      console.log(JSON.stringify({ cycle, ...summary }));
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
  if (dryRun) {
    return { ...summary, dry_run: true };
  }
  if (exportOnlyCli) {
    return { ...summary, export_only: true };
  }
  if (sync.pipeline.run_wiki_compile) {
    await deps.runWikiCompile(ctx);
  }
  return summary;
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
