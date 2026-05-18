/**
 * Joplin Desktop Data API client (loopback HTTP, token query auth).
 *
 * @typedef {'preflight' | 'write'} JoplinApiPhase
 */

/**
 * @param {string} message
 * @returns {Error & { code: string }}
 */
function preflightFail(message) {
  const err = new Error(message);
  /** @type {Error & { code?: string }} */ (err).code = "JOPLIN_DATA_API_FAILED";
  return /** @type {Error & { code: string }} */ (err);
}

/**
 * @param {string} message
 * @returns {Error & { code: string }}
 */
function writeFail(message) {
  const err = new Error(message);
  /** @type {Error & { code?: string }} */ (err).code = "JOPLIN_DATA_API_WRITE_FAILED";
  return /** @type {Error & { code: string }} */ (err);
}

/**
 * @param {import('../config/load-config.js').AppConfig} cfg
 * @param {{ fetch?: typeof fetch }} [options]
 */
export async function runJoplinDataApiPreflight(cfg, options = {}) {
  const client = createJoplinDataApiClient(cfg, options);
  await client.pingWithRetries();
}

/**
 * @param {import('../config/load-config.js').AppConfig} cfg
 * @param {{ fetch?: typeof fetch }} [options]
 */
export function createJoplinDataApiClient(cfg, options = {}) {
  const api = cfg.joplin_data_api;
  const wb = cfg.joplin_wiki_writeback;
  const base = api.base_url.replace(/\/+$/, "");
  const token = api.token;
  const timeoutMs = api.timeout_ms;
  const maxAttempts = wb.max_cli_attempts;
  const fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);

  /**
   * @param {string} pathname
   * @param {Record<string, string | number>} [query]
   */
  function urlWithToken(pathname, query = {}) {
    const u = new URL(pathname.startsWith("/") ? pathname.slice(1) : pathname, `${base}/`);
    u.searchParams.set("token", token);
    for (const [k, v] of Object.entries(query)) {
      u.searchParams.set(k, String(v));
    }
    return u.toString();
  }

  /**
   * @param {JoplinApiPhase} phase
   * @param {() => Promise<Response>} fn
   */
  async function withRetries(phase, fn) {
    /** @type {unknown} */
    let last = undefined;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (e) {
        last = e;
        const code = /** @type {Error & { code?: string }} */ (e)?.code;
        if (code === "JOPLIN_DATA_API_FAILED" || code === "JOPLIN_DATA_API_WRITE_FAILED") {
          throw e;
        }
        if (!isRetryableError(e) || attempt === maxAttempts - 1) break;
      }
    }
    const msg =
      last instanceof Error ? last.message : String(last ?? "Joplin Data API request failed");
    throw phase === "preflight" ? preflightFail(msg) : writeFail(msg);
  }

  /**
   * @param {JoplinApiPhase} phase
   * @param {string} method
   * @param {string} pathname
   * @param {Record<string, string | number>} [query]
   * @param {unknown} [jsonBody]
   */
  async function requestJson(phase, method, pathname, query, jsonBody) {
    return await withRetries(phase, async () => {
      const url = urlWithToken(pathname, query ?? {});
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), timeoutMs);
      /** @type {RequestInit} */
      const init = {
        method,
        signal: controller.signal,
        headers: {},
      };
      if (jsonBody !== undefined) {
        init.headers = { "Content-Type": "application/json" };
        init.body = JSON.stringify(jsonBody);
      }
      let res;
      try {
        res = await fetchFn(url, init);
      } catch (e) {
        if (e?.name === "AbortError") {
          throw new Error(`Joplin Data API timeout after ${timeoutMs}ms`);
        }
        throw e;
      } finally {
        clearTimeout(t);
      }

      if (!res.ok) {
        let detail = "";
        try {
          const j = await res.json();
          if (j && typeof j === "object" && "error" in j)
            detail = `: ${String(/** @type {{ error?: unknown }} */ (j).error)}`;
        } catch {
          try {
            detail = `: ${(await res.text()).slice(0, 200)}`;
          } catch {
            /* ignore */
          }
        }
        const msg = `HTTP ${res.status}${detail}`;
        if (res.status === 503 || res.status === 429) {
          throw new Error(msg);
        }
        throw phase === "preflight" ? preflightFail(msg) : writeFail(msg);
      }

      if (res.status === 204) return null;
      const text = await res.text();
      if (!text.trim()) return null;
      try {
        return JSON.parse(text);
      } catch {
        throw phase === "preflight" ?
            preflightFail("invalid JSON from Joplin Data API")
          : writeFail("invalid JSON from Joplin Data API");
      }
    });
  }

  /**
   * @param {JoplinApiPhase} phase
   * @param {string} pathname
   * @param {Record<string, string | number>} [query]
   */
  async function fetchAllPages(phase, pathname, query = {}) {
    /** @type {unknown[]} */
    const out = [];
    let page = 1;
    while (true) {
      /** @type {Record<string, string | number>} */
      const q = { ...query, page };
      const data = await requestJson(phase, "GET", pathname, q);
      const items =
        data && typeof data === "object" && Array.isArray(/** @type {{ items?: unknown }} */ (data).items) ?
          /** @type {{ items: unknown[] }} */ (data).items
        : [];
      out.push(...items);
      const hasMore =
        data &&
        typeof data === "object" &&
        /** @type {{ has_more?: unknown }} */ (data).has_more === true;
      if (!hasMore || items.length === 0) break;
      page++;
      if (page > 10_000) throw writeFail("pagination exceeded safety limit");
    }
    return out;
  }

  return {
    /** @returns {Promise<void>} */
    async pingWithRetries() {
      await withRetries("preflight", async () => {
        const url = urlWithToken("/ping", {});
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), timeoutMs);
        let res;
        try {
          res = await fetchFn(url, { method: "GET", signal: controller.signal });
        } catch (e) {
          if (/** @type {{ name?: string }} */ (e).name === "AbortError") {
            throw new Error(`Joplin Data API timeout after ${timeoutMs}ms`);
          }
          throw e;
        } finally {
          clearTimeout(t);
        }
        if (!res.ok) {
          let detail = "";
          try {
            detail = `: ${(await res.text()).slice(0, 200)}`;
          } catch {
            /* ignore */
          }
          const msg = `HTTP ${res.status}${detail}`;
          if (res.status === 503 || res.status === 429) throw new Error(msg);
          throw preflightFail(msg);
        }
        await res.text().catch(() => "");
        return null;
      });
    },

    /**
     * Root-level folders (parent_id "").
     * @returns {Promise<{ id: string, parent_id: string, title?: string }[]>}
     */
    async listRootFolders() {
      const items = await fetchAllPages("write", "/folders", {});
      return items.filter(isFolderDto).filter((f) => f.parent_id === "");
    },

    /**
     * @param {string} parentId
     * @returns {Promise<{ id: string, parent_id: string, title?: string }[]>}
     */
    async listChildFolders(parentId) {
      const items = await fetchAllPages(
        "write",
        `/folders/${encodeURIComponent(parentId)}/folders`,
        {},
      );
      return items.filter(isFolderDto).filter((f) => f.parent_id === parentId);
    },

    /**
     * @param {string} title
     * @param {string} parentId
     */
    async createFolder(title, parentId) {
      await requestJson("write", "POST", "/folders", {}, {
        title,
        parent_id: parentId,
      });
    },

    /**
     * @param {string} folderId
     * @returns {Promise<{ id: string, title?: string, parent_id?: string }[]>}
     */
    async listNotesInFolder(folderId) {
      const items = await fetchAllPages(
        "write",
        `/folders/${encodeURIComponent(folderId)}/notes`,
        {},
      );
      return items.filter(isNoteDto);
    },

    /**
     * @param {string} parentFolderId
     * @param {string} title
     * @param {string} body
     */
    async createNote(parentFolderId, title, body) {
      await requestJson("write", "POST", "/notes", {}, {
        parent_id: parentFolderId,
        title,
        body,
      });
    },

    /**
     * @param {string} noteId
     * @param {string} body
     */
    async updateNoteBody(noteId, body) {
      await requestJson(
        "write",
        "PUT",
        `/notes/${encodeURIComponent(noteId)}`,
        {},
        { body },
      );
    },
  };
}

/**
 * @param {unknown} o
 * @returns {o is { id: string, parent_id: string, title?: string }}
 */
function isFolderDto(o) {
  return (
    o !== null &&
    typeof o === "object" &&
    typeof /** @type {{ id?: unknown }} */ (o).id === "string" &&
    typeof /** @type {{ parent_id?: unknown }} */ (o).parent_id === "string" &&
    !(/** @type {{ deleted_time?: number }} */ (o).deleted_time > 0)
  );
}

/**
 * @param {unknown} o
 * @returns {o is { id: string, title?: string, parent_id?: string }}
 */
function isNoteDto(o) {
  return (
    o !== null &&
    typeof o === "object" &&
    typeof /** @type {{ id?: unknown }} */ (o).id === "string" &&
    !(/** @type {{ deleted_time?: number }} */ (o).deleted_time > 0)
  );
}

/**
 * @param {unknown} e
 */
function isRetryableError(e) {
  if (!(e instanceof Error)) return false;
  if (e.message.includes("HTTP 503")) return true;
  if (e.message.includes("HTTP 429")) return true;
  if (e.message.includes("timeout")) return true;
  const name = /** @type {{ name?: string }} */ (e).name;
  if (name === "TypeError") return true;
  return false;
}
