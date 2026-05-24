import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { extractPathsFromModelJson } from "../src/wiki/wiki-planner.js";

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "jllw-wiki-"));
}

function writeSchema(dir) {
  const p = path.join(dir, "schema.yaml");
  fs.writeFileSync(
    p,
    `schema_version: "1"
page_types:
  - id: concept
    required_frontmatter_keys: [source_refs, compiled_at, compiler_revision]
    required_outbound_link_patterns: []
required_hub_pages:
  - indexes/All-Sources.md
  - indexes/All-Concepts.md
`,
  );
  return p;
}

function writeConfig(dir, raw, wiki, schema) {
  const p = path.join(dir, "config.yaml");
  fs.writeFileSync(
    p,
    `raw: ${JSON.stringify(raw)}
raw_glob: "**/*.md"
wiki: ${JSON.stringify(wiki)}
wiki_glob: "**/*.md"
wiki_schema:
  path: ${JSON.stringify(schema)}
  strict: false
wiki_ingest:
  max_pages_per_run: 15
  min_pages_per_run: 1
  min_topic_pages_per_run: 1
  corpus_digest_max_files: 40
ollama:
  chat_model: test
joplin_wiki_writeback:
  enabled: false
`,
  );
  return p;
}

test("planner accepts only flat summaries/concepts/indexes paths", () => {
  const out = extractPathsFromModelJson(
    {
      paths: [
        "summaries/source-a.md",
        "concepts/topic-a.md",
        "indexes/All-Sources.md",
        "concepts/nested/topic.md",
        "Notebook/topic.md",
        "indexes/Other.md",
      ],
    },
    { rejectSourcePaths: true },
  );
  assert.deepEqual(out.paths, [
    "summaries/source-a.md",
    "concepts/topic-a.md",
    "indexes/All-Sources.md",
  ]);
});

test("wiki-compile dry-run with empty raw reports NO_SOURCE_MARKDOWN without touching wiki", async () => {
  const dir = tmpdir();
  const raw = path.join(dir, "raw");
  const wiki = path.join(dir, "wiki");
  fs.mkdirSync(raw, { recursive: true });
  const schema = writeSchema(dir);
  const configPath = writeConfig(dir, raw, wiki, schema);

  const { runWikiCompileFlow } = await import("../src/wiki/wiki-compiler.js");
  const lines = [];
  const oldLog = console.log;
  console.log = (s) => lines.push(String(s));
  await runWikiCompileFlow({
    ctx: { configPath, argv: [], opts: new Map([["dry-run", "true"]]) },
  });
  console.log = oldLog;
  const payload = JSON.parse(lines.at(-1));
  assert.equal(payload.warning, "NO_SOURCE_MARKDOWN");
  assert.deepEqual(fs.existsSync(wiki) ? fs.readdirSync(wiki) : [], []);
});
