import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert";
import { loadConfig } from "../src/config/load-config.js";
import { createIndexRuntime } from "../src/commands/cmd-index.js";
import { indexAll } from "../src/index/indexer.js";
import { installMockOllamaFetch } from "./helpers/mock-ollama-fetch.mjs";

test("SCN-IDX-01 + SCN-IDX-DUAL indexing writes chroma chunks", async () => {
  process.env.JOPLIN_BRAIN_TEST_MEMORY_VECTOR = "1";
  const restoreFetch = installMockOllamaFetch({ embedDim: 16 });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jb-idx-"));
  const notes = path.join(tmp, "notes");
  const wiki = path.join(tmp, "wiki");
  fs.mkdirSync(notes, { recursive: true });
  fs.mkdirSync(wiki, { recursive: true });
  fs.writeFileSync(path.join(notes, "a.md"), "# A\n\nhello\n", "utf8");
  fs.writeFileSync(path.join(notes, "b.md"), "# B\n\nworld\n", "utf8");
  fs.writeFileSync(path.join(notes, "c.md"), "# C\n\nagain\n", "utf8");
  fs.writeFileSync(path.join(wiki, "w.md"), "---\n---\nwiki\n", "utf8");

  const cfgPath = path.join(tmp, "cfg.yaml");
  fs.writeFileSync(
    cfgPath,
    `
notes_root: ${notes}
wiki_root: ${wiki}
wiki_schema:
  path: ${path.join(tmp, "schema.yaml")}
wiki:
  glob: "**/*.md"
chroma:
  persist_path: ${path.join(tmp, "chroma")}
  collection_sources: test_sources
  collection_wiki: test_wiki
rag:
  retrieve_mode: wiki_first
`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(tmp, "schema.yaml"),
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

  try {
    const cfg = await loadConfig(cfgPath);
    const { chroma, ollama } = await createIndexRuntime(cfg);
    const summary = await indexAll(cfg, chroma, ollama);
    assert.strictEqual(summary.indexed_files, 4);
    const ns = await chroma.count("source");
    const nw = await chroma.count("wiki");
    assert.ok(ns >= 3);
    assert.ok(nw >= 1);
  } finally {
    delete process.env.JOPLIN_BRAIN_TEST_MEMORY_VECTOR;
    restoreFetch();
  }
});

test("SCN-IDX-IDEMP second index skips embeddings", async () => {
  process.env.JOPLIN_BRAIN_TEST_MEMORY_VECTOR = "1";
  const restoreFetch = installMockOllamaFetch({ embedDim: 8 });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jb-idem-"));
  const notes = path.join(tmp, "notes");
  fs.mkdirSync(notes, { recursive: true });
  fs.writeFileSync(path.join(notes, "only.md"), "# One\n\nbody\n", "utf8");
  const cfgPath = path.join(tmp, "cfg.yaml");
  fs.writeFileSync(
    cfgPath,
    `
notes_root: ${notes}
chroma:
  persist_path: ${path.join(tmp, "chroma")}
  collection_sources: test_sources
  collection_wiki: test_wiki
`,
    "utf8",
  );

  try {
    const cfg = await loadConfig(cfgPath);
    const { chroma, ollama } = await createIndexRuntime(cfg);
    await indexAll(cfg, chroma, ollama);
    const firstCalls = ollama.embedCalls;
    await indexAll(cfg, chroma, ollama);
    const secondCalls = ollama.embedCalls;
    assert.strictEqual(secondCalls, firstCalls);
  } finally {
    delete process.env.JOPLIN_BRAIN_TEST_MEMORY_VECTOR;
    restoreFetch();
  }
});
