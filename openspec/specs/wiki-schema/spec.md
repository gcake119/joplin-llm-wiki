# wiki-schema Specification

## Purpose

TBD - created by archiving change 'joplin-brain-mvp'. Update Purpose after archive.

## Requirements

### Requirement: REQ-WS-001 Schema document shape

The schema file SHALL contain keys `schema_version` (string), `page_types` (array of objects with `id`, `required_frontmatter_keys`, `required_outbound_link_patterns`), and `required_hub_pages` (array of relative wiki paths).

#### Scenario: SCN-SCHEMA-SHAPE Parse succeeds

- **WHEN** SchemaValidator loads a conforming schema file
- **THEN** parsing completes without error and exposes page_types count ≥ 1


<!-- @trace
source: joplin-brain-mvp
updated: 2026-05-17
code:
  - src/wiki/wiki-compiler.js
  - src/rag/rag-service.js
  - src/vector/chroma-store.js
  - src/commands/cmd-wiki-compile.js
  - scripts/register-bin.mjs
  - src/vector/store-factory.js
  - src/wiki/frontmatter.js
  - src/wiki/wiki-planner.js
  - src/index/indexer.js
  - test/helpers/chroma-server.mjs
  - docs/scheduling-examples.md
  - src/commands/index.js
  - fixtures/full-karpathy.config.yaml
  - src/lint/karpathy-lint-engine.js
  - src/report/report-writer.js
  - src/schema/schema-validator.js
  - src/commands/cmd-watch.js
  - bin/joplin-brain.js
  - src/commands/cmd-ask.js
  - src/commands/cmd-lint.js
  - src/commands/cmd-index.js
  - src/config/load-config.js
  - src/joplin/cli-runner.js
  - test/helpers/mock-ollama-fetch.mjs
  - wiki-schema.example.yaml
  - src/ollama/client.js
  - src/vector/memory-vector-store.js
  - README.md
  - package.json
  - src/cli.js
  - src/index/chunker.js
  - src/fs/note-discovery.js
  - config.yaml.example
  - src/index/state-store.js
tests:
  - test/cli-routing.test.js
  - test/cli-help.test.js
  - test/config-schema.test.js
  - test/wiki-separation.test.js
  - test/joplin-cli.test.js
  - test/integration-index.test.js
-->

---
### Requirement: REQ-WS-002 Hub pages existence

When `wiki_schema.strict` is true, before `wiki-compile` writes output, the system SHALL verify every path in `required_hub_pages` exists under `wiki_root` or is scheduled for creation in the current compile plan.

#### Scenario: SCN-SCHEMA-HUB Missing hub fails strict mode

- **WHEN** strict mode is true and a required hub page is absent and not in compile plan
- **THEN** `wiki-compile` exits 1 with `SCHEMA_INVALID`

<!-- @trace
source: joplin-brain-mvp
updated: 2026-05-17
code:
  - src/wiki/wiki-compiler.js
  - src/rag/rag-service.js
  - src/vector/chroma-store.js
  - src/commands/cmd-wiki-compile.js
  - scripts/register-bin.mjs
  - src/vector/store-factory.js
  - src/wiki/frontmatter.js
  - src/wiki/wiki-planner.js
  - src/index/indexer.js
  - test/helpers/chroma-server.mjs
  - docs/scheduling-examples.md
  - src/commands/index.js
  - fixtures/full-karpathy.config.yaml
  - src/lint/karpathy-lint-engine.js
  - src/report/report-writer.js
  - src/schema/schema-validator.js
  - src/commands/cmd-watch.js
  - bin/joplin-brain.js
  - src/commands/cmd-ask.js
  - src/commands/cmd-lint.js
  - src/commands/cmd-index.js
  - src/config/load-config.js
  - src/joplin/cli-runner.js
  - test/helpers/mock-ollama-fetch.mjs
  - wiki-schema.example.yaml
  - src/ollama/client.js
  - src/vector/memory-vector-store.js
  - README.md
  - package.json
  - src/cli.js
  - src/index/chunker.js
  - src/fs/note-discovery.js
  - config.yaml.example
  - src/index/state-store.js
tests:
  - test/cli-routing.test.js
  - test/cli-help.test.js
  - test/config-schema.test.js
  - test/wiki-separation.test.js
  - test/joplin-cli.test.js
  - test/integration-index.test.js
-->