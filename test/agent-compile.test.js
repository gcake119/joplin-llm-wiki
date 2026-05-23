import assert from "node:assert";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { runAgentCompile } from "../src/commands/cmd-agent-compile.js";

function makeChild() {
  const c = new EventEmitter();
  c.stdout = new EventEmitter();
  c.stderr = new EventEmitter();
  return c;
}

test("agent-compile dry-run defaults to full-library prompt and does not spawn codex", async () => {
  let spawns = 0;
  let line = "";
  const origLog = console.log;
  console.log = (x) => {
    line = String(x);
  };
  try {
    const code = await runAgentCompile(
      { configPath: "./config.yaml", argv: [], opts: new Map([["dry-run", "true"]]) },
      {
        spawn: () => {
          spawns++;
          const c = makeChild();
          queueMicrotask(() => c.emit("close", 0));
          return c;
        },
        loadConfig: async () =>
          /** @type {any} */ ({
            raw: "/raw",
            raw_glob: "**/*.md",
            wiki: "/wiki",
          }),
        discoverMarkdown: async () => ["/raw/工作-專案A/會議.md"],
      },
    );
    assert.strictEqual(code, 0);
    assert.strictEqual(spawns, 0);
    const parsed = JSON.parse(line);
    assert.strictEqual(parsed.agent_compile, "dry_run");
    assert.match(parsed.prompt, /工作-專案A/);
    assert.match(parsed.prompt, /summaries：每個來源一份摘要/);
    assert.match(parsed.prompt, /concepts：概念條目/);
    assert.match(parsed.prompt, /段落標題需依主題與來源證據選擇/);
    assert.match(parsed.prompt, /沒有價值或沒有證據的段落必須省略/);
    assert.match(parsed.prompt, /不得在 summaries、concepts、indexes 底下建立子資料夾/);
    assert.match(parsed.prompt, /All-Sources\.md/);
    assert.strictEqual(parsed.full_library, true);
    assert.match(parsed.prompt, /初始化全庫掃描模式/);
    assert.doesNotMatch(parsed.prompt, /一次最多更新 10-15 個 wiki 頁面/);
  } finally {
    console.log = origLog;
  }
});

test("agent-compile batch dry-run keeps 10-15 page fallback", async () => {
  let line = "";
  const origLog = console.log;
  console.log = (x) => {
    line = String(x);
  };
  try {
    const code = await runAgentCompile(
      {
        configPath: "./config.yaml",
        argv: [],
        opts: new Map([
          ["dry-run", "true"],
          ["batch", "true"],
        ]),
      },
      {
        loadConfig: async () =>
          /** @type {any} */ ({
            raw: "/raw",
            raw_glob: "**/*.md",
            wiki: "/wiki",
          }),
        discoverMarkdown: async () => ["/raw/a.md", "/raw/project/b.md"],
      },
    );
    assert.strictEqual(code, 0);
    const parsed = JSON.parse(line);
    assert.strictEqual(parsed.full_library, false);
    assert.match(parsed.prompt, /一次最多更新 10-15 個 wiki 頁面/);
    assert.doesNotMatch(parsed.prompt, /初始化全庫掃描模式/);
  } finally {
    console.log = origLog;
  }
});

test("agent-compile spawns codex exec with workspace-write sandbox", async () => {
  const calls = [];
  let line = "";
  const origLog = console.log;
  console.log = (x) => {
    line = String(x);
  };
  try {
    const code = await runAgentCompile(
      { configPath: path.resolve("cfg.yaml"), argv: [], opts: new Map() },
      {
        spawn: (cmd, args, opts) => {
          calls.push({ cmd, args, cwd: opts.cwd });
          const c = makeChild();
          queueMicrotask(() => c.emit("close", 0));
          return c;
        },
        loadConfig: async () =>
          /** @type {any} */ ({
            raw: "/raw",
            raw_glob: "**/*.md",
            wiki: "/wiki",
          }),
        discoverMarkdown: async () => ["/raw/nb/a.md"],
      },
    );
    assert.strictEqual(code, 0);
    assert.strictEqual(calls[0].cmd, "codex");
    assert.deepStrictEqual(calls[0].args.slice(0, 6), [
      "exec",
      "--cd",
      process.cwd(),
      "--sandbox",
      "workspace-write",
      "--output-last-message",
    ]);
    assert.match(calls[0].args[7], /請執行 joplin-llm-wiki agent-based compile workflow/);
    assert.match(calls[0].args[7], /不要執行 pnpm exec joplin-llm-wiki agent-compile/);
    assert.match(calls[0].args[7], /source_refs 必須是 raw\/ 下存在的相對路徑/);
    assert.strictEqual(JSON.parse(line).agent_compile, "ok");
  } finally {
    console.log = origLog;
  }
});

test("agent-compile writes generated wiki pages back to Joplin Data API when enabled", async () => {
  const calls = [];
  let writebackCall = null;
  let line = "";
  const origLog = console.log;
  console.log = (x) => {
    line = String(x);
  };
  try {
    const code = await runAgentCompile(
      { configPath: path.resolve("cfg.yaml"), argv: [], opts: new Map() },
      {
        spawn: (cmd, args, opts) => {
          calls.push({ cmd, args, cwd: opts.cwd });
          const c = makeChild();
          queueMicrotask(() => c.emit("close", 0));
          return c;
        },
        loadConfig: async () =>
          /** @type {any} */ ({
            raw: "/raw",
            raw_glob: "**/*.md",
            wiki: "/wiki",
            joplin_wiki_writeback: { enabled: true },
          }),
        discoverMarkdown: async (root) => {
          if (root === "/raw") return ["/raw/nb/a.md"];
          if (root === "/wiki") {
            return [
              "/wiki/summaries/a.md",
              "/wiki/concepts/a.md",
              "/wiki/concepts/nested.md",
            ];
          }
          return [];
        },
        runWikiWriteback: async (_cfg, wikiRoot, relPaths, options) => {
          writebackCall = { wikiRoot, relPaths, options };
          return {
            writeback_written: relPaths.length,
            writeback_skipped: 0,
            writeback_notebooks_ensured: 1,
            writeback_collision_count: 0,
          };
        },
      },
    );
    assert.strictEqual(code, 0);
    assert.deepStrictEqual(writebackCall, {
      wikiRoot: "/wiki",
      relPaths: ["concepts/a.md", "concepts/nested.md"],
      options: { dryRun: false },
    });
    const parsed = JSON.parse(line);
    assert.strictEqual(parsed.agent_compile, "ok");
    assert.strictEqual(parsed.writeback_written, 2);
  } finally {
    console.log = origLog;
  }
});

test("agent-compile concept resume writes local concepts and defers writeback", async () => {
  const dir = fs.mkdtempSync(path.join(process.cwd(), ".tmp-agent-resume-"));
  const raw = path.join(dir, "raw");
  const wiki = path.join(dir, "wiki");
  fs.mkdirSync(path.join(raw, "src"), { recursive: true });
  fs.mkdirSync(path.join(wiki, "summaries"), { recursive: true });
  fs.writeFileSync(path.join(raw, "src", "a.md"), "# raw\n");
  fs.writeFileSync(
    path.join(wiki, "summaries", "a.md"),
    "---\ntitle: Summary\nsource_refs:\n  - src/a.md\ncompiled_at: now\ncompiler_revision: test\ndomain: notes\n---\n# Summary\n",
  );

  let writebackCalled = false;
  let line = "";
  const origLog = console.log;
  console.log = (x) => {
    line = String(x);
  };
  try {
    const code = await runAgentCompile(
      {
        configPath: path.join(dir, "config.yaml"),
        argv: [],
        opts: new Map([["resume-stage", "concepts"]]),
      },
      {
        spawn: (_cmd, args) => {
          const c = makeChild();
          const outPath = args[args.indexOf("--output-last-message") + 1];
          queueMicrotask(() => {
            fs.mkdirSync(path.join(wiki, "concepts"), { recursive: true });
            fs.mkdirSync(path.join(wiki, "indexes"), { recursive: true });
            fs.writeFileSync(
              path.join(wiki, "concepts", "topic.md"),
              "---\ntitle: Topic\nsource_refs:\n  - src/a.md\ncompiled_at: now\ncompiler_revision: test\ndomain: concepts\n---\n# Topic\n",
            );
            fs.writeFileSync(
              path.join(wiki, "indexes", "All-Concepts.md"),
              "---\ntitle: All Concepts\nsource_refs:\n  - src/a.md\ncompiled_at: now\ncompiler_revision: test\ndomain: indexes\n---\n# All Concepts\n",
            );
            fs.writeFileSync(outPath, "寫入檔案清單：wiki/concepts/topic.md", "utf8");
            c.emit("close", 0);
          });
          return c;
        },
        loadConfig: async () =>
          /** @type {any} */ ({
            raw,
            raw_glob: "**/*.md",
            wiki,
            joplin_wiki_writeback: { enabled: true },
          }),
        discoverMarkdown: async (root, glob) => {
          if (root === raw) return [path.join(raw, "src", "a.md")];
          if (root === wiki && glob === "summaries/*.md") {
            return [path.join(wiki, "summaries", "a.md")];
          }
          if (root === wiki && glob === "concepts/*.md") {
            return [path.join(wiki, "concepts", "topic.md")];
          }
          if (root === wiki && glob === "**/*.md") {
            return [
              path.join(wiki, "summaries", "a.md"),
              path.join(wiki, "concepts", "topic.md"),
              path.join(wiki, "indexes", "All-Concepts.md"),
            ];
          }
          return [];
        },
        runWikiWriteback: async () => {
          writebackCalled = true;
          return {};
        },
      },
    );
    assert.strictEqual(code, 0);
    assert.strictEqual(writebackCalled, false);
    const parsed = JSON.parse(line);
    assert.strictEqual(parsed.agent_compile, "ok");
    assert.strictEqual(parsed.compile_adapter, "agent");
    assert.strictEqual(parsed.resume_stage, "concepts");
    assert.strictEqual(parsed.writeback_deferred, true);
    assert.deepStrictEqual(parsed.summary_paths_read, ["summaries/a.md"]);
    assert.deepStrictEqual(parsed.changed_summary_paths, []);
    assert.deepStrictEqual(parsed.concept_paths_written, ["concepts/topic.md"]);
    assert.deepStrictEqual(parsed.writeback_relpaths, [
      "concepts/topic.md",
      "indexes/All-Concepts.md",
    ]);
  } finally {
    console.log = origLog;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("agent-compile writeback resume uses shared writeback without spawning codex", async () => {
  let spawns = 0;
  let writebackCall = null;
  let line = "";
  const origLog = console.log;
  console.log = (x) => {
    line = String(x);
  };
  try {
    const code = await runAgentCompile(
      {
        configPath: path.resolve("cfg.yaml"),
        argv: [],
        opts: new Map([["resume-stage", "writeback"]]),
      },
      {
        spawn: () => {
          spawns++;
          return makeChild();
        },
        loadConfig: async () =>
          /** @type {any} */ ({
            raw: "/raw",
            raw_glob: "**/*.md",
            wiki: "/wiki",
            joplin_wiki_writeback: { enabled: true },
          }),
        discoverMarkdown: async (root, glob) => {
          if (root === "/wiki" && glob === "concepts/*.md") {
            return ["/wiki/concepts/topic.md"];
          }
          return [];
        },
        runWikiWriteback: async (_cfg, wikiRoot, relPaths, options) => {
          writebackCall = { wikiRoot, relPaths, options };
          return { writeback_written: relPaths.length };
        },
      },
    );
    assert.strictEqual(code, 0);
    assert.strictEqual(spawns, 0);
    assert.deepStrictEqual(writebackCall, {
      wikiRoot: "/wiki",
      relPaths: ["concepts/topic.md"],
      options: { dryRun: false },
    });
    const parsed = JSON.parse(line);
    assert.strictEqual(parsed.compile_adapter, "agent");
    assert.strictEqual(parsed.resume_stage, "writeback");
    assert.deepStrictEqual(parsed.writeback_relpaths, ["concepts/topic.md"]);
    assert.strictEqual(parsed.writeback_written, 1);
  } finally {
    console.log = origLog;
  }
});

test("agent-compile fails before writeback when concept title and H1 mismatch", async () => {
  const dir = fs.mkdtempSync(path.join(process.cwd(), ".tmp-agent-"));
  const raw = path.join(dir, "raw");
  const wiki = path.join(dir, "wiki");
  fs.mkdirSync(path.join(raw, "src"), { recursive: true });
  fs.mkdirSync(path.join(wiki, "concepts"), { recursive: true });
  fs.writeFileSync(path.join(raw, "src", "a.md"), "# raw\n");
  fs.writeFileSync(
    path.join(wiki, "concepts", "bad.md"),
    `---
source_refs:
  - src/a.md
compiled_at: "2026-05-23T00:00:00.000Z"
compiler_revision: test
domain: concepts
title: 正確標題
---
# 錯誤標題
`,
  );

  await assert.rejects(
    () =>
      runAgentCompile(
        { configPath: "cfg.yaml", argv: [], opts: new Map() },
        {
          spawn: (_cmd, args) => {
            const c = makeChild();
            const outPath = args[args.indexOf("--output-last-message") + 1];
            queueMicrotask(() => {
              fs.writeFileSync(outPath, "寫入檔案清單：wiki/concepts/bad.md", "utf8");
              c.emit("close", 0);
            });
            return c;
          },
          loadConfig: async () =>
            /** @type {any} */ ({
              raw,
              raw_glob: "**/*.md",
              wiki,
              joplin_wiki_writeback: { enabled: true },
            }),
          discoverMarkdown: async (root) => {
            if (root === raw) return [path.join(raw, "src", "a.md")];
            if (root === wiki) return [path.join(wiki, "concepts", "bad.md")];
            return [];
          },
          runWikiWriteback: async () => {
            throw new Error("writeback should not run after invalid agent concept");
          },
        },
      ),
    (e) => /** @type {{ code?: string }} */ (e).code === "AGENT_COMPILE_FAILED",
  );
});

test("agent-compile fails when codex final message reports no writes", async () => {
  await assert.rejects(
    () =>
      runAgentCompile(
        { configPath: "cfg.yaml", argv: [], opts: new Map() },
        {
          spawn: (_cmd, args) => {
            const c = makeChild();
            const outPath = args[args.indexOf("--output-last-message") + 1];
            queueMicrotask(() => {
              fs.writeFileSync(
                outPath,
                "結果未完成。\n寫入檔案清單：無。\nCODEX_CLI_UNAVAILABLE",
                "utf8",
              );
              c.emit("close", 0);
            });
            return c;
          },
          loadConfig: async () =>
            /** @type {any} */ ({
              raw: "/raw",
              raw_glob: "**/*.md",
              wiki: "/wiki",
            }),
          discoverMarkdown: async () => ["/raw/nb/a.md"],
        },
      ),
    (e) => /** @type {{ code?: string }} */ (e).code === "AGENT_COMPILE_FAILED",
  );
});

test("agent-compile maps codex spawn failure to CODEX_CLI_UNAVAILABLE", async () => {
  await assert.rejects(
    () =>
      runAgentCompile(
        { configPath: "cfg.yaml", argv: [], opts: new Map() },
        {
          spawn: () => {
            const c = makeChild();
            queueMicrotask(() => c.emit("error", new Error("ENOENT")));
            return c;
          },
          loadConfig: async () =>
            /** @type {any} */ ({
              raw: "/raw",
              raw_glob: "**/*.md",
              wiki: "/wiki",
            }),
          discoverMarkdown: async () => ["/raw/nb/a.md"],
        },
      ),
    (e) => /** @type {{ code?: string }} */ (e).code === "CODEX_CLI_UNAVAILABLE",
  );
});
