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

### Requirement: REQ-JSQ-SNAPSHOT-ONLY Snapshot-only mode

`sqlite-sync --snapshot-only=true` SHALL build and persist a baseline snapshot
from existing `raw` Markdown without opening SQLite, deleting files, or running
compile.

If no matching raw Markdown exists, the command SHALL fail with
`NO_SOURCE_MARKDOWN`.

#### Scenario: SCN-JSQ-SNAP-01 Existing raw baseline

- **WHEN** `raw` contains Markdown files and snapshot-only runs
- **THEN** state is written and `snapshot_only: true` appears in stdout JSON.

### Requirement: REQ-JSQ-POLLING Periodic checking is polling

`sqlite-sync` periodic checking SHALL be polling, not a filesystem watcher.

The system SHALL run once when `schedule.every_seconds` is null and `--every` is
absent. The system SHALL run repeated cycles in one process when
`schedule.every_seconds` or CLI `--every <seconds>` supplies a positive
interval.

#### Scenario: SCN-JSQ-POLL-01 One-shot default

- **WHEN** `every_seconds` is null and no `--every` option is passed
- **THEN** `sqlite-sync` runs one cycle and exits.
