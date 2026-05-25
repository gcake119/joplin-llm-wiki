import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "../src/config/load-config.js";

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "jllw-config-"));
}

function writeCfg(dir, body) {
  const p = path.join(dir, "config.yaml");
  fs.writeFileSync(p, body);
  return p;
}

function minimal(dir, extra = "") {
  fs.mkdirSync(path.join(dir, "raw"), { recursive: true });
  fs.mkdirSync(path.join(dir, "wiki"), { recursive: true });
  return writeCfg(
    dir,
    `raw: ./raw
raw_glob: "**/*.md"
wiki: ./wiki
wiki_glob: "**/*.md"
wiki_schema:
  path: ""
joplin_wiki_writeback:
  enabled: false
${extra}`,
  );
}

test("load-config resolves raw/wiki and defaults", async () => {
  const dir = tmpdir();
  const cfg = await loadConfig(minimal(dir));
  assert.equal(cfg.raw, path.join(dir, "raw"));
  assert.equal(cfg.raw_glob, "**/*.md");
  assert.equal(cfg.wiki, path.join(dir, "wiki"));
  assert.equal(cfg.wiki_glob, "**/*.md");
  assert.equal(cfg.knowledge_flow.pending_capture_id_timezone, "UTC");
  assert.equal(cfg.joplin_wiki_writeback.parent_notebook_title, "@llm-wiki");
});

test("knowledge_flow pending capture id timezone accepts Asia/Taipei", async () => {
  const dir = tmpdir();
  const cfg = await loadConfig(
    minimal(
      dir,
      `knowledge_flow:
  pending_capture_id_timezone: Asia/Taipei
`,
    ),
  );
  assert.equal(cfg.knowledge_flow.pending_capture_id_timezone, "Asia/Taipei");
});

test("knowledge_flow pending capture id timezone rejects invalid values", async () => {
  const dir = tmpdir();
  const p = minimal(
    dir,
    `knowledge_flow:
  pending_capture_id_timezone: Mars/Taipei
`,
  );
  await assert.rejects(
    () => loadConfig(p),
    /knowledge_flow\.pending_capture_id_timezone must be a valid IANA timezone/,
  );
});

test("legacy notes_root/wiki_root keys are rejected", async () => {
  const dir = tmpdir();
  const p = writeCfg(
    dir,
    `notes_root: ./notes
wiki_root: ./wiki
joplin_wiki_writeback:
  enabled: false
`,
  );
  await assert.rejects(() => loadConfig(p), /legacy config keys/);
});

test("legacy wiki.glob is rejected", async () => {
  const dir = tmpdir();
  const p = writeCfg(
    dir,
    `raw: ./raw
wiki:
  glob: "**/*.md"
joplin_wiki_writeback:
  enabled: false
`,
  );
  await assert.rejects(() => loadConfig(p), /wiki\.glob/);
});

test("sqlite export_root must equal raw", async () => {
  const dir = tmpdir();
  const p = minimal(
    dir,
    `joplin_sqlite_sync:
  enabled: true
  database_path: ./db.sqlite
  export_root: ./other
`,
  );
  await assert.rejects(() => loadConfig(p), /export_root must equal raw/);
});

test("sqlite compile_mode accepts local agent and off", async () => {
  for (const mode of ["local", "agent", "off"]) {
    const dir = tmpdir();
    const p = minimal(
      dir,
      `joplin_sqlite_sync:
  enabled: true
  database_path: ./db.sqlite
  pipeline:
    compile_mode: ${mode}
`,
    );
    const cfg = await loadConfig(p);
    assert.equal(cfg.joplin_sqlite_sync.pipeline.compile_mode, mode);
  }
});

test("sqlite compile_mode rejects invalid values", async () => {
  const dir = tmpdir();
  const p = minimal(
    dir,
    `joplin_sqlite_sync:
  enabled: true
  database_path: ./db.sqlite
  pipeline:
    compile_mode: shell
`,
  );
  await assert.rejects(() => loadConfig(p), /compile_mode must be local, agent, or off/);
});

test("sqlite compile_mode falls back to legacy run_wiki_compile", async () => {
  const enabledDir = tmpdir();
  const enabled = await loadConfig(
    minimal(
      enabledDir,
      `joplin_sqlite_sync:
  enabled: true
  database_path: ./db.sqlite
  pipeline:
    run_wiki_compile: true
`,
    ),
  );
  assert.equal(enabled.joplin_sqlite_sync.pipeline.compile_mode, "local");

  const disabledDir = tmpdir();
  const disabled = await loadConfig(
    minimal(
      disabledDir,
      `joplin_sqlite_sync:
  enabled: true
  database_path: ./db.sqlite
  pipeline:
    run_wiki_compile: false
`,
    ),
  );
  assert.equal(disabled.joplin_sqlite_sync.pipeline.compile_mode, "off");
});

test("sqlite compile_mode overrides legacy run_wiki_compile", async () => {
  const dir = tmpdir();
  const cfg = await loadConfig(
    minimal(
      dir,
      `joplin_sqlite_sync:
  enabled: true
  database_path: ./db.sqlite
  pipeline:
    compile_mode: agent
    run_wiki_compile: false
`,
    ),
  );
  assert.equal(cfg.joplin_sqlite_sync.pipeline.run_wiki_compile, false);
  assert.equal(cfg.joplin_sqlite_sync.pipeline.compile_mode, "agent");
});

test("writeback enabled requires token but not artifacts project notebook", async () => {
  const dir = tmpdir();
  const missingToken = writeCfg(
    dir,
    `raw: ./raw
wiki: ./wiki
joplin_wiki_writeback:
  enabled: true
  artifacts_project_notebook_title: ProjectA
joplin_data_api:
  token: ""
`,
  );
  await assert.rejects(() => loadConfig(missingToken), /token must be non-empty/);

  const wikiOnly = writeCfg(
    dir,
    `raw: ./raw
wiki: ./wiki
joplin_wiki_writeback:
  enabled: true
joplin_data_api:
  token: t
`,
  );
  const cfg = await loadConfig(wikiOnly);
  assert.equal(cfg.joplin_wiki_writeback.enabled, true);
  assert.equal(cfg.joplin_wiki_writeback.artifacts_project_notebook_title, "");
});

test("writeback enabled rejects non-loopback Joplin Data API URL", async () => {
  const dir = tmpdir();
  const cfgPath = writeCfg(
    dir,
    `raw: ./raw
wiki: ./wiki
joplin_wiki_writeback:
  enabled: true
joplin_data_api:
  base_url: http://example.com:41184
  token: t
`,
  );

  await assert.rejects(
    () => loadConfig(cfgPath),
    /hostname must be 127\.0\.0\.1, localhost, or ::1/,
  );
});
