# wiki-ingest Specification

## Purpose

TBD - created by archiving change 'joplin-brain-mvp'. Update Purpose after archive.

## Requirements

### Requirement: REQ-WI-001 Page budget per run

The system SHALL NOT create or update more than `wiki_ingest.max_pages_per_run` distinct wiki files in one `wiki-compile` invocation.

#### Scenario: SCN-WI-CAP Budget enforced

- **WHEN** planner returns 20 candidate paths and max_pages_per_run is 15
- **THEN** only 15 files are written and stdout summary states truncation occurred

##### Example: cap table

| max_pages_per_run | Planner candidates | Files written |
|-------------------|-------------------|---------------|
| 15 | 20 | 15 |
| 15 | 8 | 8 |


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
### Requirement: REQ-WI-002 Dry-run mode

When `--dry-run` is passed, the system SHALL NOT write or modify files under `wiki_root`.

The system SHALL emit a JSON document listing planned paths and reasons.

#### Scenario: SCN-WI-DRY No writes

- **WHEN** `wiki-compile --dry-run` executes
- **THEN** wiki md file mtimes under `wiki_root` remain unchanged


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
### Requirement: REQ-WI-003 Planner uses local Ollama only

The WikiPlanner SHALL send HTTP only to `ollama.base_url`.

#### Scenario: SCN-WI-LOCAL Planner HTTP

- **WHEN** wiki-compile runs successfully
- **THEN** no HTTP host other than `ollama.base_url` receives planner or writer prompts

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
### Requirement: REQ-WI-020 Post-compile optional Joplin database writeback orchestration

When `joplin_wiki_writeback.enabled` is true (including the default `true` when the key is omitted) and `wiki-compile` completes wiki file writes successfully without `--dry-run`, the system SHALL invoke the Joplin CLI writeback stage before the `wiki-compile` process exits with code 0.

When `wiki-compile` is invoked with `--dry-run`, the system SHALL NOT execute writeback Joplin CLI invocations that mutate Joplin profile data, regardless of `joplin_wiki_writeback.enabled`.

When `joplin_wiki_writeback.enabled` is false, the system SHALL NOT invoke the writeback stage during `wiki-compile`.

#### Scenario: SCN-WI-WB-01 Dry-run skips mutating CLI

- **WHEN** wiki-compile runs with --dry-run
- **AND** joplin_wiki_writeback.enabled is true
- **THEN** no writeback mutating Joplin CLI subprocess runs

#### Scenario: SCN-WI-WB-02 Success runs writeback after compile

- **WHEN** wiki-compile runs without --dry-run
- **AND** compile completes successfully
- **AND** joplin_wiki_writeback.enabled is true
- **THEN** writeback executes before process exit

#### Scenario: SCN-WI-WB-03 Disabled skips writeback

- **WHEN** joplin_wiki_writeback.enabled is false
- **THEN** wiki-compile SHALL NOT invoke the writeback stage

#### Scenario: SCN-WI-WB-04 Omitted enabled key defaults to writeback on

- **WHEN** configuration omits `joplin_wiki_writeback.enabled`
- **AND** `joplin_cli.enabled` is true with a non-empty `joplin_cli.command`
- **AND** wiki-compile completes file writes successfully without --dry-run
- **THEN** the writeback stage SHALL execute before exit code 0

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
  - src/joplin/cli-runner.js
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
### Requirement: REQ-WI-030 Corpus mode respects page budget

When `wiki_ingest.corpus_mode_enabled` is true, the system SHALL enforce **REQ-WI-001** unchanged: the number of distinct wiki markdown files created or updated in one `wiki-compile` invocation SHALL NOT exceed **`wiki_ingest.max_pages_per_run`**.

#### Scenario: SCN-WI-CORPUS-CAP

- **WHEN** corpus_mode_enabled is true and the planner returns more candidate paths than `max_pages_per_run`
- **THEN** the implementation truncates to `max_pages_per_run` before writing
- **AND** stdout summary reports truncation consistent with **SCN-WI-CAP**


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
### Requirement: REQ-WI-031 Corpus excerpt uses local Chroma only

When corpus excerpt configuration requests Chroma augmentation, the system SHALL open Chroma only through the embedded client bound to **`chroma.persist_path`** for read-only neighbor queries and SHALL NOT target a remote Chroma HTTP server in the default configuration profile.

#### Scenario: SCN-WI-CORPUS-LOCALCH

- **WHEN** corpus_writer_excerpt_mode enables chroma augmentation
- **THEN** excerpt retrieval instantiates the vector store using **`chroma.persist_path`** identical to the embedded client policy used by `index` for `collection_sources`
- **AND** no new configuration key introduces a remote Chroma HTTP base URL for MVP defaults

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