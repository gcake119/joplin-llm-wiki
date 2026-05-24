## ADDED Requirements

### Requirement: REQ-JWKB-WORKFLOW-PULL Workflow notes support explicit pull sync

The system SHALL document and expose workflow notes as a bidirectional-on-demand workflow: workspace files can be written to Joplin through workflow writeback, and Joplin workflow notebook edits can be pulled back to workspace files through workflow pull sync.

Compiled wiki writeback SHALL remain one-way from `wiki/` to Joplin.

Automatic compile writeback SHALL NOT trigger workflow pull sync.

#### Scenario: SCN-JWKB-WP-01 Workflow writeback remains separate from pull sync

- **WHEN** `wiki-compile` or `agent-compile` completes with automatic writeback enabled
- **THEN** compiled wiki notes are written to the configured Joplin wiki notebooks
- **AND** workflow pull sync is not executed.

#### Scenario: SCN-JWKB-WP-02 Documentation distinguishes sync directions

- **WHEN** an operator reads the writeback documentation
- **THEN** it identifies workspace-to-Joplin workflow writeback and Joplin-to-workspace workflow pull sync as separate explicit operations
- **AND** it states that `raw/` and compiled `wiki/` are not bidirectionally synchronized.
