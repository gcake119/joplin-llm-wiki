import assert from "node:assert";
import { EventEmitter } from "node:events";
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
    assert.deepStrictEqual(calls[0].args.slice(0, 7), [
      "exec",
      "--cd",
      process.cwd(),
      "--sandbox",
      "workspace-write",
      "--ask-for-approval",
      "never",
    ]);
    assert.strictEqual(JSON.parse(line).agent_compile, "ok");
  } finally {
    console.log = origLog;
  }
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
