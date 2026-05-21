import assert from "node:assert";
import { test } from "node:test";

import { probeOllama } from "../../src/health-gui/probes/ollama-probe.js";

/** @type {import('../../src/config/load-config.js').AppConfig} */
const baseCfg = {
  raw: "/n",
  raw_glob: "**/*.md",
  wiki: "/w",
  wiki_glob: "**/*.md",
  wiki_schema: { path: "", strict: true },
  wiki_ingest: {
    max_pages_per_run: 15,
    min_pages_per_run: 10,
    min_topic_pages_per_run: 0,
    planner_reject_source_paths: true,
    max_planner_rounds: 3,
    corpus_mode_enabled: true,
    corpus_digest_max_files: 40,
    corpus_digest_offset: 0,
    corpus_writer_excerpt_mode: "filesystem_slice",
    corpus_auto_sweep: {
      enabled: false,
      max_windows_per_invocation: 1,
      step_files: 40,
      state_path: "",
      advance_state_on_dry_run: false,
      run_until_cycle_complete: false,
      max_total_windows_per_invocation: 500,
    },
  },
  write_back: { sources_enabled: false },
  ollama: {
    base_url: "http://127.0.0.1:11434",
    chat_model: "gemma2:2b",
    timeout_ms: 120_000,
  },
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
    preflight_argv: ["version"],
    timeout_ms: 30_000,
  },
  joplin_wiki_writeback: {
    enabled: false,
    parent_notebook_title: "note-wiki",
    wiki_notebook_title: "wiki",
    brainstorming_notebook_title: "brainstorming",
    artifacts_notebook_title: "artifacts",
    artifacts_project_notebook_title: "",
    topic_frontmatter_key: "domain",
    note_title_key: "title",
    max_cli_attempts: 3,
  },
  joplin_data_api: { base_url: "http://127.0.0.1:41184", token: "", timeout_ms: 30_000 },
  joplin_sqlite_sync: {
    enabled: false,
    database_path: "",
    export_root: "",
    reconcile_mode: "mirror",
    busy_timeout_ms: 5000,
    max_export_attempts: 5,
    notebook_filter: {
      enabled: false,
      include_notebook_ids: [],
      include_notebook_paths: [],
      include_descendants: true,
      notebook_path_style: "joined_slug",
      notebook_path_separator: "-",
      source_filename: "title",
    },
    pipeline: { run_wiki_compile: true },
    schedule: { every_seconds: null },
  },
};

test("probeOllama parses tags and missingModels", async () => {
  const fetchMock = async () => ({
    ok: true,
    json: async () => ({
      models: [{ name: "bge-m3" }],
    }),
  });
  const r = await probeOllama(baseCfg, { fetch: fetchMock });
  assert.strictEqual(r.reachable, true);
  assert.ok(r.missingModels.includes("gemma2:2b"));
});

test("probeOllama handles fetch failure", async () => {
  const fetchMock = async () => {
    throw new Error("boom");
  };
  const r = await probeOllama(baseCfg, { fetch: fetchMock });
  assert.strictEqual(r.reachable, false);
  assert.ok(r.error?.includes("boom"));
});
