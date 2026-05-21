import fs from "node:fs";
import path from "node:path";

/**
 * Write a minimal valid config.yaml under tmpRoot and return its path.
 * @param {string} tmpRoot
 */
export function writeMinimalValidConfig(tmpRoot) {
  const raw = path.join(tmpRoot, "raw");
  fs.mkdirSync(raw, { recursive: true });
  const wiki = path.join(tmpRoot, "wiki");
  fs.mkdirSync(wiki, { recursive: true });
  const schemaPath = path.join(tmpRoot, "schema.yaml");
  fs.writeFileSync(
    schemaPath,
    `schema_version: "t"
page_types:
  - id: t
    required_frontmatter_keys: []
    required_outbound_link_patterns: []
required_hub_pages: []
`,
    "utf8",
  );
  const cfgPath = path.join(tmpRoot, "cfg.yaml");
  const yaml = `
raw: ${JSON.stringify(raw)}
raw_glob: "**/*.md"
wiki: ${JSON.stringify(wiki)}
wiki_glob: "**/*.md"
wiki_schema:
  path: ${JSON.stringify(schemaPath)}
  strict: true
joplin_wiki_writeback:
  enabled: false
ollama:
  base_url: http://127.0.0.1:11434
  chat_model: gemma2:2b
`;
  fs.writeFileSync(cfgPath, yaml, "utf8");
  return cfgPath;
}
