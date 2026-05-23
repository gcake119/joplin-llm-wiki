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

---
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

---
### Requirement: REQ-HGUI-NOTEBOOKS Notebook selection uses sqlite-sync

The Health GUI SHALL list notebooks through the fixed CLI path
`sqlite-sync --list-notebooks-json=true` and SHALL save selected notebook ids
into `joplin_sqlite_sync.notebook_filter`.

#### Scenario: SCN-HGUI-NB-01 Notebook ids saved

- **WHEN** the operator selects notebooks and saves
- **THEN** config contains `notebook_filter.enabled: true` and the selected
  `include_notebook_ids`.

---
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

---
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

---
### Requirement: REQ-HGUI-LOCAL-DEPS Start Ollama only

The Health GUI MAY offer a button to start local `ollama serve` as a detached
dependency.

The Health GUI SHALL NOT offer a Chroma start button.

#### Scenario: SCN-HGUI-DEPS-01 Start Ollama

- **WHEN** the operator confirms starting Ollama
- **THEN** the GUI starts the local Ollama process and polls health until
  Ollama becomes reachable or polling times out.

---
### Requirement: Joplin-LLM-wiki tool visible identity

The local Electron operator surface SHALL display the product name `Joplin-LLM-wiki tool` in the window title and primary UI heading.

Existing executable names and internal source directory names SHALL remain compatible unless a separate migration explicitly changes them.

#### Scenario: SCN-HGUI-RENAME-01 Visible GUI name changes without executable rename

- **WHEN** the GUI starts
- **THEN** the window title contains `Joplin-LLM-wiki tool`
- **AND** the main UI heading contains `Joplin-LLM-wiki tool`
- **AND** the existing GUI executable remains callable.


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
### Requirement: Concept resume actions in GUI

The GUI SHALL expose fixed operator actions for local concept resume dry-run, local concept resume run, agent concept resume dry-run, and agent concept resume run.

The concept resume dry-run action SHALL spawn `pnpm exec joplin-llm-wiki wiki-compile --config <absConfigPath> --resume-stage concepts --dry-run`. The concept resume run action SHALL spawn `pnpm exec joplin-llm-wiki wiki-compile --config <absConfigPath> --resume-stage concepts`.

The agent concept resume dry-run action SHALL spawn `pnpm exec joplin-llm-wiki agent-compile --config <absConfigPath> --resume-stage concepts --dry-run`. The agent concept resume run action SHALL spawn `pnpm exec joplin-llm-wiki agent-compile --config <absConfigPath> --resume-stage concepts`.

#### Scenario: SCN-HGUI-CONCEPT-ACTIONS-01 Concept buttons spawn fixed argv

- **WHEN** the operator starts concept resume dry-run from the GUI
- **THEN** the main process spawns the fixed wiki-compile dry-run argv with resume stage `concepts`
- **WHEN** the operator starts concept resume run from the GUI
- **THEN** the main process spawns the fixed wiki-compile argv with resume stage `concepts` and without dry-run.

#### Scenario: SCN-HGUI-CONCEPT-ACTIONS-AGENT-01 Agent concept buttons spawn fixed argv

- **WHEN** the operator starts agent concept resume dry-run from the GUI
- **THEN** the main process spawns the fixed agent-compile dry-run argv with resume stage `concepts`
- **WHEN** the operator starts agent concept resume run from the GUI
- **THEN** the main process spawns the fixed agent-compile argv with resume stage `concepts` and without dry-run.


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
### Requirement: Writeback resume actions in GUI

The GUI SHALL expose fixed operator actions for local writeback resume dry-run, local writeback resume run, agent writeback resume dry-run, and agent writeback resume run.

The writeback dry-run action SHALL spawn `pnpm exec joplin-llm-wiki wiki-compile --config <absConfigPath> --resume-stage writeback --dry-run`. The writeback run action SHALL spawn `pnpm exec joplin-llm-wiki wiki-compile --config <absConfigPath> --resume-stage writeback`.

The agent writeback dry-run action SHALL spawn `pnpm exec joplin-llm-wiki agent-compile --config <absConfigPath> --resume-stage writeback --dry-run`. The agent writeback run action SHALL spawn `pnpm exec joplin-llm-wiki agent-compile --config <absConfigPath> --resume-stage writeback`.

#### Scenario: SCN-HGUI-WRITEBACK-ACTIONS-01 Writeback buttons spawn fixed argv

- **WHEN** the operator starts writeback resume dry-run from the GUI
- **THEN** the main process spawns the fixed wiki-compile dry-run argv with resume stage `writeback`
- **WHEN** the operator starts writeback resume run from the GUI
- **THEN** the main process spawns the fixed wiki-compile argv with resume stage `writeback` and without dry-run.

#### Scenario: SCN-HGUI-WRITEBACK-ACTIONS-AGENT-01 Agent writeback buttons spawn fixed argv

- **WHEN** the operator starts agent writeback resume dry-run from the GUI
- **THEN** the main process spawns the fixed agent-compile dry-run argv with resume stage `writeback`
- **WHEN** the operator starts agent writeback resume run from the GUI
- **THEN** the main process spawns the fixed agent-compile argv with resume stage `writeback` and without dry-run.


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
### Requirement: GUI concept actions use single-flight guard

The GUI SHALL prevent concurrent concept resume, writeback resume, corpus pipeline, initialization, snapshot, query, lint, and LaunchAgent operations.

If an operation is already running, a concept or writeback stage action SHALL return the existing `PIPELINE_IN_FLIGHT` style failure without spawning another process.

#### Scenario: SCN-HGUI-CONCEPT-SINGLE-FLIGHT-01 Concurrent stage action rejected

- **WHEN** a corpus pipeline operation is running
- **AND** the operator starts concept resume dry-run
- **THEN** the GUI does not spawn a second command
- **AND** the result reports `PIPELINE_IN_FLIGHT`.


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
### Requirement: GUI displays staged concept telemetry

The GUI SHALL display or expose the parsed JSON fields returned by concept and writeback stage commands, including compile adapter, resume stage, changed summaries, concept paths, writeback relPaths, collision count, and orphan candidate count when present.

#### Scenario: SCN-HGUI-STAGED-TELEMETRY-01 Stage result visible to operator

- **WHEN** a concept resume or writeback resume command exits with stdout JSON
- **THEN** the GUI operation result includes `compile_adapter` when that field is present
- **AND** the GUI operation result includes `resume_stage`
- **AND** the GUI operation result includes `concept_paths_written` or `writeback_relpaths` when those fields are present.

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