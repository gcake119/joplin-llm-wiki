import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert";
import { loadConfig } from "../src/config/load-config.js";
import { runWikiCompileFlow } from "../src/wiki/wiki-compiler.js";
import { installMockOllamaFetch } from "./helpers/mock-ollama-fetch.mjs";

test("wiki-compile dry-run does not mutate notes_root mtimes", async () => {
  process.env.JOPLIN_BRAIN_TEST_MEMORY_VECTOR = "1";
  const restore = installMockOllamaFetch({ embedDim: 8 });

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jb-wsep-"));
  const notes = path.join(tmp, "notes");
  const wiki = path.join(tmp, "wiki");
  fs.mkdirSync(notes, { recursive: true });
  fs.mkdirSync(wiki, { recursive: true });
  fs.writeFileSync(path.join(notes, "src.md"), "# Src\n\nx\n", "utf8");
  fs.mkdirSync(path.join(wiki, "topics"), { recursive: true });
  fs.writeFileSync(path.join(wiki, "index.md"), "---\n---\n", "utf8");
  fs.writeFileSync(path.join(wiki, "topics/overview.md"), "---\n---\n", "utf8");

  const schemaPath = path.join(tmp, "schema.yaml");
  fs.writeFileSync(
    schemaPath,
    `
schema_version: "1"
page_types:
  - id: t
    required_frontmatter_keys: []
    required_outbound_link_patterns: []
required_hub_pages:
  - index.md
  - topics/overview.md
`,
    "utf8",
  );

  const cfgPath = path.join(tmp, "cfg.yaml");
  fs.writeFileSync(
    cfgPath,
    `
notes_root: ${notes}
wiki_root: ${wiki}
wiki_schema:
  path: ${schemaPath}
  strict: true
wiki_ingest:
  max_pages_per_run: 15
`,
    "utf8",
  );

  const srcAbs = path.join(notes, "src.md");
  const before = fs.statSync(srcAbs).mtimeMs;

  try {
    const cfg = await loadConfig(cfgPath);
    await runWikiCompileFlow({
      ctx: {
        configPath: cfgPath,
        argv: [],
        opts: new Map([["dry-run", "true"]]),
        flags: { help: false },
      },
    });
    const after = fs.statSync(srcAbs).mtimeMs;
    assert.strictEqual(after, before);
    assert.strictEqual(cfg.write_back.sources_enabled, false);
  } finally {
    delete process.env.JOPLIN_BRAIN_TEST_MEMORY_VECTOR;
    restore();
  }
});
