## ADDED Requirements

### Requirement: Retry-safe snapshot commit for downstream pipelines

When `sqlite-sync` detects raw Markdown changes and resolved `joplin_sqlite_sync.pipeline.compile_mode` is `local` or `agent`, the system SHALL treat the current raw snapshot as pending until the configured downstream compile and enabled writeback stages complete successfully.

The system SHALL NOT replace the previous sqlite-sync snapshot state when a required downstream compile or writeback stage fails.

The system SHALL replace the sqlite-sync snapshot state after export when downstream work is intentionally skipped by `--export-only`, `--snapshot-only`, baseline creation, unchanged raw, or `compile_mode: off`.

#### Scenario: Downstream failure preserves previous snapshot

- **GIVEN** a valid previous sqlite-sync snapshot state exists
- **AND** a normal non-dry-run `sqlite-sync` cycle exports raw Markdown changes
- **AND** resolved `compile_mode` is `agent`
- **WHEN** the agent compile stage fails with `AGENT_COMPILE_FAILED`
- **THEN** `sqlite-sync` exits non-zero
- **AND** the sqlite-sync snapshot state file still contains the previous snapshot
- **AND** stdout or stderr identifies `state_committed` as false with a downstream failure reason

#### Scenario: Retry after failed downstream detects the same raw change

- **GIVEN** a previous `sqlite-sync` cycle failed after raw Markdown changes and did not commit the pending snapshot
- **WHEN** the operator runs `sqlite-sync` again after fixing the downstream failure
- **THEN** the system SHALL compare the current raw snapshot against the still-previous snapshot
- **AND** `raw_changed` SHALL be true for the same raw change
- **AND** the configured downstream compile mode SHALL run again
- **AND** the snapshot state SHALL be replaced only after the downstream stage succeeds

#### Scenario: Export-only preserves explicit export semantics

- **GIVEN** a normal non-dry-run `sqlite-sync --export-only` cycle exports raw Markdown changes
- **WHEN** export and snapshot comparison complete successfully
- **THEN** the system SHALL write the current snapshot state
- **AND** the system SHALL NOT run `wiki-compile` or `agent-compile`
- **AND** stdout SHALL identify `export_only` as true and `state_committed` as true

#### Scenario: Compile mode off commits after export

- **GIVEN** resolved `compile_mode` is `off`
- **AND** a normal non-dry-run `sqlite-sync` cycle exports raw Markdown changes
- **WHEN** export and snapshot comparison complete successfully
- **THEN** the system SHALL write the current snapshot state
- **AND** the system SHALL NOT run downstream compile
- **AND** stdout SHALL identify `compile_mode` as `off` and `state_committed` as true

### Requirement: Downstream-aware sqlite-sync cycle summary

Every non-dry-run `sqlite-sync` cycle SHALL include machine-readable state commit and downstream status fields in its JSON summary before the process exits or before the polling loop sleeps.

The summary SHALL distinguish raw unchanged, baseline, export-only, compile skipped, downstream succeeded, downstream failed, and writeback preflight failed outcomes.

#### Scenario: Successful downstream summary

- **GIVEN** raw changes are detected
- **AND** resolved `compile_mode` is `local`
- **WHEN** `wiki-compile` and enabled writeback complete successfully
- **THEN** stdout SHALL include `raw_changed: true`
- **AND** stdout SHALL include `compile_triggered: true`
- **AND** stdout SHALL include `downstream_status: "succeeded"`
- **AND** stdout SHALL include `state_committed: true`

#### Scenario: Writeback preflight failure summary

- **GIVEN** raw changes are detected
- **AND** writeback is enabled
- **AND** Joplin Data API rejects the configured token
- **WHEN** `sqlite-sync` runs the preflight check
- **THEN** the process SHALL exit non-zero before compile starts
- **AND** stderr SHALL include a stable Joplin Data API error code
- **AND** stdout or stderr SHALL identify `writeback_preflight_status` as `failed`
- **AND** the snapshot state SHALL remain unchanged

### Requirement: Local retry boundary

Retry-safe snapshot commit SHALL NOT introduce remote storage, remote queues, or non-loopback network endpoints.

The system SHALL keep retry state in the existing local sqlite-sync snapshot state file and in process exit status only.

#### Scenario: Retry state remains local

- **WHEN** `sqlite-sync` handles a downstream failure after raw changes
- **THEN** no new remote endpoint SHALL be contacted for retry bookkeeping
- **AND** no retry queue file outside the repository working directory SHALL be created
- **AND** the previous local snapshot state SHALL remain the retry boundary
