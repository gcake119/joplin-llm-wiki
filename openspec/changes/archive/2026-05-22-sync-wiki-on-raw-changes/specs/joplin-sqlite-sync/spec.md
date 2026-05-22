## MODIFIED Requirements

### Requirement: REQ-JSQ-CONFIG Configuration surface

The system SHALL extend `config.yaml` with a `joplin_sqlite_sync` mapping containing at least:

| Key | Type | Default | Required when enabled |
| --- | ---- | ------- | ---------------------- |
| `enabled` | boolean | false | — |
| `database_path` | string | — | required |
| `export_root` | string | `""` | — |
| `reconcile_mode` | string enum | `mirror` | — |
| `busy_timeout_ms` | integer | 5000 | — |
| `max_export_attempts` | integer | 5 | — |
| `pipeline.compile_mode` | string enum `local`, `agent`, `off` | derived from `pipeline.run_wiki_compile` | — |
| `pipeline.run_wiki_compile` | boolean | true | legacy compatibility only |
| `schedule.every_seconds` | integer or null | null | — |

The system SHALL resolve relative `database_path` values relative to the config file directory, identical to `raw` resolution.

The system SHALL treat `export_root` equal to `""` as "use `raw` as the export directory".

The system SHALL reject invalid combinations at config load time with `CONFIG_INVALID` when `enabled` is true and `database_path` is missing or empty.

The system SHALL reject configuration where resolved `export_root` is not identical to resolved `raw` after path normalization.

The system SHALL reject `pipeline.compile_mode` values other than `local`, `agent`, and `off` with `CONFIG_INVALID`.

When `pipeline.compile_mode` is absent, the system SHALL derive it from legacy `pipeline.run_wiki_compile`: `true` resolves to `local`, and `false` resolves to `off`.

When both `pipeline.compile_mode` and `pipeline.run_wiki_compile` are present, the system SHALL use `pipeline.compile_mode` as the authoritative value.

#### Scenario: SCN-JSQ-CFG-01 Missing database path fails fast

- **WHEN** `joplin_sqlite_sync.enabled` is true
- **AND** `database_path` is empty
- **THEN** config loading SHALL fail with `CONFIG_INVALID`

##### Example: relative database path resolution

- **GIVEN** config file `/repo/my.config.yaml` sets `database_path: joplin/database.sqlite`
- **WHEN** the loader resolves paths
- **THEN** the resolved database path SHALL be `/repo/joplin/database.sqlite`

#### Scenario: SCN-JSQ-CFG-02 Compile mode accepts fixed enum values

- **WHEN** `joplin_sqlite_sync.pipeline.compile_mode` is `local`, `agent`, or `off`
- **THEN** config loading SHALL succeed and expose that resolved compile mode to `sqlite-sync`

#### Scenario: SCN-JSQ-CFG-03 Invalid compile mode fails fast

- **WHEN** `joplin_sqlite_sync.pipeline.compile_mode` is `shell`
- **THEN** config loading SHALL fail with `CONFIG_INVALID`

#### Scenario: SCN-JSQ-CFG-04 Legacy run_wiki_compile maps to compile mode

- **WHEN** `pipeline.compile_mode` is absent
- **AND** `pipeline.run_wiki_compile` is `true`
- **THEN** the resolved compile mode SHALL be `local`
- **WHEN** `pipeline.compile_mode` is absent
- **AND** `pipeline.run_wiki_compile` is `false`
- **THEN** the resolved compile mode SHALL be `off`

### Requirement: REQ-JSQ-PIPELINE-ORDER Orchestration order and failure gating

When `joplin_sqlite_sync.enabled` is false, the `sqlite-sync` command SHALL exit 0 without writing files and without running downstream pipelines, emitting a machine-readable "skipped" status on stdout.

When `enabled` is true, the system SHALL execute steps in order:

1. Export Markdown files, including reconcile when configured.
2. Build a raw Markdown snapshot for files exported in the current successful cycle.
3. Compare the current snapshot with the previous persisted snapshot state.
4. Persist the current snapshot state when the command is not a dry-run.
5. If raw Markdown changed and resolved `pipeline.compile_mode` is `local`, run the existing `wiki-compile` command runtime.
6. If raw Markdown changed and resolved `pipeline.compile_mode` is `agent`, run the existing `agent-compile` command runtime.
7. If raw Markdown did not change or resolved `pipeline.compile_mode` is `off`, skip compile.

If export fails, the system SHALL NOT update snapshot state and SHALL NOT execute any compile step.

If snapshot state cannot be written after a successful non-dry-run export, the system SHALL fail the invocation with a stable state I/O error and SHALL NOT execute any compile step.

Failures from downstream compile steps SHALL preserve existing error codes. The local compile path SHALL preserve `wiki-compile` errors. The agent compile path SHALL preserve `CODEX_CLI_UNAVAILABLE`, `CODEX_USAGE_LIMIT`, and `AGENT_COMPILE_FAILED`.

#### Scenario: SCN-JSQ-PIPE-01 Export failure skips state and compile

- **WHEN** export terminates with `SQLITE_EXPORT_FAILED`
- **THEN** snapshot state SHALL NOT be updated
- **AND** no compile runner SHALL start in that invocation

#### Scenario: SCN-JSQ-PIPE-02 Changed raw triggers local compile

- **WHEN** a successful non-dry-run export detects at least one added, updated, or deleted exported Markdown file
- **AND** resolved `pipeline.compile_mode` is `local`
- **THEN** the system SHALL run `wiki-compile` once for that invocation

#### Scenario: SCN-JSQ-PIPE-03 Changed raw triggers agent compile

- **WHEN** a successful non-dry-run export detects at least one added, updated, or deleted exported Markdown file
- **AND** resolved `pipeline.compile_mode` is `agent`
- **THEN** the system SHALL run `agent-compile` once for that invocation

#### Scenario: SCN-JSQ-PIPE-04 Unchanged raw skips compile

- **WHEN** a successful non-dry-run export detects no added, updated, or deleted exported Markdown file
- **THEN** the system SHALL skip local compile and agent compile for that invocation

##### Example: unchanged snapshot

- **GIVEN** previous snapshot contains `a.md` with Joplin note id `note-a` and SHA-256 hash `hash-a`
- **AND** current snapshot contains `a.md` with Joplin note id `note-a` and SHA-256 hash `hash-a`
- **WHEN** the export cycle reaches compile decision
- **THEN** `raw_changed` SHALL be false
- **AND** `compile_triggered` SHALL be false

#### Scenario: SCN-JSQ-PIPE-05 Off mode skips compile even when raw changed

- **WHEN** a successful non-dry-run export detects at least one raw Markdown change
- **AND** resolved `pipeline.compile_mode` is `off`
- **THEN** the system SHALL skip local compile and agent compile for that invocation

### Requirement: REQ-JSQ-SCHEDULE Optional periodic re-run in-process

When `schedule.every_seconds` is null and the operator does not pass a CLI override, the system SHALL run a single export, raw change detection, and conditional compile cycle, then exit.

When `schedule.every_seconds` is a positive integer, the system SHALL repeat the cycle indefinitely with an interval of that many seconds until the process receives SIGINT or SIGTERM, where each cycle starts only after the previous cycle completes.

The system SHALL log each completed cycle summary to stdout as one JSON line per cycle.

The summary SHALL include `raw_changed`, `change_detection`, `changed_files`, `compile_mode`, and `compile_triggered`.

#### Scenario: SCN-JSQ-SCH-01 Interval mode runs at least twice

- **GIVEN** `schedule.every_seconds` is 3600
- **WHEN** the operator starts the command and the first two cycles complete successfully
- **THEN** stdout SHALL contain at least two JSON summary lines with monotonically increasing cycle counters

#### Scenario: SCN-JSQ-SCH-02 Summary exposes compile decision

- **WHEN** a scheduled cycle completes successfully
- **THEN** the JSON summary SHALL include `raw_changed`, `change_detection`, `changed_files`, `compile_mode`, and `compile_triggered`

## ADDED Requirements

### Requirement: REQ-JSQ-RAW-CHANGE-DETECTION Raw snapshot change detection

The system SHALL persist a JSON snapshot state for successful non-dry-run `sqlite-sync` exports outside the `raw` directory.

The snapshot state SHALL record at minimum `schema_version`, `updated_at_ms`, the resolved export root, and one entry per exported Markdown file keyed by raw-relative path. Each file entry SHALL record the Joplin note id and a SHA-256 content hash.

The system SHALL classify a raw Markdown file as added when its raw-relative path exists in the current snapshot and not in the previous snapshot.

The system SHALL classify a raw Markdown file as updated when its raw-relative path exists in both snapshots and either the Joplin note id or SHA-256 content hash differs.

The system SHALL classify a raw Markdown file as deleted when its raw-relative path exists in the previous snapshot and not in the current snapshot.

When no previous valid snapshot state exists, the system SHALL establish a baseline snapshot, report `change_detection: "baseline"`, report `raw_changed: false`, and skip compile for that invocation.

When the operator invokes `sqlite-sync --snapshot-only`, the system SHALL scan existing Markdown files under the configured `raw` directory using `raw_glob`, persist a baseline snapshot state, report `change_detection: "snapshot_created"`, report `snapshot_only: true`, and skip compile for that invocation.

When the operator invokes `sqlite-sync --snapshot-only`, the system SHALL NOT open Joplin SQLite, SHALL NOT export notes, and SHALL NOT delete files from `raw`.

When the operator invokes `sqlite-sync --snapshot-only` and no Markdown files match `raw_glob`, the system SHALL fail with `NO_SOURCE_MARKDOWN` and SHALL NOT write snapshot state.

Dry-run invocations SHALL read existing snapshot state for comparison, SHALL report `change_detection: "dry_run"`, SHALL NOT persist snapshot state, and SHALL NOT trigger compile.

#### Scenario: SCN-JSQ-RCD-01 First successful export establishes baseline

- **WHEN** `sqlite-sync` completes a successful non-dry-run export and no previous valid snapshot state exists
- **THEN** the system SHALL persist the current snapshot state
- **AND** stdout summary SHALL report `change_detection: "baseline"`
- **AND** stdout summary SHALL report `compile_triggered: false`

#### Scenario: SCN-JSQ-RCD-02 Added markdown is detected

- **GIVEN** previous snapshot state contains `a.md`
- **WHEN** current snapshot contains `a.md` and `b.md`
- **THEN** `changed_files.added` SHALL equal 1
- **AND** `raw_changed` SHALL be true

#### Scenario: SCN-JSQ-RCD-03 Updated markdown is detected

- **GIVEN** previous snapshot state contains `a.md` with SHA-256 hash `old`
- **WHEN** current snapshot contains `a.md` with SHA-256 hash `new`
- **THEN** `changed_files.updated` SHALL equal 1
- **AND** `raw_changed` SHALL be true

#### Scenario: SCN-JSQ-RCD-04 Deleted markdown is detected

- **GIVEN** previous snapshot state contains `a.md` and `b.md`
- **WHEN** current snapshot contains only `a.md`
- **THEN** `changed_files.deleted` SHALL equal 1
- **AND** `raw_changed` SHALL be true

#### Scenario: SCN-JSQ-RCD-05 Dry run does not persist state

- **WHEN** `sqlite-sync --dry-run` computes raw changes against an existing snapshot
- **THEN** the system SHALL NOT write snapshot state
- **AND** the system SHALL NOT trigger local compile or agent compile

#### Scenario: SCN-JSQ-RCD-06 Snapshot-only establishes baseline from existing raw

- **GIVEN** configured `raw` contains `notes/a.md`
- **WHEN** the operator runs `sqlite-sync --snapshot-only`
- **THEN** the system SHALL persist snapshot state containing `notes/a.md`
- **AND** stdout summary SHALL report `change_detection: "snapshot_created"`
- **AND** stdout summary SHALL report `snapshot_only: true`
- **AND** stdout summary SHALL report `compile_triggered: false`

#### Scenario: SCN-JSQ-RCD-07 Snapshot-only does not touch SQLite or raw files

- **WHEN** the operator runs `sqlite-sync --snapshot-only`
- **THEN** the system SHALL NOT open the configured Joplin SQLite database
- **AND** the system SHALL NOT export notes
- **AND** the system SHALL NOT delete Markdown files from `raw`

#### Scenario: SCN-JSQ-RCD-08 Snapshot-only rejects empty raw

- **GIVEN** configured `raw` contains no Markdown matching `raw_glob`
- **WHEN** the operator runs `sqlite-sync --snapshot-only`
- **THEN** the command SHALL fail with `NO_SOURCE_MARKDOWN`
- **AND** the system SHALL NOT write snapshot state

### Requirement: REQ-JSQ-AGENT-COMPILE-ORCHESTRATION Agent compile as a fixed sqlite-sync downstream mode

When resolved `joplin_sqlite_sync.pipeline.compile_mode` is `agent`, `sqlite-sync` SHALL invoke the same command runtime used by the `agent-compile` CLI command after a successful export detects raw Markdown changes.

The system SHALL NOT implement agent mode by accepting or executing an arbitrary shell command from config.

The system SHALL preserve existing `agent-compile` behavior: it SHALL use local `codex exec`, SHALL read raw Markdown sources, SHALL write only allowed wiki Markdown paths, and SHALL run enabled wiki writeback after successful compile.

#### Scenario: SCN-JSQ-ACO-01 Agent mode uses fixed command runtime

- **WHEN** resolved `pipeline.compile_mode` is `agent`
- **AND** raw Markdown changes are detected
- **THEN** `sqlite-sync` SHALL invoke the existing `agent-compile` command runtime once
- **AND** it SHALL NOT evaluate a shell command string from config

#### Scenario: SCN-JSQ-ACO-02 Agent failure preserves existing error families

- **WHEN** the agent compile runtime fails with a Codex CLI unavailable, usage limit, or incomplete compile condition
- **THEN** `sqlite-sync` SHALL surface the corresponding `CODEX_CLI_UNAVAILABLE`, `CODEX_USAGE_LIMIT`, or `AGENT_COMPILE_FAILED` error code
