import path from "node:path";

import { loadConfig } from "../config/load-config.js";
import { probeOllama } from "./probes/ollama-probe.js";
import { probeChroma } from "./probes/chroma-probe.js";
import { persistParentHint } from "./probes/fs-hints.js";

/**
 * @param {string} configPath
 * @param {{ fetch?: typeof fetch, chroma?: { ChromaStore?: typeof import('../vector/chroma-store.js').ChromaStore } }} [deps]
 */
export async function buildHealthSnapshot(configPath, deps = {}) {
  const resolved = path.resolve(configPath);
  try {
    const cfg = await loadConfig(resolved);
    const [ollama, chroma] = await Promise.all([
      probeOllama(cfg, deps),
      probeChroma(cfg, process.env, deps.chroma),
    ]);
    const filesystem = persistParentHint(cfg.chroma.persist_path);
    return {
      ok: true,
      configPathResolved: resolved,
      notesRoot: cfg.notes_root,
      ollama,
      chroma,
      filesystem,
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
