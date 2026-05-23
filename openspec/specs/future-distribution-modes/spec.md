# future-distribution-modes Specification

## Purpose

Future distribution work may package the current local raw/wiki pipeline as a
Joplin Desktop plugin or a Homebrew-distributed CLI/app. These are roadmap
directions only; the existing pnpm CLI remains the baseline until a separate
Spectra change says otherwise.

## Requirements

### Requirement: REQ-DIST-PARK Current CLI path remains supported

Any future plugin or Homebrew packaging work SHALL NOT remove or break the
current `pnpm exec joplin-llm-wiki ...` development and operator path without a
separate proposal and migration plan.

#### Scenario: SCN-DIST-PARK-01 Existing CLI preserved

- **WHEN** a distribution change is proposed
- **THEN** it documents how existing `sqlite-sync`, `wiki-compile`,
  `agent-compile`, `query`, and `lint` CLI workflows remain available or are
  migrated.

### Requirement: REQ-DIST-CORE Core/host boundary

Future packaging SHOULD keep domain logic callable from host-specific shells:
configuration loading, SQLite export, raw snapshot comparison, wiki compile,
agent compile, filesystem query, lint, and Joplin Data API writeback.

Host layers SHALL own path selection, process spawning, Joplin/Electron
integration, and local service lifecycle policy.

#### Scenario: SCN-DIST-CORE-01 Host calls core workflow

- **WHEN** a plugin or packaged app triggers a raw/wiki pipeline
- **THEN** it calls the same core workflow semantics as the CLI instead of
  inventing a separate data model.

### Requirement: REQ-DIST-LOCAL-FIRST Local-first privacy baseline

Future distribution modes SHALL preserve the local-first default: notes and
compiled wiki files remain on the operator workstation.

The default model route SHALL remain local Ollama for `wiki-compile`; the Codex
route SHALL remain explicit `agent-compile` through a locally authenticated
`codex exec`, not an OpenAI API-key provider.

#### Scenario: SCN-DIST-LOCAL-01 No default cloud upload

- **WHEN** an operator installs a future packaged app with default settings
- **THEN** it does not upload notes or compiled wiki content to a third-party
  service.

### Requirement: REQ-DIST-TRACK-A Joplin plugin considerations

A future Joplin plugin design SHALL address UI thread isolation, long-running
task cancellation/progress, Data API or Plugin API writeback boundaries, and
how Ollama or Codex CLI availability is detected.

#### Scenario: SCN-DIST-PLUGIN-01 Long tasks isolated

- **WHEN** a plugin design runs `wiki-compile` or `agent-compile`
- **THEN** it documents how the work avoids blocking the Joplin UI thread.

### Requirement: REQ-DIST-TRACK-B Homebrew considerations

A future Homebrew design SHALL document how the CLI binary, optional GUI app,
launchd files, Node runtime, and local Ollama dependency are installed or
discovered.

#### Scenario: SCN-DIST-BREW-01 Runtime documented

- **WHEN** a Homebrew packaging proposal is opened
- **THEN** it names how `joplin-llm-wiki` is invoked without assuming a repo-local
  `pnpm install`.
