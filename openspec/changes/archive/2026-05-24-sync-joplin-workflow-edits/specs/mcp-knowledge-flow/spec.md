## ADDED Requirements

### Requirement: REQ-MCP-WORKFLOW-SYNC MCP workflow pull sync tool

The MCP server SHALL expose a tool named `joplin_sync_workflow_notes` that runs the same workflow pull sync service as the CLI command.

The tool SHALL accept a configuration path, dry-run flag, and optional section filter limited to `brainstorming`, `artifacts`, or both.

The tool SHALL return a structured JSON-compatible summary containing at least `scanned`, `created`, `updated`, `unchanged`, `skipped`, `conflicts`, `errors`, and `changed_files`.

The tool SHALL NOT require callers to parse CLI stdout for normal success results.

#### Scenario: SCN-MCP-WFS-01 MCP tool returns structured summary

- **WHEN** `joplin_sync_workflow_notes` completes a dry-run with one changed brainstorming note
- **THEN** the result includes `updated` or `changed_files` information for the mapped workspace file
- **AND** the result is returned as structured JSON-compatible data.

#### Scenario: SCN-MCP-WFS-02 MCP tool preserves dry-run semantics

- **WHEN** `joplin_sync_workflow_notes` is called with dry-run enabled
- **THEN** no workspace file is written
- **AND** the result reports the same candidate changes as the CLI dry-run path.
