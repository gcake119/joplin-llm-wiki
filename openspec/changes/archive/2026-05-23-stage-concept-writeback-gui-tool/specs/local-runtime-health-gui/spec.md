## ADDED Requirements

### Requirement: Joplin-LLM-wiki tool visible identity

The local Electron operator surface SHALL display the product name `Joplin-LLM-wiki tool` in the window title and primary UI heading.

Existing executable names and internal source directory names SHALL remain compatible unless a separate migration explicitly changes them.

#### Scenario: SCN-HGUI-RENAME-01 Visible GUI name changes without executable rename

- **WHEN** the GUI starts
- **THEN** the window title contains `Joplin-LLM-wiki tool`
- **AND** the main UI heading contains `Joplin-LLM-wiki tool`
- **AND** the existing GUI executable remains callable.

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

### Requirement: GUI concept actions use single-flight guard

The GUI SHALL prevent concurrent concept resume, writeback resume, corpus pipeline, initialization, snapshot, query, lint, and LaunchAgent operations.

If an operation is already running, a concept or writeback stage action SHALL return the existing `PIPELINE_IN_FLIGHT` style failure without spawning another process.

#### Scenario: SCN-HGUI-CONCEPT-SINGLE-FLIGHT-01 Concurrent stage action rejected

- **WHEN** a corpus pipeline operation is running
- **AND** the operator starts concept resume dry-run
- **THEN** the GUI does not spawn a second command
- **AND** the result reports `PIPELINE_IN_FLIGHT`.

### Requirement: GUI displays staged concept telemetry

The GUI SHALL display or expose the parsed JSON fields returned by concept and writeback stage commands, including compile adapter, resume stage, changed summaries, concept paths, writeback relPaths, collision count, and orphan candidate count when present.

#### Scenario: SCN-HGUI-STAGED-TELEMETRY-01 Stage result visible to operator

- **WHEN** a concept resume or writeback resume command exits with stdout JSON
- **THEN** the GUI operation result includes `compile_adapter` when that field is present
- **AND** the GUI operation result includes `resume_stage`
- **AND** the GUI operation result includes `concept_paths_written` or `writeback_relpaths` when those fields are present.
