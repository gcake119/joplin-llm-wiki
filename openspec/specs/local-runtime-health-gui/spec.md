# local-runtime-health-gui Specification

## Purpose

The Health GUI is a local Electron operator surface for configuration, health
checks, notebook selection, raw/wiki pipeline actions, query, lint, and
LaunchAgent management. It follows the current filesystem pipeline and no
longer manages Chroma.

## Requirements

### Requirement: REQ-HGUI-HEALTH Health snapshot covers current dependencies

The Health GUI SHALL load the configured YAML through `loadConfig` and render
resolved `raw`, `wiki`, and Ollama chat-model health.

The health snapshot SHALL probe Ollama through `{ollama.base_url}/api/tags` and
SHALL compute missing models only for `ollama.chat_model`.

The Health GUI SHALL NOT probe or display Chroma health.

#### Scenario: SCN-HGUI-HEALTH-01 Ollama only

- **WHEN** the operator refreshes health
- **THEN** the UI displays raw root, wiki root, Ollama reachability, and missing
  chat model information.

### Requirement: REQ-HGUI-CONFIG Config editing uses current keys

The Health GUI SHALL expose current MVP fields for `raw`, `wiki`,
`ollama.base_url`, `ollama.chat_model`, Joplin Data API, and
`joplin_wiki_writeback.enabled`.

When saving through repair/field mode, the GUI SHALL remove legacy keys such as
`notes_root`, `wiki_root`, `chroma`, `rag`, `watch`, `chunk`,
`ollama.embed_model`, `ollama.embed_batch_size`, and
`joplin_sqlite_sync.pipeline.run_index`.

#### Scenario: SCN-HGUI-CONFIG-01 Repair removes legacy keys

- **WHEN** a legacy config is opened and saved through the GUI
- **THEN** the saved YAML uses `raw`/`wiki` and omits legacy vector keys.

### Requirement: REQ-HGUI-NOTEBOOKS Notebook selection uses sqlite-sync

The Health GUI SHALL list notebooks through the fixed CLI path
`sqlite-sync --list-notebooks-json=true` and SHALL save selected notebook ids
into `joplin_sqlite_sync.notebook_filter`.

#### Scenario: SCN-HGUI-NB-01 Notebook ids saved

- **WHEN** the operator selects notebooks and saves
- **THEN** config contains `notebook_filter.enabled: true` and the selected
  `include_notebook_ids`.

### Requirement: REQ-HGUI-PIPELINE Raw/wiki pipeline actions

The Health GUI SHALL provide fixed handlers for:

- initialization pipeline
- corpus pipeline
- `sqlite-sync --snapshot-only`
- query
- lint
- LaunchAgent install/uninstall

Pipeline actions SHALL call whitelisted `joplin-llm-wiki` subcommands only:
`sqlite-sync`, `wiki-compile`, `agent-compile`, `query`, and `lint`.

The GUI SHALL guard long-running pipeline actions with a single in-flight
operation lock.

#### Scenario: SCN-HGUI-PIPE-01 Snapshot handler

- **WHEN** the operator runs snapshot-only from the Pipeline tab
- **THEN** the main process spawns `pnpm exec joplin-llm-wiki sqlite-sync
  --config <absConfigPath> --snapshot-only`.

### Requirement: REQ-HGUI-CLI-TAB-COVERAGE Major CLI workflows are reachable

The Health GUI SHALL provide operator-visible tabs for health/config inspection,
configuration editing, notebook selection, raw/wiki pipeline, query, lint, and
LaunchAgent management.

The GUI SHALL use fixed IPC handlers for Query, Lint, and snapshot-only rather
than a generic unrestricted command runner.

#### Scenario: SCN-HGUI-TABS-01 Current tabs

- **WHEN** the GUI starts
- **THEN** the operator can reach Health, Config, Notebooks, Pipeline, Query,
  Lint, and LaunchAgent workflows.

### Requirement: REQ-HGUI-LOCAL-DEPS Start Ollama only

The Health GUI MAY offer a button to start local `ollama serve` as a detached
dependency.

The Health GUI SHALL NOT offer a Chroma start button.

#### Scenario: SCN-HGUI-DEPS-01 Start Ollama

- **WHEN** the operator confirms starting Ollama
- **THEN** the GUI starts the local Ollama process and polls health until
  Ollama becomes reachable or polling times out.
