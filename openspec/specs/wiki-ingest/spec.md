# wiki-ingest Specification

## Purpose

`wiki-compile` plans and writes compiled wiki Markdown from source evidence in
`raw/`. The local route uses Ollama chat; `agent-compile` uses the local Codex
CLI agent route and shares the same output/writeback contract.

## Requirements

### Requirement: REQ-WI-001 Page budget per compile window

The system SHALL NOT create or update more than
`wiki_ingest.max_pages_per_run` distinct wiki files in one compile window.

When corpus sweep executes multiple windows inside one CLI invocation, this
budget SHALL apply independently to each window.

#### Scenario: SCN-WI-CAP-01 Budget enforced

- **WHEN** planner returns more paths than `max_pages_per_run`
- **THEN** only `max_pages_per_run` paths are planned or written for that
  window and telemetry reports truncation.

---
### Requirement: REQ-WI-002 Dry-run mode

When `wiki-compile --dry-run=true` is passed, the system SHALL NOT write or
modify files under `wiki` and SHALL NOT send mutating Joplin Data API requests.

The system SHALL emit a JSON document listing planned paths and dry-run
metadata.

#### Scenario: SCN-WI-DRY-01 No writes

- **WHEN** `wiki-compile --dry-run=true` executes
- **THEN** wiki file mtimes remain unchanged.

---
### Requirement: REQ-WI-003 Planner and writer use local Ollama only

The local `wiki-compile` route SHALL send planner and writer HTTP only to
`ollama.base_url`.

The local `wiki-compile` route SHALL NOT use OpenAI API providers, embeddings,
Chroma, or vector stores.

#### Scenario: SCN-WI-LOCAL-01 Planner HTTP

- **WHEN** local `wiki-compile` runs
- **THEN** no HTTP host other than `ollama.base_url` receives planner or writer
  prompts, except optional loopback Joplin Data API writeback after output.

---
### Requirement: REQ-WI-020 Post-compile Joplin Data API writeback

When `joplin_wiki_writeback.enabled` is true and `wiki-compile` or `agent-compile` completes wiki file writes successfully without dry-run, the system SHALL invoke the Joplin Data API writeback stage before the process exits with code 0, except when the active resume stage is `concepts`.

When the active resume stage is `concepts`, the system SHALL write only local concept and concept-index files and SHALL defer Joplin publication to the `writeback` resume stage.

When `joplin_wiki_writeback.enabled` is false, `wiki-compile` and `agent-compile` SHALL skip writeback.

#### Scenario: SCN-WI-WB-01 Dry-run skips mutating Data API calls

- **WHEN** `wiki-compile --dry-run=true` or `agent-compile --dry-run=true` runs with writeback enabled
- **THEN** no writeback mutating Data API requests are executed.

#### Scenario: SCN-WI-WB-02 Success runs writeback

- **WHEN** full `wiki-compile` or `agent-compile` completes successfully without dry-run
- **AND** `joplin_wiki_writeback.enabled` is true
- **THEN** writeback executes before process exit.

#### Scenario: SCN-WI-STAGED-CONCEPT-01 Concept resume defers writeback

- **WHEN** `wiki-compile` or `agent-compile` runs with resume stage `concepts` without dry-run
- **AND** `joplin_wiki_writeback.enabled` is true
- **THEN** the system writes local concept and All-Concepts files
- **AND** the system does not send mutating Joplin Data API requests
- **AND** the JSON result reports `writeback_deferred: true`.


<!-- @trace
source: stage-concept-writeback-gui-tool
updated: 2026-05-23
code:
  - src/health-gui/main.js
  - src/cli.js
  - docs/scheduling-examples.md
  - docs/llm-knowledge-flow.md
  - src/health-gui/renderer/app.js
  - src/wiki/wiki-compiler.js
  - src/health-gui/preload.cjs
  - src/commands/cmd-sqlite-sync.js
  - README.md
  - src/commands/cmd-agent-compile.js
  - config.yaml.example
  - src/health-gui/renderer/index.html
  - src/health-gui/corpus/corpus-pipeline-runner.js
tests:
  - test/agent-compile.test.js
  - test/health-gui/concept-resume-actions.test.js
  - test/joplin-wiki-writeback.test.js
  - test/cli-help.test.js
  - test/sqlite-sync-change-detection.test.js
  - test/wiki-concept-resume.test.js
-->

---
### Requirement: REQ-WI-CORPUS-SWEEP-001 Corpus digest sweep orchestration

When `wiki_ingest.corpus_auto_sweep.enabled` is true and corpus mode resolves to
enabled, a single `wiki-compile` CLI invocation SHALL execute up to
`wiki_ingest.corpus_auto_sweep.max_windows_per_invocation` sequential sweep
windows in one OS process.

Each sweep window SHALL run the existing wiki-compile pipeline using an
effective `corpus_digest_offset` equal to the persisted sweep state value modulo
the discovered raw Markdown count.

#### Scenario: SCN-WI-SWEEP-MULTI

- **WHEN** sweep is enabled with at least two windows and enough raw Markdown
  files exist
- **THEN** the process performs at least two planner invocations with different
  effective offsets before exiting successfully.

---
### Requirement: REQ-WI-CORPUS-SWEEP-002 Sweep state file and fingerprint reset

The system SHALL persist sweep progress in a JSON state file at
`wiki_ingest.corpus_auto_sweep.state_path` when provided, otherwise under
`wiki/.joplin-llm-wiki/corpus-sweep-state.json`.

The state file SHALL record at minimum `schema_version`, `next_offset`,
`markdown_file_count`, `step_files`, and `updated_at_ms`.

When the current discovered raw Markdown count differs from the count stored in
state, the system SHALL reset sweep progression to `next_offset: 0` and emit
telemetry identifying the fingerprint reset.

#### Scenario: SCN-WI-SWEEP-FPR-RESET

- **WHEN** state records 10 files and discovery later reports 11 files
- **THEN** the first effective offset is reset to 0 and telemetry indicates a
  fingerprint reset.

---
### Requirement: REQ-WI-CORPUS-SWEEP-003 Dry-run interaction with sweep state

When `wiki-compile --dry-run=true` runs and
`wiki_ingest.corpus_auto_sweep.advance_state_on_dry_run` is false, the system
SHALL NOT update sweep state.

When dry-run is active and `advance_state_on_dry_run` is true, the system SHALL
advance and persist sweep state exactly as non-dry-run mode does and SHALL emit
a warning that dry-run advanced state.

#### Scenario: SCN-WI-SWEEP-DRY-NO-ADVANCE

- **WHEN** sweep is enabled and dry-run state advancement is false
- **THEN** dry-run performs planner-visible work but leaves `next_offset`
  unchanged on disk.

---
### Requirement: REQ-WI-TOPIC-001 Minimum concept paths per compile window

When `wiki_ingest.min_topic_pages_per_run` is greater than zero, the planner
stage SHALL attempt to produce at least that many `concepts/*.md` paths that are
not required hub pages.

If Ollama rounds are exhausted without meeting the quota, the system SHALL merge
deterministic heuristic concept paths and emit stderr JSON
`PLAN_TOPIC_TOPUP_HEURISTIC`.

#### Scenario: SCN-WI-TOPIC-01 Heuristic top-up

- **WHEN** the model returns only hub paths for all planner rounds
- **THEN** the compile plan includes heuristic `concepts/*.md` paths.

---
### Requirement: REQ-WI-SWEEP-UNTIL-001 Optional run until corpus cycle complete

When `wiki_ingest.corpus_auto_sweep.run_until_cycle_complete` is true, a single
`wiki-compile` invocation SHALL execute sweep windows sequentially until
`cycle_complete` is true or `max_total_windows_per_invocation` is reached.

#### Scenario: SCN-WI-SWEEP-UNTIL-01 Cycle completes

- **WHEN** a small raw fixture completes one full offset cycle within the total
  cap
- **THEN** stdout summary includes `cycle_complete: true`.

---
### Requirement: Concept canonicalization during wiki compile

The wiki compile system SHALL canonicalize concept output before writing `wiki/concepts/*.md`.

A canonical concept SHALL bind one normalized slug, one frontmatter `title`, one body H1, and one evidence set. When two planned concept paths normalize to the same canonical topic, the system SHALL write one canonical concept file and SHALL report the merged titles in compile telemetry.

The final decision that two concepts describe the same topic SHALL be made by an LLM semantic judgment over summary excerpts, raw evidence references, and existing canonical concept context. String equality, slug similarity, title overlap, and filename prefix matching SHALL be used only to gather candidates for the LLM judgment.

#### Scenario: SCN-WI-CONCEPT-CANON-01 stable concept across repeated runs

- **WHEN** two compile windows plan concepts named `depression-support-and-psychoeducation` and `depression-support-psychoeducation`
- **THEN** the system writes or updates one canonical `concepts/depression-support-and-psychoeducation.md` file
- **AND** compile telemetry reports `canonical_merge_count: 1`

##### Example: similar concept title merge

- **GIVEN** planned titles `憂鬱症支持與心理衛教` and `憂鬱症陪伴、心理衛教與求助`
- **WHEN** the LLM semantic judgment classifies both candidate concepts as the same topic
- **THEN** the output includes one concept file with `merged_from` containing the non-canonical title


<!-- @trace
source: fix-concept-generation-resume
updated: 2026-05-23
code:
  - src/commands/cmd-agent-compile.js
  - src/wiki/wiki-compiler.js
  - docs/llm-knowledge-flow.md
  - src/joplin/wiki-writeback.js
  - src/config/load-config.js
  - README.md
  - config.yaml.example
  - src/wiki/wiki-planner.js
  - docs/scheduling-examples.md
  - src/commands/cmd-wiki-compile.js
  - src/joplin/data-api-client.js
tests:
  - test/agent-compile.test.js
  - test/wiki-concept-resume.test.js
  - test/joplin-wiki-writeback.test.js
-->

---
### Requirement: LLM semantic concept relation judgment

The wiki compile system SHALL classify concept relation candidates with an LLM semantic judgment before merging them.

The judgment input SHALL include candidate concept titles, summary excerpts, source_refs, and any existing canonical concept summary. The judgment output SHALL include `relation`, `confidence`, and `reason`. The system SHALL NOT merge a candidate into an existing canonical concept when the LLM returns a low-confidence or distinct-topic judgment.

#### Scenario: SCN-WI-CONCEPT-SEMANTIC-01 semantic judgment overrides string similarity

- **WHEN** two concept candidates have similar titles but their summary excerpts describe distinct topics
- **THEN** the system keeps them as separate canonical concepts
- **AND** compile telemetry includes a semantic decision with `relation: distinct_topic`

##### Example: string-similar but semantically distinct

| Candidate A | Candidate B | LLM relation | Expected output |
| ----- | ----- | ----- | ----- |
| `投資心理與風險承受` | `心理衛教與求助` | `distinct_topic` | Two canonical concept files |


<!-- @trace
source: fix-concept-generation-resume
updated: 2026-05-23
code:
  - src/commands/cmd-agent-compile.js
  - src/wiki/wiki-compiler.js
  - docs/llm-knowledge-flow.md
  - src/joplin/wiki-writeback.js
  - src/config/load-config.js
  - README.md
  - config.yaml.example
  - src/wiki/wiki-planner.js
  - docs/scheduling-examples.md
  - src/commands/cmd-wiki-compile.js
  - src/joplin/data-api-client.js
tests:
  - test/agent-compile.test.js
  - test/wiki-concept-resume.test.js
  - test/joplin-wiki-writeback.test.js
-->

---
### Requirement: Concept resume stage

The `wiki-compile` command SHALL support a resume stage that starts from existing `wiki/summaries/*.md` and produces only concept and concept-index output.

When the resume stage is `concepts`, the system SHALL read existing summaries, SHALL use their frontmatter and source references as the concept planning input, SHALL write only `wiki/concepts/*.md` and `wiki/indexes/All-Concepts.md`, and SHALL NOT rewrite `wiki/summaries/*.md`.

#### Scenario: SCN-WI-RESUME-CONCEPTS-01 concept-only resume skips summaries

- **WHEN** an operator runs `wiki-compile` with resume stage `concepts`
- **AND** `wiki/summaries/a.md` and `wiki/summaries/b.md` already exist
- **THEN** the system reads the existing summary files
- **AND** the system writes concept and All-Concepts files only
- **AND** the system leaves summary file mtimes unchanged

##### Example: concept resume telemetry

| Input summaries | Output concepts | Expected telemetry |
| ----- | ----- | ----- |
| `summaries/a.md`, `summaries/b.md` | `concepts/topic.md` | `resume_stage: concepts`, `summary_paths_read: 2`, `concept_paths_written: 1` |


<!-- @trace
source: fix-concept-generation-resume
updated: 2026-05-23
code:
  - src/commands/cmd-agent-compile.js
  - src/wiki/wiki-compiler.js
  - docs/llm-knowledge-flow.md
  - src/joplin/wiki-writeback.js
  - src/config/load-config.js
  - README.md
  - config.yaml.example
  - src/wiki/wiki-planner.js
  - docs/scheduling-examples.md
  - src/commands/cmd-wiki-compile.js
  - src/joplin/data-api-client.js
tests:
  - test/agent-compile.test.js
  - test/wiki-concept-resume.test.js
  - test/joplin-wiki-writeback.test.js
-->

---
### Requirement: Writeback resume stage

The `wiki-compile` command SHALL support a resume stage that starts from existing concepts and indexes and performs only Joplin wiki writeback.

When the resume stage is `writeback`, the system SHALL read existing `wiki/concepts/*.md` and `wiki/indexes/All-Concepts.md`, SHALL pass only those relative paths to the writeback stage, and SHALL NOT invoke summary generation, concept generation, or Ollama chat completion.

#### Scenario: SCN-WI-RESUME-WRITEBACK-01 writeback-only resume skips model work

- **WHEN** an operator runs `wiki-compile` with resume stage `writeback`
- **THEN** the system does not call Ollama chat completion
- **AND** the system passes only `concepts/*.md` and `indexes/All-Concepts.md` paths to Joplin writeback
- **AND** the JSON summary reports `resume_stage: writeback`

<!-- @trace
source: fix-concept-generation-resume
updated: 2026-05-23
code:
  - src/commands/cmd-agent-compile.js
  - src/wiki/wiki-compiler.js
  - docs/llm-knowledge-flow.md
  - src/joplin/wiki-writeback.js
  - src/config/load-config.js
  - README.md
  - config.yaml.example
  - src/wiki/wiki-planner.js
  - docs/scheduling-examples.md
  - src/commands/cmd-wiki-compile.js
  - src/joplin/data-api-client.js
tests:
  - test/agent-compile.test.js
  - test/wiki-concept-resume.test.js
  - test/joplin-wiki-writeback.test.js
-->

---
### Requirement: Staged concept resume output

The `wiki-compile` and `agent-compile` commands SHALL treat `--resume-stage concepts` as a local-file-only concept compilation stage.

The concepts stage SHALL read existing `wiki/summaries/*.md`, SHALL write only `wiki/concepts/*.md` and `wiki/indexes/All-Concepts.md`, and SHALL expose the downstream writeback relPaths that a later writeback stage can publish. Local mode SHALL perform writing through the Ollama-backed wiki compiler. Agent mode SHALL perform the same file contract through the local `codex exec` agent path without using a remote API service.

#### Scenario: SCN-WI-STAGED-CONCEPT-LOCAL-01 Concepts stage writes local outputs only

- **WHEN** an operator runs `wiki-compile --resume-stage concepts`
- **THEN** the system writes canonical concept files and `indexes/All-Concepts.md`
- **AND** the system leaves `wiki/summaries/*.md` unchanged
- **AND** the result contains `writeback_relpaths` for completed concept/index files.

#### Scenario: SCN-WI-STAGED-CONCEPT-AGENT-01 Agent concepts stage writes local outputs only

- **WHEN** an operator runs `agent-compile --resume-stage concepts`
- **THEN** the system writes canonical concept files and `indexes/All-Concepts.md`
- **AND** the system leaves `wiki/summaries/*.md` unchanged
- **AND** the system does not send mutating Joplin Data API requests
- **AND** the result contains `writeback_relpaths` for completed concept/index files.


<!-- @trace
source: stage-concept-writeback-gui-tool
updated: 2026-05-23
code:
  - src/health-gui/main.js
  - src/cli.js
  - docs/scheduling-examples.md
  - docs/llm-knowledge-flow.md
  - src/health-gui/renderer/app.js
  - src/wiki/wiki-compiler.js
  - src/health-gui/preload.cjs
  - src/commands/cmd-sqlite-sync.js
  - README.md
  - src/commands/cmd-agent-compile.js
  - config.yaml.example
  - src/health-gui/renderer/index.html
  - src/health-gui/corpus/corpus-pipeline-runner.js
tests:
  - test/agent-compile.test.js
  - test/health-gui/concept-resume-actions.test.js
  - test/joplin-wiki-writeback.test.js
  - test/cli-help.test.js
  - test/sqlite-sync-change-detection.test.js
  - test/wiki-concept-resume.test.js
-->

---
### Requirement: Incremental concept rebuild from changed summaries

When changed raw content causes one or more summaries to change, the system SHALL compute a changed summary scope and SHALL use that scope to plan downstream concept rebuilds.

The system SHALL expand the impact scope from changed summaries through available `summary_refs`, `source_refs`, canonical concept metadata, and LLM semantic judgment when the relationship is ambiguous.

#### Scenario: SCN-WI-INCREMENTAL-CONCEPT-01 Changed summary rebuilds affected concept

- **WHEN** `summaries/a.md` changes after raw export
- **AND** existing concept metadata links `summaries/a.md` to `concepts/topic.md`
- **THEN** the concept planning stage includes `concepts/topic.md`
- **AND** the JSON result includes `changed_summary_paths: ["summaries/a.md"]`.

##### Example: changed summary scope expansion

| Changed summary | Existing concept metadata | Expected planned concept |
| ----- | ----- | ----- |
| `summaries/a.md` | `summary_refs: ["summaries/a.md"]` | `concepts/topic.md` |
| `summaries/b.md` | source_refs overlap with `concepts/finance.md` | `concepts/finance.md` |


<!-- @trace
source: stage-concept-writeback-gui-tool
updated: 2026-05-23
code:
  - src/health-gui/main.js
  - src/cli.js
  - docs/scheduling-examples.md
  - docs/llm-knowledge-flow.md
  - src/health-gui/renderer/app.js
  - src/wiki/wiki-compiler.js
  - src/health-gui/preload.cjs
  - src/commands/cmd-sqlite-sync.js
  - README.md
  - src/commands/cmd-agent-compile.js
  - config.yaml.example
  - src/health-gui/renderer/index.html
  - src/health-gui/corpus/corpus-pipeline-runner.js
tests:
  - test/agent-compile.test.js
  - test/health-gui/concept-resume-actions.test.js
  - test/joplin-wiki-writeback.test.js
  - test/cli-help.test.js
  - test/sqlite-sync-change-detection.test.js
  - test/wiki-concept-resume.test.js
-->

---
### Requirement: Staged concept telemetry

Concept resume and incremental concept rebuild results SHALL expose enough telemetry for operators and GUI consumers to understand what changed and what remains to publish.

The JSON output SHALL include `compile_adapter`, `resume_stage`, `summary_paths_read`, `changed_summary_paths`, `concept_paths_planned`, `concept_paths_written`, `writeback_relpaths`, and `writeback_deferred` when applicable.

#### Scenario: SCN-WI-STAGED-TELEMETRY-01 Concept stage reports deferred writeback

- **WHEN** concept resume completes without dry-run
- **THEN** the JSON result includes `resume_stage: "concepts"`
- **AND** the JSON result includes `compile_adapter: "local"` or `compile_adapter: "agent"`
- **AND** the JSON result includes `writeback_deferred: true`
- **AND** the JSON result includes the relPaths required by the writeback stage.

<!-- @trace
source: stage-concept-writeback-gui-tool
updated: 2026-05-23
code:
  - src/health-gui/main.js
  - src/cli.js
  - docs/scheduling-examples.md
  - docs/llm-knowledge-flow.md
  - src/health-gui/renderer/app.js
  - src/wiki/wiki-compiler.js
  - src/health-gui/preload.cjs
  - src/commands/cmd-sqlite-sync.js
  - README.md
  - src/commands/cmd-agent-compile.js
  - config.yaml.example
  - src/health-gui/renderer/index.html
  - src/health-gui/corpus/corpus-pipeline-runner.js
tests:
  - test/agent-compile.test.js
  - test/health-gui/concept-resume-actions.test.js
  - test/joplin-wiki-writeback.test.js
  - test/cli-help.test.js
  - test/sqlite-sync-change-detection.test.js
  - test/wiki-concept-resume.test.js
-->