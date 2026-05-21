import { spawn } from "node:child_process";
import path from "node:path";

import { loadConfig } from "../../config/load-config.js";
import { probeOllama } from "../probes/ollama-probe.js";

/** @type {{ ollamaServe: boolean }} */
const busy = {
  ollamaServe: false,
};

function busyKey(kind) {
  return "ollamaServe";
}

/**
 * @param {typeof spawn} spawnImpl
 * @param {string} cmd
 * @param {string[]} args
 * @param {import('node:child_process').SpawnOptions} opts
 */
function spawnDetached(spawnImpl, cmd, args, opts) {
  return new Promise((resolve) => {
    const child = spawnImpl(cmd, args, opts);
    let settled = false;
    child.once("error", (err) => {
      if (settled) return;
      settled = true;
      resolve({
        ok: false,
        code: "SPAWN_ERROR",
        message: String(/** @type {Error} */ (err).message),
      });
    });
    child.once("spawn", () => {
      if (settled) return;
      settled = true;
      if (typeof child.unref === "function") {
        child.unref();
      }
      resolve({
        ok: true,
        code: "OK",
        pid: child.pid ?? null,
      });
    });
  });
}

/**
 * @param {string} repoRoot
 * @param {string} configPath
 * @param {{ kind: string, confirmed?: boolean }} payload
 * @param {{
 *   spawn?: typeof spawn,
 *   loadConfig?: typeof loadConfig,
 *   probeOllama?: typeof probeOllama,
 *   env?: NodeJS.ProcessEnv,
 * }} [deps]
 */
export async function startLocalDependency(repoRoot, configPath, payload, deps = {}) {
  const spawnImpl = deps.spawn ?? spawn;
  const loadCfg = deps.loadConfig ?? loadConfig;
  const probeOll = deps.probeOllama ?? probeOllama;
  const procEnv = deps.env ?? process.env;

  if (!payload || typeof payload !== "object") {
    return { ok: false, code: "BAD_REQUEST" };
  }
  if (payload.confirmed !== true) {
    return { ok: false, code: "CONFIRMATION_REQUIRED" };
  }
  const kind = payload.kind;
  if (kind !== "ollama-serve") {
    return { ok: false, code: "UNKNOWN_KIND" };
  }

  const bk = busyKey(kind);
  if (busy[bk]) {
    return { ok: false, code: "SKIPPED_IN_FLIGHT" };
  }
  busy[bk] = true;

  try {
    /** @type {import('../../config/load-config.js').AppConfig} */
    let cfg;
    try {
      cfg = await loadCfg(path.resolve(configPath));
    } catch (err) {
      const code = /** @type {Error & { code?: string }} */ (err).code;
      return {
        ok: false,
        code: code ?? "CONFIG_INVALID",
        message: String(/** @type {Error} */ (err).message),
      };
    }

    const root = path.resolve(repoRoot);

    const ollamaStatus = await probeOll(cfg);
    if (ollamaStatus.reachable) {
      return { ok: false, code: "ALREADY_RUNNING" };
    }

    return spawnDetached(spawnImpl, "ollama", ["serve"], {
      cwd: root,
      detached: true,
      stdio: "ignore",
      env: { ...procEnv },
    });
  } finally {
    busy[bk] = false;
  }
}
