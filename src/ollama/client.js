const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @typedef {{
 *   baseUrl: string,
 *   chatModel: string,
 *   timeoutMs: number,
 * }} OllamaOpts
 */

export class OllamaClient {
  /** @param {OllamaOpts} opts */
  constructor(opts) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.chatModel = opts.chatModel;
    this.timeoutMs = opts.timeoutMs;
  }

  /**
   * @param {{
   *   system?: string,
   *   prompt: string,
   *   jsonMode?: boolean,
   *   timeoutMs?: number,
   * }} args
   */
  async chatComplete(args) {
    let lastErr;
    const timeoutMs = args.timeoutMs ?? this.timeoutMs;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), timeoutMs);
        try {
          const res = await fetch(`${this.baseUrl}/api/chat`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              model: this.chatModel,
              stream: false,
              format: args.jsonMode ? "json" : undefined,
              messages: [
                ...(args.system
                  ? [{ role: "system", content: args.system }]
                  : []),
                { role: "user", content: args.prompt },
              ],
            }),
            signal: ctrl.signal,
          });
          if (!res.ok) throw new Error(`chat HTTP ${res.status}`);
          /** @type {{ message?: { content?: string } }} */
          const body = await res.json();
          const text = body.message?.content ?? "";
          return text;
        } finally {
          clearTimeout(t);
        }
      } catch (e) {
        lastErr = e;
        await sleep(200 * 2 ** attempt);
      }
    }
    const err = new Error(
      `Ollama chat failed after retries: ${lastErr?.message ?? lastErr}`,
    );
    /** @type {Error & { code?: string }} */ (err).code = "OLLAMA_UNAVAILABLE";
    throw err;
  }
}
