## ADDED Requirements

### Requirement: REQ-HGUI-CLI-TAB-COVERAGE Major CLI workflows are reachable from GUI tabs

The Health GUI SHALL provide operator-visible tabs for the major supported CLI workflows: health/config inspection, configuration editing, notebook selection, raw/wiki pipeline, query, lint, and LaunchAgent management.

The GUI SHALL expose dedicated Query and Lint tabs in addition to the existing Health, Config, Notebooks, Pipeline, and LaunchAgent tabs.

The GUI SHALL NOT expose a generic shell command input for these workflows. Each tab SHALL call fixed main-process IPC handlers that spawn known `joplin-llm-wiki` subcommands with bounded arguments.

#### Scenario: SCN-HGUI-CLI-TABS-01 Tabs cover major workflows

- **WHEN** the Health GUI renderer loads
- **THEN** it SHALL show tabs for Health, Config, Notebooks, Pipeline, Query, Lint, and LaunchAgent

##### Example: required tab list

| Tab label | Workflow |
| --- | --- |
| Health | health/config inspection |
| Config | configuration editing |
| Notebooks | notebook selection |
| Pipeline | sqlite-sync, wiki-compile, agent-compile, snapshot-only |
| Query | query and confirm-capture |
| Lint | lint |
| LaunchAgent | launchd stack management |

#### Scenario: SCN-HGUI-CLI-TABS-02 Query and lint do not use generic shell execution

- **WHEN** the renderer invokes Query or Lint actions
- **THEN** the main process SHALL spawn fixed `pnpm exec joplin-llm-wiki query` or `pnpm exec joplin-llm-wiki lint` commands
- **AND** the renderer SHALL NOT provide an arbitrary executable or shell command string

### Requirement: REQ-HGUI-SNAPSHOT-ONLY Raw snapshot action in Pipeline tab

The Pipeline tab SHALL provide an operator action to establish a raw snapshot baseline from existing `raw` Markdown without running SQLite export or wiki compile.

The action SHALL call a fixed main-process IPC handler that invokes `sqlite-sync --snapshot-only --config <absConfigPath>` from the repository root.

The action SHALL require explicit operator confirmation before spawning the command.

The result SHALL display bounded stdout and stderr tails, including the JSON summary fields `snapshot_only`, `change_detection`, and `compile_triggered` when present.

#### Scenario: SCN-HGUI-SNAPSHOT-01 Snapshot action uses fixed argv

- **WHEN** the operator confirms the Pipeline tab snapshot action
- **THEN** the main process SHALL spawn `pnpm` with argv beginning `exec`, `joplin-llm-wiki`, `sqlite-sync`, `--config`, `<absConfigPath>`, `--snapshot-only`
- **AND** cwd SHALL equal the resolved repository root

#### Scenario: SCN-HGUI-SNAPSHOT-02 Snapshot action displays command result

- **WHEN** the snapshot-only command exits
- **THEN** the Pipeline tab SHALL display the exit code and bounded stdout and stderr tails
- **AND** a successful JSON summary SHALL make `snapshot_only`, `change_detection`, and `compile_triggered` visible to the operator

### Requirement: REQ-HGUI-QUERY-TAB Query workflow tab

The Query tab SHALL allow the operator to enter a question, choose a source scope from `knowledge`, `wiki`, and `raw`, and run the existing `query` CLI command with the configured config path.

The Query tab SHALL display bounded stdout and stderr tails from the query command.

The Query tab SHALL provide a confirm-capture action that accepts a pending capture id and invokes `query --confirm-capture <id>` with the configured config path.

#### Scenario: SCN-HGUI-QUERY-01 Query tab runs fixed query command

- **WHEN** the operator enters question `測試問題` and selects source scope `knowledge`
- **THEN** the main process SHALL spawn `pnpm` with argv beginning `exec`, `joplin-llm-wiki`, `query`, `--config`, `<absConfigPath>`, `--source-scope`, `knowledge`, `測試問題`
- **AND** cwd SHALL equal the resolved repository root

#### Scenario: SCN-HGUI-QUERY-02 Query tab confirms capture by id

- **WHEN** the operator enters pending capture id `abc123` and confirms capture
- **THEN** the main process SHALL spawn `pnpm` with argv beginning `exec`, `joplin-llm-wiki`, `query`, `--config`, `<absConfigPath>`, `--confirm-capture`, `abc123`

### Requirement: REQ-HGUI-LINT-TAB Lint workflow tab

The Lint tab SHALL allow the operator to run the existing `lint` CLI command with the configured config path.

The Lint tab SHALL display the lint command exit code and bounded stdout and stderr tails.

The Lint tab SHALL require no arbitrary CLI arguments from the renderer.

#### Scenario: SCN-HGUI-LINT-01 Lint tab runs fixed lint command

- **WHEN** the operator starts lint from the Lint tab
- **THEN** the main process SHALL spawn `pnpm` with argv beginning `exec`, `joplin-llm-wiki`, `lint`, `--config`, `<absConfigPath>`
- **AND** cwd SHALL equal the resolved repository root

#### Scenario: SCN-HGUI-LINT-02 Lint tab displays result tails

- **WHEN** the lint command exits with success or failure
- **THEN** the Lint tab SHALL display exit code, bounded stdout tail, and bounded stderr tail

##### Example: failed lint display

- **GIVEN** the lint command exits with code `1`
- **AND** stdout tail is `lint summary`
- **AND** stderr tail is `frontmatter invalid`
- **WHEN** the main process returns the lint result
- **THEN** the Lint tab SHALL display exit code `1`
- **AND** it SHALL display `lint summary`
- **AND** it SHALL display `frontmatter invalid`
