# wiki-corpus-llm Specification

## Purpose

TBD - created by archiving change 'expand-wiki-corpus-llm'. Update Purpose after archive.

## Requirements

### Requirement: REQ-WCC-LOCAL Corpus LLM wiki local-first

Corpus-oriented compilation SHALL keep all plaintext within the host filesystem or the project's embedded vector store rooted at **`chroma.persist_path`**.

The corpus feature SHALL NOT require remote HTTP SaaS embedding or hosted vector endpoints for its default configuration path.

#### Scenario: SCN-WCC-LOCAL-OFFNET

- **WHEN** an operator configures `ollama.base_url` to localhost and corpus mode resolves to enabled (including YAML omission default)
- **THEN** corpus digest assembly reads only `notes_root` files permitted by notes_glob
- **THEN** corpus excerpt assembly queries Chroma only through the project's configured persist client if chroma-augmentation is enabled


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
### Requirement: REQ-WCC-001 Corpus mode defaults on for thematic notebook-wide LLM wiki

The system SHALL treat `wiki_ingest.corpus_mode_enabled` as **true** when the key is omitted from YAML after this change ships.

Operators who intentionally require the legacy compact digest and five-file excerpt path SHALL assign `wiki_ingest.corpus_mode_enabled` to explicit **`false`** in YAML (documented migrate path for BREAKING avoidance).

Explicit **`false`** SHALL restore unchanged baseline semantics referenced by **REQ-WI-030**, **REQ-WI-003**, **REQ-WI-020**, **REQ-WIKI-015**, plus regression fixtures recorded in **`test/`**.

#### Scenario: SCN-WCC-DEFAULT-OMITTED

- **WHEN** configuration omits `wiki_ingest.corpus_mode_enabled`
- **THEN** REQ-WCC-002 widening logic SHALL activate for planner digest sizing
- **AND** REQ-WCC-003 excerpt augmentation paths SHALL activate for wiki body generation hooks

##### Example: boolean parsing table for load-config

| `corpus_mode_enabled` YAML | Parsed corpus active |
| -------------------------- | -------------------- |
| key omitted | true |
| `true` | true |
| `false` | false |

#### Scenario: SCN-WCC-LEGACY-FALSE

- **WHEN** configuration sets `wiki_ingest.corpus_mode_enabled` to false
- **THEN** planner digest line count MUST match legacy compact digest thresholds described in **`test/wiki-separation.test.js`** baselines dated before this capability ships


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
### Requirement: REQ-WCC-002 Planner digest window beyond legacy cap

When `wiki_ingest.corpus_mode_enabled` is true, **`summarizeSourcesForPlanner`** (or successor entry point holding the responsibility) SHALL include path and mtime lines for **`min(totalMarkdownFiles, corpus_digest_max_files)`** discovered markdown paths starting at **`corpus_digest_offset`** modulo **`max(1, totalMarkdownFiles)`** in stable lexicographic discovery order identical to **`discoverMarkdown`**.

Values outside the declared configuration bounds MUST be rejected at `load-config` time with **`CONFIG_INVALID`**.

#### Scenario: SCN-WCC-DIGEST-WINDOW

- **WHEN** totalMarkdownFiles is 120 and `corpus_digest_max_files` is 80 and offset is 0
- **THEN** the planner prompt digest contains metadata lines for exactly 80 relative paths drawn from contiguous rotation of lexicographically sorted discoveries

##### Example: wrap-around arithmetic

| total | offset | max_files | Included count |
| ----- | ------ | --------- | -------------- |
| 50 | 40 | 20 | 20 |
| 10 | 8 | 5 | 5 |


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
### Requirement: REQ-WCC-003 Writer excerpt composition modes

When `wiki_ingest.corpus_mode_enabled` is true, **`writeWikiPageBody`** (or its successor) MUST assemble excerpt text strictly under `wiki_ingest.corpus_writer_excerpt_mode` where at minimum one mode enumerates **filesystem slices using digest rotation** consistent with REQ-WCC-002 and optionally one mode merges **neighbor chunks** from **`collection_sources`** with top_k capped by **`wiki_ingest.corpus_chroma_top_k`**.

Neighbor queries MUST constrain results to chunks whose **`relative_path`** metadata resolves under **`notes_root`**.

#### Scenario: SCN-WCC-EXCERPT-FS

- **WHEN** excerpt mode disables chroma augmentation
- **THEN** excerpt assembly MUST NOT instantiate a Chroma PersistentClient solely for excerpts

#### Scenario: SCN-WCC-EXCERPT-CH

- **WHEN** excerpt mode enables chroma augmentation and Chroma responds with k neighbor documents
- **THEN** excerpt assembly merges at most **`corpus_chroma_top_k`** chunk bodies into the writer prompt scaffolding

##### Example: top_k numeric cap

| `corpus_chroma_top_k` | Neighbors returned by store | Fragments appended |
| --------------------- | --------------------------- | ------------------ |
| 8 | 20 | first 8 after deterministic sort |
| 8 | 0 | 0 textual fragments besides filesystem slices |


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
### Requirement: REQ-WCC-004 Chroma degradation surface

When chroma-augmentation is requested and the client throws an error OR the queried collection yields zero fragments, **`wiki-compile` SHALL fall back** to filesystem-only excerpt assembly for that page iteration and MUST emit exactly one **`stderr`** JSON log line carrying field **`warning":"CORPUS_CHROMA_DEGRADED"`** before continuing.

Multiple degradation events in one invocation SHALL each emit a separate JSON log line, and every such line MUST remain a single self-contained JSON object describing that warning event.

#### Scenario: SCN-WCC-DEGRADE-ZERO-HITS

- **WHEN** chroma-augmentation is enabled but the retrieval returns zero rows
- **THEN** wiki generation continues after emitting `CORPUS_CHROMA_DEGRADED`
- **AND** wiki files still satisfy REQ-WIKI-002 mandatory frontmatter when writes succeed


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
### Requirement: REQ-WCC-005 Telemetry fields on success summary

When `wiki_ingest.corpus_mode_enabled` is true and `wiki-compile` completes without `--dry-run`, stdout JSON MUST include **`corpus_mode: true`** and MUST include **`corpus_digest_paths_in_prompt_count`** reflecting the planner digest cardinality used for this run after bounds application.

Dry-run payloads MUST include the same keys when corpus mode is active.

#### Scenario: SCN-WCC-TELEMETRY

- **WHEN** corpus mode is true and pages_written is 3
- **THEN** stdout JSON includes `corpus_mode` true and a non-negative integer `corpus_digest_paths_in_prompt_count`

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
### Requirement: REQ-WCC-CORPUS-SWEEP-001 Corpus digest offset advancement between sweep windows

When corpus digest sweep mode is enabled (`wiki_ingest.corpus_auto_sweep.enabled` true), after a sweep window completes successfully and state advancement is permitted per REQ-WI-CORPUS-SWEEP-003, the system SHALL update the effective planner digest start index by adding `wiki_ingest.corpus_auto_sweep.step_files` (defaults resolved at load-config time to equal `wiki_ingest.corpus_digest_max_files`) and reducing modulo `max(1, totalMarkdownFiles)` using the same lexicographic discovery ordering as REQ-WCC-002.

The writer excerpt slice for corpus modes SHALL use the same effective `corpus_digest_offset` as the planner digest for that sweep window before applying mode-specific bumps (`filesystem_plus_chroma` hash bump remains additive on top of that base).

#### Scenario: SCN-WCC-SWEEP-OFFSET

- **WHEN** totalMarkdownFiles is 5, `corpus_digest_max_files` is 2, `step_files` is 2, and two sweep windows run with advancement enabled
- **THEN** the first planner digest covers indices {0,1} and the second covers indices {2,3} in lexicographic order

##### Example: wrap-around indices

| total | step | start offset | next offset after window |
| ----- | ---- | ------------ | ------------------------- |
| 5 | 2 | 4 | 1 |
| 3 | 3 | 0 | 0 |


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
### Requirement: REQ-WCC-CORPUS-SWEEP-002 Sweep step validation

`wiki_ingest.corpus_auto_sweep.step_files` MUST be rejected at `load-config` time with `CONFIG_INVALID` when it is greater than `wiki_ingest.corpus_digest_max_files`.

Sweep mode MUST be rejected with `CONFIG_INVALID` when `wiki_ingest.corpus_mode_enabled` resolves to false while sweep is enabled.

#### Scenario: SCN-WCC-SWEEP-CFG-INVALID

- **WHEN** `corpus_auto_sweep.enabled` is true and `corpus_mode_enabled` is false
- **THEN** `load-config` throws `CONFIG_INVALID`

#### Scenario: SCN-WCC-SWEEP-STEP

- **WHEN** `step_files` is 100 and `corpus_digest_max_files` is 80
- **THEN** `load-config` rejects the configuration with `CONFIG_INVALID`

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