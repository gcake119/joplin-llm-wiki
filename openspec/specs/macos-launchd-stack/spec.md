# macos-launchd-stack Specification

## Purpose

TBD - created by archiving change 'one-click-launchd-stack'. Update Purpose after archive.

## Requirements

### Requirement: REQ-MLS-LOCAL-ONLY Launchd stack preserves local-first boundaries

The system SHALL document and enforce that LaunchAgent definitions shipped for this capability only invoke locally installed programs (`node`, `pnpm`, `joplin`, `chroma` CLI as referenced in repository documentation) and the project CLI (`joplin-brain`). The system SHALL NOT configure LaunchAgents to start outbound HTTP listeners for joplin-brain, SHALL NOT add cloud vector database endpoints, and SHALL NOT bundle third-party SaaS credentials inside plist templates.

#### Scenario: Operator inspects plist template

- **WHEN** an operator opens the shipped LaunchAgent plist example under `scripts/launchd/`
- **THEN** the documented keys SHALL reference only local paths and standard launchd keys (for example `Label`, `WorkingDirectory`, `ProgramArguments`, `EnvironmentVariables`, `RunAtLoad`, `KeepAlive`, `StandardOutPath`, `StandardErrorPath`) and SHALL NOT declare `Sockets`, `inetd`-style listeners, or remote URLs as part of joplin-brain orchestration.


<!-- @trace
source: one-click-launchd-stack
updated: 2026-05-17
code:
  - scripts/launchd/run-ollama.sh
  - scripts/launchd/run-sqlite-sync.sh
  - scripts/launchd/README.md
  - scripts/launchd/run-chroma.sh
  - scripts/launchd/com.joplin-brain.chroma.plist.example
  - scripts/launchd/com.joplin-brain.sqlite-sync.plist.example
  - scripts/launchd/install-joplin-brain-stack.sh
  - README.md
  - docs/macos-launchd-stack.md
  - scripts/launchd/com.joplin-brain.ollama.plist.example
  - scripts/launchd/uninstall-joplin-brain-stack.sh
-->

---
### Requirement: REQ-MLS-LAUNCHD-ARTIFACTS Shipped plist and wrapper contracts

The system SHALL ship LaunchAgent property list templates and paired wrapper scripts under `scripts/launchd/` for **Ollama** (`ollama serve` as the default foreground command, operator-customizable via plist `ProgramArguments`), **Chroma** (`pnpm exec chroma run` with `WorkingDirectory` at the repository root and arguments consistent with `README.md` for loopback host, port, and persist path), and **`joplin-brain sqlite-sync`** with repository `WorkingDirectory`, non-empty per-job `Label`, and `ProgramArguments` that resolve `pnpm`, `ollama`, and the project CLI via absolute or PATH-safe means. Each plist template SHALL declare `StandardOutPath` and `StandardErrorPath` under the operator home directory or another documented location outside the git index. The `sqlite-sync` wrapper SHALL change to the repository root, optionally load a documented local non-committed env file, perform dependency readiness checks required by **REQ-MLS-FULL-STACK**, and execute `pnpm exec joplin-brain sqlite-sync` with a config path provided by the installer or operator.

#### Scenario: Template supports periodic sqlite-sync

- **WHEN** the operator sets `joplin_sqlite_sync.schedule.every_seconds` to a positive integer (for example **600** for a ten-minute cadence) or passes the CLI override for the same semantics, and launches the job using the shipped wrapper
- **THEN** the long-running `sqlite-sync` process SHALL remain compatible with the existing in-process scheduling loop (await between cycles) without requiring cron.


<!-- @trace
source: one-click-launchd-stack
updated: 2026-05-17
code:
  - scripts/launchd/run-ollama.sh
  - scripts/launchd/run-sqlite-sync.sh
  - scripts/launchd/README.md
  - scripts/launchd/run-chroma.sh
  - scripts/launchd/com.joplin-brain.chroma.plist.example
  - scripts/launchd/com.joplin-brain.sqlite-sync.plist.example
  - scripts/launchd/install-joplin-brain-stack.sh
  - README.md
  - docs/macos-launchd-stack.md
  - scripts/launchd/com.joplin-brain.ollama.plist.example
  - scripts/launchd/uninstall-joplin-brain-stack.sh
-->

---
### Requirement: REQ-MLS-FULL-STACK Full-stack launchd registers Ollama Chroma and bounded sqlite-sync readiness

The default one-click install documented for this capability SHALL register three LaunchAgents: Ollama server, Chroma server, and `joplin-brain sqlite-sync`, each with shipped plist examples. The `run-sqlite-sync.sh` wrapper SHALL probe readiness of the Ollama HTTP service and the Chroma HTTP endpoint using default base URLs `http://127.0.0.1:11434` and `http://127.0.0.1:8000` unless overridden by environment variables documented in `docs/macos-launchd-stack.md`. The wrapper SHALL retry until success or until a documented wall-clock timeout is exceeded; on timeout the wrapper SHALL print one actionable line to standard error and exit non-zero.

#### Scenario: Sqlite-sync starts after Ollama and Chroma accept connections

- **WHEN** Ollama and Chroma LaunchAgents are loaded and listening on the configured loopback ports and the operator loads the `sqlite-sync` LaunchAgent
- **THEN** the `run-sqlite-sync.sh` wrapper SHALL pass its readiness phase without exiting and SHALL execute `pnpm exec joplin-brain sqlite-sync` with the configured config path.

#### Scenario: Sqlite-sync surfaces timeout when Chroma never becomes reachable

- **WHEN** the Chroma process is not running or not listening on the configured Chroma port and the configured timeout elapses during readiness probes inside `run-sqlite-sync.sh`
- **THEN** the wrapper SHALL exit non-zero after writing at least one error line to standard error that names Chroma readiness failure so operators can inspect the `sqlite-sync` LaunchAgent error log.


<!-- @trace
source: one-click-launchd-stack
updated: 2026-05-17
code:
  - scripts/launchd/run-ollama.sh
  - scripts/launchd/run-sqlite-sync.sh
  - scripts/launchd/README.md
  - scripts/launchd/run-chroma.sh
  - scripts/launchd/com.joplin-brain.chroma.plist.example
  - scripts/launchd/com.joplin-brain.sqlite-sync.plist.example
  - scripts/launchd/install-joplin-brain-stack.sh
  - README.md
  - docs/macos-launchd-stack.md
  - scripts/launchd/com.joplin-brain.ollama.plist.example
  - scripts/launchd/uninstall-joplin-brain-stack.sh
-->

---
### Requirement: REQ-MLS-INSTALL-UNINSTALL One-step install and uninstall scripts

The system SHALL provide an install shell script under `scripts/launchd/` that copies or links **all** LaunchAgent plists in the **full-stack** operator path (Ollama, Chroma, and `sqlite-sync`) into `${HOME}/Library/LaunchAgents/`, substitutes operator-specific placeholders (including repository root, config absolute path, and unique `Label` for each job), and loads **each** agent using `launchctl bootstrap gui/$(id -u)` or a documented equivalent for the target macOS version. The system SHALL provide an uninstall shell script that unloads **each** registered job using `launchctl bootout` or documented equivalent and removes **all** corresponding plist files from `${HOME}/Library/LaunchAgents/`. Both scripts SHALL exit non-zero on failure and SHALL print actionable error messages to standard error. The documentation MAY describe a reduced install path that registers only `sqlite-sync` for advanced troubleshooting, but the default documented one-click flow SHALL include Ollama and Chroma as specified in **REQ-MLS-FULL-STACK**.

#### Scenario: Install then uninstall leaves no loaded job

- **WHEN** the operator runs the install script successfully for the full-stack path, confirms the jobs are loaded, then runs the uninstall script
- **THEN** every previously installed `Label` for Ollama, Chroma, and `sqlite-sync` SHALL no longer appear as active GUI LaunchAgents for that user and every plist file SHALL be removed from `${HOME}/Library/LaunchAgents/` when the uninstall script completes successfully.


<!-- @trace
source: one-click-launchd-stack
updated: 2026-05-17
code:
  - scripts/launchd/run-ollama.sh
  - scripts/launchd/run-sqlite-sync.sh
  - scripts/launchd/README.md
  - scripts/launchd/run-chroma.sh
  - scripts/launchd/com.joplin-brain.chroma.plist.example
  - scripts/launchd/com.joplin-brain.sqlite-sync.plist.example
  - scripts/launchd/install-joplin-brain-stack.sh
  - README.md
  - docs/macos-launchd-stack.md
  - scripts/launchd/com.joplin-brain.ollama.plist.example
  - scripts/launchd/uninstall-joplin-brain-stack.sh
-->

---
### Requirement: REQ-MLS-OBSERVABILITY Logging locations and Joplin CLI PATH

The system SHALL document how operators ensure the Joplin CLI used for write-back is discoverable under launchd (for example by setting `PATH` in `EnvironmentVariables` in the plist or exporting it in each wrapper script). The operator guide SHALL require that stdout and stderr from **`sqlite-sync`** are captured using `StandardOutPath` and `StandardErrorPath`, and SHALL require the same for **Ollama** and **Chroma** jobs in the full-stack path, so periodic JSON summaries from `cmd-sqlite-sync` and server startup diagnostics remain available for troubleshooting.

#### Scenario: Write-back prerequisites are visible to operators

- **WHEN** an operator enables Joplin CLI write-back in configuration (`joplin_wiki_writeback` enabled and `joplin_cli.enabled: true`)
- **THEN** the macOS launchd documentation shipped in `docs/macos-launchd-stack.md` SHALL explicitly require that the resolved `joplin_cli.command` binary is reachable in the LaunchAgent environment and SHALL describe how to validate this with a non-interactive command from the same wrapper prior to relying on scheduled write-back.


<!-- @trace
source: one-click-launchd-stack
updated: 2026-05-17
code:
  - scripts/launchd/run-ollama.sh
  - scripts/launchd/run-sqlite-sync.sh
  - scripts/launchd/README.md
  - scripts/launchd/run-chroma.sh
  - scripts/launchd/com.joplin-brain.chroma.plist.example
  - scripts/launchd/com.joplin-brain.sqlite-sync.plist.example
  - scripts/launchd/install-joplin-brain-stack.sh
  - README.md
  - docs/macos-launchd-stack.md
  - scripts/launchd/com.joplin-brain.ollama.plist.example
  - scripts/launchd/uninstall-joplin-brain-stack.sh
-->

---
### Requirement: REQ-MLS-DOC User guide links prerequisites

The system SHALL add or extend documentation file `docs/macos-launchd-stack.md` describing prerequisites (Ollama and Chroma binaries installed per upstream instructions, Joplin Desktop SQLite path alignment), the **default full-stack** launchd layout (Ollama + Chroma + `sqlite-sync`), suggested log directories for all three jobs, rollback steps that unload every installed plist without deleting Joplin profiles, and upgrade notes when bootstrap verbs differ across macOS versions. The guide SHALL state that on a typical Joplin Desktop install using the default configuration directory layout, the notebook database file is located at **`~/.config/joplin-desktop/database.sqlite`**, and operators SHALL set `joplin_sqlite_sync.database_path` to the absolute path of that file (or to the correct path when using a non-default profile location). The system SHALL add a short pointer from `README.md` to this guide.

#### Scenario: README points to launchd guide

- **WHEN** a maintainer completes documentation tasks for this change
- **THEN** `README.md` SHALL contain a link or section reference to `docs/macos-launchd-stack.md` so operators can discover the launchd workflow from the project entrypoint.

#### Scenario: Default Joplin Desktop database path is documented for operators

- **WHEN** an operator reads `docs/macos-launchd-stack.md` to configure `joplin-brain` against Joplin Desktop
- **THEN** the guide SHALL name **`~/.config/joplin-desktop/database.sqlite`** as the conventional default location for `database.sqlite` under the default profile layout and SHALL instruct the operator to copy that path as an absolute `joplin_sqlite_sync.database_path` value unless their installation uses a different profile directory.

<!-- @trace
source: one-click-launchd-stack
updated: 2026-05-17
code:
  - scripts/launchd/run-ollama.sh
  - scripts/launchd/run-sqlite-sync.sh
  - scripts/launchd/README.md
  - scripts/launchd/run-chroma.sh
  - scripts/launchd/com.joplin-brain.chroma.plist.example
  - scripts/launchd/com.joplin-brain.sqlite-sync.plist.example
  - scripts/launchd/install-joplin-brain-stack.sh
  - README.md
  - docs/macos-launchd-stack.md
  - scripts/launchd/com.joplin-brain.ollama.plist.example
  - scripts/launchd/uninstall-joplin-brain-stack.sh
-->