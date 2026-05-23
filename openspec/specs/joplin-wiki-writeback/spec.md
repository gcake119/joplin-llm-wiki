# joplin-wiki-writeback Specification

## Purpose

Compiled wiki and selected workflow notes can be mirrored into Joplin through
the local Joplin Desktop Web Clipper / Data API. The implementation does not
use the Joplin terminal CLI for writeback.

## Requirements

### Requirement: REQ-JWKB-LOCAL-FIRST Local Data API boundary

The writeback stage SHALL open HTTP connections only to the configured Joplin
Data API host allowed by `joplin-data-api`.

The system SHALL NOT connect to remote vector databases or third-party SaaS APIs
as part of writeback.

#### Scenario: SCN-JWKB-LF-01 Writeback HTTP stays on loopback API

- **WHEN** writeback executes
- **THEN** every HTTP request targets only the configured loopback Data API host.

### Requirement: REQ-JWKB-CONFIG Configuration surface

The system SHALL support `joplin_wiki_writeback` with at least:

| Key | Type | Default | Required when enabled |
| --- | ---- | ------- | ---------------------- |
| `enabled` | boolean | true | — |
| `parent_notebook_title` | string | `@llm-wiki` | — |
| `wiki_notebook_title` | string | `wiki` | — |
| `brainstorming_notebook_title` | string | `brainstorming` | — |
| `artifacts_notebook_title` | string | `artifacts` | — |
| `artifacts_project_notebook_title` | string | `""` | required only for artifact workflow writeback |
| `topic_frontmatter_key` | string | `domain` | legacy metadata key; not used for section routing |
| `note_title_key` | string | `title` | — |
| `max_cli_attempts` | integer | 3 | — |

When `joplin_wiki_writeback.enabled` is true, configuration SHALL require a
non-empty `joplin_data_api.token` and a loopback `joplin_data_api.base_url`.

The system SHALL NOT require `joplin_cli.enabled` or a non-empty
`joplin_cli.command` because writeback is enabled.

#### Scenario: SCN-JWKB-CFG-01 Writeback enabled without Data API token fails

- **WHEN** `joplin_wiki_writeback.enabled` is true
- **AND** `joplin_data_api.token` is empty after trim
- **THEN** configuration loading fails with `CONFIG_INVALID`.

#### Scenario: SCN-JWKB-CFG-02 Defaults match notebook tree convention

- **WHEN** config omits writeback notebook title keys
- **THEN** resolved config uses `@llm-wiki/wiki`,
  `@llm-wiki/brainstorming`, and `@llm-wiki/artifacts` as the top-level
  sections.

### Requirement: REQ-JWKB-DRYRUN Dry-run produces no durable Joplin updates

When `wiki-compile` or `agent-compile` is invoked with dry-run semantics, the
writeback stage SHALL NOT execute HTTP requests that mutate Joplin resources.

#### Scenario: SCN-JWKB-DRY-01 No mutating Data API calls on dry-run

- **WHEN** compile runs with dry-run and writeback enabled
- **THEN** zero mutating Data API requests for writeback are executed.

### Requirement: REQ-JWKB-WIKI-TREE Compiled wiki notebook tree

For compile writeback, the system SHALL ensure this notebook hierarchy:

- `@llm-wiki`
- `@llm-wiki/wiki`
- `@llm-wiki/wiki/summaries`
- `@llm-wiki/wiki/concepts`
- `@llm-wiki/wiki/indexes`

For each compiled wiki Markdown file, the system SHALL route by the first wiki
relative path segment. Paths outside `summaries`, `concepts`, and `indexes`
SHALL normalize to `_uncategorized`.

#### Scenario: SCN-JWKB-WIKI-TREE-01 Section creation

- **WHEN** wiki writeback runs for `concepts/security.md`
- **THEN** the note is upserted below `@llm-wiki/wiki/concepts`.

### Requirement: REQ-JWKB-NOTE-UPSERT Note title resolution and body upsert

For each wiki file in the writeback batch, the system SHALL determine the Joplin
note title as follows:

1. If frontmatter contains a non-empty string at
   `joplin_wiki_writeback.note_title_key`, that string SHALL be the note title
   after trim.
2. Otherwise the title SHALL be the wiki file basename without `.md`.

The system SHALL upsert exactly one note per wiki file inside the resolved
topic notebook. The stored body SHALL be the wiki file content with YAML
frontmatter removed.

#### Scenario: SCN-JWKB-UPSERT-01 Title from frontmatter

- **GIVEN** a wiki file `concepts/security.md` with `title: "Overview"`
- **WHEN** writeback runs
- **THEN** the affected note title is `Overview` under
  `@llm-wiki/wiki/concepts`.

### Requirement: REQ-JWKB-WORKFLOW On-demand workflow writeback

Compile flows SHALL only synchronize compiled wiki Markdown.

`brainstorming/` and `artifacts/` SHALL be written back only through explicit
workflow writeback, such as confirming a query capture with
`--writeback-workflow=true`.

Brainstorming workflow notes SHALL map under
`@llm-wiki/brainstorming/<folder>`. Artifact workflow notes SHALL map under
`@llm-wiki/artifacts/<artifacts_project_notebook_title>`.

#### Scenario: SCN-JWKB-WORKFLOW-01 Selected capture only

- **WHEN** a pending query capture is confirmed with `--writeback-workflow=true`
- **THEN** writeback receives only the newly confirmed workflow note path.

### Requirement: REQ-JWKB-DOCS Operator documentation

The repository SHALL document that operators enable the Joplin Desktop Web
Clipper / Data API service, configure `joplin_data_api.base_url` and
`joplin_data_api.token`, and that writeback publishes compiled wiki pages into
`@llm-wiki/wiki/{summaries,concepts,indexes}` through that API.

#### Scenario: SCN-JWKB-DOCS-01 README describes Data API

- **WHEN** README describes Joplin writeback
- **THEN** it states that the Data API is required and Joplin CLI is not the
  writeback mechanism.
