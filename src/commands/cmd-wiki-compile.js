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
  const cliSweep = ctx.opts.get("corpus-sweep") === "true";
  const sweepWanted =
    cliSweep || cfgBase.wiki_ingest.corpus_auto_sweep.enabled;

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

  const cfg =
    cliSweep && !cfgBase.wiki_ingest.corpus_auto_sweep.enabled ?
      {
        ...cfgBase,
        wiki_ingest: {
          ...cfgBase.wiki_ingest,
          corpus_auto_sweep: {
            ...cfgBase.wiki_ingest.corpus_auto_sweep,
            enabled: true,
          },
        },
      }
    : cfgBase;

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

  const notesRoot = path.resolve(cfg.notes_root);
  const allNotes = await discoverMarkdown(notesRoot, cfg.notes_glob);
  const n = allNotes.length;

  if (n === 0) {
    await runWikiCompileFlow({ ctx, cfg });
    return 0;
  }

  if (!cfg.wiki_root?.trim()) {
    const err = new Error("wiki_root required for wiki-compile");
    /** @type {Error & { code?: string }} */ (err).code = "CONFIG_INVALID";
    throw err;
  }

  const wikiRoot = path.resolve(cfg.wiki_root);
  fs.mkdirSync(wikiRoot, { recursive: true });

  const maxWRaw = cfg.wiki_ingest.corpus_auto_sweep.max_windows_per_invocation;
  const maxW =
    dryRun && !cfg.wiki_ingest.corpus_auto_sweep.advance_state_on_dry_run ?
      1
    : maxWRaw;

  const statePath = resolveSweepStatePath(cfg);
  let state =
    readSweepState(statePath) ??
    initialSweepState(cfg.wiki_ingest.corpus_auto_sweep.step_files);

  const step = cfg.wiki_ingest.corpus_auto_sweep.step_files;
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

  const initialLoopOffset = state.next_offset;
  let cycleComplete = false;
  /** @type {number} */
  let windowsExecuted = 0;

  const modulus = Math.max(n, 1);

  for (let w = 0; w < maxW; w++) {
    const effectiveOffset = ((state.next_offset % modulus) + modulus) % modulus;

    console.error(
      JSON.stringify({
        warning: "CORPUS_SWEEP_WINDOW",
        window_index: w,
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
        windowIndex: w,
        maxWindows: maxW,
        statePath,
        windowsExecuted: w + 1,
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

    if (windowsExecuted > 0 && state.next_offset === initialLoopOffset) {
      cycleComplete = true;
      break;
    }
  }

  const truncated = !cycleComplete && windowsExecuted >= maxW;

  console.log(
    JSON.stringify({
      corpus_sweep: {
        windows_executed: windowsExecuted,
        state_path: statePath,
        truncated,
        cycle_complete: cycleComplete,
        max_windows_per_invocation: maxWRaw,
      },
    }),
  );

  return 0;
}
