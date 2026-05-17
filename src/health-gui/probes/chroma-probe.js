import { ChromaStore } from "../../vector/chroma-store.js";

/**
 * @param {import('../../config/load-config.js').AppConfig} cfg
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ ChromaStore?: typeof ChromaStore }} [deps]
 */
export async function probeChroma(cfg, env = process.env, deps = {}) {
  const Store = deps.ChromaStore ?? ChromaStore;
  const host = env.CHROMA_HOST ?? "127.0.0.1";
  const port = Number(env.CHROMA_PORT ?? 8000);
  const persistPath = cfg.chroma.persist_path;
  const store = new Store({
    persistPath,
    host,
    port,
  });
  try {
    await store.heartbeat();
    return {
      reachable: true,
      host,
      port,
      persistPath,
      error: null,
    };
  } catch (e) {
    return {
      reachable: false,
      host,
      port,
      persistPath,
      error: String(/** @type {{ message?: string }} */ (e)?.message ?? e),
    };
  }
}
