import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { test } from "node:test";
import assert from "node:assert";
import { loadConfig } from "../src/config/load-config.js";
import {
  exportNotesFromSqlite,
  openReadonlyDatabase,
} from "../src/joplin/sqlite/exporter.js";
import {
  markdownPathForNote,
  assertPathUnderExportRoot,
} from "../src/joplin/sqlite/paths.js";
import { runSqliteSync, defaultDeps } from "../src/commands/cmd-sqlite-sync.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, "..");
const binCli = path.join(rootDir, "bin", "joplin-llm-wiki.js");

test("REQ-JSQ-CONFIG: enabled without database_path throws CONFIG_INVALID", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jb-sql-cfg-"));
  const cfgPath = path.join(tmp, "cfg.yaml");
  const notes = path.join(tmp, "notes");
  fs.mkdirSync(notes);
  fs.writeFileSync(
    cfgPath,
    `
notes_root: ./notes
wiki_root: ""
joplin_sqlite_sync:
  enabled: true
  database_path: ""
joplin_wiki_writeback:
  enabled: false
chroma:
  persist_path: ./chroma
`,
    "utf8",
  );
  await assert.rejects(
    () => loadConfig(cfgPath),
    (e) => /** @type {{ code?: string }} */ (e).code === "CONFIG_INVALID",
  );
});

test("REQ-JSQ-CONFIG: export_root must equal notes_root when enabled", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jb-sql-cfg2-"));
  const cfgPath = path.join(tmp, "cfg.yaml");
  const notes = path.join(tmp, "notes");
  const other = path.join(tmp, "other");
  fs.mkdirSync(notes);
  fs.mkdirSync(other);
  fs.writeFileSync(
    cfgPath,
    `
notes_root: ./notes
wiki_root: ""
joplin_sqlite_sync:
  enabled: true
  database_path: ${path.join(tmp, "x.db").replace(/\\/g, "/")}
  export_root: ./other
joplin_wiki_writeback:
  enabled: false
chroma:
  persist_path: ./chroma
`,
    "utf8",
  );
  await assert.rejects(
    () => loadConfig(cfgPath),
    (e) =>
      /** @type {{ code?: string }} */ (e).code === "CONFIG_INVALID" &&
      String(e).includes("export_root"),
  );
});

test("sqlite-sync --list-notebooks-json prints notebook payload without exporting", async () => {
  const lines = [];
  const origLog = console.log;
  const db = { closed: false, close() { this.closed = true; } };
  try {
    console.log = (msg) => lines.push(String(msg));
    const code = await runSqliteSync(
      {
        configPath: "cfg.yaml",
        argv: [],
        opts: new Map([["list-notebooks-json", "true"]]),
      },
      {
        ...defaultDeps,
        loadConfig: async () => ({
          notes_root: "/tmp/notes",
          notes_glob: "**/*.md",
          wiki_root: "/tmp/wiki",
          wiki: { glob: "**/*.md" },
          wiki_schema: { path: "", strict: false, schema: { page_types: [] } },
          wiki_ingest: {},
          write_back: { sources_enabled: false },
          ollama: {},
          chroma: {},
          chunk: {},
          watch: {},
          rag: {},
          lint: {},
          joplin_cli: {},
          joplin_data_api: {},
          joplin_wiki_writeback: {},
          joplin_sqlite_sync: {
            enabled: true,
            database_path: "/tmp/joplin.sqlite",
            export_root: "/tmp/notes",
            reconcile_mode: "mirror",
            busy_timeout_ms: 1,
            max_export_attempts: 1,
            notebook_filter: {
              enabled: true,
              include_notebook_ids: ["child"],
              include_notebook_paths: [],
              include_descendants: true,
              notebook_path_style: "joined_slug",
              notebook_path_separator: "-",
              source_filename: "title",
            },
            pipeline: { run_index: false, run_wiki_compile: false },
            schedule: { every_seconds: null },
          },
        }),
        openReadonlyDatabase: async () => db,
        listNotebooksFromSqlite: () => [
          { id: "root", parent_id: "", title: "工作", path: "工作", slug: "工作", depth: 0 },
          { id: "child", parent_id: "root", title: "會議", path: "工作/會議", slug: "工作-會議", depth: 1 },
        ],
        exportNotesFromSqlite: async () => {
          throw new Error("should not export");
        },
      },
    );
    assert.strictEqual(code, 0);
    assert.strictEqual(db.closed, true);
    const payload = JSON.parse(lines.at(-1));
    assert.deepStrictEqual(payload.selectedIds, ["child"]);
    assert.strictEqual(payload.enabled, true);
    assert.strictEqual(payload.notebooks[1].slug, "工作-會議");
  } finally {
    console.log = origLog;
  }
});

test("sqlite-sync --list-notebooks-json-out writes notebook payload to file", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jb-sql-nb-json-"));
  const outPath = path.join(tmp, "notebooks.json");
  const db = { closed: false, close() { this.closed = true; } };
  const code = await runSqliteSync(
    {
      configPath: "cfg.yaml",
      argv: [],
      opts: new Map([
        ["list-notebooks-json", "true"],
        ["list-notebooks-json-out", outPath],
      ]),
    },
    {
      ...defaultDeps,
      loadConfig: async () => ({
        notes_root: "/tmp/notes",
        notes_glob: "**/*.md",
        wiki_root: "/tmp/wiki",
        wiki: { glob: "**/*.md" },
        wiki_schema: { path: "", strict: false, schema: { page_types: [] } },
        wiki_ingest: {},
        write_back: { sources_enabled: false },
        ollama: {},
        chroma: {},
        chunk: {},
        watch: {},
        rag: {},
        lint: {},
        joplin_cli: {},
        joplin_data_api: {},
        joplin_wiki_writeback: {},
        joplin_sqlite_sync: {
          enabled: true,
          database_path: "/tmp/joplin.sqlite",
          export_root: "/tmp/notes",
          reconcile_mode: "mirror",
          busy_timeout_ms: 1,
          max_export_attempts: 1,
          notebook_filter: {
            enabled: false,
            include_notebook_ids: [],
            include_notebook_paths: [],
            include_descendants: true,
            notebook_path_style: "joined_slug",
            notebook_path_separator: "-",
            source_filename: "title",
          },
          pipeline: { run_index: false, run_wiki_compile: false },
          schedule: { every_seconds: null },
        },
      }),
      openReadonlyDatabase: async () => db,
      listNotebooksFromSqlite: () => [
        { id: "root", parent_id: "", title: "工作", path: "工作", slug: "工作", depth: 0 },
      ],
      exportNotesFromSqlite: async () => {
        throw new Error("should not export");
      },
    },
  );
  assert.strictEqual(code, 0);
  assert.strictEqual(db.closed, true);
  const payload = JSON.parse(fs.readFileSync(outPath, "utf8"));
  assert.strictEqual(payload.notebooks[0].id, "root");
  assert.deepStrictEqual(payload.selectedIds, []);
});

test("markdownPathForNote rejects path escape via id", () => {
  const root = path.join(os.tmpdir(), "jb-root");
  assert.throws(
    () => markdownPathForNote(root, "../evil000000000000000000000000"),
    /invalid note id for filename/,
  );
});

test("assertPathUnderExportRoot rejects traversal", () => {
  const root = path.resolve("/tmp/jb-eroot");
  assert.throws(
    () => assertPathUnderExportRoot(root, path.join(root, "..", "outside")),
    /refuses path outside export_root/,
  );
});

test("REQ-JSQ-EXPORT-MIRROR: exporter writes notes and mirror deletes stale", async () => {
  const Database = (await import("better-sqlite3")).default;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jb-exp-"));
  const dbFile = path.join(tmp, "db.sqlite");
  const outDir = path.join(tmp, "out");
  fs.mkdirSync(outDir);

  const db = new Database(dbFile);
  db.exec(`
    CREATE TABLE notes (
      id TEXT NOT NULL PRIMARY KEY,
      parent_id TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      created_time INTEGER NOT NULL DEFAULT 0,
      updated_time INTEGER NOT NULL DEFAULT 0,
      deleted_time INTEGER NOT NULL DEFAULT 0
    );
  `);
  const ins = db.prepare(
    "INSERT INTO notes (id, title, body, deleted_time) VALUES (?, ?, ?, 0)",
  );
  const id1 = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const id2 = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const id3 = "cccccccccccccccccccccccccccccccc";
  ins.run(id1, "One", "# One\n\nhello");
  ins.run(id2, "Two", "# Two\n\nworld");
  ins.run(id3, "Three", "# Three\n\nagain");
  db.close();

  const stale = path.join(outDir, "deaddeaddeaddeaddeaddeaddeaddead.md");
  fs.writeFileSync(stale, "stale", "utf8");

  const summary = await exportNotesFromSqlite({
    databasePath: dbFile,
    exportRootAbs: outDir,
    reconcileMode: "mirror",
    busyTimeoutMs: 5000,
    maxExportAttempts: 3,
    dryRun: false,
  });
  assert.strictEqual(summary.written_files, 3);
  assert.ok(!fs.existsSync(stale));
  assert.ok(fs.existsSync(path.join(outDir, "_uncategorized", "One.md")));
});

test("notebook filter exports selected nested notebooks with title filenames", async () => {
  const Database = (await import("better-sqlite3")).default;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jb-nb-filter-"));
  const dbFile = path.join(tmp, "db.sqlite");
  const outDir = path.join(tmp, "out");
  fs.mkdirSync(outDir);

  const db = new Database(dbFile);
  db.exec(`
    CREATE TABLE folders (
      id TEXT NOT NULL PRIMARY KEY,
      parent_id TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      deleted_time INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE notes (
      id TEXT NOT NULL PRIMARY KEY,
      parent_id TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      created_time INTEGER NOT NULL DEFAULT 0,
      updated_time INTEGER NOT NULL DEFAULT 0,
      deleted_time INTEGER NOT NULL DEFAULT 0
    );
  `);
  db.prepare("INSERT INTO folders (id, parent_id, title) VALUES (?, ?, ?)").run("p", "", "工作");
  db.prepare("INSERT INTO folders (id, parent_id, title) VALUES (?, ?, ?)").run("c", "p", "專案A");
  db.prepare("INSERT INTO folders (id, parent_id, title) VALUES (?, ?, ?)").run("x", "", "私人");
  const ins = db.prepare("INSERT INTO notes (id, parent_id, title, body) VALUES (?, ?, ?, ?)");
  ins.run("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "c", "會議", "A");
  ins.run("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "c", "會議", "B");
  ins.run("cccccccccccccccccccccccccccccccc", "x", "秘密", "C");
  db.close();

  const stale = path.join(outDir, "工作-專案A", "old.md");
  fs.mkdirSync(path.dirname(stale), { recursive: true });
  fs.writeFileSync(stale, "stale", "utf8");

  const summary = await exportNotesFromSqlite({
    databasePath: dbFile,
    exportRootAbs: outDir,
    reconcileMode: "mirror",
    busyTimeoutMs: 5000,
    maxExportAttempts: 3,
    dryRun: false,
    notebookFilter: {
      enabled: true,
      include_notebook_ids: ["p"],
      include_notebook_paths: [],
      include_descendants: true,
      notebook_path_style: "joined_slug",
      notebook_path_separator: "-",
      source_filename: "title",
    },
  });

  assert.strictEqual(summary.written_files, 2);
  assert.ok(fs.existsSync(path.join(outDir, "工作-專案A", "會議.md")));
  assert.ok(fs.existsSync(path.join(outDir, "工作-專案A", "會議-2.md")));
  assert.ok(!fs.existsSync(path.join(outDir, "私人", "秘密.md")));
  assert.ok(!fs.existsSync(stale));
  const text = fs.readFileSync(path.join(outDir, "工作-專案A", "會議.md"), "utf8");
  assert.match(text, /joplin_notebook_path: "工作\/專案A"/);
});

test("REQ-JSQ-LOCAL-FIRST Local execution and network boundary: no fetch when pipelines off", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jb-lf-"));
  const cfgPath = path.join(tmp, "cfg.yaml");
  const notes = path.join(tmp, "notes");
  fs.mkdirSync(notes);
  fs.writeFileSync(
    cfgPath,
    `
notes_root: ./notes
wiki_root: ""
joplin_sqlite_sync:
  enabled: true
  database_path: ${path.join(tmp, "db.sqlite").replace(/\\/g, "/")}
  pipeline:
    run_index: false
    run_wiki_compile: false
joplin_wiki_writeback:
  enabled: false
chroma:
  persist_path: ./chroma
`,
    "utf8",
  );

  let calls = 0;
  const orig = globalThis.fetch;
  // @ts-expect-error test stub
  globalThis.fetch = async () => {
    calls++;
    return /** @type {any} */ ({});
  };
  try {
    await runSqliteSync(
      { configPath: cfgPath, argv: [], opts: new Map() },
      {
        ...defaultDeps,
        exportNotesFromSqlite: async () => ({
          exported_notes: 0,
          written_files: 0,
          skipped_notes: [],
          deleted_files: 0,
          duration_ms: 0,
        }),
      },
    );
  } finally {
    globalThis.fetch = orig;
  }
  assert.strictEqual(calls, 0);
});

test("REQ-JSQ-PIPELINE-ORDER: index failure skips wiki-compile", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jb-pipe-"));
  const cfgPath = path.join(tmp, "cfg.yaml");
  const notes = path.join(tmp, "notes");
  fs.mkdirSync(notes);
  fs.writeFileSync(
    cfgPath,
    `
notes_root: ./notes
wiki_root: ""
joplin_sqlite_sync:
  enabled: true
  database_path: ${path.join(tmp, "db.sqlite").replace(/\\/g, "/")}
  pipeline:
    run_index: true
    run_wiki_compile: true
joplin_wiki_writeback:
  enabled: false
chroma:
  persist_path: ./chroma
`,
    "utf8",
  );

  let wikiRan = false;
  await assert.rejects(
    async () =>
      runSqliteSync(
        { configPath: cfgPath, argv: [], opts: new Map() },
        {
          ...defaultDeps,
          exportNotesFromSqlite: async () => ({
            exported_notes: 1,
            written_files: 1,
            skipped_notes: [],
            deleted_files: 0,
            duration_ms: 1,
          }),
          runIndex: async () => {
            const err = new Error("chroma down");
            /** @type {Error & { code?: string }} */ (err).code = "CHROMA_ERROR";
            throw err;
          },
          runWikiCompile: async () => {
            wikiRan = true;
            return 0;
          },
        },
      ),
    (e) => /** @type {{ code?: string }} */ (e).code === "CHROMA_ERROR",
  );
  assert.strictEqual(wikiRan, false);
});

test("sqlite-sync --export-only skips pipeline despite run_index true", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jb-exo-"));
  const cfgPath = path.join(tmp, "cfg.yaml");
  const notes = path.join(tmp, "notes");
  fs.mkdirSync(notes);
  fs.writeFileSync(
    cfgPath,
    `
notes_root: ./notes
wiki_root: ""
joplin_sqlite_sync:
  enabled: true
  database_path: ${path.join(tmp, "db.sqlite").replace(/\\/g, "/")}
  pipeline:
    run_index: true
    run_wiki_compile: true
joplin_wiki_writeback:
  enabled: false
chroma:
  persist_path: ./chroma
`,
    "utf8",
  );

  let indexRan = false;
  let wikiRan = false;
  const opts = new Map([["export-only", "true"]]);
  const code = await runSqliteSync(
    { configPath: cfgPath, argv: [], opts },
    {
      ...defaultDeps,
      exportNotesFromSqlite: async () => ({
        exported_notes: 1,
        written_files: 1,
        skipped_notes: [],
        deleted_files: 0,
        duration_ms: 1,
      }),
      runIndex: async () => {
        indexRan = true;
        return 0;
      },
      runWikiCompile: async () => {
        wikiRan = true;
        return 0;
      },
    },
  );
  assert.strictEqual(code, 0);
  assert.strictEqual(indexRan, false);
  assert.strictEqual(wikiRan, false);
});

test("REQ-JSQ-REPO-NOTES-LAYOUT: .gitignore lists notes_root/", () => {
  const gi = fs.readFileSync(path.join(rootDir, ".gitignore"), "utf8");
  assert.ok(
    gi.split("\n").some((l) => l.trim() === "notes_root/"),
    "notes_root/ missing from .gitignore",
  );
});

test("SCN-JSQ-REPO-01: git check-ignore notes_root placeholder", () => {
  const notesFile = path.join(rootDir, "notes_root", ".gitignore-test-file");
  fs.mkdirSync(path.dirname(notesFile), { recursive: true });
  fs.writeFileSync(notesFile, "x", "utf8");
  try {
    const r = spawnSync("git", ["check-ignore", "-q", notesFile], {
      cwd: rootDir,
      encoding: "utf8",
    });
    assert.strictEqual(
      r.status,
      0,
      `notes_root file should be ignored (status ${r.status})`,
    );
  } finally {
    try {
      fs.unlinkSync(notesFile);
    } catch {
      /* ignore */
    }
  }
});

test("sqlite-sync --dry-run does not create new md files", async () => {
  const Database = (await import("better-sqlite3")).default;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jb-dry-"));
  const dbFile = path.join(tmp, "db.sqlite");
  const outDir = path.join(tmp, "out");
  fs.mkdirSync(outDir);
  const db = new Database(dbFile);
  db.exec(`
    CREATE TABLE notes (
      id TEXT NOT NULL PRIMARY KEY,
      parent_id TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      created_time INTEGER NOT NULL DEFAULT 0,
      updated_time INTEGER NOT NULL DEFAULT 0,
      deleted_time INTEGER NOT NULL DEFAULT 0
    );
  `);
  db.prepare("INSERT INTO notes (id, title, body) VALUES (?, ?, ?)").run(
    "dddddddddddddddddddddddddddddddd",
    "D",
    "x",
  );
  db.close();

  const cfgPath = path.join(tmp, "cfg.yaml");
  fs.writeFileSync(
    cfgPath,
    `
notes_root: ${outDir.replace(/\\/g, "/")}
wiki_root: ""
joplin_sqlite_sync:
  enabled: true
  database_path: ${dbFile.replace(/\\/g, "/")}
  pipeline:
    run_index: false
    run_wiki_compile: false
joplin_wiki_writeback:
  enabled: false
chroma:
  persist_path: ./chroma
`,
    "utf8",
  );

  const before = fs.readdirSync(outDir).slice().sort();
  const opts = new Map();
  opts.set("dry-run", "true");
  await runSqliteSync({ configPath: cfgPath, argv: [], opts });
  const after = fs.readdirSync(outDir).slice().sort();
  assert.deepStrictEqual(after, before);
});

test("schedule emits multiple stdout lines (integration)", async () => {
  const Database = (await import("better-sqlite3")).default;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jb-sch-"));
  const dbFile = path.join(tmp, "db.sqlite");
  const outDir = path.join(tmp, "out");
  fs.mkdirSync(outDir);
  const db = new Database(dbFile);
  db.exec(`
    CREATE TABLE notes (
      id TEXT NOT NULL PRIMARY KEY,
      parent_id TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      created_time INTEGER NOT NULL DEFAULT 0,
      updated_time INTEGER NOT NULL DEFAULT 0,
      deleted_time INTEGER NOT NULL DEFAULT 0
    );
  `);
  db.prepare("INSERT INTO notes (id, title, body) VALUES (?, ?, ?)").run(
    "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    "E",
    "y",
  );
  db.close();

  const cfgPath = path.join(tmp, "cfg.yaml");
  fs.writeFileSync(
    cfgPath,
    `
notes_root: ${outDir.replace(/\\/g, "/")}
wiki_root: ""
joplin_sqlite_sync:
  enabled: true
  database_path: ${dbFile.replace(/\\/g, "/")}
  pipeline:
    run_index: false
    run_wiki_compile: false
  schedule:
    every_seconds: 1
joplin_wiki_writeback:
  enabled: false
chroma:
  persist_path: ./chroma
`,
    "utf8",
  );

  const child = spawn(process.execPath, [binCli, "sqlite-sync", "--config", cfgPath], {
    cwd: tmp,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let lines = 0;
  await new Promise((resolve, reject) => {
    let buf = "";
    child.stdout?.on("data", (d) => {
      buf += String(d);
      lines = buf.trim().split(/\n/).filter(Boolean).length;
      if (lines >= 2) {
        child.kill("SIGINT");
      }
    });
    child.on("error", reject);
    child.on("exit", () => resolve(undefined));
    setTimeout(() => {
      child.kill("SIGINT");
    }, 8000);
  });
  assert.ok(lines >= 2, `expected at least 2 json lines, got ${lines}`);
});

test("better-sqlite3 smoke: openReadonlyDatabase", async () => {
  const Database = (await import("better-sqlite3")).default;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jb-open-"));
  const dbFile = path.join(tmp, "x.db");
  const d = new Database(dbFile);
  d.exec("CREATE TABLE t(x INT); INSERT INTO t VALUES (1);");
  d.close();
  const ro = await openReadonlyDatabase(dbFile, 5000, 2);
  const v = /** @type {{ x: number }} */ (ro.prepare("SELECT x FROM t").get());
  assert.strictEqual(v.x, 1);
  ro.close();
});
