## ADDED Requirements

### Requirement: REQ-MCP-001 Local MCP server exposes knowledge-flow tools

The system SHALL provide a local MCP server that runs under Node.js 20+ and communicates with Codex or Cursor through stdio.

The MCP server SHALL expose these tools: `joplin_query`, `joplin_show_capture`, `joplin_confirm_capture`, `joplin_brainstorm`, `joplin_suggest_archive_project`, `joplin_archive_project`, `joplin_sync_sources`, and `joplin_compile_wiki`.

The MCP server SHALL return structured JSON-compatible results for every tool invocation and SHALL NOT require callers to parse CLI stdout for normal success results.

The MCP server SHALL NOT open a public HTTP listener.

#### Scenario: SCN-MCP-SERVER-01 Tools are listed

- **WHEN** the MCP server starts successfully
- **THEN** the server exposes all required knowledge-flow tool names to the MCP client
- **AND** the server communicates through stdio
- **AND** the server does not bind an HTTP port

#### Scenario: SCN-MCP-SERVER-02 Query result is structured

- **WHEN** `joplin_query` answers a question from available wiki or raw Markdown
- **THEN** the result includes `answer`
- **AND** the result includes `sources` as layer/path objects
- **AND** the result includes `capture_draft_id` when a pending capture is created

### Requirement: REQ-MCP-002 MCP tools preserve pending capture workflow

The MCP query and brainstorm tools SHALL create pending captures only under `.joplin-llm-wiki/pending-captures/` when capture is requested or suggested.

The MCP tools SHALL NOT write formal notes under `brainstorming/` or `artifacts/` until `joplin_confirm_capture` or `joplin_archive_project` completes successfully.

`joplin_show_capture` SHALL return the pending capture content without modifying filesystem state.

`joplin_confirm_capture` SHALL remove the pending capture only after the formal note write and optional writeback step complete successfully.

#### Scenario: SCN-MCP-CAPTURE-01 Query creates pending capture only

- **WHEN** `joplin_query` creates a capture draft
- **THEN** a pending capture JSON exists under `.joplin-llm-wiki/pending-captures/`
- **AND** no new formal note exists under `brainstorming/` or `artifacts/`

#### Scenario: SCN-MCP-CAPTURE-02 Show capture is read-only

- **WHEN** `joplin_show_capture` is called with an existing capture id
- **THEN** the tool returns the pending capture JSON
- **AND** the pending capture file remains present

### Requirement: REQ-MCP-003 Project archive requires suggested and confirmed project name

The system SHALL support a two-step project archive flow.

`joplin_suggest_archive_project` SHALL inspect the provided title, content, and optional context and return two or three suggested project names, a suggested artifact title, and a reason for each project name.

`joplin_archive_project` SHALL require a non-empty project name and an explicit confirmation flag indicating that the user confirmed that project name.

If the confirmation flag is absent or false, `joplin_archive_project` SHALL fail with `PROJECT_CONFIRMATION_REQUIRED` and SHALL NOT write any file.

When archive succeeds, the system SHALL write the artifact Markdown file under `artifacts/<project>/<timestamp>-<slug>.md`.

The system SHALL NOT use `artifacts/projects/<project>/` for new MCP project archives.

#### Scenario: SCN-MCP-ARCHIVE-01 Suggestions precede archive

- **WHEN** `joplin_suggest_archive_project` receives content about a municipal dispatch monitoring plan
- **THEN** the result contains two or three project name suggestions
- **AND** each suggestion contains a project name and reason
- **AND** the result states that user confirmation is required

#### Scenario: SCN-MCP-ARCHIVE-02 Archive without confirmation is rejected

- **WHEN** `joplin_archive_project` is called with project `tainan-city`
- **AND** the confirmation flag is false
- **THEN** the tool fails with `PROJECT_CONFIRMATION_REQUIRED`
- **AND** no file is written under `artifacts/tainan-city/`

#### Scenario: SCN-MCP-ARCHIVE-03 Confirmed archive writes project directory

- **WHEN** `joplin_archive_project` is called with project `tainan-city`
- **AND** the confirmation flag is true
- **THEN** the tool writes exactly one Markdown artifact under `artifacts/tainan-city/`
- **AND** the tool result includes the written relative path

### Requirement: REQ-MCP-004 MCP orchestration tools wrap existing sync and compile flows

`joplin_sync_sources` SHALL invoke the existing sqlite-sync behavior for `normal`, `export_only`, and `snapshot_only` modes.

`joplin_compile_wiki` SHALL invoke the existing `wiki-compile` behavior when mode is `local` and the existing `agent-compile` behavior when mode is `agent`.

The orchestration tools SHALL return exit code, bounded stdout summary, bounded stderr summary, and stable error code when available.

The orchestration tools SHALL NOT change sqlite-sync snapshot semantics or compile writeback semantics.

#### Scenario: SCN-MCP-ORCH-01 Export-only sync delegates to sqlite-sync

- **WHEN** `joplin_sync_sources` runs with mode `export_only`
- **THEN** the tool invokes sqlite-sync export-only behavior
- **AND** the result includes an exit code and output summary

#### Scenario: SCN-MCP-ORCH-02 Agent compile delegates to agent-compile

- **WHEN** `joplin_compile_wiki` runs with mode `agent`
- **THEN** the tool invokes agent-compile behavior
- **AND** the result includes an exit code and output summary

### Requirement: REQ-MCP-005 MCP tools preserve local-first boundaries

The MCP server SHALL read and write only repository workflow paths resolved from the configured project root and config path.

The MCP server SHALL NOT send note content, capture content, project archive content, Joplin token values, or filesystem paths to remote SaaS endpoints.

When `provider` is `ollama`, query and brainstorm tools SHALL contact only the configured Ollama base URL.

When workflow writeback is requested, the tools SHALL use only the configured loopback Joplin Data API base URL accepted by configuration loading.

Tool errors SHALL NOT include the Joplin Data API token value.

#### Scenario: SCN-MCP-LOCAL-01 Query uses local knowledge paths

- **WHEN** `joplin_query` runs with default source scope
- **THEN** the tool reads Markdown from configured `wiki/` and `raw/` paths
- **AND** it does not read from remote vector databases or hosted LLM APIs

#### Scenario: SCN-MCP-LOCAL-02 Writeback token is redacted

- **WHEN** workflow writeback fails because the Joplin Data API rejects the token
- **THEN** the tool returns a stable error code
- **AND** the result does not include the token value
