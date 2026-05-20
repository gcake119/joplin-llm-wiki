import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert";
import { loadConfig } from "../src/config/load-config.js";
import { loadWikiSchema } from "../src/schema/schema-validator.js";

const here = path.dirname(fileURLToPath(import.meta.url));

test("load-config resolves relative paths + default rag.retrieve_mode", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jb-cfg-"));
  const notes = path.join(tmp, "notes");
  fs.mkdirSync(notes);
  const cfgPath = path.join(tmp, "cfg.yaml");
  fs.writeFileSync(
    cfgPath,
    `
notes_root: ./notes
wiki_root: ./wiki
wiki_schema:
  path: ./schema.yaml
wiki:
  glob: "**/*.md"
chroma:
  persist_path: ./chroma-data
joplin_wiki_writeback:
  enabled: false
`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(tmp, "schema.yaml"),
    `
schema_version: "t"
page_types:
  - id: t
    required_frontmatter_keys: []
    required_outbound_link_patterns: []
required_hub_pages: []
`,
    "utf8",
  );

  const cfg = await loadConfig(cfgPath);
  assert.strictEqual(cfg.notes_root, path.resolve(tmp, "notes"));
  assert.strictEqual(cfg.wiki_root, path.resolve(tmp, "wiki"));
  assert.strictEqual(cfg.wiki_schema.path, path.resolve(tmp, "schema.yaml"));
  assert.strictEqual(cfg.chroma.persist_path, path.resolve(tmp, "chroma-data"));
  assert.strictEqual(cfg.rag.retrieve_mode, "wiki_first");
});

test("SCN-SCHEMA-01 example schema parses", () => {
  const example = path.resolve(here, "../wiki-schema.example.yaml");
  const schema = loadWikiSchema(example);
  assert.ok(schema.page_types.length >= 1);
});

test("SCN-SCHEMA-02 duplicate page type id rejected", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jb-sch-"));
  const p = path.join(tmp, "bad.yaml");
  fs.writeFileSync(
    p,
    `
schema_version: "1"
page_types:
  - id: dup
    required_frontmatter_keys: []
    required_outbound_link_patterns: []
  - id: dup
    required_frontmatter_keys: []
    required_outbound_link_patterns: []
required_hub_pages: []
`,
    "utf8",
  );
  assert.throws(
    () => loadWikiSchema(p),
    (e) =>
      /** @type {Error & { code?: string }} */ (e).code === "SCHEMA_INVALID",
  );
});

test("SCN-WCC-CFG corpus_mode_enabled omitted defaults true + digest defaults", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jb-wccfg-"));
  const notes = path.join(tmp, "notes");
  fs.mkdirSync(notes);
  const schemaPath = path.join(tmp, "schema.yaml");
  fs.writeFileSync(
    schemaPath,
    `
schema_version: "1"
page_types:
  - id: t
    required_frontmatter_keys: []
    required_outbound_link_patterns: []
required_hub_pages: []
`,
    "utf8",
  );
  const cfgPath = path.join(tmp, "cfg.yaml");
  fs.writeFileSync(
    cfgPath,
    `
notes_root: ${notes}
wiki_root: ""
wiki_schema:
  path: ${schemaPath}
joplin_wiki_writeback:
  enabled: false
chroma:
  persist_path: ${path.join(tmp, "chroma")}
`,
    "utf8",
  );
  const cfg = await loadConfig(cfgPath);
  assert.strictEqual(cfg.wiki_ingest.corpus_mode_enabled, true);
  assert.strictEqual(cfg.wiki_ingest.corpus_digest_max_files, 500);
});

test("SCN-WCC-CFG corpus_mode_enabled false + invalid excerpt enum rejected", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jb-wccfg2-"));
  const notes = path.join(tmp, "notes");
  fs.mkdirSync(notes);
  const schemaPath = path.join(tmp, "schema.yaml");
  fs.writeFileSync(
    schemaPath,
    `
schema_version: "1"
page_types:
  - id: t
    required_frontmatter_keys: []
    required_outbound_link_patterns: []
required_hub_pages: []
`,
    "utf8",
  );

  fs.writeFileSync(
    path.join(tmp, "ok.yaml"),
    `
notes_root: ${notes}
wiki_root: ""
wiki_schema:
  path: ${schemaPath}
wiki_ingest:
  corpus_mode_enabled: false
joplin_wiki_writeback:
  enabled: false
chroma:
  persist_path: ${path.join(tmp, "chroma")}
`,
    "utf8",
  );
  const ok = await loadConfig(path.join(tmp, "ok.yaml"));
  assert.strictEqual(ok.wiki_ingest.corpus_mode_enabled, false);

  fs.writeFileSync(
    path.join(tmp, "bad.yaml"),
    `
notes_root: ${notes}
wiki_root: ""
wiki_schema:
  path: ${schemaPath}
wiki_ingest:
  corpus_writer_excerpt_mode: chroma_cloud
joplin_wiki_writeback:
  enabled: false
chroma:
  persist_path: ${path.join(tmp, "chroma")}
`,
    "utf8",
  );
  await assert.rejects(
    () => loadConfig(path.join(tmp, "bad.yaml")),
    (e) => /** @type {{ code?: string }} */ (e).code === "CONFIG_INVALID",
  );
});

test("SCN-WCC-CFG corpus_digest_max_files below minimum rejected", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jb-wccfg3-"));
  const notes = path.join(tmp, "notes");
  fs.mkdirSync(notes);
  const schemaPath = path.join(tmp, "schema.yaml");
  fs.writeFileSync(
    schemaPath,
    `
schema_version: "1"
page_types:
  - id: t
    required_frontmatter_keys: []
    required_outbound_link_patterns: []
required_hub_pages: []
`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(tmp, "cfg.yaml"),
    `
notes_root: ${notes}
wiki_root: ""
wiki_schema:
  path: ${schemaPath}
wiki_ingest:
  corpus_digest_max_files: 39
joplin_wiki_writeback:
  enabled: false
chroma:
  persist_path: ${path.join(tmp, "chroma")}
`,
    "utf8",
  );
  await assert.rejects(
    () => loadConfig(path.join(tmp, "cfg.yaml")),
    (e) => /** @type {{ code?: string }} */ (e).code === "CONFIG_INVALID",
  );
});

test("SCN-WCC-SWEEP-CFG-INVALID sweep enabled with corpus_mode false", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jb-sweep-cfg-"));
  const notes = path.join(tmp, "notes");
  const schemaPath = writeMinimalSchema(tmp, notes);
  fs.writeFileSync(
    path.join(tmp, "cfg.yaml"),
    `
notes_root: ${notes}
wiki_root: ""
wiki_schema:
  path: ${schemaPath}
wiki_ingest:
  corpus_mode_enabled: false
  corpus_auto_sweep:
    enabled: true
joplin_wiki_writeback:
  enabled: false
chroma:
  persist_path: ${path.join(tmp, "chroma")}
`,
    "utf8",
  );
  await assert.rejects(
    () => loadConfig(path.join(tmp, "cfg.yaml")),
    (e) =>
      /** @type {{ code?: string }} */ (e).code === "CONFIG_INVALID" &&
      String(e.message).includes("corpus_auto_sweep.enabled"),
  );
});

test("SCN-WCC-SWEEP-STEP step_files exceeds corpus_digest_max_files", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jb-sweep-step-"));
  const notes = path.join(tmp, "notes");
  const schemaPath = writeMinimalSchema(tmp, notes);
  fs.writeFileSync(
    path.join(tmp, "cfg.yaml"),
    `
notes_root: ${notes}
wiki_root: ""
wiki_schema:
  path: ${schemaPath}
wiki_ingest:
  corpus_digest_max_files: 80
  corpus_auto_sweep:
    enabled: true
    step_files: 100
joplin_wiki_writeback:
  enabled: false
chroma:
  persist_path: ${path.join(tmp, "chroma")}
`,
    "utf8",
  );
  await assert.rejects(
    () => loadConfig(path.join(tmp, "cfg.yaml")),
    (e) => /** @type {{ code?: string }} */ (e).code === "CONFIG_INVALID",
  );
});

test("SCN-WCC-SWEEP step_files omitted defaults to corpus_digest_max_files", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jb-sweep-step-def-"));
  const notes = path.join(tmp, "notes");
  const schemaPath = writeMinimalSchema(tmp, notes);
  fs.writeFileSync(
    path.join(tmp, "cfg.yaml"),
    `
notes_root: ${notes}
wiki_root: ""
wiki_schema:
  path: ${schemaPath}
wiki_ingest:
  corpus_digest_max_files: 120
  corpus_auto_sweep:
    enabled: true
joplin_wiki_writeback:
  enabled: false
chroma:
  persist_path: ${path.join(tmp, "chroma")}
`,
    "utf8",
  );
  const cfg = await loadConfig(path.join(tmp, "cfg.yaml"));
  assert.strictEqual(cfg.wiki_ingest.corpus_auto_sweep.step_files, 120);
});

/**
 * @param {string} tmp
 * @param {string} notes
 */
function writeMinimalSchema(tmp, notes) {
  const schemaPath = path.join(tmp, "schema.yaml");
  fs.writeFileSync(
    schemaPath,
    `
schema_version: "1"
page_types:
  - id: t
    required_frontmatter_keys: []
    required_outbound_link_patterns: []
required_hub_pages: []
`,
    "utf8",
  );
  fs.mkdirSync(notes);
  return schemaPath;
}

test("SCN-CFG-TOPIC loads min_topic_pages_per_run and sweep until-cycle keys", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jb-cfg-topic-"));
  const notes = path.join(tmp, "notes");
  const schemaPath = writeMinimalSchema(tmp, notes);
  fs.writeFileSync(
    path.join(tmp, "cfg.yaml"),
    `
notes_root: ${notes}
wiki_root: ""
wiki_schema:
  path: ${schemaPath}
wiki_ingest:
  min_topic_pages_per_run: 4
  planner_reject_source_paths: false
  corpus_auto_sweep:
    enabled: true
    run_until_cycle_complete: true
    max_total_windows_per_invocation: 99
joplin_wiki_writeback:
  enabled: false
chroma:
  persist_path: ${path.join(tmp, "chroma")}
`,
    "utf8",
  );
  const cfg = await loadConfig(path.join(tmp, "cfg.yaml"));
  assert.strictEqual(cfg.wiki_ingest.min_topic_pages_per_run, 4);
  assert.strictEqual(cfg.wiki_ingest.planner_reject_source_paths, false);
  assert.strictEqual(
    cfg.wiki_ingest.corpus_auto_sweep.run_until_cycle_complete,
    true,
  );
  assert.strictEqual(
    cfg.wiki_ingest.corpus_auto_sweep.max_total_windows_per_invocation,
    99,
  );
});

test("SCN-JDA-CFG writeback enabled rejects non-integer timeout_ms", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jb-jda-timeout-"));
  const notes = path.join(tmp, "notes");
  const schemaPath = writeMinimalSchema(tmp, notes);
  fs.writeFileSync(
    path.join(tmp, "cfg.yaml"),
    `
notes_root: ${notes}
wiki_root: ""
wiki_schema:
  path: ${schemaPath}
joplin_wiki_writeback:
  enabled: true
joplin_data_api:
  token: ok-token
  timeout_ms: 3000.5
chroma:
  persist_path: ${path.join(tmp, "chroma")}
`,
    "utf8",
  );
  await assert.rejects(
    () => loadConfig(path.join(tmp, "cfg.yaml")),
    (e) => /** @type {{ code?: string }} */ (e).code === "CONFIG_INVALID",
  );
});

test("SCN-JDA-CFG writeback enabled rejects timeout_ms below minimum", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jb-jda-timeout2-"));
  const notes = path.join(tmp, "notes");
  const schemaPath = writeMinimalSchema(tmp, notes);
  fs.writeFileSync(
    path.join(tmp, "cfg.yaml"),
    `
notes_root: ${notes}
wiki_root: ""
wiki_schema:
  path: ${schemaPath}
joplin_wiki_writeback:
  enabled: true
joplin_data_api:
  token: ok-token
  timeout_ms: 500
chroma:
  persist_path: ${path.join(tmp, "chroma")}
`,
    "utf8",
  );
  await assert.rejects(
    () => loadConfig(path.join(tmp, "cfg.yaml")),
    (e) => /** @type {{ code?: string }} */ (e).code === "CONFIG_INVALID",
  );
});

test("SCN-JDA-CFG writeback enabled accepts token + timeout_ms defaults", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jb-jda-ok-"));
  const notes = path.join(tmp, "notes");
  const schemaPath = writeMinimalSchema(tmp, notes);
  fs.writeFileSync(
    path.join(tmp, "cfg.yaml"),
    `
notes_root: ${notes}
wiki_root: ""
wiki_schema:
  path: ${schemaPath}
joplin_wiki_writeback:
  enabled: true
joplin_data_api:
  token: ok-token
chroma:
  persist_path: ${path.join(tmp, "chroma")}
`,
    "utf8",
  );
  const cfg = await loadConfig(path.join(tmp, "cfg.yaml"));
  assert.strictEqual(cfg.joplin_data_api.token, "ok-token");
  assert.strictEqual(cfg.joplin_data_api.timeout_ms, 30_000);
  assert.strictEqual(cfg.joplin_data_api.base_url, "http://127.0.0.1:41184");
});

test("SCN-JDA-ALLOWLIST non-loopback base_url rejected when writeback enabled", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jb-jda-host-"));
  const notes = path.join(tmp, "notes");
  const schemaPath = writeMinimalSchema(tmp, notes);
  fs.writeFileSync(
    path.join(tmp, "cfg.yaml"),
    `
notes_root: ${notes}
wiki_root: ""
wiki_schema:
  path: ${schemaPath}
joplin_wiki_writeback:
  enabled: true
joplin_data_api:
  base_url: http://192.168.1.10:41184
  token: ok-token
chroma:
  persist_path: ${path.join(tmp, "chroma")}
`,
    "utf8",
  );
  await assert.rejects(
    () => loadConfig(path.join(tmp, "cfg.yaml")),
    (e) => /** @type {{ code?: string }} */ (e).code === "CONFIG_INVALID",
  );
});

test("SCN-JDA-ALLOWLIST non-loopback base_url allowed when writeback disabled", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jb-jda-host-off-"));
  const notes = path.join(tmp, "notes");
  const schemaPath = writeMinimalSchema(tmp, notes);
  fs.writeFileSync(
    path.join(tmp, "cfg.yaml"),
    `
notes_root: ${notes}
wiki_root: ""
wiki_schema:
  path: ${schemaPath}
joplin_wiki_writeback:
  enabled: false
joplin_data_api:
  base_url: http://192.168.1.10:41184
  token: ""
chroma:
  persist_path: ${path.join(tmp, "chroma")}
`,
    "utf8",
  );
  const cfg = await loadConfig(path.join(tmp, "cfg.yaml"));
  assert.strictEqual(cfg.joplin_data_api.base_url, "http://192.168.1.10:41184");
});

test("notebook_filter defaults and configured values load", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jb-cfg-nbf-"));
  const notes = path.join(tmp, "notes");
  fs.mkdirSync(notes);
  const cfgPath = path.join(tmp, "cfg.yaml");
  fs.writeFileSync(
    cfgPath,
    `
notes_root: ./notes
wiki_root: ./wiki
joplin_wiki_writeback:
  enabled: false
joplin_sqlite_sync:
  enabled: true
  database_path: ./db.sqlite
  notebook_filter:
    enabled: true
    include_notebook_ids: ["abc"]
    include_notebook_paths: ["工作/專案A"]
    include_descendants: true
    notebook_path_style: joined_slug
    notebook_path_separator: "-"
    source_filename: title
chroma:
  persist_path: ./chroma
`,
    "utf8",
  );
  const cfg = await loadConfig(cfgPath);
  assert.strictEqual(cfg.joplin_sqlite_sync.notebook_filter.enabled, true);
  assert.deepStrictEqual(cfg.joplin_sqlite_sync.notebook_filter.include_notebook_ids, ["abc"]);
  assert.deepStrictEqual(cfg.joplin_sqlite_sync.notebook_filter.include_notebook_paths, ["工作/專案A"]);
  assert.strictEqual(cfg.joplin_sqlite_sync.notebook_filter.notebook_path_style, "joined_slug");
  assert.strictEqual(cfg.joplin_sqlite_sync.notebook_filter.source_filename, "title");
});
