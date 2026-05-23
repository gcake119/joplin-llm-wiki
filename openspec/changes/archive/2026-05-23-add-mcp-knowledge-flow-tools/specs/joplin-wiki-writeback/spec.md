## MODIFIED Requirements

### Requirement: REQ-JWKB-WORKFLOW On-demand workflow writeback

Compile flows SHALL only synchronize compiled wiki Markdown.

`brainstorming/` and `artifacts/` SHALL be written back only through explicit
workflow writeback, such as confirming a query capture with
`--writeback-workflow=true` or archiving a project artifact through the MCP
archive workflow with writeback enabled.

Brainstorming workflow notes SHALL map under
`@llm-wiki/brainstorming/<folder>`.

Artifact workflow notes under `artifacts/<project>/` SHALL map under
`@llm-wiki/artifacts/<project>`.

Artifact workflow notes SHALL NOT require a local `artifacts/projects/<project>/`
path for new project archive writeback.

When an explicit artifacts project notebook title is supplied by the caller, the
writeback stage SHALL use that confirmed project title for the artifact notebook
name.

#### Scenario: SCN-JWKB-WORKFLOW-01 Selected capture only

- **WHEN** a pending query capture is confirmed with `--writeback-workflow=true`
- **THEN** writeback receives only the newly confirmed workflow note path.

#### Scenario: SCN-JWKB-WORKFLOW-02 Artifact workflow path maps to project notebook

- **WHEN** workflow writeback receives `artifacts/tainan-city/2026-05-23-plan.md`
- **THEN** the note is upserted below `@llm-wiki/artifacts/tainan-city`

#### Scenario: SCN-JWKB-WORKFLOW-03 New archive path does not require projects segment

- **WHEN** workflow writeback receives `artifacts/tainan-city/2026-05-23-plan.md`
- **THEN** the writeback stage accepts the path as an artifact workflow note
- **AND** it does not require `artifacts/projects/tainan-city/2026-05-23-plan.md`
