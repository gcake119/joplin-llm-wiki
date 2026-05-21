import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildHealthSnapshot } from "../../src/health-gui/health-snapshot.js";
import {
  mergeMvpFields,
  readGuiFieldsLenient,
} from "../../src/health-gui/config/config-coordinator.js";
import { startLocalDependency } from "../../src/health-gui/deps/dependency-starter.js";

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "jllw-health-"));
}

function writeConfig(dir) {
  const p = path.join(dir, "config.yaml");
  fs.writeFileSync(
    p,
    `raw: ./raw
wiki: ./wiki
joplin_wiki_writeback:
  enabled: false
ollama:
  base_url: http://127.0.0.1:1
  chat_model: test
`,
  );
  return p;
}

test("health snapshot reports raw/wiki without Chroma", async () => {
  const dir = tmpdir();
  fs.mkdirSync(path.join(dir, "raw"));
  fs.mkdirSync(path.join(dir, "wiki"));
  const cfg = writeConfig(dir);
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ models: [] }), { status: 200 });
  try {
    const snap = await buildHealthSnapshot(cfg);
    assert.equal(snap.ok, true);
    assert.equal(snap.rawRoot, path.join(dir, "raw"));
    assert.equal(snap.wikiRoot, path.join(dir, "wiki"));
    assert.equal("chroma" in snap, false);
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test("config coordinator merges raw/wiki fields", () => {
  const out = mergeMvpFields({
    notes_root: "./old-notes",
    wiki_root: "./old-wiki",
    ollama: { embed_model: "bge", embed_batch_size: 16 },
    joplin_sqlite_sync: { pipeline: { run_index: true, run_wiki_compile: true } },
  }, {
    raw: "./raw",
    wiki: "./wiki",
    ollama_base_url: "http://127.0.0.1:11434",
    ollama_chat_model: "chat",
  });
  assert.match(out, /raw: \.\/raw/);
  assert.match(out, /wiki: \.\/wiki/);
  assert.doesNotMatch(out, /notes_root/);
  assert.doesNotMatch(out, /wiki_root/);
  assert.doesNotMatch(out, /embed_model/);
  assert.doesNotMatch(out, /embed_batch_size/);
  assert.doesNotMatch(out, /run_index/);
});

test("config coordinator derives GUI fields from legacy config", () => {
  const fields = readGuiFieldsLenient({
    notes_root: "./notes",
    wiki_root: "./wiki-root",
    ollama: { base_url: "http://127.0.0.1:11434", chat_model: "chat" },
  });
  assert.equal(fields.raw, "./notes");
  assert.equal(fields.wiki, "./wiki-root");
  assert.equal(fields.ollama_chat_model, "chat");
});

test("dependency starter only accepts ollama", async () => {
  const r = await startLocalDependency("/repo", "/cfg", { kind: "chroma-server", confirmed: true }, {
    loadConfig: async () => ({}),
  });
  assert.equal(r.code, "UNKNOWN_KIND");
});
