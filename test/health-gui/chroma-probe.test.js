import assert from "node:assert";
import { test } from "node:test";

import { probeChroma } from "../../src/health-gui/probes/chroma-probe.js";

/** @type {import('../../src/config/load-config.js').AppConfig} */
const cfg = {
  notes_root: "/n",
  notes_glob: "**/*.md",
  wiki_root: "",
  wiki: { glob: "**/*.md" },
  wiki_schema: { path: "", strict: true },
  wiki_ingest: {
    max_pages_per_run: 15,
    min_pages_per_run: 10,
    max_planner_rounds: 3,
  },
  write_back: { sources_enabled: false },
  ollama: {
    base_url: "http://127.0.0.1:11434",
    embed_model: "bge-m3",
    chat_model: "gemma2:2b",
    timeout_ms: 120_000,
    embed_batch_size: 16,
  },
  chroma: {
    persist_path: "/tmp/chroma-test",
    collection_sources: "s",
    collection_wiki: "w",
  },
  chunk: { size_chars: 1200, overlap_chars: 200 },
  watch: { enabled: false, debounce_ms: 2000 },
  rag: { top_k: 5, max_context_chars: 6000, retrieve_mode: "wiki_first" },
  lint: {
    out_dir: "reports",
    duplicate_similarity_threshold: 0.92,
    duplicate_scope: "both",
    source_link_check: true,
    contradiction: { max_pairs: 50, timeout_ms: 180_000 },
  },
  joplin_cli: {
    enabled: false,
    command: "joplin",
    preflight_argv: ["config", "version"],
    timeout_ms: 30_000,
  },
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
    busy_timeout_ms: 5000,
    max_export_attempts: 5,
    pipeline: { run_index: true, run_wiki_compile: true },
    schedule: { every_seconds: null },
  },
};

test("probeChroma success with stub store", async () => {
  class Stub {
    async heartbeat() {}
  }
  const r = await probeChroma(cfg, { CHROMA_HOST: "127.0.0.1", CHROMA_PORT: "8000" }, {
    ChromaStore: Stub,
  });
  assert.strictEqual(r.reachable, true);
  assert.strictEqual(r.error, null);
});

test("probeChroma failure when heartbeat throws", async () => {
  class Stub {
    async heartbeat() {
      throw new Error("no chroma");
    }
  }
  const r = await probeChroma(cfg, {}, { ChromaStore: Stub });
  assert.strictEqual(r.reachable, false);
  assert.ok(r.error?.includes("no chroma"));
});
