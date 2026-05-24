import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  callKnowledgeFlowTool,
  listKnowledgeFlowTools,
  validateToolInput,
} from "../src/mcp/tools.js";

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "jllw-mcp-"));
}

function writeConfig(dir) {
  const p = path.join(dir, "config.yaml");
  fs.writeFileSync(
    p,
    `raw: ./raw
raw_glob: "**/*.md"
wiki: ./wiki
wiki_glob: "**/*.md"
joplin_wiki_writeback:
  enabled: false
ollama:
  base_url: http://127.0.0.1:1
  chat_model: test
`,
  );
  return p;
}

function writeWritebackConfig(dir) {
  const p = path.join(dir, "config.yaml");
  fs.writeFileSync(
    p,
    `raw: ./raw
raw_glob: "**/*.md"
wiki: ./wiki
wiki_glob: "**/*.md"
joplin_wiki_writeback:
  enabled: true
  parent_notebook_title: "@llm-wiki"
  artifacts_notebook_title: "artifacts"
  max_cli_attempts: 1
joplin_data_api:
  base_url: "http://127.0.0.1:41184"
  token: "secret-token"
  timeout_ms: 1000
ollama:
  base_url: http://127.0.0.1:1
  chat_model: test
`,
  );
  return p;
}

function writeUnsafeWritebackConfig(dir) {
  const p = path.join(dir, "config.yaml");
  fs.writeFileSync(
    p,
    `raw: ./raw
raw_glob: "**/*.md"
wiki: ./wiki
wiki_glob: "**/*.md"
joplin_wiki_writeback:
  enabled: true
joplin_data_api:
  base_url: "https://example.com"
  token: "secret-token"
  timeout_ms: 1000
ollama:
  base_url: http://127.0.0.1:1
  chat_model: test
`,
  );
  return p;
}

function writeKnowledge(dir) {
  fs.mkdirSync(path.join(dir, "wiki", "concepts"), { recursive: true });
  fs.mkdirSync(path.join(dir, "raw", "project"), { recursive: true });
  fs.writeFileSync(path.join(dir, "wiki", "concepts", "topic.md"), "# Topic\nWiki evidence");
  fs.writeFileSync(path.join(dir, "raw", "project", "source.md"), "# Raw\nRaw evidence");
}

async function withMockQuery(response, fn) {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ message: { content: response } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  try {
    return await fn();
  } finally {
    globalThis.fetch = oldFetch;
  }
}

test("MCP server exposes required knowledge-flow tool names", () => {
  const tools = listKnowledgeFlowTools();
  assert.deepEqual(
    tools.map((tool) => tool.name),
    [
      "joplin_query",
      "joplin_show_capture",
      "joplin_confirm_capture",
      "joplin_brainstorm",
      "joplin_suggest_archive_project",
      "joplin_archive_project",
      "joplin_sync_sources",
      "joplin_compile_wiki",
      "joplin_sync_workflow_notes",
    ],
  );
});

test("query, show-capture, and confirm-capture schemas validate required fields", () => {
  const byName = new Map(listKnowledgeFlowTools().map((tool) => [tool.name, tool]));
  assert.deepEqual(byName.get("joplin_query")?.inputSchema.required, ["question"]);
  assert.deepEqual(byName.get("joplin_show_capture")?.inputSchema.required, ["capture_id"]);
  assert.deepEqual(byName.get("joplin_confirm_capture")?.inputSchema.required, ["capture_id"]);

  assert.deepEqual(validateToolInput("joplin_query", { question: "查詢內容" }), {
    ok: true,
    value: { question: "查詢內容" },
  });
  assert.deepEqual(validateToolInput("joplin_show_capture", {}), {
    ok: false,
    error: { code: "INPUT_INVALID", message: "capture_id is required" },
  });
  assert.deepEqual(validateToolInput("joplin_confirm_capture", { capture_id: "" }), {
    ok: false,
    error: { code: "INPUT_INVALID", message: "capture_id is required" },
  });
});

test("brainstorm and archive schemas require explicit project confirmation", () => {
  const byName = new Map(listKnowledgeFlowTools().map((tool) => [tool.name, tool]));
  assert.deepEqual(byName.get("joplin_brainstorm")?.inputSchema.required, ["topic"]);
  assert.deepEqual(byName.get("joplin_suggest_archive_project")?.inputSchema.required, ["content"]);
  assert.deepEqual(byName.get("joplin_archive_project")?.inputSchema.required, [
    "project",
    "title",
    "confirmed_project",
  ]);

  assert.deepEqual(validateToolInput("joplin_archive_project", {
    project: "tainan-city",
    title: "Dispatch Plan",
    confirmed_project: false,
  }), {
    ok: false,
    error: {
      code: "PROJECT_CONFIRMATION_REQUIRED",
      message: "confirmed_project must be true before archiving",
    },
  });
  assert.equal(validateToolInput("joplin_archive_project", {
    project: "tainan-city",
    title: "Dispatch Plan",
    confirmed_project: true,
  }).ok, true);
});

test("sync and compile schemas expose orchestration output and reject invalid modes", () => {
  const byName = new Map(listKnowledgeFlowTools().map((tool) => [tool.name, tool]));
  assert.deepEqual(Object.keys(byName.get("joplin_sync_sources")?.outputSchema.properties ?? {}), [
    "exit_code",
    "stdout_summary",
    "stderr_summary",
    "error_code",
  ]);
  assert.deepEqual(Object.keys(byName.get("joplin_compile_wiki")?.outputSchema.properties ?? {}), [
    "exit_code",
    "stdout_summary",
    "stderr_summary",
    "error_code",
  ]);

  assert.deepEqual(validateToolInput("joplin_sync_sources", { mode: "invalid" }), {
    ok: false,
    error: {
      code: "INPUT_INVALID",
      message: "mode must be one of: normal, export_only, snapshot_only",
    },
  });
  assert.deepEqual(validateToolInput("joplin_compile_wiki", { mode: "remote" }), {
    ok: false,
    error: {
      code: "INPUT_INVALID",
      message: "mode must be one of: local, agent",
    },
  });
  assert.deepEqual(validateToolInput("joplin_sync_workflow_notes", { section: "remote" }), {
    ok: false,
    error: {
      code: "INPUT_INVALID",
      message: "section must be one of: brainstorming, artifacts, all",
    },
  });
});

test("joplin_query handler returns structured answer, sources, and pending capture only", async () => {
  const dir = tmpdir();
  writeKnowledge(dir);
  const configPath = writeConfig(dir);

  await withMockQuery(
    `答案
CAPTURE_JSON:
\`\`\`json
{"should_create":true,"classification":"brainstorming","title":"查詢紀錄","content":"保存內容","knowledge_sources":[{"layer":"wiki","path":"concepts/topic.md"}]}
\`\`\`
`,
    async () => {
      const result = await callKnowledgeFlowTool("joplin_query", {
        config_path: configPath,
        question: "問題？",
      });
      assert.equal(result.ok, true);
      assert.equal(result.answer, "答案");
      assert.deepEqual(result.sources.at(0), { layer: "wiki", path: "concepts/topic.md" });
      assert.match(result.capture_draft_id, /查詢紀錄/);
      assert.equal(fs.existsSync(path.join(dir, "brainstorming", "chat")), false);
      assert.equal(
        fs.readdirSync(path.join(dir, ".joplin-llm-wiki", "pending-captures")).length,
        1,
      );
    },
  );
});

test("joplin_show_capture handler reads pending capture without deleting it", async () => {
  const dir = tmpdir();
  writeKnowledge(dir);
  const configPath = writeConfig(dir);

  await withMockQuery(
    `答案
CAPTURE_JSON:
\`\`\`json
{"should_create":true,"classification":"brainstorming","title":"查詢紀錄","content":"保存內容","knowledge_sources":[{"layer":"wiki","path":"concepts/topic.md"}]}
\`\`\`
`,
    async () => {
      const query = await callKnowledgeFlowTool("joplin_query", {
        config_path: configPath,
        question: "問題？",
      });
      const capturePath = path.join(
        dir,
        ".joplin-llm-wiki",
        "pending-captures",
        `${query.capture_draft_id}.json`,
      );
      const shown = await callKnowledgeFlowTool("joplin_show_capture", {
        config_path: configPath,
        capture_id: query.capture_draft_id,
      });
      assert.equal(shown.ok, true);
      assert.equal(shown.capture.id, query.capture_draft_id);
      assert.equal(shown.capture.capture.classification, "brainstorming");
      assert.equal(fs.existsSync(capturePath), true);
    },
  );
});

test("joplin_confirm_capture handler writes artifact note and clears pending capture", async () => {
  const dir = tmpdir();
  writeKnowledge(dir);
  const configPath = writeConfig(dir);

  await withMockQuery(
    `答案
CAPTURE_JSON:
\`\`\`json
{"should_create":true,"classification":"artifacts","title":"作品草稿","content":"保存內容","knowledge_sources":[{"layer":"wiki","path":"concepts/topic.md"}]}
\`\`\`
`,
    async () => {
      const query = await callKnowledgeFlowTool("joplin_query", {
        config_path: configPath,
        question: "問題？",
      });
      const capturePath = path.join(
        dir,
        ".joplin-llm-wiki",
        "pending-captures",
        `${query.capture_draft_id}.json`,
      );
      const confirmed = await callKnowledgeFlowTool("joplin_confirm_capture", {
        config_path: configPath,
        capture_id: query.capture_draft_id,
        artifact_project: "tainan-city",
      });
      assert.equal(confirmed.ok, true);
      assert.match(confirmed.capture_written, /^artifacts\/tainan-city\//);
      assert.equal(fs.existsSync(path.join(dir, confirmed.capture_written)), true);
      assert.equal(fs.existsSync(capturePath), false);
    },
  );
});

test("joplin_brainstorm handler creates brainstorming pending capture by intent", async () => {
  const dir = tmpdir();
  writeKnowledge(dir);
  const configPath = writeConfig(dir);

  await withMockQuery("腦力激盪結果", async () => {
    const result = await callKnowledgeFlowTool("joplin_brainstorm", {
      config_path: configPath,
      topic: "派案監控命名",
      context: "需要整理 project archive naming",
    });
    assert.equal(result.ok, true);
    assert.equal(result.answer, "腦力激盪結果");
    assert.match(result.capture_draft_id, /派案監控命名/);
    const pending = JSON.parse(
      fs.readFileSync(
        path.join(dir, ".joplin-llm-wiki", "pending-captures", `${result.capture_draft_id}.json`),
        "utf8",
      ),
    );
    assert.equal(pending.capture.classification, "brainstorming");
  });
});

test("joplin_suggest_archive_project returns deterministic project suggestions", async () => {
  const result = await callKnowledgeFlowTool("joplin_suggest_archive_project", {
    title: "衛生局派案進度監控系統規劃",
    content: "台南市 1999 派案與衛生局稽查進度追蹤，需要 no cloud 的行政工具。",
    context: "workspace: /Users/caiyijun/js/tainan-city",
  });
  assert.equal(result.ok, true);
  assert.equal(result.requires_user_confirmation, true);
  assert.equal(result.suggested_projects.length, 3);
  assert.equal(result.suggested_projects[0].name, "tainan-city");
  assert.match(result.suggested_title, /衛生局派案進度監控系統規劃/);
  assert.ok(result.suggested_projects.every((item) => item.reason));
});

test("joplin_archive_project rejects unconfirmed project without writing files", async () => {
  const dir = tmpdir();
  const configPath = writeConfig(dir);
  const result = await callKnowledgeFlowTool("joplin_archive_project", {
    config_path: configPath,
    project: "tainan-city",
    title: "Dispatch Plan",
    content: "正式歸檔內容",
    confirmed_project: false,
  });
  assert.deepEqual(result, {
    ok: false,
    error: {
      code: "PROJECT_CONFIRMATION_REQUIRED",
      message: "confirmed_project must be true before archiving",
    },
  });
  assert.equal(fs.existsSync(path.join(dir, "artifacts", "tainan-city")), false);
});

test("joplin_archive_project writes confirmed artifact with frontmatter", async () => {
  const dir = tmpdir();
  const configPath = writeConfig(dir);
  const result = await callKnowledgeFlowTool("joplin_archive_project", {
    config_path: configPath,
    project: "tainan-city",
    title: "Dispatch Plan",
    content: "正式歸檔內容",
    confirmed_project: true,
  });
  assert.equal(result.ok, true);
  assert.match(result.archive_written, /^artifacts\/tainan-city\//);
  const note = fs.readFileSync(path.join(dir, result.archive_written), "utf8");
  assert.match(note, /title: "Dispatch Plan"/);
  assert.match(note, /project: "tainan-city"/);
  assert.match(note, /capture_classification: "artifacts"/);
  assert.match(note, /capture_path: "artifacts\/tainan-city\//);
  assert.doesNotMatch(note, /^# 保存內容$/m);
  assert.match(note, /\n---\n\n正式歸檔內容\n$/);
  assert.match(note, /正式歸檔內容/);
});

test("joplin_archive_project writes back to confirmed project notebook", async () => {
  const dir = tmpdir();
  const configPath = writeWritebackConfig(dir);
  const requests = [];
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const u = new URL(String(url));
    const method = init?.method ?? "GET";
    requests.push({
      pathname: u.pathname,
      method,
      body: init?.body ? JSON.parse(String(init.body)) : null,
      href: String(url),
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
                children: [{ id: "tainan", parent_id: "artifacts", title: "tainan-city" }],
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
    if (u.pathname === "/notes" && method === "POST") {
      return jsonResponse({ id: "created" });
    }
    return jsonResponse({ items: [], has_more: false });
  };
  try {
    const result = await callKnowledgeFlowTool("joplin_archive_project", {
      config_path: configPath,
      project: "tainan-city",
      title: "Dispatch Plan",
      content: "正式歸檔內容",
      confirmed_project: true,
      writeback_workflow: true,
    });
    assert.equal(result.ok, true);
    assert.equal(result.writeback.workflow_writeback_written, 1);
  } finally {
    globalThis.fetch = oldFetch;
  }

  const created = requests.find((r) => r.method === "POST" && r.pathname === "/notes");
  assert.equal(created?.body.parent_id, "tainan");
  assert.equal(created?.body.title, "Dispatch Plan");
  assert.equal(JSON.stringify(requests.map((r) => r.body)).includes("secret-token"), false);
});

test("joplin_sync_sources handler maps modes to sqlite-sync argv and bounded output", async () => {
  const calls = [];
  const result = await callKnowledgeFlowTool(
    "joplin_sync_sources",
    { config_path: "/repo/config.yaml", mode: "snapshot_only" },
    {
      spawnImpl: fakeSpawn(calls, {
        stdout: `${"x".repeat(9000)}\n{"ok":true}`,
        stderr: "warn",
        exitCode: 0,
      }),
      cwd: "/repo",
    },
  );
  assert.equal(result.ok, true);
  assert.deepEqual(calls[0].args, [
    "exec",
    "joplin-llm-wiki",
    "sqlite-sync",
    "--config",
    "/repo/config.yaml",
    "--snapshot-only",
  ]);
  assert.equal(result.exit_code, 0);
  assert.equal(result.stderr_summary, "warn");
  assert.equal(result.stdout_summary.length <= 8000, true);
  assert.match(result.stdout_summary, /\{"ok":true\}$/);
});

test("joplin_compile_wiki handler maps agent mode and compile flags", async () => {
  const calls = [];
  const result = await callKnowledgeFlowTool(
    "joplin_compile_wiki",
    {
      config_path: "/repo/config.yaml",
      mode: "agent",
      dry_run: true,
      batch: true,
    },
    {
      spawnImpl: fakeSpawn(calls, { stdout: "done", stderr: "", exitCode: 0 }),
      cwd: "/repo",
    },
  );
  assert.equal(result.ok, true);
  assert.deepEqual(calls[0].args, [
    "exec",
    "joplin-llm-wiki",
    "agent-compile",
    "--config",
    "/repo/config.yaml",
    "--dry-run",
    "--batch=true",
  ]);
  assert.equal(result.stdout_summary, "done");
});

test("MCP tool errors preserve local-first boundaries and redact tokens", async () => {
  const dir = tmpdir();
  const configPath = writeUnsafeWritebackConfig(dir);
  const result = await callKnowledgeFlowTool("joplin_archive_project", {
    config_path: configPath,
    project: "tainan-city",
    title: "Dispatch Plan",
    content: "正式歸檔內容",
    confirmed_project: true,
    writeback_workflow: true,
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "CONFIG_INVALID");
  assert.equal(JSON.stringify(result).includes("secret-token"), false);
});

function fakeSpawn(calls, result) {
  return (cmd, args, options) => {
    calls.push({ cmd, args, options });
    const listeners = {};
    const child = {
      stdout: {
        on(event, fn) {
          if (event === "data") fn(Buffer.from(result.stdout));
        },
      },
      stderr: {
        on(event, fn) {
          if (event === "data") fn(Buffer.from(result.stderr));
        },
      },
      on(event, fn) {
        listeners[event] = fn;
        if (event === "close") queueMicrotask(() => fn(result.exitCode));
      },
    };
    return child;
  };
}

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
