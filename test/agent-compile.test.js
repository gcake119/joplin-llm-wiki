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

test("agent-compile dry-run emits prompt and does not spawn codex", async () => {
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
          return makeChild();
        },
        loadConfig: async () =>
          /** @type {any} */ ({
            notes_root: "/notes",
            notes_glob: "**/*.md",
            wiki_root: "/wiki",
          }),
        discoverMarkdown: async () => ["/notes/工作-專案A/會議.md"],
      },
    );
    assert.strictEqual(code, 0);
    assert.strictEqual(spawns, 0);
    const parsed = JSON.parse(line);
    assert.strictEqual(parsed.agent_compile, "dry_run");
    assert.match(parsed.prompt, /工作-專案A/);
    assert.match(parsed.prompt, /domain isolation 是硬限制/);
    assert.match(parsed.prompt, /不得建立跨 notebook 的總結/);
    assert.match(parsed.prompt, /段落標題需依主題與來源證據選擇/);
    assert.match(parsed.prompt, /沒有價值或沒有證據的段落必須省略/);
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
            notes_root: "/notes",
            notes_glob: "**/*.md",
            wiki_root: "/wiki",
          }),
        discoverMarkdown: async () => ["/notes/nb/a.md"],
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
    assert.match(calls[0].args[7], /source_refs 必須全部以同一個 <notebook-slug>\/ 開頭/);
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
            notes_root: "/notes",
            notes_glob: "**/*.md",
            wiki_root: "/wiki",
            joplin_wiki_writeback: { enabled: true },
          }),
        discoverMarkdown: async (root) => {
          if (root === "/notes") return ["/notes/nb/a.md"];
          if (root === "/wiki") {
            return [
              "/wiki/nb/index.md",
              "/wiki/nb/topics/a.md",
              "/wiki/other/index.md",
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
      relPaths: ["nb/index.md", "nb/topics/a.md"],
      options: { dryRun: false },
    });
    const parsed = JSON.parse(line);
    assert.strictEqual(parsed.agent_compile, "ok");
    assert.strictEqual(parsed.writeback_written, 2);
  } finally {
    console.log = origLog;
  }
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
              notes_root: "/notes",
              notes_glob: "**/*.md",
              wiki_root: "/wiki",
            }),
          discoverMarkdown: async () => ["/notes/nb/a.md"],
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
              notes_root: "/notes",
              notes_glob: "**/*.md",
              wiki_root: "/wiki",
            }),
          discoverMarkdown: async () => ["/notes/nb/a.md"],
        },
      ),
    (e) => /** @type {{ code?: string }} */ (e).code === "CODEX_CLI_UNAVAILABLE",
  );
});
