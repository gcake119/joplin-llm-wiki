## MODIFIED Requirements

### Requirement: REQ-QUERY-003 Pending capture before formal notes

The system SHALL enable capture suggestion by default.

The system SHALL allow explicit `--capture=brainstorming` and
`--capture=artifacts` requests.

The system SHALL treat `--file-back=false` as a legacy alias for disabling
capture.

When a capture is suggested or requested, the system SHALL create a pending
capture under `.joplin-llm-wiki/pending-captures/` and SHALL NOT write a formal
`brainstorming/` or `artifacts/` note until confirmation.

Capture classification SHALL be exactly one of `brainstorming` or `artifacts`.

Brainstorming captures SHALL confirm to `brainstorming/chat/`.

Artifacts captures SHALL require a project name from an explicit option,
configuration, or confirmed MCP archive input before formal note creation.

Artifacts captures SHALL confirm to `artifacts/<project>/`.

Artifacts captures SHALL NOT confirm to `artifacts/projects/<project>/` for new
notes.

#### Scenario: SCN-QUERY-CAPTURE-01 Pending only

- **WHEN** the model returns a capture request marked true
- **THEN** query writes a pending capture JSON
- **AND** no formal note is written under `brainstorming/` or `artifacts/`

#### Scenario: SCN-QUERY-CAPTURE-02 Confirm brainstorming

- **WHEN** `query --confirm-capture <id>` confirms a brainstorming capture
- **THEN** the system writes a Markdown note under `brainstorming/chat/`
- **AND** the note frontmatter records `knowledge_sources` with layer/path data

#### Scenario: SCN-QUERY-CAPTURE-03 Artifact project required

- **WHEN** `query --confirm-capture <id>` confirms an artifacts capture
- **AND** no artifact project is provided by option, config, or confirmed MCP archive input
- **THEN** the command exits 1 with `ARTIFACT_PROJECT_REQUIRED`
- **AND** no formal artifacts note is written

#### Scenario: SCN-QUERY-CAPTURE-04 Confirm artifact under project root

- **WHEN** `query --confirm-capture <id>` confirms an artifacts capture with project `tainan-city`
- **THEN** the system writes a Markdown note under `artifacts/tainan-city/`
- **AND** the system does not write a note under `artifacts/projects/tainan-city/`

### Requirement: REQ-QUERY-004 On-demand workflow writeback

When confirmation is run with `--writeback-workflow=true`, the system SHALL write
back only the selected confirmed workflow note to Joplin.

The system SHALL map brainstorming captures to `@llm-wiki/brainstorming/chat`.

The system SHALL map artifacts captures to
`@llm-wiki/artifacts/<project-notebook>`.

The project notebook name for artifacts captures SHALL match the confirmed
project name used in the local `artifacts/<project>/` path.

#### Scenario: SCN-QUERY-WRITEBACK-01 Selected note only

- **WHEN** a pending capture is confirmed with `--writeback-workflow=true`
- **THEN** writeback receives only the newly confirmed workflow note path

#### Scenario: SCN-QUERY-WRITEBACK-02 Artifact writeback uses confirmed project

- **WHEN** an artifacts capture is confirmed with project `tainan-city`
- **AND** `--writeback-workflow=true` is set
- **THEN** writeback maps the note under `@llm-wiki/artifacts/tainan-city`
