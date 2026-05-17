import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { loadConfig } from "../config/load-config.js";
import { exportNotesFromSqlite } from "../joplin/sqlite/exporter.js";
import { runIndex } from "./cmd-index.js";
import { runWikiCompile } from "./cmd-wiki-compile.js";

const defaultDeps = {
  loadConfig,
  exportNotesFromSqlite,
  /** @param {{ configPath: string, argv: string[], opts: Map<string, string> }} ctx */
  runIndex: (ctx) => runIndex(ctx),
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
  const cfg = await deps.loadConfig(ctx.configPath);
  const sync = cfg.joplin_sqlite_sync;
  const exportOnlyCli = ctx.opts.get("export-only") === "true";
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
  });
  if (dryRun) {
    return { ...summary, dry_run: true };
  }
  if (exportOnlyCli) {
    return { ...summary, export_only: true };
  }
  if (sync.pipeline.run_index) {
    await deps.runIndex(ctx);
  }
  if (sync.pipeline.run_wiki_compile) {
    await deps.runWikiCompile(ctx);
  }
  return summary;
}

export { defaultDeps };
