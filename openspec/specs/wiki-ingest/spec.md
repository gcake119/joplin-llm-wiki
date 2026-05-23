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

### Requirement: REQ-WI-002 Dry-run mode

When `wiki-compile --dry-run=true` is passed, the system SHALL NOT write or
modify files under `wiki` and SHALL NOT send mutating Joplin Data API requests.

The system SHALL emit a JSON document listing planned paths and dry-run
metadata.

#### Scenario: SCN-WI-DRY-01 No writes

- **WHEN** `wiki-compile --dry-run=true` executes
- **THEN** wiki file mtimes remain unchanged.

### Requirement: REQ-WI-003 Planner and writer use local Ollama only

The local `wiki-compile` route SHALL send planner and writer HTTP only to
`ollama.base_url`.

The local `wiki-compile` route SHALL NOT use OpenAI API providers, embeddings,
Chroma, or vector stores.

#### Scenario: SCN-WI-LOCAL-01 Planner HTTP

- **WHEN** local `wiki-compile` runs
- **THEN** no HTTP host other than `ollama.base_url` receives planner or writer
  prompts, except optional loopback Joplin Data API writeback after output.

### Requirement: REQ-WI-020 Post-compile Joplin Data API writeback

When `joplin_wiki_writeback.enabled` is true and `wiki-compile` completes wiki
file writes successfully without dry-run, the system SHALL invoke the Joplin
Data API writeback stage before the process exits with code 0.

When `joplin_wiki_writeback.enabled` is false, `wiki-compile` SHALL skip
writeback.

#### Scenario: SCN-WI-WB-01 Dry-run skips mutating Data API calls

- **WHEN** `wiki-compile --dry-run=true` runs with writeback enabled
- **THEN** no writeback mutating Data API requests are executed.

#### Scenario: SCN-WI-WB-02 Success runs writeback

- **WHEN** `wiki-compile` completes successfully without dry-run
- **AND** `joplin_wiki_writeback.enabled` is true
- **THEN** writeback executes before process exit.

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

### Requirement: REQ-WI-SWEEP-UNTIL-001 Optional run until corpus cycle complete

When `wiki_ingest.corpus_auto_sweep.run_until_cycle_complete` is true, a single
`wiki-compile` invocation SHALL execute sweep windows sequentially until
`cycle_complete` is true or `max_total_windows_per_invocation` is reached.

#### Scenario: SCN-WI-SWEEP-UNTIL-01 Cycle completes

- **WHEN** a small raw fixture completes one full offset cycle within the total
  cap
- **THEN** stdout summary includes `cycle_complete: true`.
