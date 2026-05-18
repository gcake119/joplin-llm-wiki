# compiled-wiki Specification

## Purpose

TBD - created by archiving change 'joplin-brain-mvp'. Update Purpose after archive.

## Requirements

### Requirement: REQ-WIKI-001 Wiki root separation

The system SHALL treat `wiki_root` as distinct from `notes_root`.

The Wiki maintenance pipeline SHALL NOT modify bytes under `notes_root` when configuration `write_back.sources_enabled` is false (default).

#### Scenario: SCN-WIKI-SEP Default no touch sources

- **WHEN** `write_back.sources_enabled` is false and `wiki-compile` runs
- **THEN** no file under `notes_root` changes mtime or content_hash


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
  - src/joplin/data-api-client.js
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
### Requirement: REQ-WIKI-002 Mandatory frontmatter

Every Markdown file under `wiki_root` produced or updated by `wiki-compile` SHALL contain YAML frontmatter with keys `source_refs` (array of strings), `compiled_at` (ISO8601 UTC), `compiler_revision` (string).

#### Scenario: SCN-WIKI-FM Required keys

- **WHEN** a new wiki page is written by `wiki-compile`
- **THEN** the file parses as YAML frontmatter and contains all three keys


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
  - src/joplin/data-api-client.js
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
### Requirement: REQ-WIKI-003 Source reference semantics

Each element of `source_refs` SHALL be a `relative_path` resolvable under `notes_root` pointing to the originating source note or section anchor documented in README.

#### Scenario: SCN-WIKI-REF Resolvable path

- **WHEN** `wiki-compile` completes for a fixture pair (sources + wiki)
- **THEN** every `source_refs` entry resolves to an existing file under `notes_root`

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
  - src/joplin/data-api-client.js
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
### Requirement: REQ-WIKI-010 Repository wiki_root default path convention

The file `config.yaml.example` SHALL set `wiki_root` to `./wiki_root` as the default relative path, matching the repository-root convention used for `notes_root`.

The repository SHALL document in `README.md` that the `wiki_root/` directory is excluded from version control when `wiki_root/` appears in `.gitignore`.

#### Scenario: SCN-WIKI-EX-01 Example default relative wiki_root

- **WHEN** an operator copies `config.yaml.example` to a new configuration file in the repository root
- **THEN** `wiki_root` resolves to a directory named `wiki_root` at the repository root alongside `./notes_root` when both keys use `./` relative paths

#### Scenario: SCN-WIKI-EX-02 Gitignore documents exclusion

- **WHEN** `.gitignore` contains the entry `wiki_root/`
- **THEN** `README.md` SHALL mention that compiled wiki outputs under `wiki_root/` are not tracked by default


<!-- @trace
source: joplin-wiki-db-writeback
updated: 2026-05-17
code:
  - my.config.yaml
  - src/joplin/wiki-writeback.js
  - src/config/load-config.js
  - fixtures/full-karpathy.config.yaml
  - README.md
  - config.yaml.example
  - src/joplin/data-api-client.js
  - src/cli.js
  - src/wiki/wiki-compiler.js
tests:
  - test/wiki-separation.test.js
  - test/integration-index.test.js
  - test/config-schema.test.js
  - test/joplin-wiki-writeback.test.js
  - test/joplin-sqlite.test.js
-->

---
### Requirement: REQ-WIKI-011 Wiki frontmatter domain for Joplin writeback routing

The repository SHALL document in `README.md` that a string field `domain` in wiki YAML frontmatter (or the configured `topic_frontmatter_key` from `joplin_wiki_writeback`) selects the child notebook title under the configured parent notebook (default `note-wiki`) when writeback runs.

When `domain` is omitted, writeback routing SHALL fall back to `_uncategorized` per `joplin-wiki-writeback` specification.

#### Scenario: SCN-WIKI-DOMAIN-01 Documentation mentions domain for writeback

- **WHEN** `README.md` describes the `joplin_wiki_writeback` notebook tree
- **THEN** it SHALL mention that `domain` (or the configured `topic_frontmatter_key`) in wiki frontmatter selects the child notebook title

<!-- @trace
source: joplin-wiki-db-writeback
updated: 2026-05-17
code:
  - my.config.yaml
  - src/joplin/wiki-writeback.js
  - src/config/load-config.js
  - fixtures/full-karpathy.config.yaml
  - README.md
  - config.yaml.example
  - src/joplin/data-api-client.js
  - src/cli.js
  - src/wiki/wiki-compiler.js
tests:
  - test/wiki-separation.test.js
  - test/integration-index.test.js
  - test/config-schema.test.js
  - test/joplin-wiki-writeback.test.js
  - test/joplin-sqlite.test.js
-->

---
### Requirement: REQ-WIKI-015 Corpus mode preserves mandatory frontmatter

When `wiki_ingest.corpus_mode_enabled` is true, every wiki markdown file produced or updated by `wiki-compile` SHALL still satisfy **REQ-WIKI-002** without removing or renaming existing mandatory keys.

#### Scenario: SCN-WIKI-CORPUS-FM

- **WHEN** corpus mode is true and a page is written
- **THEN** YAML frontmatter includes `source_refs`, `compiled_at`, and `compiler_revision`


<!-- @trace
source: expand-wiki-corpus-llm
updated: 2026-05-18
code:
  - fixtures/full-karpathy.config.yaml
  - src/config/load-config.js
  - src/wiki/wiki-planner.js
  - src/wiki/corpus-slice.js
  - src/wiki/corpus-chroma-excerpt.js
  - src/wiki/wiki-compiler.js
  - README.md
  - config.yaml.example
  - CHANGELOG.md
tests:
  - test/config-schema.test.js
  - test/corpus-chroma-excerpt.test.js
  - test/wiki-separation.test.js
-->

---
### Requirement: REQ-WIKI-016 Corpus-mode writer evidence beyond legacy five-file excerpt window

When `wiki_ingest.corpus_mode_enabled` is true, the writer excerpt bundle passed to the Ollama chat call for a given wiki path SHALL be able to contain text read from a source file whose lexicographic rank under `discoverMarkdown` is **strictly greater than four** when **REQ-WCC-003** filesystem rotation places that file inside the active excerpt window for the fixture under test.

#### Scenario: SCN-WIKI-CORPUS-SLICE

- **WHEN** automated tests call `runWikiCompileFlow` with a temporary `notes_root` that contains at least eleven markdown files and embeds a unique ASCII token only inside the eleventh lexicographic file
- **AND** corpus digest offset and excerpt rotation are configured so that token-bearing file is included in the excerpt bundle for a chosen wiki path
- **THEN** the mock Ollama writer transcript for that path includes the unique token substring

<!-- @trace
source: expand-wiki-corpus-llm
updated: 2026-05-18
code:
  - fixtures/full-karpathy.config.yaml
  - src/config/load-config.js
  - src/wiki/wiki-planner.js
  - src/wiki/corpus-slice.js
  - src/wiki/corpus-chroma-excerpt.js
  - src/wiki/wiki-compiler.js
  - README.md
  - config.yaml.example
  - CHANGELOG.md
tests:
  - test/config-schema.test.js
  - test/corpus-chroma-excerpt.test.js
  - test/wiki-separation.test.js
-->