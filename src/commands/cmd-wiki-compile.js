import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "../config/load-config.js";
import { runWikiCompileFlow } from "../wiki/wiki-compiler.js";
import { discoverMarkdown } from "../fs/note-discovery.js";
import {
  resolveSweepStatePath,
  readSweepState,
  writeSweepStateAtomic,
  initialSweepState,
  reconcileFingerprint,
} from "../wiki/corpus-sweep-state.js";

/**
 * @param {{
 *   configPath: string,
 *   argv: string[],
 *   opts: Map<string, string>,
 * }} ctx
 * @returns {Promise<number>}
 */
export async function runWikiCompile(ctx) {
  const cfgBase = await loadConfig(ctx.configPath);
  if (ctx.opts.has("resume-stage")) {
    await runWikiCompileFlow({ ctx, cfg: cfgBase });
    return 0;
  }

  const batchFallback =
    ctx.opts.get("batch") === "true" ||
    ctx.opts.get("full-library") === "false" ||
    ctx.opts.get("full-scan") === "false" ||
    ctx.opts.get("corpus-sweep") === "false";
  const sweepWanted = !batchFallback;

  if (!sweepWanted) {
    await runWikiCompileFlow({ ctx });
    return 0;
  }

  if (!cfgBase.wiki_ingest.corpus_mode_enabled) {
    const err = new Error(
      "corpus_auto_sweep requires wiki_ingest.corpus_mode_enabled true",
    );
    /** @type {Error & { code?: string }} */ (err).code = "CONFIG_INVALID";
    throw err;
  }

  const cfg = {
    ...cfgBase,
    wiki_ingest: {
      ...cfgBase.wiki_ingest,
      corpus_auto_sweep: {
        ...cfgBase.wiki_ingest.corpus_auto_sweep,
        enabled: true,
        run_until_cycle_complete: true,
      },
    },
  };

  const dryRun = ctx.opts.get("dry-run") === "true";
  const advanceOk =
    !dryRun || cfg.wiki_ingest.corpus_auto_sweep.advance_state_on_dry_run;

  if (dryRun && cfg.wiki_ingest.corpus_auto_sweep.advance_state_on_dry_run) {
    console.error(
      JSON.stringify({
        warning: "CORPUS_SWEEP_DRY_RUN_ADVANCE",
        message:
          "dry-run advances corpus sweep state because advance_state_on_dry_run is true",
      }),
    );
  }

  const rawRoot = path.resolve(cfg.raw);
  const allNotes = await discoverMarkdown(rawRoot, cfg.raw_glob);
  const n = allNotes.length;

  if (n === 0) {
    await runWikiCompileFlow({ ctx, cfg });
    return 0;
  }

  if (!cfg.wiki?.trim()) {
    const err = new Error("wiki required for wiki-compile");
    /** @type {Error & { code?: string }} */ (err).code = "CONFIG_INVALID";
    throw err;
  }

  const wikiRoot = path.resolve(cfg.wiki);
  fs.mkdirSync(wikiRoot, { recursive: true });

  const sweep = cfg.wiki_ingest.corpus_auto_sweep;
  const maxWRaw = sweep.max_windows_per_invocation;
  const maxW =
    dryRun && !sweep.advance_state_on_dry_run ? 1 : maxWRaw;

  const runUntil =
    sweep.run_until_cycle_complete && advanceOk && !dryRun;
  const maxTotal = sweep.max_total_windows_per_invocation;

  const statePath = resolveSweepStatePath(cfg);
  let state =
    readSweepState(statePath) ??
    initialSweepState(sweep.step_files);

  const step = sweep.step_files;
  const reconciled = reconcileFingerprint(state, n, step);
  state = reconciled.state;

  if (reconciled.fingerprint_reset) {
    console.error(
      JSON.stringify({
        warning: "CORPUS_SWEEP_FINGERPRINT_RESET",
        markdown_file_count: n,
        next_offset: state.next_offset,
      }),
    );
  }

  const modulus = Math.max(n, 1);
  const invocationStartOffset = state.next_offset;
  let totalWindowsExecuted = 0;
  let cycleComplete = false;
  let truncated = false;

  do {
    const batch = await runSweepWindowBatch({
      ctx,
      cfg,
      state,
      statePath,
      n,
      modulus,
      step,
      maxW,
      advanceOk,
      windowIndexBase: totalWindowsExecuted,
      invocationStartOffset,
    });

    state = batch.state;
    totalWindowsExecuted += batch.windowsExecuted;
    cycleComplete = batch.cycleComplete;

    if (!runUntil) {
      truncated = batch.truncated;
      break;
    }
    if (cycleComplete) {
      truncated = false;
      break;
    }
    if (totalWindowsExecuted >= maxTotal) {
      truncated = true;
      break;
    }
    truncated = true;
  } while (runUntil);

  console.log(
    JSON.stringify({
      corpus_sweep: {
        windows_executed: totalWindowsExecuted,
        total_windows_executed: totalWindowsExecuted,
        state_path: statePath,
        truncated,
        cycle_complete: cycleComplete,
        max_windows_per_invocation: maxWRaw,
        max_total_windows_per_invocation: maxTotal,
        run_until_cycle_complete: runUntil,
      },
    }),
  );

  return 0;
}

/**
 * @param {{
 *   ctx: { configPath: string, argv: string[], opts: Map<string, string> },
 *   cfg: import('../config/load-config.js').AppConfig,
 *   state: import('../wiki/corpus-sweep-state.js').SweepState,
 *   statePath: string,
 *   n: number,
 *   modulus: number,
 *   step: number,
 *   maxW: number,
 *   advanceOk: boolean,
 *   windowIndexBase: number,
 *   invocationStartOffset: number,
 * }} args
 */
async function runSweepWindowBatch(args) {
  const {
    ctx,
    cfg,
    statePath,
    n,
    modulus,
    step,
    maxW,
    advanceOk,
    windowIndexBase,
    invocationStartOffset,
  } = args;
  let state = args.state;
  let cycleComplete = false;
  let windowsExecuted = 0;

  for (let w = 0; w < maxW; w++) {
    const effectiveOffset = ((state.next_offset % modulus) + modulus) % modulus;

    console.error(
      JSON.stringify({
        warning: "CORPUS_SWEEP_WINDOW",
        window_index: windowIndexBase + w,
        effective_offset: effectiveOffset,
        digest_count: Math.min(n, cfg.wiki_ingest.corpus_digest_max_files),
        state_path: statePath,
      }),
    );

    const effectiveCfg = {
      ...cfg,
      wiki_ingest: {
        ...cfg.wiki_ingest,
        corpus_digest_offset: effectiveOffset,
      },
    };

    await runWikiCompileFlow({
      ctx,
      cfg: effectiveCfg,
      sweepContext: {
        windowIndex: windowIndexBase + w,
        maxWindows: maxW,
        statePath,
        windowsExecuted: windowIndexBase + w + 1,
        truncated: false,
        cycleComplete: false,
      },
    });

    windowsExecuted = w + 1;

    if (!advanceOk) break;

    state.next_offset = (state.next_offset + step) % modulus;
    state.markdown_file_count = n;
    state.step_files = step;
    state.updated_at_ms = Date.now();
    writeSweepStateAtomic(statePath, state);

    if (
      windowsExecuted > 0 &&
      (state.next_offset === invocationStartOffset ||
        cfg.wiki_ingest.corpus_digest_max_files >= n ||
        step >= n)
    ) {
      cycleComplete = true;
      break;
    }
  }

  const truncated = !cycleComplete && windowsExecuted >= maxW;

  return { state, windowsExecuted, cycleComplete, truncated };
}
