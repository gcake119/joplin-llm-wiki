# joplin-sqlite-sync Specification

## Purpose

`sqlite-sync` exports Joplin Desktop SQLite notes into `raw/`, compares a raw
snapshot, and optionally triggers `wiki-compile` or `agent-compile` when raw
content changed.

## Requirements

### Requirement: REQ-JSQ-LOCAL-FIRST Local execution and network boundary

The system SHALL execute SQLite export, Markdown writes, snapshot comparison,
and orchestration on the operator workstation.

`sqlite-sync --export-only` and `sqlite-sync --snapshot-only` SHALL NOT require
HTTP network access.

When changed raw content triggers downstream compile, `compile_mode: local` MAY
contact `ollama.base_url` and the local Joplin Data API writeback preflight;
`compile_mode: agent` MAY run local `codex exec` and the local Joplin Data API
writeback preflight; `compile_mode: off` SHALL not compile.

The system SHALL NOT use Chroma, vector databases, or OpenAI API providers as
part of `sqlite-sync`.

#### Scenario: SCN-JSQ-LF-01 Export-only run uses no compile HTTP

- **WHEN** `sqlite-sync --export-only=true` runs
- **THEN** it exports raw Markdown and updates snapshot state without running
  compile.

---
### Requirement: REQ-JSQ-CONFIG Configuration surface

The system SHALL support `joplin_sqlite_sync` with at least:

| Key | Type | Default | Required when enabled |
| --- | ---- | ------- | ---------------------- |
| `enabled` | boolean | false | — |
| `database_path` | string | `""` | required |
| `export_root` | string | `""` | — |
| `reconcile_mode` | string enum `mirror`, `leave` | `mirror` | — |
| `busy_timeout_ms` | integer | 5000 | — |
| `max_export_attempts` | integer | 5 | — |
| `pipeline.compile_mode` | enum `local`, `agent`, `off` | derived from legacy `run_wiki_compile` | — |
| `pipeline.run_wiki_compile` | boolean | true | legacy compatibility only |
| `schedule.every_seconds` | positive integer or null | null | — |

Relative `database_path` SHALL resolve relative to the config file directory.

Empty `export_root` SHALL mean resolved `raw`. When sync is enabled, resolved
`export_root` SHALL equal resolved `raw`.

When `pipeline.compile_mode` is absent, the system SHALL derive it from legacy
`pipeline.run_wiki_compile`: `true` resolves to `local`; `false` resolves to
`off`. When both are present, `compile_mode` is authoritative.

#### Scenario: SCN-JSQ-CFG-01 Missing database path fails fast

- **WHEN** `joplin_sqlite_sync.enabled` is true and `database_path` is empty
- **THEN** config loading fails with `CONFIG_INVALID`.

#### Scenario: SCN-JSQ-CFG-02 Compile mode accepts fixed enum values

- **WHEN** `compile_mode` is `local`, `agent`, or `off`
- **THEN** config loading succeeds.

---
### Requirement: REQ-JSQ-SQLITE-RO Read-only SQLite access with busy handling

The system SHALL open the Joplin SQLite database in read-only mode suitable for
concurrent Joplin Desktop usage.

The system SHALL retry open/read operations up to `max_export_attempts` when
SQLite reports transient busy errors, respecting `busy_timeout_ms`.

If all attempts fail, the command SHALL abort with `SQLITE_OPEN_FAILED` and
SHALL NOT update snapshot state or run compile.

#### Scenario: SCN-JSQ-SQL-01 Busy database eventually succeeds

- **WHEN** the first open attempt returns SQLITE_BUSY and a later attempt
  succeeds
- **THEN** export proceeds.

---
### Requirement: REQ-JSQ-EXPORT-MIRROR Markdown export and reconciliation

The system SHALL read note records from the supported Joplin SQLite schema and
write one UTF-8 Markdown file per exported note under `raw`.

Notebook-filtered exports SHALL write files under
`raw/<joined-notebook-slug>/<safe-title>.md`; nested notebook paths SHALL join
levels with `joplin_sqlite_sync.notebook_filter.notebook_path_separator`, which
defaults to `-`.

Exported Markdown frontmatter SHALL preserve stable Joplin identity fields:
`joplin_note_id`, `joplin_notebook_id`, `joplin_notebook_path`, and
`joplin_notebook_slug`.

When `reconcile_mode` is `mirror`, the system SHALL delete Markdown files under
`raw` that no longer correspond to exported notes in the current database
snapshot. When `reconcile_mode` is `leave`, the system SHALL not delete removed
notes' files.

#### Scenario: SCN-JSQ-EXP-01 Joined notebook slug

- **GIVEN** a Joplin note under notebook path `工作/專案A/會議`
- **WHEN** notebook export runs with the default separator
- **THEN** the note is written under `raw/工作-專案A-會議/`.

---
### Requirement: REQ-JSQ-CHANGE-GATE Snapshot change detection and downstream gating

Normal `sqlite-sync` SHALL:

1. Export Joplin notes into `raw`.
2. Build a raw snapshot from raw-relative path, Joplin note id, and Markdown
   content hash.
3. Compare the current snapshot with persisted state.
4. Trigger downstream compile only when raw changed and compile mode is
   `local` or `agent`.
5. Commit snapshot state only after the applicable downstream work succeeds.

The first non-dry-run sync SHALL record a baseline only and SHALL not compile.

If downstream preflight or compile fails, snapshot state SHALL remain at the
last successful snapshot so a later run retries the same raw change.

#### Scenario: SCN-JSQ-GATE-01 Baseline does not compile

- **WHEN** no previous snapshot state exists and non-dry-run `sqlite-sync` runs
- **THEN** state is committed with reason `baseline` and compile is not
  triggered.

#### Scenario: SCN-JSQ-GATE-02 Changed raw triggers local compile

- **WHEN** raw changed and resolved `compile_mode` is `local`
- **THEN** the system runs `wiki-compile` once and commits state only after it
  succeeds.

#### Scenario: SCN-JSQ-GATE-03 Changed raw triggers agent compile

- **WHEN** raw changed and resolved `compile_mode` is `agent`
- **THEN** the system runs `agent-compile` once and commits state only after it
  succeeds.

---
### Requirement: REQ-JSQ-SNAPSHOT-ONLY Snapshot-only mode

`sqlite-sync --snapshot-only=true` SHALL build and persist a baseline snapshot
from existing `raw` Markdown without opening SQLite, deleting files, or running
compile.

If no matching raw Markdown exists, the command SHALL fail with
`NO_SOURCE_MARKDOWN`.

#### Scenario: SCN-JSQ-SNAP-01 Existing raw baseline

- **WHEN** `raw` contains Markdown files and snapshot-only runs
- **THEN** state is written and `snapshot_only: true` appears in stdout JSON.

---
### Requirement: REQ-JSQ-POLLING Periodic checking is polling

`sqlite-sync` periodic checking SHALL be polling, not a filesystem watcher.

The system SHALL run once when `schedule.every_seconds` is null and `--every` is
absent. The system SHALL run repeated cycles in one process when
`schedule.every_seconds` or CLI `--every <seconds>` supplies a positive
interval.

#### Scenario: SCN-JSQ-POLL-01 One-shot default

- **WHEN** `every_seconds` is null and no `--every` option is passed
- **THEN** `sqlite-sync` runs one cycle and exits.

---
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


<!-- @trace
source: durable-sqlite-sync-writeback
updated: 2026-05-23
code:
  - src/joplin/sqlite/exporter.js
  - README.md
  - src/joplin/wiki-writeback.js
  - src/commands/cmd-sqlite-sync.js
  - scripts/launchd/com.joplin-brain.sqlite-sync.plist.example
  - docs/macos-launchd-stack.md
  - docs/scheduling-examples.md
  - scripts/launchd/run-sqlite-sync.sh
tests:
  - test/joplin-wiki-writeback.test.js
  - test/joplin-sqlite.test.js
  - test/config-schema.test.js
  - test/launchd-plist.test.js
  - test/sqlite-sync-change-detection.test.js
  - test/launchd-run-sqlite-sync.test.js
-->

---
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


<!-- @trace
source: durable-sqlite-sync-writeback
updated: 2026-05-23
code:
  - src/joplin/sqlite/exporter.js
  - README.md
  - src/joplin/wiki-writeback.js
  - src/commands/cmd-sqlite-sync.js
  - scripts/launchd/com.joplin-brain.sqlite-sync.plist.example
  - docs/macos-launchd-stack.md
  - docs/scheduling-examples.md
  - scripts/launchd/run-sqlite-sync.sh
tests:
  - test/joplin-wiki-writeback.test.js
  - test/joplin-sqlite.test.js
  - test/config-schema.test.js
  - test/launchd-plist.test.js
  - test/sqlite-sync-change-detection.test.js
  - test/launchd-run-sqlite-sync.test.js
-->

---
### Requirement: Local retry boundary

Retry-safe snapshot commit SHALL NOT introduce remote storage, remote queues, or non-loopback network endpoints.

The system SHALL keep retry state in the existing local sqlite-sync snapshot state file and in process exit status only.

#### Scenario: Retry state remains local

- **WHEN** `sqlite-sync` handles a downstream failure after raw changes
- **THEN** no new remote endpoint SHALL be contacted for retry bookkeeping
- **AND** no retry queue file outside the repository working directory SHALL be created
- **AND** the previous local snapshot state SHALL remain the retry boundary

<!-- @trace
source: durable-sqlite-sync-writeback
updated: 2026-05-23
code:
  - src/joplin/sqlite/exporter.js
  - README.md
  - src/joplin/wiki-writeback.js
  - src/commands/cmd-sqlite-sync.js
  - scripts/launchd/com.joplin-brain.sqlite-sync.plist.example
  - docs/macos-launchd-stack.md
  - docs/scheduling-examples.md
  - scripts/launchd/run-sqlite-sync.sh
tests:
  - test/joplin-wiki-writeback.test.js
  - test/joplin-sqlite.test.js
  - test/config-schema.test.js
  - test/launchd-plist.test.js
  - test/sqlite-sync-change-detection.test.js
  - test/launchd-run-sqlite-sync.test.js
-->

---
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
### Requirement: Incremental downstream state commit boundary

The sqlite-sync snapshot state SHALL be committed only after summary generation, affected concept rebuild, and enabled writeback all succeed.

If concept rebuild or writeback fails, sqlite-sync SHALL leave the previous snapshot state unchanged so the next run retries the same raw change.

#### Scenario: SCN-JSQ-INCREMENTAL-STATE-01 Concept failure keeps previous snapshot

- **WHEN** raw changed and summary generation succeeds
- **AND** affected concept rebuild fails with `WIKI_COMPILE_ABORT`
- **THEN** sqlite-sync exits non-zero
- **AND** the previous snapshot state remains unchanged
- **AND** the next normal sqlite-sync run retries the same raw change.


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