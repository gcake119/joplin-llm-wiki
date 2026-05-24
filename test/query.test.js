import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runQuery } from "../src/commands/cmd-query.js";

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "jllw-query-"));
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

function writeKnowledge(dir, { wiki = true, raw = true } = {}) {
  if (wiki) {
    fs.mkdirSync(path.join(dir, "wiki", "indexes"), { recursive: true });
    fs.mkdirSync(path.join(dir, "wiki", "concepts"), { recursive: true });
    fs.writeFileSync(path.join(dir, "wiki", "indexes", "All-Concepts.md"), "# Concepts\n- [[concepts/topic]]");
    fs.writeFileSync(path.join(dir, "wiki", "concepts", "topic.md"), "# Topic\nWiki evidence");
  }
  if (raw) {
    fs.mkdirSync(path.join(dir, "raw", "project"), { recursive: true });
    fs.writeFileSync(path.join(dir, "raw", "project", "source.md"), "# Raw\nRaw evidence");
  }
}

async function withMockQuery(response, fn) {
  const oldFetch = globalThis.fetch;
  /** @type {string[]} */
  const prompts = [];
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    prompts.push(String(body.messages?.[0]?.content ?? ""));
    return new Response(JSON.stringify({ message: { content: response } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const logs = [];
  const errors = [];
  const oldLog = console.log;
  const oldError = console.error;
  console.log = (s) => logs.push(String(s));
  console.error = (s) => errors.push(String(s));
  try {
    return await fn({ logs, errors, prompts });
  } finally {
    console.log = oldLog;
    console.error = oldError;
    globalThis.fetch = oldFetch;
  }
}

test("query defaults to wiki+raw knowledge scope and creates a pending capture only", async () => {
  const dir = tmpdir();
  writeKnowledge(dir);
  const configPath = writeConfig(dir);

  await withMockQuery(
    `根據 wiki 優先、raw 佐證：答案

CAPTURE_JSON:
\`\`\`json
{"should_create":true,"classification":"brainstorming","title":"查詢紀錄","content":"值得保存的問答","knowledge_sources":[{"layer":"wiki","path":"concepts/topic.md"},{"layer":"raw","path":"project/source.md"}]}
\`\`\`
`,
    async ({ logs, prompts }) => {
      const code = await runQuery({
        configPath,
        argv: ["問題？"],
        opts: new Map(),
      });
      assert.equal(code, 0);
      assert.match(prompts[0], /wiki\/ 是最高優先/);
      assert.match(prompts[0], /Wiki evidence/);
      assert.match(prompts[0], /Raw evidence/);
      assert.match(logs[0], /根據 wiki 優先/);
      assert.doesNotMatch(logs[0], /CAPTURE_JSON/);
      assert.match(logs[1], /"layer":"wiki"/);
      assert.match(logs[1], /"layer":"raw"/);
      assert.match(logs[2], /^CAPTURE_DRAFT /);
    },
  );

  assert.equal(fs.existsSync(path.join(dir, "brainstorming", "chat")), false);
  const pendingDir = path.join(dir, ".joplin-llm-wiki", "pending-captures");
  assert.equal(fs.readdirSync(pendingDir).length, 1);
});

test("query --source-scope=wiki excludes raw context", async () => {
  const dir = tmpdir();
  writeKnowledge(dir);
  const configPath = writeConfig(dir);

  await withMockQuery("只看 wiki\nCAPTURE_JSON: {\"should_create\":false,\"classification\":\"brainstorming\",\"title\":\"\",\"content\":\"\",\"knowledge_sources\":[]}", async ({ prompts, logs }) => {
    const code = await runQuery({
      configPath,
      argv: ["問題？"],
      opts: new Map([["source-scope", "wiki"]]),
    });
    assert.equal(code, 0);
    assert.match(prompts[0], /Wiki evidence/);
    assert.doesNotMatch(prompts[0], /Raw evidence/);
    assert.doesNotMatch(logs.join("\n"), /CAPTURE_DRAFT/);
  });
});

test("query can answer from raw when wiki is empty", async () => {
  const dir = tmpdir();
  writeKnowledge(dir, { wiki: false, raw: true });
  const configPath = writeConfig(dir);

  await withMockQuery("根據 raw：答案", async ({ prompts, logs }) => {
    const code = await runQuery({
      configPath,
      argv: ["問題？"],
      opts: new Map(),
    });
    assert.equal(code, 0);
    assert.match(prompts[0], /Raw evidence/);
    assert.match(logs[1], /"layer":"raw"/);
  });
});

test("confirm-capture writes brainstorming note after confirmation", async () => {
  const dir = tmpdir();
  writeKnowledge(dir);
  const configPath = writeConfig(dir);
  let id = "";

  await withMockQuery(
    `答案
CAPTURE_JSON:
\`\`\`json
{"should_create":true,"classification":"brainstorming","title":"查詢紀錄","content":"保存內容","knowledge_sources":[{"layer":"wiki","path":"concepts/topic.md"}]}
\`\`\`
`,
    async ({ logs }) => {
      const code = await runQuery({ configPath, argv: ["問題？"], opts: new Map() });
      assert.equal(code, 0);
      id = JSON.parse(logs[2].replace(/^CAPTURE_DRAFT /, "")).id;
    },
  );

  const logs = [];
  const oldLog = console.log;
  console.log = (s) => logs.push(String(s));
  try {
    const code = await runQuery({
      configPath,
      argv: [],
      opts: new Map([["confirm-capture", id]]),
    });
    assert.equal(code, 0);
  } finally {
    console.log = oldLog;
  }

  const result = JSON.parse(logs[0]);
  assert.match(result.capture_written, /^brainstorming\/chat\//);
  const note = fs.readFileSync(path.join(dir, result.capture_written), "utf8");
  assert.match(note, /capture_classification: "brainstorming"/);
  assert.match(note, /layer: "wiki"/);
  assert.match(note, /保存內容/);
});

test("confirm-capture rejects artifacts without project", async () => {
  const dir = tmpdir();
  writeKnowledge(dir);
  const configPath = writeConfig(dir);
  let id = "";

  await withMockQuery(
    `答案
CAPTURE_JSON:
\`\`\`json
{"should_create":true,"classification":"artifacts","title":"作品草稿","content":"保存內容","knowledge_sources":[{"layer":"wiki","path":"concepts/topic.md"}]}
\`\`\`
`,
    async ({ logs }) => {
      const code = await runQuery({ configPath, argv: ["問題？"], opts: new Map() });
      assert.equal(code, 0);
      id = JSON.parse(logs[2].replace(/^CAPTURE_DRAFT /, "")).id;
    },
  );

  const errors = [];
  const oldError = console.error;
  console.error = (s) => errors.push(String(s));
  try {
    const code = await runQuery({
      configPath,
      argv: [],
      opts: new Map([["confirm-capture", id]]),
    });
    assert.equal(code, 1);
  } finally {
    console.error = oldError;
  }
  assert.match(errors[0], /ARTIFACT_PROJECT_REQUIRED/);
  assert.equal(fs.existsSync(path.join(dir, "artifacts")), false);
  assert.equal(
    fs.existsSync(path.join(dir, ".joplin-llm-wiki", "pending-captures", `${id}.json`)),
    true,
  );
});

test("confirm-capture writes artifacts under confirmed project root", async () => {
  const dir = tmpdir();
  writeKnowledge(dir);
  const configPath = writeConfig(dir);
  let id = "";

  await withMockQuery(
    `答案
CAPTURE_JSON:
\`\`\`json
{"should_create":true,"classification":"artifacts","title":"作品草稿","content":"保存內容","knowledge_sources":[{"layer":"wiki","path":"concepts/topic.md"}]}
\`\`\`
`,
    async ({ logs }) => {
      const code = await runQuery({ configPath, argv: ["問題？"], opts: new Map() });
      assert.equal(code, 0);
      id = JSON.parse(logs[2].replace(/^CAPTURE_DRAFT /, "")).id;
    },
  );

  const logs = [];
  const oldLog = console.log;
  console.log = (s) => logs.push(String(s));
  try {
    const code = await runQuery({
      configPath,
      argv: [],
      opts: new Map([
        ["confirm-capture", id],
        ["artifact-project", "tainan-city"],
      ]),
    });
    assert.equal(code, 0);
  } finally {
    console.log = oldLog;
  }

  const result = JSON.parse(logs[0]);
  assert.match(result.capture_written, /^artifacts\/tainan-city\//);
  assert.doesNotMatch(result.capture_written, /^artifacts\/projects\//);
  assert.equal(fs.existsSync(path.join(dir, result.capture_written)), true);
  assert.equal(fs.existsSync(path.join(dir, "artifacts", "projects", "tainan-city")), false);
  const note = fs.readFileSync(path.join(dir, result.capture_written), "utf8");
  assert.match(note, /capture_classification: "artifacts"/);
  assert.match(note, /capture_path: "artifacts\/tainan-city\//);
  assert.doesNotMatch(note, /^# 保存內容$/m);
  assert.match(note, /# 回答\n\n答案\n\n保存內容\n$/);
});
