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
