import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert";
import { loadConfig } from "../src/config/load-config.js";
import {
  runWikiWriteback,
  normalizeWikiWritebackTopic,
  summarizeWikiWritebackDry,
} from "../src/joplin/wiki-writeback.js";
import { runWikiCompileFlow } from "../src/wiki/wiki-compiler.js";
import { installMockOllamaFetch } from "./helpers/mock-ollama-fetch.mjs";

/**
 * @param {unknown} obj
 * @param {number} [status]
 */
function jsonOk(obj, status = 200) {
  const s = JSON.stringify(obj);
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return JSON.parse(s);
    },
    async text() {
      return s;
    },
  };
}

/**
 * @param {string} t
 * @param {number} [status]
 */
function textOk(t, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      throw new Error("not json");
    },
    async text() {
      return t;
    },
  };
}

function baseCfgYaml(tmp, notes, wiki, schemaPath, extra = "") {
  return `
notes_root: ${notes}
wiki_root: ${wiki}
wiki_schema:
  path: ${schemaPath}
  strict: false
wiki_ingest:
  max_pages_per_run: 15
  min_pages_per_run: 0
joplin_data_api:
  token: test-token
  base_url: http://127.0.0.1:41184
  timeout_ms: 5000
${extra}
chroma:
  persist_path: ${path.join(tmp, "chroma")}
`;
}

test("SCN-JWKB-CFG-01 Writeback enabled without Data API token fails fast", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jwkb-cfg-"));
  const cfgPath = path.join(tmp, "cfg.yaml");
  fs.mkdirSync(path.join(tmp, "notes"));
  fs.writeFileSync(
    cfgPath,
    `
notes_root: ${path.join(tmp, "notes")}
wiki_root: ""
joplin_wiki_writeback:
  enabled: true
joplin_data_api:
  token: ""
chroma:
  persist_path: ${path.join(tmp, "chroma")}
`,
    "utf8",
  );
  await assert.rejects(
    () => loadConfig(cfgPath),
    (e) => /** @type {{ code?: string }} */ (e).code === "CONFIG_INVALID",
  );
});

test("SCN-JWKB-CFG-02 Defaults match notebook tree convention", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jwkb-cfg2-"));
  const cfgPath = path.join(tmp, "cfg.yaml");
  fs.mkdirSync(path.join(tmp, "notes"));
  fs.writeFileSync(
    cfgPath,
    `
notes_root: ${path.join(tmp, "notes")}
wiki_root: ""
joplin_data_api:
  token: dummy-token
chroma:
  persist_path: ${path.join(tmp, "chroma")}
`,
    "utf8",
  );
  const cfg = await loadConfig(cfgPath);
  assert.strictEqual(cfg.joplin_wiki_writeback.enabled, true);
  assert.strictEqual(cfg.joplin_wiki_writeback.parent_notebook_title, "note-wiki");
  assert.strictEqual(cfg.joplin_wiki_writeback.topic_frontmatter_key, "domain");
  assert.strictEqual(cfg.joplin_wiki_writeback.note_title_key, "title");
});

test("SCN-WI-WB-04 Omitted enabled key defaults to writeback on (runWikiWriteback dry-run)", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jwkb-wb04-"));
  const cfgPath = path.join(tmp, "cfg.yaml");
  const notes = path.join(tmp, "notes");
  const wiki = path.join(tmp, "wiki");
  fs.mkdirSync(notes);
  fs.mkdirSync(wiki);
  fs.writeFileSync(path.join(wiki, "a.md"), "---\nstub: true\n---\n\nx\n", "utf8");
  fs.writeFileSync(
    cfgPath,
    `
notes_root: ${notes}
wiki_root: ${wiki}
wiki_schema:
  path: ${path.join(tmp, "schema.yaml")}
  strict: false
wiki_ingest:
  max_pages_per_run: 15
  min_pages_per_run: 0
joplin_data_api:
  token: test-token
chroma:
  persist_path: ${path.join(tmp, "chroma")}
`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(tmp, "schema.yaml"),
    `
schema_version: "1"
page_types:
  - id: t
    required_frontmatter_keys: []
    required_outbound_link_patterns: []
required_hub_pages: []
`,
    "utf8",
  );
  const cfg = await loadConfig(cfgPath);
  assert.strictEqual(cfg.joplin_wiki_writeback.enabled, true);
  let fetchCalls = 0;
  await runWikiWriteback(cfg, wiki, ["a.md"], {
    dryRun: true,
    fetch: async () => {
      fetchCalls++;
      return jsonOk({});
    },
  });
  assert.strictEqual(fetchCalls, 0);
});

test("normalizeWikiWritebackTopic trims and strips path chars", () => {
  assert.strictEqual(normalizeWikiWritebackTopic("  ab  "), "ab");
  assert.ok(normalizeWikiWritebackTopic("a\\b/c").includes("_"));
});

test("SCN-JWKB-DRY-01 / SCN-WI-WB-01 dry-run: no Joplin HTTP (bad PATH irrelevant)", async () => {
  process.env.JOPLIN_BRAIN_TEST_MEMORY_VECTOR = "1";
  const restoreFetch = installMockOllamaFetch({
    embedDim: 8,
    chatResponses: {
      test: () => '{"paths":["stub/page.md"]}',
    },
  });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jwkb-dry-"));
  const notes = path.join(tmp, "notes");
  const wiki = path.join(tmp, "wiki");
  fs.mkdirSync(notes, { recursive: true });
  fs.mkdirSync(wiki, { recursive: true });
  fs.writeFileSync(path.join(notes, "s.md"), "# S\n\nx\n", "utf8");
  const schemaPath = path.join(tmp, "schema.yaml");
  fs.writeFileSync(
    schemaPath,
    `
schema_version: "1"
page_types:
  - id: t
    required_frontmatter_keys: []
    required_outbound_link_patterns: []
required_hub_pages: []
`,
    "utf8",
  );
  const cfgPath = path.join(tmp, "cfg.yaml");
  fs.writeFileSync(
    cfgPath,
    baseCfgYaml(tmp, notes, wiki, schemaPath, `
joplin_wiki_writeback:
  enabled: true
  parent_notebook_title: note-wiki
`),
    "utf8",
  );
  try {
    await runWikiCompileFlow({
      ctx: {
        configPath: cfgPath,
        argv: [],
        opts: new Map([["dry-run", "true"]]),
        flags: { help: false },
      },
    });
  } finally {
    delete process.env.JOPLIN_BRAIN_TEST_MEMORY_VECTOR;
    restoreFetch();
  }
});

test("SCN-JWKB-TREE-01 parent missing → create folders then note", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jwkb-tree-"));
  const wiki = path.join(tmp, "wiki");
  fs.mkdirSync(wiki, { recursive: true });
  fs.writeFileSync(
    path.join(wiki, "p.md"),
    "---\ndomain: Networking\ntitle: Overview\n---\n\n# Body\n",
    "utf8",
  );
  const cfgPath = path.join(tmp, "cfg.yaml");
  fs.mkdirSync(path.join(tmp, "notes"));
  fs.writeFileSync(
    cfgPath,
    `
notes_root: ${path.join(tmp, "notes")}
wiki_root: ${wiki}
joplin_wiki_writeback:
  enabled: true
joplin_data_api:
  token: x
chroma:
  persist_path: ${path.join(tmp, "chroma")}
`,
    "utf8",
  );
  const cfg = await loadConfig(cfgPath);
  const parentId = "pid1111111111111111111111111111";
  let rootPass = 0;
  let childPass = 0;
  /** @type {string[]} */
  const posts = [];

  const fetchMock = async (/** @type {string | URL} */ url, init) => {
    const u = new URL(url);
    const m = init?.method ?? "GET";
    const parts = u.pathname.split("/").filter(Boolean);

    if (parts[parts.length - 1] === "ping") {
      assert.strictEqual(m, "GET");
      return textOk("JoplinClipperServer");
    }

    if (m === "GET" && parts.length === 1 && parts[0] === "folders") {
      rootPass++;
      if (rootPass === 1) {
        return jsonOk({ items: [], has_more: false });
      }
      return jsonOk({
        items: [
          {
            id: parentId,
            parent_id: "",
            title: "note-wiki",
            deleted_time: 0,
          },
        ],
        has_more: false,
      });
    }

    if (m === "POST" && parts.length === 1 && parts[0] === "folders") {
      const b = JSON.parse(String(init?.body ?? "{}"));
      posts.push(`folder:${b.title}:${b.parent_id}`);
      return jsonOk({ id: "new", title: b.title, parent_id: b.parent_id }, 200);
    }

    if (
      m === "GET" &&
      parts.length === 3 &&
      parts[0] === "folders" &&
      parts[2] === "folders"
    ) {
      assert.strictEqual(parts[1], parentId);
      childPass++;
      if (childPass === 1) {
        return jsonOk({ items: [], has_more: false });
      }
      return jsonOk({
        items: [
          {
            id: "sub1",
            parent_id: parentId,
            title: "Networking",
            deleted_time: 0,
          },
        ],
        has_more: false,
      });
    }

    if (
      m === "GET" &&
      parts.length === 3 &&
      parts[0] === "folders" &&
      parts[2] === "notes"
    ) {
      return jsonOk({ items: [], has_more: false });
    }

    if (m === "POST" && parts.length === 1 && parts[0] === "notes") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      assert.strictEqual(body.title, "Overview");
      posts.push("note:create");
      return jsonOk({ id: "nid22222222222222222222222222222" }, 200);
    }

    throw new Error(`unexpected fetch ${m} ${u.pathname}`);
  };

  await runWikiWriteback(cfg, wiki, ["p.md"], { fetch: fetchMock });
  assert.strictEqual(rootPass, 2);
  assert.strictEqual(childPass, 2);
  assert.ok(posts.some((p) => p.startsWith("folder:note-wiki:")));
  assert.ok(posts.some((p) => p.startsWith("folder:Networking:")));
  assert.ok(posts.includes("note:create"));
});

test("SCN-JWKB-UPSERT-01 title from frontmatter under topic notebook", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jwkb-up-"));
  const wiki = path.join(tmp, "wiki");
  fs.mkdirSync(wiki, { recursive: true });
  fs.writeFileSync(
    path.join(wiki, "foo.md"),
    '---\ndomain: Security\ntitle: "Overview"\n---\n\nHello\n',
    "utf8",
  );
  const cfg = await loadConfig(await writeMiniCfg(tmp, wiki));

  const fetchMock = async (/** @type {string | URL} */ url, init) => {
    const u = new URL(url);
    const m = init?.method ?? "GET";
    const parts = u.pathname.split("/").filter(Boolean);

    if (parts[parts.length - 1] === "ping") return textOk("ok");

    if (m === "GET" && parts.length === 1 && parts[0] === "folders") {
      return jsonOk({
        items: [
          {
            id: "p",
            parent_id: "",
            title: "note-wiki",
            deleted_time: 0,
          },
        ],
        has_more: false,
      });
    }

    if (
      m === "GET" &&
      parts.length === 3 &&
      parts[0] === "folders" &&
      parts[2] === "folders"
    ) {
      return jsonOk({
        items: [
          {
            id: "s",
            parent_id: "p",
            title: "Security",
            deleted_time: 0,
          },
        ],
        has_more: false,
      });
    }

    if (
      m === "GET" &&
      parts.length === 3 &&
      parts[0] === "folders" &&
      parts[2] === "notes"
    ) {
      return jsonOk({
        items: [
          {
            id: "n1",
            title: "Overview",
            deleted_time: 0,
          },
        ],
        has_more: false,
      });
    }

    if (m === "PUT" && parts[0] === "notes" && parts.length === 2) {
      const body = JSON.parse(String(init?.body ?? "{}"));
      assert.strictEqual(body.body.includes("Hello"), true);
      return jsonOk({}, 200);
    }

    throw new Error(`unexpected ${m} ${u.pathname}`);
  };

  await runWikiWriteback(cfg, wiki, ["foo.md"], { fetch: fetchMock });
});

test("SCN-JWKB-DAPI-01 retries on transport failure then JOPLIN_DATA_API_FAILED", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jwkb-dapi-"));
  const wiki = path.join(tmp, "wiki");
  fs.mkdirSync(wiki);
  fs.writeFileSync(path.join(wiki, "a.md"), "---\nstub: true\n---\n\nx\n", "utf8");
  const cfg = await loadConfig(await writeMiniCfg(tmp, wiki));
  let n = 0;
  await assert.rejects(
    () =>
      runWikiWriteback(cfg, wiki, ["a.md"], {
        dryRun: false,
        fetch: async () => {
          n++;
          throw new TypeError("network down");
        },
      }),
    (e) => /** @type {{ code?: string }} */ (e).code === "JOPLIN_DATA_API_FAILED",
  );
  assert.strictEqual(n, cfg.joplin_wiki_writeback.max_cli_attempts);
});

test("SCN-JWKB-LF-01 writeback uses loopback fetch only", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jwkb-lf-"));
  const wiki = path.join(tmp, "wiki");
  fs.mkdirSync(wiki);
  fs.writeFileSync(path.join(wiki, "a.md"), "---\nstub: true\n---\n\nx\n", "utf8");
  const cfg = await loadConfig(await writeMiniCfg(tmp, wiki));
  let fetchCalls = 0;
  const fetchMock = async (/** @type {string | URL} */ url, init) => {
    fetchCalls++;
    const u = new URL(url);
    assert.strictEqual(u.hostname, "127.0.0.1");
    assert.ok(u.searchParams.has("token"));
    const parts = u.pathname.split("/").filter(Boolean);
    const m = init?.method ?? "GET";

    if (parts[parts.length - 1] === "ping") return textOk("ok");

    if (m === "GET" && parts.length === 1 && parts[0] === "folders") {
      return jsonOk({
        items: [
          {
            id: "p",
            parent_id: "",
            title: "note-wiki",
            deleted_time: 0,
          },
        ],
        has_more: false,
      });
    }
    if (
      m === "GET" &&
      parts.length === 3 &&
      parts[0] === "folders" &&
      parts[2] === "folders"
    ) {
      return jsonOk({
        items: [
          {
            id: "t",
            parent_id: "p",
            title: "_uncategorized",
            deleted_time: 0,
          },
        ],
        has_more: false,
      });
    }
    if (
      m === "GET" &&
      parts.length === 3 &&
      parts[0] === "folders" &&
      parts[2] === "notes"
    ) {
      return jsonOk({
        items: [{ id: "n1", title: "a", deleted_time: 0 }],
        has_more: false,
      });
    }
    if (m === "PUT" && parts[0] === "notes") {
      return jsonOk({}, 200);
    }

    throw new Error(`unexpected ${m} ${u.pathname}`);
  };

  await runWikiWriteback(cfg, wiki, ["a.md"], { fetch: fetchMock });
  assert.ok(fetchCalls >= 1);
});

test("SCN-JWKB-ERR-01 wiki-compile writeback preflight failure → JOPLIN_DATA_API_FAILED", async () => {
  process.env.JOPLIN_BRAIN_TEST_MEMORY_VECTOR = "1";
  const restoreFetch = installMockOllamaFetch({
    embedDim: 8,
    chatResponses: {
      test: () => '{"paths":["stub/x.md"]}',
    },
  });
  const mockFetch = globalThis.fetch;
  // @ts-expect-error wrapper
  globalThis.fetch = async (input, init) => {
    const u = new URL(String(input));
    if (u.pathname.endsWith("/ping")) {
      return { ok: false, status: 403, async text() {
        return "";
      } };
    }
    return mockFetch(input, init);
  };

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jwkb-err-"));
  const notes = path.join(tmp, "notes");
  const wiki = path.join(tmp, "wiki");
  fs.mkdirSync(notes, { recursive: true });
  fs.mkdirSync(wiki, { recursive: true });
  fs.writeFileSync(path.join(notes, "s.md"), "# S\n\ny\n", "utf8");
  const schemaPath = path.join(tmp, "schema.yaml");
  fs.writeFileSync(
    schemaPath,
    `
schema_version: "1"
page_types:
  - id: t
    required_frontmatter_keys: []
    required_outbound_link_patterns: []
required_hub_pages: []
`,
    "utf8",
  );
  const cfgPath = path.join(tmp, "cfg.yaml");
  fs.writeFileSync(
    cfgPath,
    baseCfgYaml(tmp, notes, wiki, schemaPath, `
joplin_wiki_writeback:
  enabled: true
`),
    "utf8",
  );

  try {
    await assert.rejects(
      () =>
        runWikiCompileFlow({
          ctx: {
            configPath: cfgPath,
            argv: [],
            opts: new Map(),
            flags: { help: false },
          },
        }),
      (e) => /** @type {{ code?: string }} */ (e).code === "JOPLIN_DATA_API_FAILED",
    );
  } finally {
    restoreFetch();
    delete process.env.JOPLIN_BRAIN_TEST_MEMORY_VECTOR;
  }
});

test("summarizeWikiWritebackDry counts collisions", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jwkb-sum-"));
  const wiki = path.join(tmp, "wiki");
  fs.mkdirSync(wiki);
  fs.writeFileSync(path.join(wiki, "a.md"), "---\ntitle: T\n---\n\n1\n", "utf8");
  fs.writeFileSync(path.join(wiki, "b.md"), "---\ntitle: T\n---\n\n2\n", "utf8");
  const cfg = await loadConfig(await writeMiniCfg(tmp, wiki));
  const s = summarizeWikiWritebackDry(cfg, wiki, ["a.md", "b.md"]);
  assert.strictEqual(s.writeback_collision_count, 1);
  assert.strictEqual(s.writeback_would_write, 2);
});

/**
 * @param {string} tmp
 * @param {string} wiki
 */
async function writeMiniCfg(tmp, wiki) {
  const cfgPath = path.join(tmp, "m.yaml");
  fs.mkdirSync(path.join(tmp, "notes"));
  fs.writeFileSync(
    cfgPath,
    `
notes_root: ${path.join(tmp, "notes")}
wiki_root: ${wiki}
joplin_wiki_writeback:
  enabled: true
joplin_data_api:
  token: test-token
chroma:
  persist_path: ${path.join(tmp, "c")}
`,
    "utf8",
  );
  return cfgPath;
}
