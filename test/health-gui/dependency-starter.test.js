import assert from "node:assert";
import { EventEmitter } from "node:events";
import { test } from "node:test";

import { startLocalDependency } from "../../src/health-gui/deps/dependency-starter.js";

/** @type {import('../../src/config/load-config.js').AppConfig} */
const minimalCfg = {
  notes_root: "/n",
  notes_glob: "**/*.md",
  wiki_root: "/w",
  wiki: { glob: "**/*.md" },
  wiki_schema: { path: "/s.yaml", strict: true },
  wiki_ingest: { max_pages_per_run: 500, min_pages_per_run: 10, max_planner_rounds: 5 },
  write_back: { sources_enabled: false },
  ollama: {
    base_url: "http://127.0.0.1:11434",
    embed_model: "bge-m3",
    chat_model: "gemma2:2b",
    timeout_ms: 120_000,
    embed_batch_size: 32,
  },
  chroma: {
    persist_path: "/tmp/fixture-chroma",
    collection_sources: "joplin_sources",
    collection_wiki: "joplin_wiki",
  },
  chunk: { size_chars: 1200, overlap_chars: 200 },
  watch: { enabled: false, debounce_ms: 300 },
  rag: { top_k: 8, max_context_chars: 12000, retrieve_mode: "hybrid" },
  lint: {
    out_dir: "./lint_reports",
    duplicate_similarity_threshold: 0.86,
    duplicate_scope: "notebook",
    source_link_check: true,
    contradiction: { max_pairs: 50, timeout_ms: 60_000 },
  },
  joplin_cli: { enabled: false, command: "", preflight_argv: [], timeout_ms: 120_000 },
  joplin_wiki_writeback: {
    enabled: false,
    parent_notebook_title: "note-wiki",
    topic_frontmatter_key: "domain",
    note_title_key: "title",
    max_cli_attempts: 3,
  },
  joplin_sqlite_sync: {
    enabled: false,
    database_path: "",
    export_root: "",
    reconcile_mode: "mirror",
    busy_timeout_ms: 10_000,
    max_export_attempts: 3,
    pipeline: { run_index: false, run_wiki_compile: false },
    schedule: { every_seconds: null },
  },
};

test("SCN-HGUI-DEP-01 rejects without confirmed", async () => {
  let calls = 0;
  const spawnImpl = () => {
    calls++;
    return new EventEmitter();
  };
  const r = await startLocalDependency(
    "/repo",
    "/cfg.yaml",
    { kind: "chroma-server", confirmed: false },
    { spawn: spawnImpl, loadConfig: async () => minimalCfg, probeChroma: async () => ({ reachable: false }) },
  );
  assert.strictEqual(calls, 0);
  assert.strictEqual(r.code, "CONFIRMATION_REQUIRED");
});

test("SCN-HGUI-DEP-02 ALREADY_RUNNING when chroma reachable", async () => {
  let calls = 0;
  const spawnImpl = () => {
    calls++;
    const c = new EventEmitter();
    queueMicrotask(() => c.emit("spawn"));
    return c;
  };
  const r = await startLocalDependency(
    "/repo",
    "/cfg.yaml",
    { kind: "chroma-server", confirmed: true },
    {
      spawn: spawnImpl,
      loadConfig: async () => minimalCfg,
      probeChroma: async () => ({ reachable: true }),
    },
  );
  assert.strictEqual(calls, 0);
  assert.strictEqual(r.code, "ALREADY_RUNNING");
});

test("SCN-HGUI-DEP-03 chroma spawn argv", async () => {
  let sawCmd = "";
  /** @type {string[]} */
  let sawArgs = [];
  /** @type {EventEmitter | null} */
  let child = null;
  const spawnImpl = (cmd, args) => {
    sawCmd = cmd;
    sawArgs = /** @type {string[]} */ (args);
    child = new EventEmitter();
    return child;
  };
  const p = startLocalDependency(
    "/abs/repo",
    "/cfg.yaml",
    { kind: "chroma-server", confirmed: true },
    {
      spawn: spawnImpl,
      loadConfig: async () => minimalCfg,
      probeChroma: async () => ({ reachable: false }),
      env: {},
    },
  );
  await new Promise((r) => setImmediate(r));
  assert.ok(child);
  /** @type {EventEmitter} */ (child).emit("spawn");
  const r = await p;
  assert.strictEqual(r.ok, true);
  assert.strictEqual(sawCmd, "pnpm");
  assert.deepStrictEqual(sawArgs, [
    "exec",
    "chroma",
    "run",
    "--path",
    "/tmp/fixture-chroma",
    "--host",
    "127.0.0.1",
    "--port",
    "8000",
  ]);
});

test("SKIPPED_IN_FLIGHT second concurrent chroma start", async () => {
  /** @type {EventEmitter[]} */
  const children = [];
  const spawnImpl = () => {
    const c = new EventEmitter();
    children.push(c);
    return c;
  };
  const loadConfig = async () => minimalCfg;
  const probeChroma = async () => ({ reachable: false });

  const p1 = startLocalDependency("/repo", "/cfg.yaml", { kind: "chroma-server", confirmed: true }, {
    spawn: spawnImpl,
    loadConfig,
    probeChroma,
  });
  const p2 = startLocalDependency("/repo", "/cfg.yaml", { kind: "chroma-server", confirmed: true }, {
    spawn: spawnImpl,
    loadConfig,
    probeChroma,
  });

  const r2 = await p2;
  assert.strictEqual(r2.code, "SKIPPED_IN_FLIGHT");

  await new Promise((r) => setImmediate(r));
  assert.strictEqual(children.length, 1);
  children[0].emit("spawn");
  const r1 = await p1;
  assert.strictEqual(r1.ok, true);
});
