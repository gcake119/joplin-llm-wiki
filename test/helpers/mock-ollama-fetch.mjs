/** @type {typeof fetch | null} */
let origFetch = null;

/**
 * @param {{
 *   chatResponses?: { test?(url: string, body: Record<string, unknown>): string },
 * }} opts
 */
export function installMockOllamaFetch(opts = {}) {
  origFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (method !== "POST") {
      return new Response("unsupported", { status: 405 });
    }
    /** @type {Record<string, unknown>} */
    let body = {};
    try {
      body = JSON.parse(String(init?.body ?? "{}"));
    } catch {
      body = {};
    }

    if (url.includes("/api/chat")) {
      let content =
        '{"paths":["index.md","topics/overview.md","stub/page.md"]}';
      if (opts.chatResponses?.test) {
        content = opts.chatResponses.test(url, body);
      }
      return new Response(
        JSON.stringify({
          message: { content },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    if (origFetch) return origFetch(input, init);
    return new Response("no upstream", { status: 500 });
  };

  return () => {
    globalThis.fetch = /** @type {typeof fetch} */ (origFetch ?? fetch);
    origFetch = null;
  };
}
