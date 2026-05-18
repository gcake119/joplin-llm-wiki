import { test } from "node:test";
import assert from "node:assert";
import { createJoplinDataApiClient } from "../src/joplin/data-api-client.js";

/** @returns {import("../src/config/load-config.js").AppConfig} */
function minimalCfg() {
  return {
    joplin_data_api: {
      base_url: "http://127.0.0.1:41184",
      token: "tkn-test",
      timeout_ms: 10_000,
    },
    joplin_wiki_writeback: {
      enabled: true,
      parent_notebook_title: "note-wiki",
      topic_frontmatter_key: "domain",
      note_title_key: "title",
      max_cli_attempts: 2,
    },
  };
}

test("SCN-JDA-CLIENT ping URL includes token query parameter", async () => {
  /** @type {string[]} */
  const urls = [];
  /** @type {typeof fetch} */
  const fetchMock = async (url) => {
    urls.push(String(url));
    return /** @type {Response} */ ({
      ok: true,
      status: 200,
      async text() {
        return "JoplinClipperServer";
      },
    });
  };
  const client = createJoplinDataApiClient(minimalCfg(), { fetch: fetchMock });
  await client.pingWithRetries();
  assert.strictEqual(urls.length >= 1, true);
  const u = new URL(urls[0]);
  assert.strictEqual(u.searchParams.get("token"), "tkn-test");
  assert.match(u.pathname, /\/ping$/);
});
