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
### Requirement: REQ-WI-020 Post-compile optional Joplin Data API writeback orchestration

When `joplin_wiki_writeback.enabled` is true (including the default `true` when the key is omitted) and `wiki-compile` completes wiki file writes successfully without `--dry-run`, the system SHALL invoke the Joplin Data API writeback stage before the `wiki-compile` process exits with code 0.

When `wiki-compile` is invoked with `--dry-run`, the system SHALL NOT execute writeback Data API requests that mutate Joplin resources managed by this capability, regardless of `joplin_wiki_writeback.enabled`.

When `joplin_wiki_writeback.enabled` is false, the system SHALL NOT invoke the writeback stage during `wiki-compile`.

#### Scenario: SCN-WI-WB-01 Dry-run skips mutating Data API calls

- **WHEN** wiki-compile runs with --dry-run
- **AND** joplin_wiki_writeback.enabled is true
- **THEN** no writeback mutating Data API requests are executed

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
- **AND** `load-config` succeeds for writeback-enabled constraints (including a non-empty `joplin_data_api.token` after trim)
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

---
### Requirement: REQ-WI-CORPUS-SWEEP-001 Corpus digest sweep orchestration

When `wiki_ingest.corpus_auto_sweep.enabled` is true and corpus mode resolves to enabled, a single `wiki-compile` CLI invocation SHALL execute up to `wiki_ingest.corpus_auto_sweep.max_windows_per_invocation` sequential sweep windows in one OS process.

Each sweep window SHALL run the existing wiki-compile pipeline (planner, writer, optional writeback) using an effective `corpus_digest_offset` equal to the persisted sweep state value modulo the discovery list length with the same normalization rules as legacy corpus mode.

When `wiki_ingest.corpus_auto_sweep.enabled` is false, the system SHALL preserve the single-window behavior described in existing wiki-ingest requirements.

#### Scenario: SCN-WI-SWEEP-MULTI

- **WHEN** sweep is enabled with `max_windows_per_invocation` at least 2 and enough markdown files exist to rotate the digest
- **THEN** the process performs at least two planner invocations with different effective offsets before exiting successfully


<!-- @trace
source: wiki-corpus-auto-digest-sweep
updated: 2026-05-18
code:
  - src/wiki/wiki-compiler.js
  - src/commands/cmd-wiki-compile.js
  - README.md
  - src/cli.js
  - src/config/load-config.js
  - config.yaml.example
  - src/wiki/corpus-sweep-state.js
tests:
  - test/corpus-sweep-state.test.js
  - test/config-schema.test.js
  - test/cli-help.test.js
  - test/wiki-separation.test.js
-->

---
### Requirement: REQ-WI-CORPUS-SWEEP-002 Sweep state file and fingerprint reset

The system SHALL persist sweep progress in a JSON state file at `wiki_ingest.corpus_auto_sweep.state_path` when provided, otherwise at the default path documented in design.md under `wiki_root`.

The state file SHALL record at minimum: `schema_version`, `next_offset`, `markdown_file_count`, `step_files`, `updated_at_ms`.

Before advancing offsets, if the current discovered markdown file count differs from `markdown_file_count` stored in state, the system SHALL reset sweep progression by setting `next_offset` to 0 and updating `markdown_file_count` to the current count, and MUST emit telemetry identifying fingerprint reset.

The system SHALL NOT mutate the operator-edited `config.yaml` to advance offsets.

#### Scenario: SCN-WI-SWEEP-FPR-RESET

- **WHEN** state exists with `markdown_file_count` equal to 10 and discovery later reports 11 files before the first sweep window begins
- **THEN** the effective offset for the first window is 0 relative to the reset semantics
- **AND** telemetry indicates fingerprint reset


<!-- @trace
source: wiki-corpus-auto-digest-sweep
updated: 2026-05-18
code:
  - src/wiki/wiki-compiler.js
  - src/commands/cmd-wiki-compile.js
  - README.md
  - src/cli.js
  - src/config/load-config.js
  - config.yaml.example
  - src/wiki/corpus-sweep-state.js
tests:
  - test/corpus-sweep-state.test.js
  - test/config-schema.test.js
  - test/cli-help.test.js
  - test/wiki-separation.test.js
-->

---
### Requirement: REQ-WI-CORPUS-SWEEP-003 Dry-run interaction with sweep state

When `wiki-compile` runs with `--dry-run` and `wiki_ingest.corpus_auto_sweep.advance_state_on_dry_run` is false, the system SHALL NOT update `next_offset` or `updated_at_ms` in the sweep state file after a window completes.

When `--dry-run` is active and `advance_state_on_dry_run` is true, the system SHALL advance `next_offset` after each completed window exactly as non-dry-run mode does, MUST persist the state file, and MUST emit telemetry warning that dry-run advanced sweep state.

#### Scenario: SCN-WI-SWEEP-DRY-NO-ADVANCE

- **WHEN** sweep is enabled, `advance_state_on_dry_run` is false, and two sweep windows would run without dry-run
- **THEN** a `--dry-run` invocation performs planner-visible work for the starting window but leaves `next_offset` unchanged on disk


<!-- @trace
source: wiki-corpus-auto-digest-sweep
updated: 2026-05-18
code:
  - src/wiki/wiki-compiler.js
  - src/commands/cmd-wiki-compile.js
  - README.md
  - src/cli.js
  - src/config/load-config.js
  - config.yaml.example
  - src/wiki/corpus-sweep-state.js
tests:
  - test/corpus-sweep-state.test.js
  - test/config-schema.test.js
  - test/cli-help.test.js
  - test/wiki-separation.test.js
-->

---
### Requirement: REQ-WI-CORPUS-SWEEP-004 Window-local page budget under sweep

When sweep is enabled, the constraint in REQ-WI-001 SHALL apply independently to each sweep window inside the same CLI invocation.

The product of `max_windows_per_invocation` and `max_pages_per_run` forms an upper bound on distinct wiki paths processed in one invocation only when the planner saturates the budget every window.

#### Scenario: SCN-WI-SWEEP-BUDGET

- **WHEN** `max_pages_per_run` is 3 and sweep runs 2 windows and each planner returns 5 paths
- **THEN** at most 3 distinct wiki files are written or planned per window
- **AND** truncation telemetry matches REQ-WI-001 semantics within each window

<!-- @trace
source: wiki-corpus-auto-digest-sweep
updated: 2026-05-18
code:
  - src/wiki/wiki-compiler.js
  - src/commands/cmd-wiki-compile.js
  - README.md
  - src/cli.js
  - src/config/load-config.js
  - config.yaml.example
  - src/wiki/corpus-sweep-state.js
tests:
  - test/corpus-sweep-state.test.js
  - test/config-schema.test.js
  - test/cli-help.test.js
  - test/wiki-separation.test.js
-->

---
### Requirement: REQ-WI-TOPIC-001 Minimum topic paths per compile window

When `wiki_ingest.min_topic_pages_per_run` is greater than zero, the planner stage SHALL attempt to produce at least that many wiki paths whose normalized form starts with `topics/` and are not listed in `wiki_schema.required_hub_pages`.

If Ollama rounds are exhausted without meeting the quota, the system SHALL merge deterministic heuristic topic paths and emit stderr JSON `{"warning":"PLAN_TOPIC_TOPUP_HEURISTIC",...}`.

#### Scenario: SCN-WI-TOPIC-01 Heuristic top-up after hub-only planner

- **WHEN** the model returns only hub paths for all planner rounds
- **THEN** the compile plan includes at least `min_topic_pages_per_run` paths under `topics/` from heuristic top-up


<!-- @trace
source: small-model-thematic-planner
updated: 2026-05-19
code:
  - src/wiki/topic-path-heuristic.js
  - src/wiki/wiki-planner.js
  - src/wiki/wiki-compiler.js
  - src/config/load-config.js
  - src/commands/cmd-wiki-compile.js
-->

---
### Requirement: REQ-WI-SWEEP-UNTIL-001 Optional run until corpus cycle complete

When `wiki_ingest.corpus_auto_sweep.run_until_cycle_complete` is true, a single `wiki-compile` invocation SHALL execute sweep windows sequentially until `cycle_complete` is true or `max_total_windows_per_invocation` is reached.

#### Scenario: SCN-WI-SWEEP-UNTIL-01 Cycle completes within total cap

- **WHEN** a small notes fixture completes one full offset cycle in fewer windows than `max_total_windows_per_invocation`
- **THEN** stdout summary includes `cycle_complete: true`

<!-- @trace
source: small-model-thematic-planner
updated: 2026-05-19
code:
  - src/wiki/topic-path-heuristic.js
  - src/wiki/wiki-planner.js
  - src/wiki/wiki-compiler.js
  - src/config/load-config.js
  - src/commands/cmd-wiki-compile.js
-->