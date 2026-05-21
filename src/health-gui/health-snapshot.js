import path from "node:path";

import { loadConfig } from "../config/load-config.js";
import { probeOllama } from "./probes/ollama-probe.js";

/**
 * @param {string} configPath
 * @param {{ fetch?: typeof fetch }} [deps]
 */
export async function buildHealthSnapshot(configPath, deps = {}) {
  const resolved = path.resolve(configPath);
  try {
    const cfg = await loadConfig(resolved);
    const ollama = await probeOllama(cfg, deps);
    return {
      ok: true,
      configPathResolved: resolved,
      rawRoot: cfg.raw,
      wikiRoot: cfg.wiki,
      ollama,
    };
  } catch (err) {
    const code = /** @type {Error & { code?: string }} */ (err).code;
    return {
      ok: false,
      configPathResolved: resolved,
      code: code ?? "CONFIG_INVALID",
      message: String(/** @type {Error} */ (err).message ?? err),
    };
  }
}
