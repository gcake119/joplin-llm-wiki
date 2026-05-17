# note-indexing Specification

## Purpose

TBD - created by archiving change 'joplin-brain-mvp'. Update Purpose after archive.

## Requirements

### Requirement: REQ-LOCAL-IDX Network and storage locality for indexing

The system SHALL persist vectors only under `chroma.persist_path` inside the repository working directory and SHALL NOT connect to remote vector databases in MVP.

The system SHALL only perform outbound HTTP to `ollama.base_url` for embeddings during indexing.

#### Scenario: SCN-LOCAL-IDX-01 Embeddings stay local

- **WHEN** indexing runs with valid configuration
- **THEN** no network endpoints other than `ollama.base_url` are contacted and vectors are stored on local disk under `chroma.persist_path`


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
### Requirement: REQ-IDX-001 Read-only Markdown discovery

The system SHALL discover Markdown files matching `notes_glob` under `notes_root` without modifying file contents.

#### Scenario: SCN-IDX-01 Discover fixtures

- **WHEN** `pnpm exec joplin-brain index` executes with a config pointing at a fixtures directory containing three `.md` files
- **THEN** all three files are parsed and at least one chunk per file is embedded unless a file is explicitly skipped with logged reason

##### Example: three fixed files

| File | Expected minimum chunks |
|------|-------------------------|
| a.md | 1 |
| b.md | 1 |
| c.md | 1 |


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
### Requirement: REQ-IDX-002 Chunking and content-hash idempotency

The system SHALL split note text into chunks using `chunk.size_chars` and `chunk.overlap_chars`.

The system SHALL compute `content_hash` per chunk and SHALL skip Ollama embedding when chunk hash is unchanged.

#### Scenario: SCN-IDX-IDEMP Unchanged note skips embed

- **WHEN** index runs twice without editing any note
- **THEN** the second run performs zero additional embedding HTTP calls for unchanged chunks

##### Example: repeated dry runs

| Run | Expected embedding HTTP calls added for unchanged corpus |
|-----|----------------------------------------------------------|
| first | > 0 |
| second | 0 |


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
### Requirement: REQ-IDX-003 Ollama embedding failure semantics

The system SHALL call Ollama `POST /api/embeddings` with batches limited by `ollama.embed_batch_size`.

The system SHALL retry transient failures up to 3 times with exponential backoff and SHALL exit with code 2 on terminal failure.

#### Scenario: SCN-IDX-OFFLINE Ollama down

- **WHEN** Ollama is unreachable at `ollama.base_url`
- **THEN** the CLI exits with code 2 and emits an error object mentioning `OLLAMA_UNAVAILABLE`


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
### Requirement: REQ-IDX-004 Chroma persistence contract

The system SHALL use Chroma embedded PersistentClient (or equivalent) with `persist_path` resolving to `chroma.persist_path`.

The system SHALL upsert source chunks into collection `chroma.collection_sources` and wiki chunks into `chroma.collection_wiki`.

The system SHALL upsert chunk records with metadata keys `note_id`, `relative_path`, `title`, `mtime_ms`, `content_hash`, `chunk_index`, `layer` where `layer` is `source` or `wiki`.

#### Scenario: SCN-IDX-CHROMA Restart persistence

- **WHEN** index completes and the process restarts
- **THEN** querying the collection without re-embedding unchanged notes still returns prior vectors

##### Example: collection continuity

| Step | Expected chunk count for unchanged corpus |
|------|---------------------------------------------|
| after first index | N |
| after restart + second index | N (no duplicate vectors for same logical chunks) |


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
### Requirement: REQ-IDX-005 State machine for lifecycle

The system SHALL track per-note states DISCOVERED→PARSED→CHUNKED→EMBEDDED→INDEXED.

The system SHALL transition to REINDEX when file `mtime_ms` or `content_hash` changes.

The system SHALL transition to TOMBSTONE when a previously indexed file disappears and SHALL delete associated vectors.

#### Scenario: SCN-IDX-TOMB Deleted note removes vectors

- **WHEN** an indexed markdown file is deleted and index runs
- **THEN** no vectors remain whose metadata `relative_path` matches the deleted file


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
### Requirement: REQ-IDX-006 Watch-driven incremental indexing latency

The system SHALL debounce filesystem events using `watch.debounce_ms`.

The system SHALL complete embedding and upsert for a changed note within 60 seconds after the debounced event under MVP fixture load on a developer machine.

#### Scenario: SCN-IDX-02 Watch settles within SLA

- **WHEN** a single note is edited once and watch mode is enabled
- **THEN** updated chunks are visible in Chroma within 60 seconds after the debounced event completes


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
### Requirement: REQ-IDX-007 Unreadable and skipped notes

The system SHALL skip notes that cannot be decoded as UTF-8 or are explicitly encrypted without readable plaintext.

The system SHALL record skipped paths with reasons in stderr summary JSON field `skipped_notes`.

#### Scenario: SCN-IDX-SKIP Binary file renamed to md

- **WHEN** a file matches glob but fails UTF-8 decoding
- **THEN** indexing continues for other files and the failing path appears in `skipped_notes`


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
### Requirement: REQ-IDX-008 Dual-layer indexing

When `wiki_root` is non-empty and points to an existing directory, the system SHALL index Markdown under `wiki_root` using `wiki.glob` into `chroma.collection_wiki` with metadata `layer=wiki`.

When `wiki_root` is empty or missing, the system SHALL skip wiki indexing without error.

#### Scenario: SCN-IDX-DUAL Both layers indexed

- **WHEN** configuration sets valid `notes_root` and `wiki_root` each containing at least one markdown file
- **THEN** after `pnpm exec joplin-brain index`, both collections contain at least one chunk


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
### Requirement: REQ-JOP-CLI-001 Optional official Joplin CLI preflight

When `joplin_cli.enabled` is false, the system SHALL NOT spawn `joplin_cli.command`.

When `joplin_cli.enabled` is true, before reading Markdown for `index` or `watch`, the system SHALL spawn exactly one subprocess whose argv is `joplin_cli.command` followed by every token in `joplin_cli.preflight_argv` in order.

The system SHALL enforce `joplin_cli.timeout_ms` wall-clock limit and SHALL terminate the subprocess on timeout.

The system SHALL treat non-zero exit codes or spawn failures as fatal with exit code 1 and SHALL emit stderr JSON containing `"error":"JOPLIN_CLI_FAILED"`.

#### Scenario: SCN-JOP-CLI-01 Preflight failure surfaces

- **WHEN** `joplin_cli.enabled` is true and the `joplin` executable exits with code 1
- **THEN** `pnpm exec joplin-brain index` exits with code 1 and stderr includes `JOPLIN_CLI_FAILED`


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
### Requirement: REQ-JOP-CLI-002 CLI must not supply corpus bytes

The system SHALL NOT pass Markdown bodies from `notes_root` through the Joplin CLI subprocess.

The system SHALL NOT use Joplin CLI output as the embedding source of truth; corpus bytes SHALL always come from filesystem reads under `notes_root`.

#### Scenario: SCN-JOP-CLI-02 Filesystem remains source

- **WHEN** indexing runs with `joplin_cli.enabled` true and fixtures on disk
- **THEN** indexed chunk text is derived only from files under `notes_root` regardless of CLI stdout content

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
### Requirement: REQ-LOCAL-IDX-PERSIST-RELATIVE Resolve relative chroma.persist_path against the config file directory

When `chroma.persist_path` in `config.yaml` is a relative filesystem path, `loadConfig` SHALL resolve it to an absolute path by anchoring to the directory containing the loaded configuration file (`path.dirname` of the resolved config path), consistent with how relative `notes_root` is resolved.

`loadConfig` SHALL NOT resolve a relative `chroma.persist_path` using only `process.cwd()`.

#### Scenario: SCN-LOCAL-IDX-PERSIST-RELATIVE-01 Relative persist path uses cfgDir

- **WHEN** configuration is loaded from absolute file `/tmp/proj/cfg.yaml` and `chroma.persist_path` is `./chroma-data`
- **THEN** `AppConfig.chroma.persist_path` equals `/tmp/proj/chroma-data` regardless of `process.cwd()` at `loadConfig` invocation time

<!-- @trace
source: health-gui-chroma-connectivity
updated: 2026-05-17
code:
  - src/config/load-config.js
  - src/health-gui/deps/dependency-starter.js
  - src/health-gui/renderer/app.js
  - README.md
  - scripts/launchd/shims/joplin-llm-wiki-ollama-serve
  - scripts/launchd/shims/joplin-llm-wiki-sqlite-sync
  - scripts/launchd/shims/joplin-llm-wiki-chroma-server
tests:
  - test/config-schema.test.js
-->

---

### Roadmap 指標（非規範義務）

- **規劃中**：長時程 `index`／Health GUI 管線於行程中斷後的 **checkpoint／自動接續**、細粒度 state 落盤、可選進度回報——見 **[`openspec/ROADMAP.md`](../../ROADMAP.md)** 小節 **PR-PIPELINE-RESUME**。