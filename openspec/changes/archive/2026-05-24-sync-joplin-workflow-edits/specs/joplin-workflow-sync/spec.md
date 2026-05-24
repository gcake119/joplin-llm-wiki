## ADDED Requirements

### Requirement: REQ-JWFS-SCOPE Workflow notebook pull scope

The system SHALL pull workflow notes only from the configured Joplin hierarchy rooted at `joplin_wiki_writeback.parent_notebook_title` with the configured `brainstorming_notebook_title` and `artifacts_notebook_title` children.

The system SHALL write pulled note bodies only under the workspace `brainstorming/` and `artifacts/` directories.

The system SHALL NOT write to `raw/`, `wiki/`, general Joplin source exports, Chroma persistence, or report outputs as part of workflow pull sync.

#### Scenario: SCN-JWFS-SCOPE-01 Pull scope excludes raw and wiki

- **WHEN** workflow pull sync scans `@llm-wiki/brainstorming` and `@llm-wiki/artifacts`
- **THEN** candidate filesystem targets are limited to paths under `brainstorming/` and `artifacts/`
- **AND** no path under `raw/` or `wiki/` is written.

#### Scenario: SCN-JWFS-SCOPE-02 Missing workflow notebooks are reported

- **WHEN** the configured root notebook exists but the configured workflow child notebook is missing
- **THEN** the command returns a structured summary with the missing section listed as skipped
- **AND** no workspace file is written for that section.

### Requirement: REQ-JWFS-MAPPING Deterministic note-to-file mapping

The system SHALL map Joplin workflow notes to workspace Markdown paths using the workflow notebook section and sanitized note title.

For brainstorming notes, the system SHALL preserve the first folder below the brainstorming notebook when it is `chat` or `health`, and SHALL reject other first-level folders unless explicitly supported by configuration.

For artifact notes, the system SHALL map the first folder below the artifacts notebook to the workspace project folder under `artifacts/`.

The system MUST reject path traversal segments, absolute paths, empty filenames, duplicate target paths, and names that resolve outside the allowed workflow directories.

#### Scenario: SCN-JWFS-BRAIN-01 Brainstorming note maps to brainstorming file

- **WHEN** Joplin note `2026-05-24-sync-note` exists under `@llm-wiki/brainstorming/chat`
- **THEN** workflow pull sync maps it to `brainstorming/chat/2026-05-24-sync-note.md`.

#### Scenario: SCN-JWFS-ART-01 Artifact note maps to project file

- **WHEN** Joplin note `sync-plan` exists under `@llm-wiki/artifacts/ProjectA`
- **THEN** workflow pull sync maps it to `artifacts/ProjectA/sync-plan.md`.

#### Scenario: SCN-JWFS-SAFE-01 Unsafe path candidate is rejected

- **WHEN** a Joplin note title or folder name resolves to `../README.md`
- **THEN** workflow pull sync rejects the candidate
- **AND** the summary records the note as skipped or conflicted
- **AND** no file outside `brainstorming/` or `artifacts/` is written.

### Requirement: REQ-JWFS-WRITE File update and dry-run semantics

The system SHALL support dry-run mode for workflow pull sync.

In dry-run mode, the system SHALL report every create, update, skip, conflict, and error candidate without writing workspace files.

In normal mode, the system SHALL create missing parent directories under allowed workflow directories and SHALL write the Joplin note body to the mapped Markdown file only when no conflict is detected.

The system SHALL produce a structured summary containing at least `scanned`, `created`, `updated`, `unchanged`, `skipped`, `conflicts`, `errors`, and `changed_files`.

#### Scenario: SCN-JWFS-DRY-01 Dry-run does not write files

- **WHEN** workflow pull sync runs with dry-run enabled
- **AND** a Joplin workflow note body differs from the mapped workspace file
- **THEN** the summary lists the mapped path in `changed_files`
- **AND** the workspace file content remains unchanged.

#### Scenario: SCN-JWFS-WRITE-01 Normal run updates changed file

- **WHEN** workflow pull sync runs without dry-run
- **AND** a Joplin workflow note body differs from the mapped workspace file
- **THEN** the mapped workspace file body matches the Joplin note body after the command completes
- **AND** the summary increments `updated`.

### Requirement: REQ-JWFS-CONFLICT Conflict detection

The system SHALL detect conflicts before writing a mapped workflow file.

A conflict SHALL be reported when two Joplin notes map to the same workspace path, when an existing workspace path is outside the allowed directory after resolution, or when the mapped path is not a regular Markdown file target.

The system SHALL NOT overwrite a conflicted target.

#### Scenario: SCN-JWFS-CONFLICT-01 Duplicate target is not overwritten

- **WHEN** two Joplin notes map to `artifacts/ProjectA/sync-plan.md`
- **THEN** workflow pull sync reports a conflict for that target
- **AND** `artifacts/ProjectA/sync-plan.md` is not overwritten by either note in the conflicting pair.

### Requirement: REQ-JWFS-LOCAL Local-first Data API boundary

Workflow pull sync SHALL use the existing Joplin Data API configuration and loopback allowlist.

The system SHALL perform a Data API preflight before reading folders or notes.

Workflow pull sync SHALL NOT require Ollama, Chroma, OpenAI API providers, remote vector databases, or public HTTP listeners.

#### Scenario: SCN-JWFS-LOCAL-01 Pull sync uses only local Data API

- **WHEN** workflow pull sync runs with writeback enabled and a valid token
- **THEN** every Joplin HTTP request targets the configured loopback Data API base URL
- **AND** no Ollama or Chroma operation is required.

#### Scenario: SCN-JWFS-LOCAL-02 Invalid Data API fails before writes

- **WHEN** Data API preflight fails
- **THEN** workflow pull sync returns `JOPLIN_DATA_API_FAILED`
- **AND** no workspace file is written.
