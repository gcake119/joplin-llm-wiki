import test from "node:test";
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
