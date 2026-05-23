# macos-launchd-stack Specification

## Purpose

The launchd stack starts local Ollama and `joplin-llm-wiki sqlite-sync` on
macOS. Chroma is no longer part of the stack.

## Requirements

### Requirement: REQ-MLS-LOCAL-ONLY LaunchAgents stay local

LaunchAgent templates shipped for this capability SHALL only invoke locally
installed programs and the project CLI.

The stack SHALL NOT configure Chroma, vector databases, public HTTP listeners,
cloud endpoints, or bundled third-party SaaS credentials.

#### Scenario: SCN-MLS-LOCAL-01 Local programs only

- **WHEN** an operator installs the stack
- **THEN** installed jobs are limited to Ollama and `sqlite-sync`.

---
### Requirement: REQ-MLS-PLISTS Ollama and sqlite-sync plist templates

The system SHALL ship LaunchAgent property list templates and paired wrapper
scripts under `scripts/launchd/` for:

- Ollama (`ollama serve`)
- `joplin-llm-wiki sqlite-sync`

The `sqlite-sync` wrapper SHALL change to the repository root, optionally load a
non-committed `.env.launchd`, resolve the configured `compile_mode`, wait for
Ollama readiness only when `compile_mode` is `local`, and execute
`pnpm exec joplin-llm-wiki sqlite-sync`.

#### Scenario: SCN-MLS-PLIST-01 Sqlite-sync skips Ollama for agent/off

- **WHEN** resolved `compile_mode` is `agent` or `off`
- **THEN** the wrapper does not wait for Ollama readiness before starting
  `sqlite-sync`.

---
### Requirement: REQ-MLS-INSTALL Install and uninstall scripts

The system SHALL provide install and uninstall shell scripts under
`scripts/launchd/` that write or remove only the Ollama and sqlite-sync plist
files under `${HOME}/Library/LaunchAgents/`.

The scripts SHALL use modern `launchctl bootstrap` / `bootout` semantics where
available and SHALL print actionable errors on failure.

#### Scenario: SCN-MLS-UNINSTALL-01 Removes installed jobs

- **WHEN** the uninstall script completes successfully
- **THEN** Ollama and sqlite-sync LaunchAgent plist files from this stack are
  removed and their jobs are unloaded.

---
### Requirement: REQ-MLS-DOCS Documentation and scheduling semantics

`docs/macos-launchd-stack.md` SHALL document that the stack contains Ollama plus
sqlite-sync, that sqlite-sync periodic checking is polling rather than a file
watcher, and that operators SHOULD NOT combine plist `StartInterval` with a
non-null `joplin_sqlite_sync.schedule.every_seconds`.

The guide SHALL document that `compile_mode: local` waits for Ollama,
`compile_mode: agent` requires an interactive local Codex CLI login, and
`compile_mode: off` only exports/snapshots raw.

#### Scenario: SCN-MLS-DOCS-01 No Chroma docs

- **WHEN** the launchd guide describes prerequisites and jobs
- **THEN** it does not instruct the operator to install or start Chroma.

---
### Requirement: sqlite-sync LaunchAgent restarts on non-zero exit with throttle

The macOS LaunchAgent template for `sqlite-sync` SHALL include launchd restart configuration that restarts the job after non-zero exits and does not restart the job after successful exits.

The LaunchAgent template SHALL include a throttle interval to prevent high-frequency restart loops when configuration or dependencies remain invalid.

#### Scenario: plist contains non-zero-exit restart policy

- **WHEN** the repository sqlite-sync LaunchAgent plist template is rendered or installed
- **THEN** the plist SHALL contain a `KeepAlive` dictionary
- **AND** `KeepAlive.SuccessfulExit` SHALL be false
- **AND** the plist SHALL contain `ThrottleInterval` with a positive integer value

#### Scenario: successful one-shot exit does not loop

- **GIVEN** `joplin_sqlite_sync.schedule.every_seconds` is null
- **AND** the sqlite-sync command exits with code 0 after one successful cycle
- **WHEN** launchd evaluates the job exit
- **THEN** the LaunchAgent restart policy SHALL NOT request an immediate restart due to successful exit

#### Scenario: failed dependency triggers throttled retry

- **GIVEN** the sqlite-sync command exits non-zero because Joplin Data API preflight fails
- **WHEN** launchd evaluates the job exit
- **THEN** the LaunchAgent restart policy SHALL request a restart
- **AND** launchd SHALL apply the configured throttle interval before repeated restarts


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
### Requirement: LaunchAgent scheduling documentation avoids double scheduling

The macOS launchd documentation SHALL explain the relationship between in-process polling and LaunchAgent restart policy.

The documentation SHALL state that `schedule.every_seconds` or CLI `--every` controls normal polling cadence, while LaunchAgent restart policy is a recovery mechanism for non-zero process exits.

The documentation SHALL warn operators not to combine a plist `StartInterval` with non-null `schedule.every_seconds` unless they intentionally accept overlapping schedule risk.

#### Scenario: operator reads scheduling guidance

- **WHEN** an operator reads the macOS launchd stack documentation
- **THEN** the documentation SHALL identify in-process polling as the normal automatic update mechanism
- **AND** the documentation SHALL identify non-zero-exit KeepAlive as failure recovery
- **AND** the documentation SHALL warn against unintentional double scheduling with `StartInterval`


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
### Requirement: sqlite-sync LaunchAgent readiness follows compile mode

The sqlite-sync LaunchAgent wrapper SHALL determine the resolved `joplin_sqlite_sync.pipeline.compile_mode` from the configured YAML before applying Ollama readiness checks.

When resolved `compile_mode` is `agent`, the wrapper SHALL NOT wait for or probe `ollama.base_url` before starting `sqlite-sync`.

When resolved `compile_mode` is `local`, the wrapper SHALL wait for the configured Ollama endpoint before starting `sqlite-sync`, preserving the local compile startup guard.

When resolved `compile_mode` is `off`, the wrapper SHALL NOT wait for or probe `ollama.base_url` before starting `sqlite-sync`.

#### Scenario: agent mode skips Ollama readiness

- **GIVEN** the configured YAML resolves `joplin_sqlite_sync.pipeline.compile_mode` to `agent`
- **AND** `ollama.base_url` is unreachable
- **WHEN** the sqlite-sync LaunchAgent wrapper starts
- **THEN** the wrapper SHALL NOT wait for Ollama readiness
- **AND** the wrapper SHALL execute the sqlite-sync command

#### Scenario: local mode waits for Ollama readiness

- **GIVEN** the configured YAML resolves `joplin_sqlite_sync.pipeline.compile_mode` to `local`
- **AND** `ollama.base_url` is unreachable
- **WHEN** the sqlite-sync LaunchAgent wrapper starts
- **THEN** the wrapper SHALL wait for Ollama readiness until the configured timeout
- **AND** the wrapper SHALL exit non-zero if Ollama remains unreachable until timeout

#### Scenario: off mode skips Ollama readiness

- **GIVEN** the configured YAML resolves `joplin_sqlite_sync.pipeline.compile_mode` to `off`
- **AND** `ollama.base_url` is unreachable
- **WHEN** the sqlite-sync LaunchAgent wrapper starts
- **THEN** the wrapper SHALL NOT wait for Ollama readiness
- **AND** the wrapper SHALL execute the sqlite-sync command


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
### Requirement: LaunchAgent restart preserves local-only execution

LaunchAgent restart configuration SHALL NOT add remote network services, remote schedulers, cloud credentials, or non-local executables.

The job SHALL continue to execute the local shim and local project CLI only.

#### Scenario: plist remains local-only after restart changes

- **WHEN** the sqlite-sync LaunchAgent plist is inspected
- **THEN** `ProgramArguments` SHALL still point to the local repository shim and run script
- **AND** environment variables SHALL NOT include Joplin token values
- **AND** the plist SHALL NOT define remote service endpoints beyond existing local PATH and config path values

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