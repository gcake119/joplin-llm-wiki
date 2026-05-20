import { spawn } from "node:child_process";
import path from "node:path";

import { loadConfig } from "../../config/load-config.js";
import { discoverMarkdown } from "../../fs/note-discovery.js";
import { tail512 } from "../stack/stack-script-runner.js";

/** Non-reentrant pipeline guard (Health GUI single operator). */
let pipelineBusy = false;

/**
 * @typedef {{
 *   kind: "precheck",
 *   message: string,
 * } | {
 *   kind: "sqlite_skipped",
 *   message: string,
 * } | {
 *   kind: "phase_start",
 *   phase: "sqlite-sync" | "index" | "wiki-compile" | "agent-compile",
 *   label: string,
 * } | {
 *   kind: "phase_stream",
 *   phase: "sqlite-sync" | "index" | "wiki-compile" | "agent-compile",
 *   channel: "stdout" | "stderr",
 *   text: string,
 * } | {
 *   kind: "phase_end",
 *   phase: "sqlite-sync" | "index" | "wiki-compile" | "agent-compile",
 *   exitCode: number | null,
 *   spawnFailed: boolean,
 * }} PipelineProgressEvent
 */

function emptyPhase() {
  return { exitCode: /** @type {number | null} */ (null), stdoutTail: "", stderrTail: "" };
}

/**
 * @param {{ skipped?: boolean }} [opts]
 */
function emptySqlitePhase(opts = {}) {
  return {
    exitCode: /** @type {number | null} */ (null),
    stdoutTail: "",
    stderrTail: "",
    skipped: opts.skipped === true,
  };
}

/**
 * @param {(line: string) => void} onLine
 * @returns {(chunk: string | Buffer) => void}
 */
function lineSplitter(onLine) {
  let buf = "";
  return (chunk) => {
    buf += String(chunk);
    let i;
    while ((i = buf.indexOf("\n")) !== -1) {
      onLine(buf.slice(0, i));
      buf = buf.slice(i + 1);
    }
  };
}

/**
 * @param {typeof spawn} spawnImpl
 * @param {string} root
 * @param {string} configAbs
 * @param {"index" | "wiki-compile" | "sqlite-sync" | "agent-compile"} subcommand
 * @param {string[]} [extraArgv]
 * @param {null | ((e: PipelineProgressEvent) => void)} [progress]
 */
function runPhase(spawnImpl, root, configAbs, subcommand, extraArgv = [], progress = null) {
  const label =
    subcommand === "sqlite-sync"
      ? "sqlite-sync --export-only"
      : subcommand === "agent-compile"
        ? "joplin-llm-wiki agent-compile"
      : `joplin-llm-wiki ${subcommand}`;
  return new Promise((resolve) => {
    let out = "";
    let err = "";
    progress?.({
      kind: "phase_start",
      phase: subcommand,
      label,
    });

    const pushOut = lineSplitter((line) => {
      progress?.({ kind: "phase_stream", phase: subcommand, channel: "stdout", text: line });
    });
    const pushErr = lineSplitter((line) => {
      progress?.({ kind: "phase_stream", phase: subcommand, channel: "stderr", text: line });
    });

    const child = spawnImpl(
      "pnpm",
      ["exec", "joplin-llm-wiki", subcommand, "--config", configAbs, ...extraArgv],
      {
        cwd: root,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    child.stdout?.on("data", (c) => {
      const s = String(c);
      out += s;
      if (out.length > 65536) out = out.slice(-65536);
      pushOut(s);
    });
    child.stderr?.on("data", (c) => {
      const s = String(c);
      err += s;
      if (err.length > 65536) err = err.slice(-65536);
      pushErr(s);
    });
    const finish = (exitCode, spawnFailed) => {
      progress?.({
        kind: "phase_end",
        phase: subcommand,
        exitCode,
        spawnFailed,
      });
    };
    child.on("error", (e) => {
      finish(null, true);
      resolve({
        exitCode: null,
        stdoutTail: tail512(out),
        stderrTail: tail512(`${err}${/** @type {Error} */ (e).message}`),
        spawnFailed: true,
      });
    });
    child.on("close", (exitCode) => {
      finish(exitCode, false);
      resolve({
        exitCode,
        stdoutTail: tail512(out),
        stderrTail: tail512(err),
        spawnFailed: false,
      });
    });
  });
}

/**
 * @param {{ exitCode: number | null, stdoutTail: string, stderrTail: string, spawnFailed: boolean }} res
 */
function assignPhase(target, res) {
  target.exitCode = res.exitCode;
  target.stdoutTail = res.stdoutTail;
  target.stderrTail = res.stderrTail;
}

/**
 * @param {typeof spawn} spawnImpl
 * @param {string} root
 * @param {string} configAbs
 * @param {null | ((e: PipelineProgressEvent) => void)} [progress]
 */
async function runIndexThenWiki(spawnImpl, root, configAbs, progress = null, compileMode = "local") {
  const index = emptyPhase();
  const wikiCompile = emptyPhase();

  if (compileMode === "agent") {
    const agentRes = await runPhase(spawnImpl, root, configAbs, "agent-compile", [], progress);
    assignPhase(wikiCompile, agentRes);
    if (agentRes.spawnFailed) return { ok: false, code: "SPAWN_ERROR", index, wikiCompile };
    if (agentRes.exitCode !== 0) return { ok: false, code: "AGENT_COMPILE_FAILED", index, wikiCompile };
    return { ok: true, code: "OK", index, wikiCompile };
  }

  const idxRes = await runPhase(spawnImpl, root, configAbs, "index", [], progress);
  assignPhase(index, idxRes);

  if (idxRes.spawnFailed) {
    return { ok: false, code: "SPAWN_ERROR", index, wikiCompile };
  }
  if (idxRes.exitCode !== 0) {
    return { ok: false, code: "INDEX_FAILED", index, wikiCompile };
  }

  const wikiRes = await runPhase(spawnImpl, root, configAbs, "wiki-compile", [], progress);
  assignPhase(wikiCompile, wikiRes);

  if (wikiRes.spawnFailed) {
    return { ok: false, code: "SPAWN_ERROR", index, wikiCompile };
  }
  if (wikiRes.exitCode !== 0) {
    return { ok: false, code: "WIKI_COMPILE_FAILED", index, wikiCompile };
  }

  return { ok: true, code: "OK", index, wikiCompile };
}

/**
 * Run index then wiki-compile via pnpm exec (same cwd and config as CLI).
 *
 * @param {string} repoRoot
 * @param {string} configPathAbs
 * @param {{ confirmed?: boolean, compileMode?: string }} payload
 * @param {typeof spawn} [spawnImpl]
 * @param {null | ((e: PipelineProgressEvent) => void)} [progress]
 */
export async function runCorpusPipeline(repoRoot, configPathAbs, payload, spawnImpl = spawn, progress = null) {
  if (payload.confirmed !== true) {
    return {
      ok: false,
      code: "CONFIRMATION_REQUIRED",
      index: emptyPhase(),
      wikiCompile: emptyPhase(),
    };
  }

  if (pipelineBusy) {
    return {
      ok: false,
      code: "PIPELINE_IN_FLIGHT",
      index: emptyPhase(),
      wikiCompile: emptyPhase(),
    };
  }

  pipelineBusy = true;
  const root = path.resolve(repoRoot);
  const configAbs = path.resolve(configPathAbs);

  try {
    return await runIndexThenWiki(
      spawnImpl,
      root,
      configAbs,
      progress,
      payload.compileMode === "agent" ? "agent" : "local",
    );
  } finally {
    pipelineBusy = false;
  }
}

/**
 * When notes_root has no matching markdown: run sqlite-sync (requires
 * joplin_sqlite_sync.enabled), then index + wiki-compile. Otherwise same as corpus only phases.
 *
 * @param {string} repoRoot
 * @param {string} configPathAbs
 * @param {{ confirmed?: boolean, compileMode?: string }} payload
 * @param {typeof spawn} [spawnImpl]
 * @param {{ loadConfig?: typeof loadConfig, discoverMarkdown?: typeof discoverMarkdown }} [deps]
 * @param {null | ((e: PipelineProgressEvent) => void)} [progress]
 */
export async function runInitPipeline(
  repoRoot,
  configPathAbs,
  payload,
  spawnImpl = spawn,
  deps = {},
  progress = null,
) {
  const load = deps.loadConfig ?? loadConfig;
  const discover = deps.discoverMarkdown ?? discoverMarkdown;

  if (payload.confirmed !== true) {
    return {
      ok: false,
      code: "CONFIRMATION_REQUIRED",
      sqliteSync: emptySqlitePhase(),
      index: emptyPhase(),
      wikiCompile: emptyPhase(),
    };
  }

  if (pipelineBusy) {
    return {
      ok: false,
      code: "PIPELINE_IN_FLIGHT",
      sqliteSync: emptySqlitePhase(),
      index: emptyPhase(),
      wikiCompile: emptyPhase(),
    };
  }

  pipelineBusy = true;
  const root = path.resolve(repoRoot);
  const configAbs = path.resolve(configPathAbs);

  try {
    /** @type {import('../../config/load-config.js').AppConfig} */
    let cfg;
    try {
      cfg = await load(configAbs);
    } catch (e) {
      const code = /** @type {Error & { code?: string }} */ (e).code ?? "CONFIG_INVALID";
      return {
        ok: false,
        code,
        message: String(/** @type {Error} */ (e).message),
        sqliteSync: emptySqlitePhase(),
        index: emptyPhase(),
        wikiCompile: emptyPhase(),
      };
    }

    progress?.({ kind: "precheck", message: "檢查 notes_root 是否已有筆記…" });
    const notesAbs = path.resolve(cfg.notes_root);
    const files = await discover(notesAbs, cfg.notes_glob);
    /** @type {{ exitCode: number | null, stdoutTail: string, stderrTail: string, skipped: boolean }} */
    let sqliteSync = emptySqlitePhase({ skipped: true });

    if (files.length === 0) {
      if (!cfg.joplin_sqlite_sync.enabled) {
        return {
          ok: false,
          code: "INIT_EMPTY_NOTES",
          message:
            "notes_root 無符合 notes_glob 的 .md；請在 config 啟用 joplin_sqlite_sync（含 database_path），或手動放入筆記後再試。",
          sqliteSync: emptySqlitePhase(),
          index: emptyPhase(),
          wikiCompile: emptyPhase(),
        };
      }

      const sqlRes = await runPhase(spawnImpl, root, configAbs, "sqlite-sync", ["--export-only"], progress);
      sqliteSync = {
        exitCode: sqlRes.exitCode,
        stdoutTail: sqlRes.stdoutTail,
        stderrTail: sqlRes.stderrTail,
        skipped: false,
      };

      if (sqlRes.spawnFailed) {
        return {
          ok: false,
          code: "SPAWN_ERROR",
          sqliteSync,
          index: emptyPhase(),
          wikiCompile: emptyPhase(),
        };
      }
      if (sqlRes.exitCode !== 0) {
        return {
          ok: false,
          code: "SQLITE_SYNC_FAILED",
          sqliteSync,
          index: emptyPhase(),
          wikiCompile: emptyPhase(),
        };
      }
    } else {
      progress?.({
        kind: "sqlite_skipped",
        message: "notes_root 已有筆記，略過 SQLite 匯出。",
      });
    }

    const tail = await runIndexThenWiki(
      spawnImpl,
      root,
      configAbs,
      progress,
      payload.compileMode === "agent" ? "agent" : "local",
    );
    return {
      ok: tail.ok,
      code: tail.code,
      sqliteSync,
      index: tail.index,
      wikiCompile: tail.wikiCompile,
    };
  } finally {
    pipelineBusy = false;
  }
}
