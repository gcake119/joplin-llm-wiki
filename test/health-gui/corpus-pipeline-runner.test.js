import assert from "node:assert";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { test } from "vitest";

import {
  runCorpusPipeline,
  runInitPipeline,
  runLintWorkflow,
  runQueryWorkflow,
  runSnapshotPipeline,
} from "../../src/health-gui/corpus/corpus-pipeline-runner.js";

const repoRoot = "/repo/abs";
const cfgAbs = "/tmp/fixture/cfg.yaml";

function makeChild() {
  const c = new EventEmitter();
  c.stdout = new EventEmitter();
  c.stderr = new EventEmitter();
  return c;
}

test("SCN-HGUI-CORPUS-01 rejects without confirmed — zero spawn", async () => {
  let spawns = 0;
  const spawnImpl = () => {
    spawns++;
    return makeChild();
  };
  const r = await runCorpusPipeline(repoRoot, cfgAbs, { confirmed: false }, spawnImpl);
  assert.strictEqual(spawns, 0);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, "CONFIRMATION_REQUIRED");
  assert.strictEqual(r.wikiCompile.exitCode, null);
});

test("SCN-HGUI-CORPUS-02 argv and cwd for wiki-compile exits 0", async () => {
  const calls = [];
  const spawnImpl = (cmd, args, opts) => {
    calls.push({ cmd, args: [...args], cwd: opts.cwd });
    const c = makeChild();
    queueMicrotask(() => c.emit("close", 0));
    return c;
  };
  const r = await runCorpusPipeline(repoRoot, cfgAbs, { confirmed: true }, spawnImpl);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.code, "OK");
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].cmd, "pnpm");
  assert.deepStrictEqual(calls[0].args, [
    "exec",
    "joplin-llm-wiki",
    "wiki-compile",
    "--config",
    path.resolve(cfgAbs),
  ]);
  assert.strictEqual(calls[0].cwd, path.resolve(repoRoot));
  assert.strictEqual(r.wikiCompile.exitCode, 0);
});

test("SCN-HGUI-CORPUS-03 wiki-compile non-zero returns failure", async () => {
  let spawns = 0;
  const spawnImpl = () => {
    spawns++;
    const c = makeChild();
    queueMicrotask(() => c.emit("close", 2));
    return c;
  };
  const r = await runCorpusPipeline(repoRoot, cfgAbs, { confirmed: true }, spawnImpl);
  assert.strictEqual(spawns, 1);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, "WIKI_COMPILE_FAILED");
  assert.strictEqual(r.wikiCompile.exitCode, 2);
});

test("SCN-HGUI-CORPUS-agent mode spawns agent-compile in full-library mode", async () => {
  const calls = [];
  const spawnImpl = (cmd, args, opts) => {
    calls.push({ cmd, args: [...args], cwd: opts.cwd });
    const c = makeChild();
    queueMicrotask(() => c.emit("close", 0));
    return c;
  };
  const r = await runCorpusPipeline(
    repoRoot,
    cfgAbs,
    { confirmed: true, compileMode: "agent" },
    spawnImpl,
  );
  assert.strictEqual(r.ok, true);
  assert.strictEqual(calls.length, 1);
  assert.deepStrictEqual(calls[0].args, [
    "exec",
    "joplin-llm-wiki",
    "agent-compile",
    "--config",
    path.resolve(cfgAbs),
    "--full-library=true",
  ]);
});

test("SCN-HGUI-CORPUS-04 overlapping request returns PIPELINE_IN_FLIGHT", async () => {
  /** @type {import('node:events').EventEmitter[]} */
  const children = [];
  const spawnImpl = () => {
    const c = makeChild();
    children.push(c);
    if (children.length === 1) {
      return c;
    }
    queueMicrotask(() => c.emit("close", 0));
    return c;
  };
  const p1 = runCorpusPipeline(repoRoot, cfgAbs, { confirmed: true }, spawnImpl);
  await new Promise((res) => setImmediate(res));
  assert.strictEqual(children.length, 1);
  const r2 = await runCorpusPipeline(repoRoot, cfgAbs, { confirmed: true }, spawnImpl);
  assert.strictEqual(r2.ok, false);
  assert.strictEqual(r2.code, "PIPELINE_IN_FLIGHT");
  assert.strictEqual(children.length, 1);
  children[0].emit("close", 0);
  const r1 = await p1;
  assert.strictEqual(r1.ok, true);
});

test("SCN-HGUI-INIT-01 rejects without confirmed — zero spawn", async () => {
  let spawns = 0;
  const spawnImpl = () => {
    spawns++;
    return makeChild();
  };
  const r = await runInitPipeline(repoRoot, cfgAbs, { confirmed: false }, spawnImpl, {
    loadConfig: async () =>
      /** @type {any} */ ({
        raw: "/raw",
        raw_glob: "**/*.md",
        joplin_sqlite_sync: { enabled: true },
      }),
    discoverMarkdown: async () => [],
  });
  assert.strictEqual(spawns, 0);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, "CONFIRMATION_REQUIRED");
});

test("SCN-HGUI-INIT-02 empty raw + sqlite on: sqlite-sync then wiki-compile", async () => {
  const calls = [];
  const spawnImpl = (cmd, args, opts) => {
    calls.push({ cmd, args: [...args], cwd: opts.cwd });
    const c = makeChild();
    queueMicrotask(() => c.emit("close", 0));
    return c;
  };
  const r = await runInitPipeline(repoRoot, cfgAbs, { confirmed: true }, spawnImpl, {
    loadConfig: async () =>
      /** @type {any} */ ({
        raw: "/raw",
        raw_glob: "**/*.md",
        joplin_sqlite_sync: { enabled: true },
      }),
    discoverMarkdown: async () => [],
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(calls.length, 2);
  assert.deepStrictEqual(calls[0].args, [
    "exec",
    "joplin-llm-wiki",
    "sqlite-sync",
    "--config",
    path.resolve(cfgAbs),
    "--export-only",
  ]);
  assert.deepStrictEqual(calls[1].args, [
    "exec",
    "joplin-llm-wiki",
    "wiki-compile",
    "--config",
    path.resolve(cfgAbs),
  ]);
  assert.strictEqual(r.sqliteSync.skipped, false);
  assert.strictEqual(r.sqliteSync.exitCode, 0);
});

test("SCN-HGUI-INIT-03 raw present: skip sqlite-sync", async () => {
  const calls = [];
  const spawnImpl = (cmd, args, opts) => {
    calls.push({ cmd, args: [...args], cwd: opts.cwd });
    const c = makeChild();
    queueMicrotask(() => c.emit("close", 0));
    return c;
  };
  const r = await runInitPipeline(repoRoot, cfgAbs, { confirmed: true }, spawnImpl, {
    loadConfig: async () =>
      /** @type {any} */ ({
        raw: "/raw",
        raw_glob: "**/*.md",
        joplin_sqlite_sync: { enabled: true },
      }),
    discoverMarkdown: async () => ["/raw/a.md"],
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].args[2], "wiki-compile");
  assert.strictEqual(r.sqliteSync.skipped, true);
});

test("SCN-HGUI-INIT-agent mode runs agent-compile in full-library mode", async () => {
  const calls = [];
  const spawnImpl = (cmd, args, opts) => {
    calls.push({ cmd, args: [...args], cwd: opts.cwd });
    const c = makeChild();
    queueMicrotask(() => c.emit("close", 0));
    return c;
  };
  const r = await runInitPipeline(
    repoRoot,
    cfgAbs,
    { confirmed: true, compileMode: "agent" },
    spawnImpl,
    {
      loadConfig: async () =>
        /** @type {any} */ ({
          raw: "/raw",
          raw_glob: "**/*.md",
          joplin_sqlite_sync: { enabled: false },
        }),
      discoverMarkdown: async () => ["/raw/a.md"],
    },
  );
  assert.strictEqual(r.ok, true);
  assert.strictEqual(calls.length, 1);
  assert.deepStrictEqual(calls[0].args, [
    "exec",
    "joplin-llm-wiki",
    "agent-compile",
    "--config",
    path.resolve(cfgAbs),
    "--full-library=true",
  ]);
  assert.strictEqual(r.sqliteSync.skipped, true);
});

test("SCN-HGUI-INIT-04 empty raw + sqlite off -> INIT_EMPTY_NOTES", async () => {
  let spawns = 0;
  const spawnImpl = () => {
    spawns++;
    return makeChild();
  };
  const r = await runInitPipeline(repoRoot, cfgAbs, { confirmed: true }, spawnImpl, {
    loadConfig: async () =>
      /** @type {any} */ ({
        raw: "/raw",
        raw_glob: "**/*.md",
        joplin_sqlite_sync: { enabled: false },
      }),
    discoverMarkdown: async () => [],
  });
  assert.strictEqual(spawns, 0);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, "INIT_EMPTY_NOTES");
});

test("SCN-HGUI-INIT-05 overlapping init returns PIPELINE_IN_FLIGHT", async () => {
  /** @type {import('node:events').EventEmitter[]} */
  const children = [];
  const spawnImpl = () => {
    const c = makeChild();
    children.push(c);
    if (children.length === 1) {
      return c;
    }
    queueMicrotask(() => c.emit("close", 0));
    return c;
  };
  const deps = {
    loadConfig: async () =>
      /** @type {any} */ ({
        raw: "/raw",
        raw_glob: "**/*.md",
        joplin_sqlite_sync: { enabled: true },
      }),
    discoverMarkdown: async () => [],
  };
  const p1 = runInitPipeline(repoRoot, cfgAbs, { confirmed: true }, spawnImpl, deps);
  await new Promise((res) => setImmediate(res));
  const r2 = await runInitPipeline(repoRoot, cfgAbs, { confirmed: true }, spawnImpl, deps);
  assert.strictEqual(r2.ok, false);
  assert.strictEqual(r2.code, "PIPELINE_IN_FLIGHT");
  children[0].emit("close", 0);
  await p1;
});

test("SCN-HGUI-TABS covers primary CLI workflows", () => {
  const html = fs.readFileSync(
    path.resolve("src/health-gui/renderer/index.html"),
    "utf8",
  );
  for (const tab of ["health", "config", "notebooks", "pipeline", "query", "lint", "launchd"]) {
    assert.match(html, new RegExp(`data-tab="${tab}"`));
    assert.match(html, new RegExp(`data-panel="${tab}"`));
  }
});

test("SCN-HGUI-SNAPSHOT rejects without confirmed — zero spawn", async () => {
  let spawns = 0;
  const spawnImpl = () => {
    spawns++;
    return makeChild();
  };
  const r = await runSnapshotPipeline(repoRoot, cfgAbs, { confirmed: false }, spawnImpl);
  assert.strictEqual(spawns, 0);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, "CONFIRMATION_REQUIRED");
  assert.strictEqual(r.sqliteSync.exitCode, null);
});

test("SCN-HGUI-SNAPSHOT argv and cwd for sqlite-sync --snapshot-only", async () => {
  const calls = [];
  const spawnImpl = (cmd, args, opts) => {
    calls.push({ cmd, args: [...args], cwd: opts.cwd });
    const c = makeChild();
    queueMicrotask(() => c.emit("close", 0));
    return c;
  };
  const r = await runSnapshotPipeline(repoRoot, cfgAbs, { confirmed: true }, spawnImpl);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.code, "OK");
  assert.deepStrictEqual(calls[0].args, [
    "exec",
    "joplin-llm-wiki",
    "sqlite-sync",
    "--config",
    path.resolve(cfgAbs),
    "--snapshot-only",
  ]);
  assert.strictEqual(calls[0].cwd, path.resolve(repoRoot));
});

test("SCN-HGUI-QUERY runs fixed query argv", async () => {
  const calls = [];
  const spawnImpl = (cmd, args, opts) => {
    calls.push({ cmd, args: [...args], cwd: opts.cwd });
    const c = makeChild();
    queueMicrotask(() => c.emit("close", 0));
    return c;
  };
  const r = await runQueryWorkflow(
    repoRoot,
    cfgAbs,
    { question: "這份 wiki 有哪些待追蹤？", sourceScope: "knowledge" },
    spawnImpl,
  );
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(calls[0].args, [
    "exec",
    "joplin-llm-wiki",
    "query",
    "--config",
    path.resolve(cfgAbs),
    "--source-scope",
    "knowledge",
    "這份 wiki 有哪些待追蹤？",
  ]);
});

test("SCN-HGUI-QUERY confirm capture uses fixed argv", async () => {
  const calls = [];
  const spawnImpl = (cmd, args, opts) => {
    calls.push({ cmd, args: [...args], cwd: opts.cwd });
    const c = makeChild();
    queueMicrotask(() => c.emit("close", 0));
    return c;
  };
  const r = await runQueryWorkflow(
    repoRoot,
    cfgAbs,
    { confirmCapture: "capture-123" },
    spawnImpl,
  );
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(calls[0].args, [
    "exec",
    "joplin-llm-wiki",
    "query",
    "--config",
    path.resolve(cfgAbs),
    "--confirm-capture",
    "capture-123",
  ]);
});

test("SCN-HGUI-QUERY rejects invalid source scope — zero spawn", async () => {
  let spawns = 0;
  const spawnImpl = () => {
    spawns++;
    return makeChild();
  };
  const r = await runQueryWorkflow(
    repoRoot,
    cfgAbs,
    { question: "q", sourceScope: "shell" },
    spawnImpl,
  );
  assert.strictEqual(spawns, 0);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, "BAD_REQUEST");
});

test("SCN-HGUI-LINT runs fixed lint argv", async () => {
  const calls = [];
  const spawnImpl = (cmd, args, opts) => {
    calls.push({ cmd, args: [...args], cwd: opts.cwd });
    const c = makeChild();
    queueMicrotask(() => c.emit("close", 0));
    return c;
  };
  const r = await runLintWorkflow(repoRoot, cfgAbs, {}, spawnImpl);
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(calls[0].args, [
    "exec",
    "joplin-llm-wiki",
    "lint",
    "--config",
    path.resolve(cfgAbs),
  ]);
});
