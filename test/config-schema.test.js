import test from "node:test";
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
  assert.equal(cfg.joplin_wiki_writeback.parent_notebook_title, "@llm-wiki");
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
