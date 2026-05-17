import assert from "node:assert";
import { EventEmitter } from "node:events";
import path from "node:path";
import { test } from "node:test";

import { runCorpusPipeline, runInitPipeline } from "../../src/health-gui/corpus/corpus-pipeline-runner.js";

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
  assert.strictEqual(r.index.exitCode, null);
  assert.strictEqual(r.wikiCompile.exitCode, null);
});

test("SCN-HGUI-CORPUS-02 argv and cwd for index then wiki-compile both exit 0", async () => {
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
  assert.strictEqual(calls.length, 2);
  assert.strictEqual(calls[0].cmd, "pnpm");
  assert.deepStrictEqual(calls[0].args, [
    "exec",
    "joplin-llm-wiki",
    "index",
    "--config",
    path.resolve(cfgAbs),
  ]);
  assert.strictEqual(calls[0].cwd, path.resolve(repoRoot));
  assert.deepStrictEqual(calls[1].args, [
    "exec",
    "joplin-llm-wiki",
    "wiki-compile",
    "--config",
    path.resolve(cfgAbs),
  ]);
  assert.strictEqual(calls[1].cwd, path.resolve(repoRoot));
  assert.strictEqual(r.index.exitCode, 0);
  assert.strictEqual(r.wikiCompile.exitCode, 0);
});

test("SCN-HGUI-CORPUS-03 index non-zero skips wiki-compile spawn", async () => {
  let spawns = 0;
  const spawnImpl = (cmd, args) => {
    spawns++;
    const c = makeChild();
    queueMicrotask(() => c.emit("close", spawns === 1 ? 2 : 0));
    return c;
  };
  const r = await runCorpusPipeline(repoRoot, cfgAbs, { confirmed: true }, spawnImpl);
  assert.strictEqual(spawns, 1);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, "INDEX_FAILED");
  assert.strictEqual(r.index.exitCode, 2);
  assert.strictEqual(r.wikiCompile.exitCode, null);
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
  assert.strictEqual(children.length, 2);
});

test("SCN-HGUI-INIT-01 rejects without confirmed — zero spawn", async () => {
  let spawns = 0;
  const spawnImpl = () => {
    spawns++;
    return makeChild();
  };
  const r = await runInitPipeline(
    repoRoot,
    cfgAbs,
    { confirmed: false },
    spawnImpl,
    {
      loadConfig: async () =>
        /** @type {any} */ ({
          notes_root: "/n",
          notes_glob: "**/*.md",
          joplin_sqlite_sync: { enabled: true },
        }),
      discoverMarkdown: async () => [],
    },
  );
  assert.strictEqual(spawns, 0);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, "CONFIRMATION_REQUIRED");
});

test("SCN-HGUI-INIT-02 empty notes + sqlite on: sqlite-sync then index then wiki", async () => {
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
        notes_root: "/notes",
        notes_glob: "**/*.md",
        joplin_sqlite_sync: { enabled: true },
      }),
    discoverMarkdown: async () => [],
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(calls.length, 3);
  assert.deepStrictEqual(calls[0].args.slice(0, 5), [
    "exec",
    "joplin-llm-wiki",
    "sqlite-sync",
    "--config",
    path.resolve(cfgAbs),
  ]);
  assert.strictEqual(calls[0].args[5], "--export-only");
  assert.deepStrictEqual(calls[1].args.slice(0, 4), ["exec", "joplin-llm-wiki", "index", "--config"]);
  assert.deepStrictEqual(calls[2].args.slice(0, 4), ["exec", "joplin-llm-wiki", "wiki-compile", "--config"]);
  assert.strictEqual(r.sqliteSync.skipped, false);
  assert.strictEqual(r.sqliteSync.exitCode, 0);
});

test("SCN-HGUI-INIT-03 notes present: skip sqlite-sync", async () => {
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
        notes_root: "/notes",
        notes_glob: "**/*.md",
        joplin_sqlite_sync: { enabled: true },
      }),
    discoverMarkdown: async () => ["/notes/a.md"],
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(calls.length, 2);
  assert.strictEqual(calls[0].args[2], "index");
  assert.strictEqual(calls[1].args[2], "wiki-compile");
  assert.strictEqual(r.sqliteSync.skipped, true);
});

test("SCN-HGUI-INIT-04 empty notes + sqlite off → INIT_EMPTY_NOTES", async () => {
  let spawns = 0;
  const spawnImpl = () => {
    spawns++;
    return makeChild();
  };
  const r = await runInitPipeline(repoRoot, cfgAbs, { confirmed: true }, spawnImpl, {
    loadConfig: async () =>
      /** @type {any} */ ({
        notes_root: "/notes",
        notes_glob: "**/*.md",
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
        notes_root: "/notes",
        notes_glob: "**/*.md",
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
