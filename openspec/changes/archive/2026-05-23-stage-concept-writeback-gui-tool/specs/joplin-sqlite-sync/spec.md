## ADDED Requirements

### Requirement: Incremental concept downstream orchestration

When normal `sqlite-sync` detects raw changes and the resolved compile mode performs downstream wiki work, the orchestration SHALL preserve the changed raw and changed summary scope needed to rebuild affected concepts for both `compile_mode: local` and `compile_mode: agent`.

If summaries are regenerated or updated, the orchestration SHALL run concept rebuild for the affected summary scope before committing snapshot state. If Joplin writeback is enabled, the orchestration SHALL publish only the changed downstream concept/index relPaths after concept rebuild succeeds.

#### Scenario: SCN-JSQ-INCREMENTAL-CONCEPT-01 Raw change rebuilds and writes affected concept

- **WHEN** `sqlite-sync` detects a changed raw note
- **AND** downstream summary generation updates `summaries/a.md`
- **AND** the affected concept plan writes `concepts/topic.md`
- **THEN** the sqlite-sync result includes `changed_summary_paths: ["summaries/a.md"]`
- **AND** the sqlite-sync result includes `concept_paths_written: ["concepts/topic.md"]`
- **AND** writeback receives `concepts/topic.md` and `indexes/All-Concepts.md` but not unchanged summaries.

#### Scenario: SCN-JSQ-INCREMENTAL-CONCEPT-AGENT-01 Agent mode uses the same downstream scope contract

- **WHEN** `sqlite-sync` detects a changed raw note
- **AND** the resolved `compile_mode` is `agent`
- **AND** downstream summary generation updates `summaries/a.md`
- **AND** the affected concept plan writes `concepts/topic.md`
- **THEN** the sqlite-sync result includes `compile_mode: "agent"`
- **AND** the sqlite-sync result includes `compile_adapter: "agent"`
- **AND** writeback receives `concepts/topic.md` and `indexes/All-Concepts.md` but not unchanged summaries.

### Requirement: Incremental downstream state commit boundary

The sqlite-sync snapshot state SHALL be committed only after summary generation, affected concept rebuild, and enabled writeback all succeed.

If concept rebuild or writeback fails, sqlite-sync SHALL leave the previous snapshot state unchanged so the next run retries the same raw change.

#### Scenario: SCN-JSQ-INCREMENTAL-STATE-01 Concept failure keeps previous snapshot

- **WHEN** raw changed and summary generation succeeds
- **AND** affected concept rebuild fails with `WIKI_COMPILE_ABORT`
- **THEN** sqlite-sync exits non-zero
- **AND** the previous snapshot state remains unchanged
- **AND** the next normal sqlite-sync run retries the same raw change.

### Requirement: Incremental downstream observability

The sqlite-sync JSON output SHALL expose downstream stage fields when raw changes trigger scoped concept rebuild.

The output SHALL include compile mode, compile adapter, changed raw paths, changed summary paths, planned concept paths, written concept paths, writeback relPaths, downstream status, and state commit reason.

#### Scenario: SCN-JSQ-INCREMENTAL-OBS-01 Changed scope appears in output

- **WHEN** raw changes trigger scoped concept rebuild
- **THEN** stdout JSON includes `changed_raw_paths`
- **AND** stdout JSON includes `compile_mode`
- **AND** stdout JSON includes `compile_adapter`
- **AND** stdout JSON includes `changed_summary_paths`
- **AND** stdout JSON includes `concept_paths_written`
- **AND** stdout JSON includes `writeback_relpaths`.
