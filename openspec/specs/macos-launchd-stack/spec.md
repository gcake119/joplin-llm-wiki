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
