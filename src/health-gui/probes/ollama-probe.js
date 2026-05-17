/**
 * @param {import('../../config/load-config.js').AppConfig} cfg
 * @param {{ fetch?: typeof fetch }} [deps]
 */
export async function probeOllama(cfg, deps = {}) {
  const fetchFn = deps.fetch ?? globalThis.fetch;
  const baseUrl = cfg.ollama.base_url.replace(/\/+$/, "");
  const timeoutMs = Math.min(5000, cfg.ollama.timeout_ms);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    if (!fetchFn) {
      throw new Error("fetch is not available");
    }
    const res = await fetchFn(`${baseUrl}/api/tags`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      return {
        reachable: false,
        baseUrl,
        latencyMs: null,
        models: [],
        missingModels: [],
        error: `HTTP ${res.status}`,
      };
    }
    /** @type {{ models?: unknown }} */
    const data = /** @type {*} */ (await res.json());
    const models = [];
    if (Array.isArray(data.models)) {
      for (const m of data.models) {
        if (typeof m === "object" && m !== null) {
          const name =
            "name" in m && typeof /** @type {{ name?: unknown }} */ (m).name === "string"
              ? /** @type {{ name: string }} */ (m).name
              : "model" in m &&
                  typeof /** @type {{ model?: unknown }} */ (m).model === "string"
                ? /** @type {{ model: string }} */ (m).model
                : null;
          if (name) models.push(name);
        }
      }
    }
    const need = [cfg.ollama.embed_model, cfg.ollama.chat_model].filter(Boolean);
    const missingModels = need.filter((n) => !models.includes(n));
    return {
      reachable: true,
      baseUrl,
      latencyMs,
      models,
      missingModels,
      error: null,
    };
  } catch (e) {
    clearTimeout(timer);
    return {
      reachable: false,
      baseUrl,
      latencyMs: null,
      models: [],
      missingModels: [],
      error: String(/** @type {{ message?: string }} */ (e)?.message ?? e),
    };
  }
}
