import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseWikiMarkdown } from "../src/wiki/frontmatter.js";

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "jllw-concept-resume-"));
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

function writeConfig(dir, raw, wiki, schema, opts = {}) {
  const writebackEnabled = opts.writebackEnabled === true;
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
  corpus_digest_max_files: 40
ollama:
  chat_model: test
joplin_wiki_writeback:
  enabled: ${writebackEnabled ? "true" : "false"}
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

test("concept resume dry-run reads existing summaries without rewriting them", async () => {
  const dir = tmpdir();
  const raw = path.join(dir, "raw");
  const wiki = path.join(dir, "wiki");
  fs.mkdirSync(path.join(wiki, "summaries"), { recursive: true });
  fs.mkdirSync(raw, { recursive: true });
  const schema = writeSchema(dir);
  const configPath = writeConfig(dir, raw, wiki, schema);
  const summaryRel = "summaries/depression-support.md";
  const summaryAbs = path.join(wiki, summaryRel);
  const summaryBefore = `---
source_refs:
  - counseling/depression.md
compiled_at: "2026-05-23T00:00:00.000Z"
compiler_revision: test
domain: counseling
title: 憂鬱症陪伴摘要
---
# 憂鬱症陪伴摘要

此摘要整理心理健康、諮商與求助資源。
`;
  fs.writeFileSync(summaryAbs, summaryBefore, "utf8");

  const { runWikiCompileFlow } = await import("../src/wiki/wiki-compiler.js");
  const lines = [];
  const oldLog = console.log;
  const oldFetch = globalThis.fetch;
  console.log = (s) => lines.push(String(s));
  globalThis.fetch = async () => ({
    ok: true,
    async json() {
      return { message: { content: JSON.stringify({ concepts: [] }) } };
    },
  });
  try {
    await runWikiCompileFlow({
      ctx: {
        configPath,
        argv: [],
        opts: new Map([
          ["dry-run", "true"],
          ["resume-stage", "concepts"],
        ]),
      },
    });
  } finally {
    console.log = oldLog;
    globalThis.fetch = oldFetch;
  }

  const payload = JSON.parse(lines.at(-1));
  assert.equal(payload.dry_run, true);
  assert.equal(payload.resume_stage, "concepts");
  assert.deepEqual(payload.summary_paths_read, [summaryRel]);
  assert.equal(fs.readFileSync(summaryAbs, "utf8"), summaryBefore);
});

test("concept resume dry-run keeps LLM semantic merges on one canonical concept path", async () => {
  const dir = tmpdir();
  const raw = path.join(dir, "raw");
  const wiki = path.join(dir, "wiki");
  fs.mkdirSync(path.join(wiki, "summaries"), { recursive: true });
  fs.mkdirSync(raw, { recursive: true });
  const schema = writeSchema(dir);
  const configPath = writeConfig(dir, raw, wiki, schema);
  fs.writeFileSync(
    path.join(wiki, "summaries", "depression-support.md"),
    `---
source_refs:
  - counseling/depression.md
compiled_at: "2026-05-23T00:00:00.000Z"
compiler_revision: test
domain: counseling
title: 憂鬱症陪伴摘要
---
# 憂鬱症陪伴摘要

諮商、心理衛教與求助資源。
`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(wiki, "summaries", "mental-health-help.md"),
    `---
source_refs:
  - counseling/help.md
compiled_at: "2026-05-23T00:00:00.000Z"
compiler_revision: test
domain: counseling
title: 心理健康求助摘要
---
# 心理健康求助摘要

同樣聚焦在憂鬱症陪伴、心理健康求助與心理衛教。
`,
    "utf8",
  );

  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(body.format, "json");
    return {
      ok: true,
      async json() {
        return {
          message: {
            content: JSON.stringify({
              concepts: [
                {
                  slug: "depression-support-and-psychoeducation",
                  title: "憂鬱症陪伴、心理衛教與求助",
                  source_refs: [
                    "counseling/depression.md",
                    "counseling/help.md",
                  ],
                  summary_refs: [
                    "summaries/depression-support.md",
                    "summaries/mental-health-help.md",
                  ],
                  merged_from: ["心理健康求助摘要"],
                  semantic_decisions: [
                    {
                      relation: "same_topic",
                      confidence: "high",
                      reason: "兩篇摘要都在談憂鬱症陪伴、心理衛教與求助。",
                    },
                  ],
                },
              ],
            }),
          },
        };
      },
    };
  };

  try {
    const { runWikiCompileFlow } = await import("../src/wiki/wiki-compiler.js");
    const payloads = [];
    for (let i = 0; i < 2; i++) {
      const lines = [];
      const oldLog = console.log;
      console.log = (s) => lines.push(String(s));
      try {
        await runWikiCompileFlow({
          ctx: {
            configPath,
            argv: [],
            opts: new Map([
              ["dry-run", "true"],
              ["resume-stage", "concepts"],
            ]),
          },
        });
      } finally {
        console.log = oldLog;
      }
      payloads.push(JSON.parse(lines.at(-1)));
    }

    for (const payload of payloads) {
      assert.deepEqual(payload.concept_paths_planned, [
        "concepts/depression-support-and-psychoeducation.md",
      ]);
      assert.equal(payload.canonical_merge_count, 1);
      assert.equal(payload.semantic_decision_count, 1);
    }
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test("concept resume writes canonical concept files with matching title, H1, source refs, and index", async () => {
  const dir = tmpdir();
  const raw = path.join(dir, "raw");
  const wiki = path.join(dir, "wiki");
  fs.mkdirSync(path.join(wiki, "summaries"), { recursive: true });
  fs.mkdirSync(path.join(raw, "counseling"), { recursive: true });
  fs.writeFileSync(
    path.join(raw, "counseling", "depression.md"),
    "# 憂鬱症陪伴\n",
  );
  fs.writeFileSync(path.join(raw, "counseling", "help.md"), "# 求助資源\n");
  const schema = writeSchema(dir);
  const configPath = writeConfig(dir, raw, wiki, schema);
  fs.writeFileSync(
    path.join(wiki, "summaries", "depression-support.md"),
    `---
source_refs:
  - counseling/depression.md
compiled_at: "2026-05-23T00:00:00.000Z"
compiler_revision: test
domain: counseling
title: 憂鬱症陪伴摘要
---
# 憂鬱症陪伴摘要

諮商、心理衛教與求助資源。
`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(wiki, "summaries", "mental-health-help.md"),
    `---
source_refs:
  - counseling/help.md
compiled_at: "2026-05-23T00:00:00.000Z"
compiler_revision: test
domain: counseling
title: 心理健康求助摘要
---
# 心理健康求助摘要

同樣聚焦在憂鬱症陪伴、心理健康求助與心理衛教。
`,
    "utf8",
  );

  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    async json() {
      return {
        message: {
          content: JSON.stringify({
            concepts: [
              {
                slug: "depression-support-and-psychoeducation",
                title: "憂鬱症陪伴、心理衛教與求助",
                source_refs: ["counseling/depression.md", "counseling/help.md"],
                summary_refs: [
                  "summaries/depression-support.md",
                  "summaries/mental-health-help.md",
                ],
                merged_from: ["心理健康求助摘要"],
                semantic_decisions: [
                  {
                    relation: "same_topic",
                    confidence: "high",
                    reason: "語意上屬於同一個心理健康求助主題。",
                  },
                ],
              },
            ],
          }),
        },
      };
    },
  });

  try {
    const { runWikiCompileFlow } = await import("../src/wiki/wiki-compiler.js");
    const lines = [];
    const oldLog = console.log;
    console.log = (s) => lines.push(String(s));
    try {
      await runWikiCompileFlow({
        ctx: {
          configPath,
          argv: [],
          opts: new Map([["resume-stage", "concepts"]]),
        },
      });
    } finally {
      console.log = oldLog;
    }

    const payload = JSON.parse(lines.at(-1));
    assert.deepEqual(payload.concept_paths_written, [
      "concepts/depression-support-and-psychoeducation.md",
    ]);
    assert.deepEqual(payload.index_paths_written, ["indexes/All-Concepts.md"]);

    const conceptAbs = path.join(
      wiki,
      "concepts",
      "depression-support-and-psychoeducation.md",
    );
    const parsed = parseWikiMarkdown(fs.readFileSync(conceptAbs, "utf8"));
    assert.equal(parsed.data.title, "憂鬱症陪伴、心理衛教與求助");
    assert.deepEqual(parsed.data.source_refs, [
      "counseling/depression.md",
      "counseling/help.md",
    ]);
    assert.match(parsed.body, /^# 憂鬱症陪伴、心理衛教與求助/m);

    const index = fs.readFileSync(
      path.join(wiki, "indexes", "All-Concepts.md"),
      "utf8",
    );
    assert.match(index, /憂鬱症陪伴、心理衛教與求助/);
    assert.doesNotMatch(index, /心理健康求助摘要/);
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test("writeback resume dry-run uses only concepts and All-Concepts without Ollama", async () => {
  const dir = tmpdir();
  const raw = path.join(dir, "raw");
  const wiki = path.join(dir, "wiki");
  fs.mkdirSync(path.join(wiki, "summaries"), { recursive: true });
  fs.mkdirSync(path.join(wiki, "concepts"), { recursive: true });
  fs.mkdirSync(path.join(wiki, "indexes"), { recursive: true });
  fs.mkdirSync(raw, { recursive: true });
  const schema = writeSchema(dir);
  const configPath = writeConfig(dir, raw, wiki, schema, {
    writebackEnabled: true,
  });
  fs.writeFileSync(
    path.join(wiki, "summaries", "should-not-write.md"),
    `---
source_refs: []
compiled_at: "2026-05-23T00:00:00.000Z"
compiler_revision: test
title: Should Not Write
---
# Should Not Write
`,
  );
  fs.writeFileSync(
    path.join(wiki, "concepts", "depression-support.md"),
    `---
source_refs: []
compiled_at: "2026-05-23T00:00:00.000Z"
compiler_revision: test
domain: concepts
title: 憂鬱症陪伴、心理衛教與求助
---
# 憂鬱症陪伴、心理衛教與求助
`,
  );
  fs.writeFileSync(
    path.join(wiki, "indexes", "All-Concepts.md"),
    `---
source_refs: []
compiled_at: "2026-05-23T00:00:00.000Z"
compiler_revision: test
domain: indexes
title: All Concepts
---
# All Concepts
`,
  );

  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("Ollama should not be called for writeback resume dry-run");
  };
  try {
    const { runWikiCompileFlow } = await import("../src/wiki/wiki-compiler.js");
    const lines = [];
    const oldLog = console.log;
    console.log = (s) => lines.push(String(s));
    try {
      await runWikiCompileFlow({
        ctx: {
          configPath,
          argv: [],
          opts: new Map([
            ["dry-run", "true"],
            ["resume-stage", "writeback"],
          ]),
        },
      });
    } finally {
      console.log = oldLog;
    }

    const payload = JSON.parse(lines.at(-1));
    assert.equal(payload.resume_stage, "writeback");
    assert.deepEqual(payload.writeback_relpaths, [
      "concepts/depression-support.md",
      "indexes/All-Concepts.md",
    ]);
    assert.equal(payload.writeback_would_write, 2);
    assert.equal(
      payload.writeback_relpaths.some((p) => p.startsWith("summaries/")),
      false,
    );
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test("concept resume merge counts follow LLM semantic relation, not title similarity", async () => {
  const dir = tmpdir();
  const raw = path.join(dir, "raw");
  const wiki = path.join(dir, "wiki");
  fs.mkdirSync(path.join(wiki, "summaries"), { recursive: true });
  fs.mkdirSync(raw, { recursive: true });
  const schema = writeSchema(dir);
  const configPath = writeConfig(dir, raw, wiki, schema);
  for (const name of [
    "frontend-learning.md",
    "javascript-tdd.md",
    "personal-finance.md",
    "investing-discipline.md",
  ]) {
    fs.writeFileSync(
      path.join(wiki, "summaries", name),
      `---
source_refs: []
compiled_at: "2026-05-23T00:00:00.000Z"
compiler_revision: test
domain: notes
title: ${name}
---
# ${name}
`,
    );
  }

  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    async json() {
      return {
        message: {
          content: JSON.stringify({
            concepts: [
              {
                slug: "frontend-learning",
                title: "前端學習",
                summary_refs: ["summaries/frontend-learning.md"],
                merged_from: ["前端學習與 JavaScript TDD"],
                semantic_decisions: [
                  {
                    relation: "distinct_topic",
                    confidence: "high",
                    reason: "一篇是學習規劃，一篇是測試實作。",
                  },
                ],
              },
              {
                slug: "personal-finance-and-allocation",
                title: "個人理財與資產配置",
                summary_refs: [
                  "summaries/personal-finance.md",
                  "summaries/investing-discipline.md",
                ],
                merged_from: ["投資理財紀律"],
                semantic_decisions: [
                  {
                    relation: "same_topic",
                    confidence: "high",
                    reason: "不同標題都在談資產配置與投資紀律。",
                  },
                ],
              },
            ],
          }),
        },
      };
    },
  });

  try {
    const { runWikiCompileFlow } = await import("../src/wiki/wiki-compiler.js");
    const lines = [];
    const oldLog = console.log;
    console.log = (s) => lines.push(String(s));
    try {
      await runWikiCompileFlow({
        ctx: {
          configPath,
          argv: [],
          opts: new Map([
            ["dry-run", "true"],
            ["resume-stage", "concepts"],
          ]),
        },
      });
    } finally {
      console.log = oldLog;
    }

    const payload = JSON.parse(lines.at(-1));
    assert.deepEqual(payload.concept_paths_planned, [
      "concepts/frontend-learning.md",
      "concepts/personal-finance-and-allocation.md",
    ]);
    assert.equal(payload.semantic_decision_count, 2);
    assert.equal(payload.canonical_merge_count, 1);
  } finally {
    globalThis.fetch = oldFetch;
  }
});
