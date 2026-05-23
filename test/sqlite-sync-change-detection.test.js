import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildSnapshotFromMarkdown,
  compareSnapshots,
  emptyChangeCounts,
  readSnapshotState,
  writeSnapshotStateAtomic,
} from "../src/joplin/sqlite/sync-state.js";
import { runSqliteSync } from "../src/commands/cmd-sqlite-sync.js";
import { loadConfig } from "../src/config/load-config.js";

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "jllw-sync-state-"));
}

function writeNote(root, rel, noteId, body) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(
    abs,
    `---\njoplin_note_id: ${noteId}\n---\n\n${body}`,
    "utf8",
  );
  return abs;
}

function writeConfig(dir, rawDir) {
  const cfg = path.join(dir, "config.yaml");
  fs.mkdirSync(path.join(dir, "wiki"), { recursive: true });
  fs.writeFileSync(
    cfg,
    `raw: ${JSON.stringify(rawDir)}
raw_glob: "**/*.md"
wiki: ./wiki
joplin_wiki_writeback:
  enabled: false
`,
    "utf8",
  );
  return cfg;
}

function writeSyncConfig(dir, rawDir, pipeline = "", writebackYaml = "") {
  const cfg = path.join(dir, "config.yaml");
  fs.mkdirSync(path.join(dir, "wiki"), { recursive: true });
  fs.writeFileSync(
    cfg,
    `raw: ${JSON.stringify(rawDir)}
raw_glob: "**/*.md"
wiki: ./wiki
${writebackYaml || `joplin_wiki_writeback:
  enabled: false`}
joplin_sqlite_sync:
  enabled: true
  database_path: ./db.sqlite
  pipeline:
${pipeline || "    compile_mode: local"}
`,
    "utf8",
  );
  return cfg;
}

function sqliteSyncStatePath(root) {
  return path.join(root, ".joplin-llm-wiki", "sqlite-sync-state.json");
}

async function runSyncForTest({
  root,
  raw,
  pipeline,
  exportBody = "hello",
  opts = new Map(),
  runWikiCompile,
  runAgentCompile,
  runJoplinDataApiPreflight,
  writebackYaml,
}) {
  const configPath = writeSyncConfig(root, raw, pipeline, writebackYaml);
  let wikiCalls = 0;
  let agentCalls = 0;
  const { result, lines } = await captureStdout(() =>
    runSqliteSync(
      { configPath, argv: [], opts },
      {
        loadConfig,
        exportNotesFromSqlite: async () => {
          writeNote(raw, "Inbox/A.md", "note-a", exportBody);
          return {
            exported_notes: 1,
            written_files: 1,
            skipped_notes: [],
            deleted_files: 0,
            duration_ms: 5,
          };
        },
        runWikiCompile: async (compileCtx) => {
          wikiCalls++;
          if (runWikiCompile) await runWikiCompile(compileCtx);
        },
        runAgentCompile: async (compileCtx) => {
          agentCalls++;
          if (runAgentCompile) await runAgentCompile(compileCtx);
        },
        runJoplinDataApiPreflight,
      },
    ),
  );
  return { result, summary: JSON.parse(lines.at(-1) ?? "{}"), wikiCalls, agentCalls, configPath };
}

async function captureStdout(fn) {
  const old = console.log;
  /** @type {string[]} */
  const lines = [];
  console.log = (line) => {
    lines.push(String(line));
  };
  try {
    const result = await fn();
    return { result, lines };
  } catch (e) {
    e.stdoutLines = lines;
    throw e;
  } finally {
    console.log = old;
  }
}

async function captureStdoutAndError(fn) {
  const old = console.log;
  /** @type {string[]} */
  const lines = [];
  console.log = (line) => {
    lines.push(String(line));
  };
  try {
    const result = await fn();
    return { result, lines, error: null };
  } catch (e) {
    return { result: undefined, lines, error: e };
  } finally {
    console.log = old;
  }
}

test("snapshot records raw-relative path, note id, and content hash", () => {
  const root = tmpdir();
  const note = writeNote(root, "Inbox/A.md", "note-a", "hello");
  const snapshot = buildSnapshotFromMarkdown(root, [note], 123);

  assert.equal(snapshot.schema_version, 1);
  assert.equal(snapshot.updated_at_ms, 123);
  assert.equal(snapshot.export_root, root);
  assert.equal(snapshot.files["Inbox/A.md"].joplin_note_id, "note-a");
  assert.match(snapshot.files["Inbox/A.md"].sha256, /^[a-f0-9]{64}$/);
});

test("compareSnapshots reports baseline when previous snapshot is missing", () => {
  const root = tmpdir();
  const note = writeNote(root, "a.md", "note-a", "hello");
  const current = buildSnapshotFromMarkdown(root, [note], 1);

  const result = compareSnapshots(null, current, { dryRun: false });

  assert.equal(result.raw_changed, false);
  assert.equal(result.change_detection, "baseline");
  assert.deepEqual(result.changed_files, emptyChangeCounts());
});

test("compareSnapshots detects added markdown", () => {
  const previous = {
    schema_version: 1,
    updated_at_ms: 1,
    export_root: "/raw",
    files: {
      "a.md": { joplin_note_id: "note-a", sha256: "hash-a" },
    },
  };
  const current = {
    ...previous,
    files: {
      ...previous.files,
      "b.md": { joplin_note_id: "note-b", sha256: "hash-b" },
    },
  };

  const result = compareSnapshots(previous, current, { dryRun: false });

  assert.equal(result.raw_changed, true);
  assert.equal(result.change_detection, "changed");
  assert.deepEqual(result.changed_files, { added: 1, updated: 0, deleted: 0 });
});

test("compareSnapshots detects updated markdown by hash or note id", () => {
  const previous = {
    schema_version: 1,
    updated_at_ms: 1,
    export_root: "/raw",
    files: {
      "a.md": { joplin_note_id: "note-a", sha256: "hash-a" },
      "b.md": { joplin_note_id: "note-b", sha256: "hash-b" },
    },
  };
  const current = {
    ...previous,
    files: {
      "a.md": { joplin_note_id: "note-a", sha256: "hash-new" },
      "b.md": { joplin_note_id: "note-new", sha256: "hash-b" },
    },
  };

  const result = compareSnapshots(previous, current, { dryRun: false });

  assert.equal(result.raw_changed, true);
  assert.deepEqual(result.changed_files, { added: 0, updated: 2, deleted: 0 });
});

test("compareSnapshots detects deleted markdown", () => {
  const previous = {
    schema_version: 1,
    updated_at_ms: 1,
    export_root: "/raw",
    files: {
      "a.md": { joplin_note_id: "note-a", sha256: "hash-a" },
      "b.md": { joplin_note_id: "note-b", sha256: "hash-b" },
    },
  };
  const current = {
    ...previous,
    files: {
      "a.md": { joplin_note_id: "note-a", sha256: "hash-a" },
    },
  };

  const result = compareSnapshots(previous, current, { dryRun: false });

  assert.equal(result.raw_changed, true);
  assert.deepEqual(result.changed_files, { added: 0, updated: 0, deleted: 1 });
});

test("compareSnapshots reports dry_run without changing classification counts", () => {
  const previous = {
    schema_version: 1,
    updated_at_ms: 1,
    export_root: "/raw",
    files: {
      "a.md": { joplin_note_id: "note-a", sha256: "hash-a" },
    },
  };
  const current = {
    ...previous,
    files: {
      "a.md": { joplin_note_id: "note-a", sha256: "hash-new" },
    },
  };

  const result = compareSnapshots(previous, current, { dryRun: true });

  assert.equal(result.raw_changed, true);
  assert.equal(result.change_detection, "dry_run");
  assert.deepEqual(result.changed_files, { added: 0, updated: 1, deleted: 0 });
});

test("readSnapshotState reports malformed JSON as recoverable warning", () => {
  const root = tmpdir();
  const statePath = path.join(root, "state.json");
  fs.writeFileSync(statePath, "{not-json", "utf8");

  const result = readSnapshotState(statePath);

  assert.equal(result.snapshot, null);
  assert.equal(result.warning?.code, "SQLITE_SYNC_STATE_MALFORMED");
  assert.match(result.warning?.message ?? "", /malformed snapshot state/);
});

test("writeSnapshotStateAtomic fails with stable code when target path is a directory", () => {
  const root = tmpdir();
  const statePath = path.join(root, "state-dir");
  fs.mkdirSync(statePath);
  const snapshot = {
    schema_version: 1,
    updated_at_ms: 1,
    export_root: root,
    files: {},
  };

  assert.throws(
    () => writeSnapshotStateAtomic(statePath, snapshot),
    /** @param {Error & { code?: string }} e */
    (e) => e.code === "SQLITE_SYNC_STATE_IO" && /write snapshot state/.test(e.message),
  );
});

test("sqlite-sync snapshot-only establishes baseline from existing raw without SQLite export or compile", async () => {
  const root = tmpdir();
  const raw = path.join(root, "raw");
  fs.mkdirSync(raw, { recursive: true });
  writeNote(raw, "Inbox/A.md", "note-a", "hello");
  const configPath = writeConfig(root, raw);
  let opened = false;
  let exported = false;
  let compiled = false;

  const { result, lines } = await captureStdout(() =>
    runSqliteSync(
      {
        configPath,
        argv: [],
        opts: new Map([["snapshot-only", "true"]]),
      },
      {
        loadConfig,
        openReadonlyDatabase: async () => {
          opened = true;
          throw new Error("should not open sqlite");
        },
        exportNotesFromSqlite: async () => {
          exported = true;
          throw new Error("should not export");
        },
        runWikiCompile: async () => {
          compiled = true;
        },
      },
    ),
  );

  assert.equal(result, 0);
  assert.equal(opened, false);
  assert.equal(exported, false);
  assert.equal(compiled, false);
  const summary = JSON.parse(lines.at(-1) ?? "{}");
  assert.equal(summary.cycle, 1);
  assert.equal(summary.snapshot_only, true);
  assert.equal(summary.change_detection, "snapshot_created");
  assert.equal(summary.compile_triggered, false);
  assert.equal(summary.changed_files.added, 1);
  const state = readSnapshotState(
    path.join(root, ".joplin-llm-wiki", "sqlite-sync-state.json"),
  );
  assert.equal(state.snapshot?.files["Inbox/A.md"].joplin_note_id, "note-a");
});

test("sqlite-sync snapshot-only rejects empty raw without writing state", async () => {
  const root = tmpdir();
  const raw = path.join(root, "raw");
  fs.mkdirSync(raw, { recursive: true });
  const configPath = writeConfig(root, raw);

  await assert.rejects(
    () =>
      runSqliteSync(
        {
          configPath,
          argv: [],
        opts: new Map([["snapshot-only", "true"]]),
      },
        { loadConfig },
      ),
    /** @param {Error & { code?: string }} e */
    (e) => e.code === "NO_SOURCE_MARKDOWN",
  );
  assert.equal(
    fs.existsSync(path.join(root, ".joplin-llm-wiki", "sqlite-sync-state.json")),
    false,
  );
});

test("sqlite-sync export establishes baseline without compiling", async () => {
  const root = tmpdir();
  const raw = path.join(root, "raw");
  fs.mkdirSync(raw, { recursive: true });

  const { result, summary, wikiCalls, agentCalls } = await runSyncForTest({
    root,
    raw,
  });

  assert.equal(result, 0);
  assert.equal(summary.change_detection, "baseline");
  assert.equal(summary.raw_changed, false);
  assert.equal(summary.compile_triggered, false);
  assert.equal(wikiCalls, 0);
  assert.equal(agentCalls, 0);
});

test("sqlite-sync unchanged export skips compile", async () => {
  const root = tmpdir();
  const raw = path.join(root, "raw");
  fs.mkdirSync(raw, { recursive: true });
  await runSyncForTest({ root, raw, exportBody: "same" });

  const { summary, wikiCalls, agentCalls } = await runSyncForTest({
    root,
    raw,
    exportBody: "same",
  });

  assert.equal(summary.change_detection, "unchanged");
  assert.equal(summary.raw_changed, false);
  assert.equal(summary.compile_triggered, false);
  assert.equal(wikiCalls, 0);
  assert.equal(agentCalls, 0);
});

test("sqlite-sync changed export triggers local compile", async () => {
  const root = tmpdir();
  const raw = path.join(root, "raw");
  fs.mkdirSync(raw, { recursive: true });
  await runSyncForTest({ root, raw, exportBody: "old" });

  const { summary, wikiCalls, agentCalls } = await runSyncForTest({
    root,
    raw,
    exportBody: "new",
  });

  assert.equal(summary.change_detection, "changed");
  assert.equal(summary.raw_changed, true);
  assert.equal(summary.changed_files.updated, 1);
  assert.equal(summary.compile_mode, "local");
  assert.equal(summary.compile_triggered, true);
  assert.equal(wikiCalls, 1);
  assert.equal(agentCalls, 0);
});

test("sqlite-sync off mode skips compile even when raw changed", async () => {
  const root = tmpdir();
  const raw = path.join(root, "raw");
  fs.mkdirSync(raw, { recursive: true });
  await runSyncForTest({ root, raw, exportBody: "old", pipeline: "    compile_mode: off" });

  const { summary, wikiCalls, agentCalls } = await runSyncForTest({
    root,
    raw,
    exportBody: "new",
    pipeline: "    compile_mode: off",
  });

  assert.equal(summary.raw_changed, true);
  assert.equal(summary.compile_mode, "off");
  assert.equal(summary.compile_triggered, false);
  assert.equal(summary.state_committed, true);
  assert.equal(summary.state_commit_reason, "compile_mode_off");
  assert.equal(wikiCalls, 0);
  assert.equal(agentCalls, 0);
});

test("sqlite-sync agent mode invokes fixed agent compile runtime", async () => {
  const root = tmpdir();
  const raw = path.join(root, "raw");
  fs.mkdirSync(raw, { recursive: true });
  await runSyncForTest({ root, raw, exportBody: "old", pipeline: "    compile_mode: agent" });

  const { summary, wikiCalls, agentCalls } = await runSyncForTest({
    root,
    raw,
    exportBody: "new",
    pipeline: "    compile_mode: agent",
  });

  assert.equal(summary.raw_changed, true);
  assert.equal(summary.compile_mode, "agent");
  assert.equal(summary.compile_triggered, true);
  assert.equal(wikiCalls, 0);
  assert.equal(agentCalls, 1);
});

test("sqlite-sync keeps previous snapshot state when agent compile fails after raw changed", async () => {
  const root = tmpdir();
  const raw = path.join(root, "raw");
  fs.mkdirSync(raw, { recursive: true });
  await runSyncForTest({ root, raw, exportBody: "old", pipeline: "    compile_mode: agent" });
  const statePath = sqliteSyncStatePath(root);
  const before = fs.readFileSync(statePath, "utf8");

  await assert.rejects(
    () =>
      runSyncForTest({
        root,
        raw,
        exportBody: "new",
        pipeline: "    compile_mode: agent",
        runAgentCompile: async () => {
          const err = new Error("agent compile failed");
          err.code = "AGENT_COMPILE_FAILED";
          throw err;
        },
      }),
    /** @param {Error & { code?: string }} e */
    (e) => e.code === "AGENT_COMPILE_FAILED",
  );

  assert.equal(fs.readFileSync(statePath, "utf8"), before);
});

test("sqlite-sync retries changed raw after agent compile failure and commits after success", async () => {
  const root = tmpdir();
  const raw = path.join(root, "raw");
  fs.mkdirSync(raw, { recursive: true });
  await runSyncForTest({ root, raw, exportBody: "old", pipeline: "    compile_mode: agent" });
  const statePath = sqliteSyncStatePath(root);
  const before = fs.readFileSync(statePath, "utf8");

  await assert.rejects(
    () =>
      runSyncForTest({
        root,
        raw,
        exportBody: "new",
        pipeline: "    compile_mode: agent",
        runAgentCompile: async () => {
          const err = new Error("agent compile failed");
          err.code = "AGENT_COMPILE_FAILED";
          throw err;
        },
      }),
    /** @param {Error & { code?: string }} e */
    (e) => e.code === "AGENT_COMPILE_FAILED",
  );
  assert.equal(fs.readFileSync(statePath, "utf8"), before);

  const { summary, agentCalls } = await runSyncForTest({
    root,
    raw,
    exportBody: "new",
    pipeline: "    compile_mode: agent",
  });

  assert.equal(summary.raw_changed, true);
  assert.equal(summary.compile_triggered, true);
  assert.equal(agentCalls, 1);
  assert.equal(
    readSnapshotState(statePath).snapshot?.files["Inbox/A.md"].sha256,
    buildSnapshotFromMarkdown(raw, [path.join(raw, "Inbox", "A.md")]).files["Inbox/A.md"].sha256,
  );
});

test("sqlite-sync stops before agent compile when writeback preflight rejects invalid token", async () => {
  const root = tmpdir();
  const raw = path.join(root, "raw");
  fs.mkdirSync(raw, { recursive: true });
  const writebackYaml = `joplin_wiki_writeback:
  enabled: true
joplin_data_api:
  base_url: http://127.0.0.1:41184
  token: invalid-token
  timeout_ms: 1000`;
  await runSyncForTest({
    root,
    raw,
    exportBody: "old",
    pipeline: "    compile_mode: agent",
    writebackYaml,
  });
  let agentCompileCalls = 0;

  await assert.rejects(
    () =>
      runSyncForTest({
        root,
        raw,
        exportBody: "new",
        pipeline: "    compile_mode: agent",
        writebackYaml,
        runJoplinDataApiPreflight: async () => {
          const err = new Error("HTTP 403: invalid token");
          err.code = "JOPLIN_DATA_API_FAILED";
          throw err;
        },
        runAgentCompile: async () => {
          agentCompileCalls++;
        },
      }),
    /** @param {Error & { code?: string }} e */
    (e) => e.code === "JOPLIN_DATA_API_FAILED",
  );

  assert.equal(agentCompileCalls, 0);
});

test("sqlite-sync calls agent compile after writeback preflight passes and reports passed status", async () => {
  const root = tmpdir();
  const raw = path.join(root, "raw");
  fs.mkdirSync(raw, { recursive: true });
  const writebackYaml = `joplin_wiki_writeback:
  enabled: true
joplin_data_api:
  base_url: http://127.0.0.1:41184
  token: valid-token
  timeout_ms: 1000`;
  await runSyncForTest({
    root,
    raw,
    exportBody: "old",
    pipeline: "    compile_mode: agent",
    writebackYaml,
  });
  /** @type {string[]} */
  const order = [];

  const { summary, agentCalls } = await runSyncForTest({
    root,
    raw,
    exportBody: "new",
    pipeline: "    compile_mode: agent",
    writebackYaml,
    runJoplinDataApiPreflight: async () => {
      order.push("preflight");
    },
    runAgentCompile: async () => {
      order.push("compile");
    },
  });

  assert.deepEqual(order, ["preflight", "compile"]);
  assert.equal(agentCalls, 1);
  assert.equal(summary.writeback_preflight_status, "passed");
  assert.equal(summary.downstream_status, "succeeded");
  assert.equal(summary.state_committed, true);
});

test("sqlite-sync prints failed downstream summary without committing state", async () => {
  const root = tmpdir();
  const raw = path.join(root, "raw");
  fs.mkdirSync(raw, { recursive: true });
  await runSyncForTest({ root, raw, exportBody: "old", pipeline: "    compile_mode: agent" });

  const { lines, error } = await captureStdoutAndError(() =>
    runSyncForTest({
      root,
      raw,
      exportBody: "new",
      pipeline: "    compile_mode: agent",
      runAgentCompile: async () => {
        const err = new Error("agent compile failed");
        err.code = "AGENT_COMPILE_FAILED";
        throw err;
      },
    }),
  );

  assert.equal(error?.code, "AGENT_COMPILE_FAILED");
  const summary = JSON.parse((error?.stdoutLines ?? lines).at(-1) ?? "{}");
  assert.equal(summary.downstream_status, "failed");
  assert.equal(summary.state_committed, false);
  assert.equal(summary.state_commit_reason, "downstream_failed");
  assert.deepEqual(fs.readdirSync(path.join(root, ".joplin-llm-wiki")), [
    "sqlite-sync-state.json",
  ]);
});

test("sqlite-sync prints failed preflight summary without committing state", async () => {
  const root = tmpdir();
  const raw = path.join(root, "raw");
  fs.mkdirSync(raw, { recursive: true });
  const writebackYaml = `joplin_wiki_writeback:
  enabled: true
joplin_data_api:
  base_url: http://127.0.0.1:41184
  token: invalid-token
  timeout_ms: 1000`;
  await runSyncForTest({
    root,
    raw,
    exportBody: "old",
    pipeline: "    compile_mode: agent",
    writebackYaml,
  });

  const { lines, error } = await captureStdoutAndError(() =>
    runSyncForTest({
      root,
      raw,
      exportBody: "new",
      pipeline: "    compile_mode: agent",
      writebackYaml,
      runJoplinDataApiPreflight: async () => {
        const err = new Error("HTTP 403: invalid token");
        err.code = "JOPLIN_DATA_API_FAILED";
        throw err;
      },
    }),
  );

  assert.equal(error?.code, "JOPLIN_DATA_API_FAILED");
  const summary = JSON.parse((error?.stdoutLines ?? lines).at(-1) ?? "{}");
  assert.equal(summary.writeback_preflight_status, "failed");
  assert.equal(summary.downstream_status, "skipped");
  assert.equal(summary.state_committed, false);
  assert.equal(summary.state_commit_reason, "preflight_failed");
});

test("sqlite-sync summary exposes raw change and compile decision fields", async () => {
  const root = tmpdir();
  const raw = path.join(root, "raw");
  fs.mkdirSync(raw, { recursive: true });

  const { summary } = await runSyncForTest({ root, raw });

  assert.equal(typeof summary.raw_changed, "boolean");
  assert.equal(typeof summary.change_detection, "string");
  assert.deepEqual(Object.keys(summary.changed_files).sort(), [
    "added",
    "deleted",
    "updated",
  ]);
  assert.equal(summary.compile_mode, "local");
  assert.equal(typeof summary.compile_triggered, "boolean");
});

test("sqlite-sync export-only updates state but skips compile", async () => {
  const root = tmpdir();
  const raw = path.join(root, "raw");
  fs.mkdirSync(raw, { recursive: true });
  await runSyncForTest({ root, raw, exportBody: "old" });

  const { summary, wikiCalls, agentCalls, configPath } = await runSyncForTest({
    root,
    raw,
    exportBody: "new",
    opts: new Map([["export-only", "true"]]),
  });

  assert.equal(summary.export_only, true);
  assert.equal(summary.raw_changed, true);
  assert.equal(summary.compile_triggered, false);
  assert.equal(summary.state_committed, true);
  assert.equal(summary.state_commit_reason, "export_only");
  assert.equal(wikiCalls, 0);
  assert.equal(agentCalls, 0);
  const state = readSnapshotState(
    path.join(path.dirname(configPath), ".joplin-llm-wiki", "sqlite-sync-state.json"),
  );
  assert.ok(state.snapshot?.files["Inbox/A.md"].sha256);
  assert.equal(
    state.snapshot?.files["Inbox/A.md"].sha256,
    buildSnapshotFromMarkdown(raw, [path.join(raw, "Inbox", "A.md")]).files["Inbox/A.md"].sha256,
  );
});

test("sqlite-sync dry-run reports would-change without writing state or compiling", async () => {
  const root = tmpdir();
  const raw = path.join(root, "raw");
  fs.mkdirSync(raw, { recursive: true });
  const baseline = await runSyncForTest({ root, raw, exportBody: "old" });
  const statePath = path.join(
    path.dirname(baseline.configPath),
    ".joplin-llm-wiki",
    "sqlite-sync-state.json",
  );
  const before = fs.readFileSync(statePath, "utf8");

  const { summary, wikiCalls, agentCalls } = await runSyncForTest({
    root,
    raw,
    exportBody: "new",
    opts: new Map([["dry-run", "true"]]),
  });

  assert.equal(summary.dry_run, true);
  assert.equal(summary.change_detection, "dry_run");
  assert.equal(summary.raw_changed, true);
  assert.equal(summary.compile_triggered, false);
  assert.equal(wikiCalls, 0);
  assert.equal(agentCalls, 0);
  assert.equal(fs.readFileSync(statePath, "utf8"), before);
});
