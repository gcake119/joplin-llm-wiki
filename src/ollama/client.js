const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @typedef {{
 *   baseUrl: string,
 *   embedModel: string,
 *   chatModel: string,
 *   timeoutMs: number,
 *   embedBatchSize: number,
 * }} OllamaOpts
 */

export class OllamaClient {
  /** @param {OllamaOpts} opts */
  constructor(opts) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.embedModel = opts.embedModel;
    this.chatModel = opts.chatModel;
    this.timeoutMs = opts.timeoutMs;
    this.embedBatchSize = opts.embedBatchSize;
    /** Exposed for tests */
    this.embedCalls = 0;
  }

  /**
   * @param {string[]} inputs
   * @returns {Promise<number[][]>}
   */
  async embedBatch(inputs) {
    const out = [];
    for (let i = 0; i < inputs.length; i += this.embedBatchSize) {
      const batch = inputs.slice(i, i + this.embedBatchSize);
      if (batch.length === 1) {
        out.push(await this._embedOneWithRetry(batch[0]));
      } else {
        const vectors = await this._embedMultiWithRetry(batch);
        out.push(...vectors);
      }
    }
    return out;
  }

  /**
   * @param {string} input
   */
  async _embedOneWithRetry(input) {
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        this.embedCalls++;
        return await this._postEmbeddingPayload(input);
      } catch (e) {
        lastErr = e;
        await sleep(200 * 2 ** attempt);
      }
    }
    const err = new Error(
      `Ollama embeddings failed after retries: ${lastErr?.message ?? lastErr}`,
    );
    /** @type {Error & { code?: string }} */ (err).code = "OLLAMA_UNAVAILABLE";
    throw err;
  }

  /**
   * @param {string[]} inputs
   */
  async _embedMultiWithRetry(inputs) {
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        this.embedCalls++;
        return await this._postEmbeddingPayload(inputs);
      } catch (e) {
        lastErr = e;
        await sleep(200 * 2 ** attempt);
      }
    }
    const err = new Error(
      `Ollama embeddings failed after retries: ${lastErr?.message ?? lastErr}`,
    );
    /** @type {Error & { code?: string }} */ (err).code = "OLLAMA_UNAVAILABLE";
    throw err;
  }

  /**
   * Prefer Ollama `POST /api/embed` (returns `embeddings: number[][]`).
   * Fall back to legacy `POST /api/embeddings` (often only `embedding` for single input).
   *
   * @param {string|string[]} input
   */
  async _postEmbeddingPayload(input) {
    const multi = Array.isArray(input);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      let res = await fetch(`${this.baseUrl}/api/embed`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: this.embedModel, input }),
        signal: ctrl.signal,
      });

      if (!res.ok && (res.status === 404 || res.status === 405)) {
        res = await fetch(`${this.baseUrl}/api/embeddings`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ model: this.embedModel, input }),
          signal: ctrl.signal,
        });
      }

      if (!res.ok) {
        throw new Error(`embed HTTP ${res.status}`);
      }

      /** @type {{ embedding?: number[], embeddings?: number[][] }} */
      const body = await res.json();
      if (Array.isArray(body.embeddings)) {
        if (!multi) {
          const row = body.embeddings[0];
          if (!row) throw new Error("embeddings[0] missing");
          return row;
        }
        if (body.embeddings.length !== input.length) {
          throw new Error("embeddings length mismatch");
        }
        return body.embeddings;
      }
      if (body.embedding) {
        if (multi) {
          throw new Error("batch response missing embeddings[]");
        }
        return body.embedding;
      }
      throw new Error("unexpected embeddings response shape");
    } finally {
      clearTimeout(t);
    }
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
