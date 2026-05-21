# cli-query Specification

## Purpose

The `query` command answers questions from the local user knowledge base without
RAG, embeddings, Chroma, or vector indexes. It reads Markdown from the
filesystem, prioritizes compiled `wiki/` knowledge, may supplement from `raw/`
source material, and stages valuable Q&A as confirmed captures.

## Requirements

### Requirement: REQ-QUERY-001 Filesystem knowledge scope

The system SHALL default `query --source-scope` to `knowledge`.

In `knowledge` scope, the system SHALL read `wiki/` first and MAY include `raw/`
as original source evidence.

The system SHALL support `--source-scope=wiki` and `--source-scope=raw` to
restrict context assembly to one layer.

The system SHALL NOT use RAG, embeddings, Chroma, vector databases, or vector
indexes for query context.

#### Scenario: SCN-QUERY-SCOPE-01 Default knowledge scope

- **WHEN** `query` runs with Markdown in both `wiki/` and `raw/`
- **THEN** the prompt context includes wiki entries before raw entries
- **AND** stdout `SOURCES` includes layer/path objects for included files

#### Scenario: SCN-QUERY-SCOPE-02 Wiki-only scope

- **WHEN** `query --source-scope=wiki` runs
- **THEN** raw files do not enter the prompt context

#### Scenario: SCN-QUERY-SCOPE-03 Raw fallback

- **WHEN** `wiki/` has no Markdown but `raw/` does
- **THEN** default `query` can still answer from raw context

### Requirement: REQ-QUERY-002 Grounding prompt

The query prompt SHALL state that `wiki/` is the preferred compiled knowledge
layer and `raw/` is uncompiled source evidence.

The prompt SHALL require the model to disclose when it uses conversation-provided
or external content that is not present in the knowledge context.

The prompt SHALL require the model to report insufficient knowledge when neither
`wiki/` nor `raw/` supports the answer.

#### Scenario: SCN-QUERY-PROMPT-01 No raw prohibition

- **WHEN** query prompt text is assembled
- **THEN** it does not say that raw is forbidden
- **AND** it explains the wiki-first, raw-supplement rule

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

#### Scenario: SCN-QUERY-CAPTURE-01 Pending only

- **WHEN** the model returns `should_create: true`
- **THEN** query writes a pending capture JSON
- **AND** no formal note is written under `brainstorming/` or `artifacts/`

#### Scenario: SCN-QUERY-CAPTURE-02 Confirm brainstorming

- **WHEN** `query --confirm-capture <id>` confirms a brainstorming capture
- **THEN** the system writes a Markdown note under `brainstorming/chat/`
- **AND** the note frontmatter records `knowledge_sources` with layer/path data

#### Scenario: SCN-QUERY-CAPTURE-03 Artifact project required

- **WHEN** `query --confirm-capture <id>` confirms an artifacts capture
- **AND** no artifact project is provided by option or config
- **THEN** the command exits 1 with `ARTIFACT_PROJECT_REQUIRED`

### Requirement: REQ-QUERY-004 On-demand workflow writeback

When confirmation is run with `--writeback-workflow=true`, the system SHALL write
back only the selected confirmed workflow note to Joplin.

The system SHALL map brainstorming captures to `@llm-wiki/brainstorming/chat`.

The system SHALL map artifacts captures to
`@llm-wiki/artifacts/<project-notebook>`.

#### Scenario: SCN-QUERY-WRITEBACK-01 Selected note only

- **WHEN** a pending capture is confirmed with `--writeback-workflow=true`
- **THEN** writeback receives only the newly confirmed workflow note path
