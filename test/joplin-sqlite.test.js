import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";
import { exportNotesFromSqlite, openReadonlyDatabase } from "../src/joplin/sqlite/exporter.js";
import { markdownPathForNote, assertPathUnderExportRoot } from "../src/joplin/sqlite/paths.js";

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

test("sqlite exporter writes markdown under raw export root", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jllw-sqlite-"));
  const dbPath = path.join(tmp, "joplin.sqlite");
  const outDir = path.join(tmp, "raw");
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE notes (id TEXT PRIMARY KEY, parent_id TEXT, title TEXT, body TEXT, deleted_time INTEGER DEFAULT 0, is_conflict INTEGER DEFAULT 0, encryption_applied INTEGER DEFAULT 0, updated_time INTEGER DEFAULT 0, created_time INTEGER DEFAULT 0);
    CREATE TABLE folders (id TEXT PRIMARY KEY, parent_id TEXT, title TEXT, deleted_time INTEGER DEFAULT 0);
    CREATE TABLE resources (id TEXT PRIMARY KEY, title TEXT, mime TEXT, filename TEXT, file_extension TEXT, updated_time INTEGER DEFAULT 0, created_time INTEGER DEFAULT 0, encryption_applied INTEGER DEFAULT 0);
    CREATE TABLE note_resources (id TEXT PRIMARY KEY, note_id TEXT, resource_id TEXT);
  `);
  db.prepare("INSERT INTO folders (id, parent_id, title) VALUES (?, ?, ?)").run("f1", "", "Inbox");
  db.prepare("INSERT INTO notes (id, parent_id, title, body) VALUES (?, ?, ?, ?)").run("n1", "f1", "Hello", "Body");
  db.close();

  const summary = await exportNotesFromSqlite({
    databasePath: dbPath,
    exportRootAbs: outDir,
    reconcileMode: "mirror",
    busyTimeoutMs: 1000,
    maxExportAttempts: 1,
    dryRun: false,
    notebookFilter: {
      enabled: false,
      include_notebook_ids: [],
      include_notebook_paths: [],
      include_descendants: true,
      notebook_path_style: "joined_slug",
      notebook_path_separator: "-",
      source_filename: "title",
    },
  });
  assert.equal(summary.exported_notes, 1);
  assert.ok(fs.existsSync(path.join(outDir, "Inbox", "Hello.md")));
});

test("sqlite exporter preserves literal replacement characters", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jllw-sqlite-"));
  const dbPath = path.join(tmp, "joplin.sqlite");
  const outDir = path.join(tmp, "raw");
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE notes (id TEXT PRIMARY KEY, parent_id TEXT, title TEXT, body TEXT, deleted_time INTEGER DEFAULT 0);
    CREATE TABLE folders (id TEXT PRIMARY KEY, parent_id TEXT, title TEXT, deleted_time INTEGER DEFAULT 0);
  `);
  db.prepare("INSERT INTO folders (id, parent_id, title) VALUES (?, ?, ?)").run("f1", "", "Inbox");
  db.prepare("INSERT INTO notes (id, parent_id, title, body) VALUES (?, ?, ?, ?)").run("n1", "f1", "Replacement", "A literal � character");
  db.close();

  const summary = await exportNotesFromSqlite({
    databasePath: dbPath,
    exportRootAbs: outDir,
    reconcileMode: "mirror",
    busyTimeoutMs: 1000,
    maxExportAttempts: 1,
    dryRun: false,
    notebookFilter: {
      enabled: false,
      include_notebook_ids: [],
      include_notebook_paths: [],
      include_descendants: true,
      notebook_path_style: "joined_slug",
      notebook_path_separator: "-",
      source_filename: "title",
    },
  });

  assert.equal(summary.written_files, 1);
  assert.deepEqual(summary.skipped_notes, []);
  assert.match(
    fs.readFileSync(path.join(outDir, "Inbox", "Replacement.md"), "utf8"),
    /A literal � character/,
  );
});

test("sqlite exporter skips truly invalid UTF-8 note bodies", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jllw-sqlite-"));
  const dbPath = path.join(tmp, "joplin.sqlite");
  const outDir = path.join(tmp, "raw");
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE notes (id TEXT PRIMARY KEY, parent_id TEXT, title TEXT, body TEXT, deleted_time INTEGER DEFAULT 0);
    CREATE TABLE folders (id TEXT PRIMARY KEY, parent_id TEXT, title TEXT, deleted_time INTEGER DEFAULT 0);
  `);
  db.prepare("INSERT INTO folders (id, parent_id, title) VALUES (?, ?, ?)").run("f1", "", "Inbox");
  db.prepare("INSERT INTO notes (id, parent_id, title, body) VALUES (?, ?, ?, CAST(? AS TEXT))").run(
    "n1",
    "f1",
    "Broken",
    Buffer.from([0x80]),
  );
  db.close();

  const summary = await exportNotesFromSqlite({
    databasePath: dbPath,
    exportRootAbs: outDir,
    reconcileMode: "mirror",
    busyTimeoutMs: 1000,
    maxExportAttempts: 1,
    dryRun: false,
    notebookFilter: {
      enabled: false,
      include_notebook_ids: [],
      include_notebook_paths: [],
      include_descendants: true,
      notebook_path_style: "joined_slug",
      notebook_path_separator: "-",
      source_filename: "title",
    },
  });

  assert.equal(summary.written_files, 0);
  assert.deepEqual(summary.skipped_notes, [{ id: "n1", reason: "INVALID_UTF8" }]);
  assert.equal(fs.existsSync(path.join(outDir, "Inbox", "Broken.md")), false);
});

test("raw/ is gitignored", () => {
  const gi = fs.readFileSync(path.join(rootDir, ".gitignore"), "utf8");
  assert.ok(gi.split("\n").some((l) => l.trim() === "raw/"));
  const rawFile = path.join(rootDir, "raw", ".gitignore-test-file");
  fs.mkdirSync(path.dirname(rawFile), { recursive: true });
  fs.writeFileSync(rawFile, "x");
  try {
    const r = spawnSync("git", ["check-ignore", "-q", rawFile], { cwd: rootDir });
    assert.equal(r.status, 0);
  } finally {
    fs.unlinkSync(rawFile);
  }
});

test("path helpers reject traversal", () => {
  const root = path.resolve(os.tmpdir(), "jllw-raw-root");
  assert.throws(() => markdownPathForNote(root, "../evil000000000000000000000000"), /invalid note id/);
  assert.throws(() => assertPathUnderExportRoot(root, path.join(root, "..", "outside")), /outside export_root/);
});

test("better-sqlite3 readonly open smoke", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jllw-db-"));
  const dbPath = path.join(tmp, "db.sqlite");
  const db = new Database(dbPath);
  db.exec("CREATE TABLE x (id TEXT)");
  db.close();
  const ro = await openReadonlyDatabase(dbPath, 1000, 1);
  ro.close();
});
