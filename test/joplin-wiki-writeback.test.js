import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  runKnowledgeFlowWriteback,
  runWikiWritebackPreflight,
  runWikiWriteback,
  summarizeWikiWritebackDry,
} from "../src/joplin/wiki-writeback.js";
import { runWikiCompileFlow } from "../src/wiki/wiki-compiler.js";

function cfg() {
  return {
    joplin_wiki_writeback: {
      enabled: true,
      parent_notebook_title: "@llm-wiki",
      wiki_notebook_title: "wiki",
      brainstorming_notebook_title: "brainstorming",
      artifacts_notebook_title: "artifacts",
      artifacts_project_notebook_title: "ProjectA",
      topic_frontmatter_key: "domain",
      note_title_key: "title",
      max_cli_attempts: 1,
    },
    joplin_data_api: {
      base_url: "http://127.0.0.1:41184",
      token: "t",
      timeout_ms: 1000,
    },
  };
}

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "jllw-wb-"));
}

function writeSchema(dir) {
  const p = path.join(dir, "schema.yaml");
  fs.writeFileSync(
    p,
    `schema_version: "1"
page_types:
  - id: concept
    required_frontmatter_keys: [source_refs, compiled_at, compiler_revision]
    required_outbound_link_patterns: []
required_hub_pages:
  - indexes/All-Sources.md
  - indexes/All-Concepts.md
`,
  );
  return p;
}

function writeCompileConfig(dir, raw, wiki, schema) {
  const p = path.join(dir, "config.yaml");
  fs.writeFileSync(
    p,
    `raw: ${JSON.stringify(raw)}
raw_glob: "**/*.md"
wiki: ${JSON.stringify(wiki)}
wiki_glob: "**/*.md"
wiki_schema:
  path: ${JSON.stringify(schema)}
  strict: false
wiki_ingest:
  max_pages_per_run: 15
  min_pages_per_run: 1
  min_topic_pages_per_run: 1
ollama:
  chat_model: test
joplin_wiki_writeback:
  enabled: true
  parent_notebook_title: "@llm-wiki"
  wiki_notebook_title: "wiki"
  topic_frontmatter_key: domain
  note_title_key: title
  max_cli_attempts: 1
joplin_data_api:
  base_url: "http://127.0.0.1:41184"
  token: "test"
  timeout_ms: 1000
`,
  );
  return p;
}

test("dry-run wiki writeback counts fixed summaries/concepts/indexes notebooks", () => {
  const dir = tmpdir();
  const wiki = path.join(dir, "wiki");
  fs.mkdirSync(path.join(wiki, "summaries"), { recursive: true });
  fs.mkdirSync(path.join(wiki, "concepts"), { recursive: true });
  fs.writeFileSync(path.join(wiki, "summaries", "s.md"), "---\ntitle: S\n---\nS");
  fs.writeFileSync(path.join(wiki, "concepts", "c.md"), "---\ntitle: C\n---\nC");
  const summary = summarizeWikiWritebackDry(cfg(), wiki, [
    "summaries/s.md",
    "concepts/c.md",
  ]);
  assert.equal(summary.writeback_would_write, 2);
  assert.equal(summary.writeback_would_create_notebooks, 4);
});

test("knowledge-flow dry-run maps artifacts to configured project notebook", async () => {
  const dir = tmpdir();
  const wiki = path.join(dir, "wiki");
  fs.mkdirSync(path.join(wiki, "indexes"), { recursive: true });
  fs.writeFileSync(path.join(wiki, "indexes", "All-Sources.md"), "---\ntitle: All Sources\n---\nBody");
  fs.mkdirSync(path.join(dir, "brainstorming", "chat"), { recursive: true });
  fs.writeFileSync(path.join(dir, "brainstorming", "chat", "q.md"), "# Q");
  fs.mkdirSync(path.join(dir, "artifacts"), { recursive: true });
  fs.writeFileSync(path.join(dir, "artifacts", "draft.md"), "# Draft");

  const summary = await runKnowledgeFlowWriteback(cfg(), wiki, ["indexes/All-Sources.md"], {
    dryRun: true,
    workflowRoot: dir,
  });
  assert.equal(summary.writeback_would_write, 3);
  assert.equal(summary.workflow_writeback_would_write, 2);
});

test("wiki compile writeback ignores brainstorming and artifacts", async () => {
  const dir = tmpdir();
  const wiki = path.join(dir, "wiki");
  fs.mkdirSync(path.join(wiki, "indexes"), { recursive: true });
  fs.writeFileSync(path.join(wiki, "indexes", "All-Sources.md"), "---\ntitle: All Sources\n---\nBody");
  fs.mkdirSync(path.join(dir, "brainstorming", "chat"), { recursive: true });
  fs.writeFileSync(path.join(dir, "brainstorming", "chat", "q.md"), "# Q");
  fs.mkdirSync(path.join(dir, "artifacts"), { recursive: true });
  fs.writeFileSync(path.join(dir, "artifacts", "draft.md"), "# Draft");

  const summary = await runWikiWriteback(cfg(), wiki, ["indexes/All-Sources.md"], {
    dryRun: true,
  });
  assert.equal(summary.writeback_would_write, 1);
  assert.equal("workflow_writeback_would_write" in summary, false);
});

test("writeback resume publishes only completed concepts and All-Concepts", async () => {
  const dir = tmpdir();
  const raw = path.join(dir, "raw");
  const wiki = path.join(dir, "wiki");
  fs.mkdirSync(raw, { recursive: true });
  fs.mkdirSync(path.join(wiki, "summaries"), { recursive: true });
  fs.mkdirSync(path.join(wiki, "concepts"), { recursive: true });
  fs.mkdirSync(path.join(wiki, "indexes"), { recursive: true });
  const schema = writeSchema(dir);
  const configPath = writeCompileConfig(dir, raw, wiki, schema);
  fs.writeFileSync(
    path.join(wiki, "summaries", "unchanged.md"),
    "---\ntitle: Unchanged\nsource_refs: []\ncompiled_at: now\ncompiler_revision: test\n---\n# Unchanged\n",
  );
  fs.writeFileSync(
    path.join(wiki, "concepts", "topic.md"),
    "---\ntitle: Topic\nsource_refs: []\ncompiled_at: now\ncompiler_revision: test\ndomain: concepts\n---\n# Topic\n",
  );
  fs.writeFileSync(
    path.join(wiki, "indexes", "All-Concepts.md"),
    "---\ntitle: All Concepts\nsource_refs: []\ncompiled_at: now\ncompiler_revision: test\ndomain: indexes\n---\n# All Concepts\n",
  );

  const dryLines = [];
  const oldLog = console.log;
  console.log = (s) => dryLines.push(String(s));
  try {
    await runWikiCompileFlow({
      ctx: {
        configPath,
        argv: [],
        opts: new Map([
          ["resume-stage", "writeback"],
          ["dry-run", "true"],
        ]),
      },
    });
  } finally {
    console.log = oldLog;
  }

  const dryPayload = JSON.parse(dryLines.at(-1));
  assert.equal(dryPayload.compile_adapter, "local");
  assert.equal(dryPayload.resume_stage, "writeback");
  assert.equal(dryPayload.writeback_would_write, 2);
  assert.deepEqual(dryPayload.writeback_relpaths, [
    "concepts/topic.md",
    "indexes/All-Concepts.md",
  ]);

  const requests = [];
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), method: init?.method ?? "GET", body: init?.body });
    const u = new URL(String(url));
    if (u.pathname === "/ping") {
      return textResponse("JoplinClipperServer");
    }
    if (u.pathname === "/folders") {
      return jsonResponse({
        items: [
          {
            id: "root",
            parent_id: "",
            title: "@llm-wiki",
            children: [
              {
                id: "wiki",
                parent_id: "root",
                title: "wiki",
                children: [
                  { id: "concepts", parent_id: "wiki", title: "concepts" },
                  { id: "indexes", parent_id: "wiki", title: "indexes" },
                ],
              },
            ],
          },
        ],
        has_more: false,
      });
    }
    if (/\/folders\/.+\/notes$/.test(u.pathname)) {
      return jsonResponse({ items: [], has_more: false });
    }
    if (u.pathname === "/notes" && init?.method === "POST") {
      return jsonResponse({ id: "created" });
    }
    return jsonResponse({ items: [], has_more: false });
  };
  const runLines = [];
  console.log = (s) => runLines.push(String(s));
  try {
    await runWikiCompileFlow({
      ctx: {
        configPath,
        argv: [],
        opts: new Map([["resume-stage", "writeback"]]),
      },
    });
  } finally {
    console.log = oldLog;
    globalThis.fetch = oldFetch;
  }

  const runPayload = JSON.parse(runLines.at(-1));
  assert.equal(runPayload.compile_adapter, "local");
  assert.deepEqual(runPayload.writeback_relpaths, [
    "concepts/topic.md",
    "indexes/All-Concepts.md",
  ]);
  const noteCreates = requests
    .filter((req) => new URL(req.url).pathname === "/notes" && req.method === "POST")
    .map((req) => JSON.parse(String(req.body)).title)
    .sort();
  assert.deepEqual(noteCreates, ["All Concepts", "Topic"]);
  assert.equal(noteCreates.includes("Unchanged"), false);
});

test("wiki writeback preflight accepts a valid local Data API token without mutating", async () => {
  /** @type {string[]} */
  const urls = [];
  const summary = await runWikiWritebackPreflight(cfg(), {
    fetch: async (url, init) => {
      urls.push(String(url));
      assert.equal(init?.method, "GET");
      return /** @type {Response} */ ({
        ok: true,
        status: 200,
        async text() {
          return "JoplinClipperServer";
        },
      });
    },
  });

  assert.equal(summary.writeback_preflight_status, "passed");
  assert.equal(urls.length, 1);
  assert.match(new URL(urls[0]).pathname, /\/ping$/);
});

test("wiki writeback preflight rejects invalid token with stable code and redacted message", async () => {
  const invalidCfg = cfg();
  invalidCfg.joplin_data_api.token = "secret-token-123";
  await assert.rejects(
    () =>
      runWikiWritebackPreflight(invalidCfg, {
        fetch: async () =>
          /** @type {Response} */ ({
            ok: false,
            status: 403,
            async text() {
              return "invalid token secret-token-123";
            },
          }),
      }),
    /** @param {Error & { code?: string }} e */
    (e) =>
      e.code === "JOPLIN_DATA_API_FAILED" &&
      /HTTP 403/.test(e.message) &&
      !e.message.includes("secret-token-123"),
  );
});

test("wiki writeback preflight maps unreachable Data API to stable preflight code", async () => {
  await assert.rejects(
    () =>
      runWikiWritebackPreflight(cfg(), {
        fetch: async () => {
          throw new TypeError("fetch failed");
        },
      }),
    /** @param {Error & { code?: string }} e */
    (e) => e.code === "JOPLIN_DATA_API_FAILED" && /fetch failed/.test(e.message),
  );
});

test("wiki writeback dry-run reports concept title collisions and orphan candidates without mutating", async () => {
  const dir = tmpdir();
  const wiki = path.join(dir, "wiki");
  fs.mkdirSync(path.join(wiki, "concepts"), { recursive: true });
  fs.writeFileSync(
    path.join(wiki, "concepts", "depression-support.md"),
    `---
source_refs:
  - raw/a.md
compiled_at: "2026-05-23T00:00:00.000Z"
compiler_revision: test
domain: concepts
title: 憂鬱症陪伴、心理衛教與求助
---
# 憂鬱症陪伴、心理衛教與求助
`,
  );

  const mutatingMethods = [];
  const summary = await runWikiWriteback(
    cfg(),
    wiki,
    ["concepts/depression-support.md"],
    {
      dryRun: true,
      fetch: async (url, init) => {
        const method = init?.method ?? "GET";
        if (method !== "GET") mutatingMethods.push(method);
        const u = new URL(String(url));
        if (u.pathname === "/folders") {
          return jsonResponse({
            items: [
              {
                id: "root",
                parent_id: "",
                title: "@llm-wiki",
                children: [
                  {
                    id: "wiki",
                    parent_id: "root",
                    title: "wiki",
                    children: [
                      {
                        id: "concepts",
                        parent_id: "wiki",
                        title: "concepts",
                      },
                    ],
                  },
                ],
              },
            ],
            has_more: false,
          });
        }
        if (u.pathname === "/folders/concepts/notes") {
          return jsonResponse({
            items: [
              {
                id: "n1",
                parent_id: "concepts",
                title: "憂鬱症陪伴、心理衛教與求助",
              },
              {
                id: "n2",
                parent_id: "concepts",
                title: "憂鬱症陪伴、心理衛教與求助",
              },
              {
                id: "old",
                parent_id: "concepts",
                title: "舊的錯誤 concept",
              },
            ],
            has_more: false,
          });
        }
        return jsonResponse({ items: [], has_more: false });
      },
    },
  );

  assert.equal(summary.writeback_collision_count, 1);
  assert.deepEqual(summary.writeback_collision_details, [
    {
      topic: "concepts",
      title: "憂鬱症陪伴、心理衛教與求助",
      note_ids: ["n1", "n2"],
    },
  ]);
  assert.equal(summary.writeback_orphan_candidate_count, 1);
  assert.deepEqual(summary.writeback_orphan_candidates, [
    {
      topic: "concepts",
      title: "舊的錯誤 concept",
      note_id: "old",
    },
  ]);
  assert.deepEqual(mutatingMethods, []);
});

test("wiki writeback updates existing notes, creates missing notes, and trashes orphans only with explicit cleanup", async () => {
  const dir = tmpdir();
  const wiki = path.join(dir, "wiki");
  fs.mkdirSync(path.join(wiki, "concepts"), { recursive: true });
  fs.writeFileSync(
    path.join(wiki, "concepts", "managed-existing.md"),
    `---
source_refs: []
compiled_at: "2026-05-23T00:00:00.000Z"
compiler_revision: test
domain: concepts
title: Managed Existing
---
# Managed Existing
`,
  );
  fs.writeFileSync(
    path.join(wiki, "concepts", "new-concept.md"),
    `---
source_refs: []
compiled_at: "2026-05-23T00:00:00.000Z"
compiler_revision: test
domain: concepts
title: New Concept
---
# New Concept
`,
  );

  const requests = [];
  const summary = await runWikiWriteback(
    cfg(),
    wiki,
    ["concepts/managed-existing.md", "concepts/new-concept.md"],
    {
      dryRun: false,
      cleanupOrphans: true,
      fetch: async (url, init) => {
        const u = new URL(String(url));
        const method = init?.method ?? "GET";
        requests.push({
          method,
          pathname: u.pathname,
          search: u.search,
          body: init?.body ? JSON.parse(String(init.body)) : null,
        });
        if (u.pathname === "/ping") {
          return textResponse("JoplinClipperServer");
        }
        if (u.pathname === "/folders") {
          return jsonResponse({
            items: [
              {
                id: "root",
                parent_id: "",
                title: "@llm-wiki",
                children: [
                  {
                    id: "wiki",
                    parent_id: "root",
                    title: "wiki",
                    children: [
                      {
                        id: "concepts",
                        parent_id: "wiki",
                        title: "concepts",
                      },
                    ],
                  },
                ],
              },
            ],
            has_more: false,
          });
        }
        if (u.pathname === "/folders/concepts/notes") {
          return jsonResponse({
            items: [
              {
                id: "existing-note",
                parent_id: "concepts",
                title: "Managed Existing",
              },
              {
                id: "orphan-note",
                parent_id: "concepts",
                title: "Old Concept",
              },
            ],
            has_more: false,
          });
        }
        if (method === "PUT" || method === "POST") {
          return jsonResponse({ id: "ok" });
        }
        if (method === "DELETE") {
          return { ok: true, status: 204, async text() { return ""; } };
        }
        return jsonResponse({ items: [], has_more: false });
      },
    },
  );

  const put = requests.find(
    (r) => r.method === "PUT" && r.pathname === "/notes/existing-note",
  );
  assert.deepEqual(put?.body, {
    body: "# Managed Existing\n",
    title: "Managed Existing",
    parent_id: "concepts",
  });

  const post = requests.find(
    (r) => r.method === "POST" && r.pathname === "/notes",
  );
  assert.deepEqual(post?.body, {
    parent_id: "concepts",
    title: "New Concept",
    body: "# New Concept\n",
  });

  const del = requests.find(
    (r) => r.method === "DELETE" && r.pathname === "/notes/orphan-note",
  );
  assert.ok(del);
  assert.equal(del.search.includes("permanent=1"), false);
  assert.equal(summary.writeback_updated_count, 1);
  assert.equal(summary.writeback_created_count, 1);
  assert.equal(summary.writeback_trashed_count, 1);
});

function textResponse(text) {
  return {
    ok: true,
    status: 200,
    async text() {
      return text;
    },
  };
}

function jsonResponse(body) {
  return {
    ok: true,
    status: 200,
    async text() {
      return JSON.stringify(body);
    },
    async json() {
      return body;
    },
  };
}

test("knowledge-flow writeback can be limited to selected workflow note", async () => {
  const dir = tmpdir();
  const wiki = path.join(dir, "wiki");
  fs.mkdirSync(wiki, { recursive: true });
  fs.mkdirSync(path.join(dir, "brainstorming", "chat"), { recursive: true });
  fs.writeFileSync(path.join(dir, "brainstorming", "chat", "q1.md"), "# Q1");
  fs.writeFileSync(path.join(dir, "brainstorming", "chat", "q2.md"), "# Q2");

  const summary = await runKnowledgeFlowWriteback(cfg(), wiki, [], {
    dryRun: true,
    workflowRoot: dir,
    workflowRelPaths: ["brainstorming/chat/q2.md"],
  });
  assert.equal(summary.writeback_would_write, 1);
  assert.equal(summary.workflow_writeback_would_write, 1);
});

test("knowledge-flow writeback maps artifacts project directory to project notebook", async () => {
  const dir = tmpdir();
  const wiki = path.join(dir, "wiki");
  fs.mkdirSync(wiki, { recursive: true });
  fs.mkdirSync(path.join(dir, "artifacts", "tainan-city"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "artifacts", "tainan-city", "dispatch-plan.md"),
    "---\ntitle: Dispatch Plan\n---\n# Dispatch Plan\n",
  );

  const requests = [];
  const summary = await runKnowledgeFlowWriteback(cfg(), wiki, [], {
    workflowRoot: dir,
    workflowRelPaths: ["artifacts/tainan-city/dispatch-plan.md"],
    fetch: async (url, init) => {
      const u = new URL(String(url));
      const method = init?.method ?? "GET";
      requests.push({
        pathname: u.pathname,
        method,
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      if (u.pathname === "/ping") return textResponse("JoplinClipperServer");
      if (u.pathname === "/folders") {
        return jsonResponse({
          items: [
            {
              id: "root",
              parent_id: "",
              title: "@llm-wiki",
              children: [
                {
                  id: "artifacts",
                  parent_id: "root",
                  title: "artifacts",
                  children: [
                    { id: "project-a", parent_id: "artifacts", title: "ProjectA" },
                    { id: "tainan", parent_id: "artifacts", title: "tainan-city" },
                  ],
                },
              ],
            },
          ],
          has_more: false,
        });
      }
      if (u.pathname === "/folders/tainan/notes") {
        return jsonResponse({ items: [], has_more: false });
      }
      if (u.pathname === "/folders/project-a/notes") {
        return jsonResponse({ items: [], has_more: false });
      }
      if (u.pathname === "/notes" && method === "POST") {
        return jsonResponse({ id: "created" });
      }
      return jsonResponse({ items: [], has_more: false });
    },
  });

  assert.equal(summary.workflow_writeback_written, 1);
  const created = requests.find((r) => r.method === "POST" && r.pathname === "/notes");
  assert.deepEqual(created?.body, {
    parent_id: "tainan",
    title: "Dispatch Plan",
    body: "# Dispatch Plan\n",
  });
});
