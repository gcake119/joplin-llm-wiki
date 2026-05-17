import fs from "node:fs";
import path from "node:path";

/**
 * Write a minimal valid config.yaml under tmpRoot and return its path.
 * @param {string} tmpRoot
 */
export function writeMinimalValidConfig(tmpRoot) {
  const notes = path.join(tmpRoot, "notes");
  fs.mkdirSync(notes, { recursive: true });
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
  const chromaDir = path.join(tmpRoot, "chroma");
  fs.mkdirSync(chromaDir, { recursive: true });
  const cfgPath = path.join(tmpRoot, "cfg.yaml");
  const yaml = `
notes_root: ${JSON.stringify(notes)}
wiki_root: ${JSON.stringify(wiki)}
wiki_schema:
  path: ${JSON.stringify(schemaPath)}
  strict: true
wiki:
  glob: "**/*.md"
chroma:
  persist_path: ${JSON.stringify(chromaDir)}
joplin_wiki_writeback:
  enabled: false
ollama:
  base_url: http://127.0.0.1:11434
  embed_model: bge-m3
  chat_model: gemma2:2b
`;
  fs.writeFileSync(cfgPath, yaml, "utf8");
  return cfgPath;
}
