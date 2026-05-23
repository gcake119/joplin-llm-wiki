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

---
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

---
### Requirement: REQ-JWKB-DRYRUN Dry-run produces no durable Joplin updates

When `wiki-compile` or `agent-compile` is invoked with dry-run semantics, the
writeback stage SHALL NOT execute HTTP requests that mutate Joplin resources.

#### Scenario: SCN-JWKB-DRY-01 No mutating Data API calls on dry-run

- **WHEN** compile runs with dry-run and writeback enabled
- **THEN** zero mutating Data API requests for writeback are executed.

---
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

---
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

---
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


<!-- @trace
source: add-mcp-knowledge-flow-tools
updated: 2026-05-23
code:
  - src/knowledge-flow/query-service.js
  - src/commands/cmd-query.js
  - package.json
  - src/mcp/tools.js
  - src/knowledge-flow/archive-service.js
  - docs/codex-cursor-mcp.md
  - src/mcp/server.js
  - bin/joplin-llm-wiki-mcp.js
  - src/mcp/schema.js
  - src/joplin/wiki-writeback.js
  - README.md
  - src/knowledge-flow/orchestration-service.js
tests:
  - test/joplin-wiki-writeback.test.js
  - test/mcp-server.test.js
  - test/query.test.js
-->

---
### Requirement: REQ-JWKB-DOCS Operator documentation

The repository SHALL document that operators enable the Joplin Desktop Web
Clipper / Data API service, configure `joplin_data_api.base_url` and
`joplin_data_api.token`, and that writeback publishes compiled wiki pages into
`@llm-wiki/wiki/{summaries,concepts,indexes}` through that API.

#### Scenario: SCN-JWKB-DOCS-01 README describes Data API

- **WHEN** README describes Joplin writeback
- **THEN** it states that the Data API is required and Joplin CLI is not the
  writeback mechanism.

---
### Requirement: Non-mutating writeback preflight for automatic compile orchestration

When wiki writeback is enabled and an automatic compile is about to run from `sqlite-sync`, the system SHALL verify that the configured Joplin Data API endpoint is reachable and that the configured token is accepted before invoking `wiki-compile` or `agent-compile`.

The preflight check SHALL NOT create, update, or delete Joplin notebooks or notes.

If preflight fails, the system SHALL surface a stable Joplin Data API error code and SHALL NOT invoke the compile stage for that cycle.

#### Scenario: Invalid token stops automatic compile before agent invocation

- **GIVEN** `joplin_wiki_writeback.enabled` is true
- **AND** resolved `compile_mode` is `agent`
- **AND** the configured Joplin Data API returns HTTP 403 for the configured token
- **WHEN** `sqlite-sync` detects raw Markdown changes
- **THEN** the system SHALL run writeback preflight before invoking `agent-compile`
- **AND** the system SHALL NOT spawn Codex agent compile
- **AND** the process SHALL exit non-zero with a stable Joplin Data API error code
- **AND** the sqlite-sync snapshot state SHALL remain unchanged

#### Scenario: Valid token allows automatic compile to proceed

- **GIVEN** `joplin_wiki_writeback.enabled` is true
- **AND** the configured Joplin Data API accepts the configured token
- **AND** `sqlite-sync` detects raw Markdown changes
- **WHEN** writeback preflight completes successfully
- **THEN** the system SHALL invoke the resolved compile mode
- **AND** actual wiki writeback SHALL remain owned by the compile command after wiki files are produced

#### Scenario: Disabled writeback skips preflight

- **GIVEN** `joplin_wiki_writeback.enabled` is false
- **AND** `sqlite-sync` detects raw Markdown changes
- **WHEN** automatic compile orchestration starts
- **THEN** the system SHALL NOT call Joplin Data API preflight
- **AND** the system SHALL invoke the resolved compile mode without writeback validation


<!-- @trace
source: durable-sqlite-sync-writeback
updated: 2026-05-23
code:
  - src/joplin/sqlite/exporter.js
  - README.md
  - src/joplin/wiki-writeback.js
  - src/commands/cmd-sqlite-sync.js
  - scripts/launchd/com.joplin-brain.sqlite-sync.plist.example
  - docs/macos-launchd-stack.md
  - docs/scheduling-examples.md
  - scripts/launchd/run-sqlite-sync.sh
tests:
  - test/joplin-wiki-writeback.test.js
  - test/joplin-sqlite.test.js
  - test/config-schema.test.js
  - test/launchd-plist.test.js
  - test/sqlite-sync-change-detection.test.js
  - test/launchd-run-sqlite-sync.test.js
-->

---
### Requirement: Writeback preflight preserves local-first boundaries

The writeback preflight SHALL use only the configured loopback Joplin Data API base URL already accepted by configuration loading.

The writeback preflight SHALL NOT send note content, wiki content, or token values to non-loopback hosts.

#### Scenario: Preflight uses only loopback Data API

- **GIVEN** configuration loading accepted `joplin_data_api.base_url`
- **WHEN** writeback preflight runs
- **THEN** every HTTP request SHALL target that configured loopback Joplin Data API origin
- **AND** no HTTP request SHALL target remote vector databases, hosted LLM APIs, or third-party services
- **AND** error output SHALL NOT include the configured token value


<!-- @trace
source: durable-sqlite-sync-writeback
updated: 2026-05-23
code:
  - src/joplin/sqlite/exporter.js
  - README.md
  - src/joplin/wiki-writeback.js
  - src/commands/cmd-sqlite-sync.js
  - scripts/launchd/com.joplin-brain.sqlite-sync.plist.example
  - docs/macos-launchd-stack.md
  - docs/scheduling-examples.md
  - scripts/launchd/run-sqlite-sync.sh
tests:
  - test/joplin-wiki-writeback.test.js
  - test/joplin-sqlite.test.js
  - test/config-schema.test.js
  - test/launchd-plist.test.js
  - test/sqlite-sync-change-detection.test.js
  - test/launchd-run-sqlite-sync.test.js
-->

---
### Requirement: Writeback preflight result is observable

Automatic compile orchestration SHALL expose the writeback preflight result in operator-readable and machine-readable output.

The output SHALL distinguish preflight skipped, passed, and failed states.

#### Scenario: Preflight status appears in failed cycle output

- **GIVEN** writeback preflight fails because Joplin Data API rejects the token
- **WHEN** automatic compile orchestration exits
- **THEN** stdout or stderr SHALL include `writeback_preflight_status: "failed"`
- **AND** stderr SHALL include the Joplin Data API failure code
- **AND** stderr SHALL include an error message that identifies invalid token or unreachable Data API without printing the token

<!-- @trace
source: durable-sqlite-sync-writeback
updated: 2026-05-23
code:
  - src/joplin/sqlite/exporter.js
  - README.md
  - src/joplin/wiki-writeback.js
  - src/commands/cmd-sqlite-sync.js
  - scripts/launchd/com.joplin-brain.sqlite-sync.plist.example
  - docs/macos-launchd-stack.md
  - docs/scheduling-examples.md
  - scripts/launchd/run-sqlite-sync.sh
tests:
  - test/joplin-wiki-writeback.test.js
  - test/joplin-sqlite.test.js
  - test/config-schema.test.js
  - test/launchd-plist.test.js
  - test/sqlite-sync-change-detection.test.js
  - test/launchd-run-sqlite-sync.test.js
-->

---
### Requirement: Concept writeback collision observability

The wiki writeback stage SHALL detect duplicate concept note titles in the Joplin concepts notebook before mutating notes when running in dry-run mode.

Dry-run output SHALL include the number of concept title collisions and the affected note titles. Non-dry-run SHALL preserve the existing duplicate-title failure instead of selecting one duplicate implicitly.

#### Scenario: SCN-JWKB-CONCEPT-COLLISION-01 dry-run reports duplicate concept titles

- **WHEN** writeback dry-run reads two existing Joplin notes titled `憂鬱症陪伴、心理衛教與求助` under the concepts notebook
- **THEN** the dry-run result reports `writeback_collision_count: 1`
- **AND** the result includes the duplicate concept title in collision details
- **AND** no mutating Joplin Data API request is sent


<!-- @trace
source: fix-concept-generation-resume
updated: 2026-05-23
code:
  - src/commands/cmd-agent-compile.js
  - src/wiki/wiki-compiler.js
  - docs/llm-knowledge-flow.md
  - src/joplin/wiki-writeback.js
  - src/config/load-config.js
  - README.md
  - config.yaml.example
  - src/wiki/wiki-planner.js
  - docs/scheduling-examples.md
  - src/commands/cmd-wiki-compile.js
  - src/joplin/data-api-client.js
tests:
  - test/agent-compile.test.js
  - test/wiki-concept-resume.test.js
  - test/joplin-wiki-writeback.test.js
-->

---
### Requirement: Downstream-only concept writeback

The wiki writeback stage SHALL accept a downstream-only path list from compile resume and SHALL upsert only those wiki files.

When the compile stage resumes at concept or writeback stage, writeback SHALL NOT upsert unchanged `summaries/*.md` files unless those summary paths are explicitly included in the relPath list.

For current canonical concept notes, the stage SHALL update an existing managed Joplin note before creating a new note. An existing managed note SHALL be found by a repo-managed identity marker or by a single unambiguous canonical title match in the target notebook.

#### Scenario: SCN-JWKB-CONCEPT-UPSERT-01 resume writeback excludes summaries

- **WHEN** writeback receives relPaths `concepts/topic.md` and `indexes/All-Concepts.md`
- **THEN** the stage upserts only those two wiki notes
- **AND** it does not list or update summary notes for mutation

##### Example: downstream relPath filtering

| relPaths input | Notes upserted | Summaries updated |
| ----- | ----- | ----- |
| `concepts/topic.md`, `indexes/All-Concepts.md` | 2 | 0 |


<!-- @trace
source: fix-concept-generation-resume
updated: 2026-05-23
code:
  - src/commands/cmd-agent-compile.js
  - src/wiki/wiki-compiler.js
  - docs/llm-knowledge-flow.md
  - src/joplin/wiki-writeback.js
  - src/config/load-config.js
  - README.md
  - config.yaml.example
  - src/wiki/wiki-planner.js
  - docs/scheduling-examples.md
  - src/commands/cmd-wiki-compile.js
  - src/joplin/data-api-client.js
tests:
  - test/agent-compile.test.js
  - test/wiki-concept-resume.test.js
  - test/joplin-wiki-writeback.test.js
-->

---
### Requirement: Joplin REST API note lifecycle for compiled wiki writeback

The Joplin writeback client SHALL model the official Joplin Data REST API note lifecycle for compiled wiki notes.

The client SHALL support creating notes with `POST /notes`, updating note fields with `PUT /notes/:id`, and moving notes to trash with `DELETE /notes/:id` when an explicit cleanup mode requests it. The system SHALL NOT use permanent deletion by default.

#### Scenario: SCN-JWKB-REST-CAPABILITY-01 update before create and trash only on cleanup

- **WHEN** writeback finds exactly one managed Joplin note for `concepts/topic.md`
- **THEN** it updates that note with `PUT /notes/:id`
- **AND** it does not create a duplicate note
- **WHEN** explicit cleanup mode confirms an orphan concept note
- **THEN** it deletes the orphan with `DELETE /notes/:id` without `permanent=1`

##### Example: REST actions by note state

| State | Action |
| ----- | ----- |
| No matching managed note | `POST /notes` |
| One matching managed note | `PUT /notes/:id` |
| Multiple matching notes | fail with collision |
| Confirmed orphan in cleanup mode | `DELETE /notes/:id` to trash |


<!-- @trace
source: fix-concept-generation-resume
updated: 2026-05-23
code:
  - src/commands/cmd-agent-compile.js
  - src/wiki/wiki-compiler.js
  - docs/llm-knowledge-flow.md
  - src/joplin/wiki-writeback.js
  - src/config/load-config.js
  - README.md
  - config.yaml.example
  - src/wiki/wiki-planner.js
  - docs/scheduling-examples.md
  - src/commands/cmd-wiki-compile.js
  - src/joplin/data-api-client.js
tests:
  - test/agent-compile.test.js
  - test/wiki-concept-resume.test.js
  - test/joplin-wiki-writeback.test.js
-->

---
### Requirement: Concept orphan reporting

The wiki writeback dry-run stage SHALL report existing Joplin concept notes that do not correspond to any current canonical `wiki/concepts/*.md` relPath.

The system SHALL report orphan candidates without deleting or modifying them unless an explicit cleanup mode is implemented and invoked. Cleanup SHALL move notes to trash by default and SHALL NOT use permanent delete unless a separate explicit permanent-delete option is added.

#### Scenario: SCN-JWKB-CONCEPT-ORPHAN-01 dry-run reports old concept notes

- **WHEN** Joplin concepts notebook contains `憂鬱症支持與心理衛教`
- **AND** current canonical wiki concepts contain only `concepts/depression-support-and-psychoeducation.md` with title `憂鬱症陪伴、心理衛教與求助`
- **THEN** writeback dry-run reports one orphan candidate
- **AND** the dry-run does not delete the old Joplin note

<!-- @trace
source: fix-concept-generation-resume
updated: 2026-05-23
code:
  - src/commands/cmd-agent-compile.js
  - src/wiki/wiki-compiler.js
  - docs/llm-knowledge-flow.md
  - src/joplin/wiki-writeback.js
  - src/config/load-config.js
  - README.md
  - config.yaml.example
  - src/wiki/wiki-planner.js
  - docs/scheduling-examples.md
  - src/commands/cmd-wiki-compile.js
  - src/joplin/data-api-client.js
tests:
  - test/agent-compile.test.js
  - test/wiki-concept-resume.test.js
  - test/joplin-wiki-writeback.test.js
-->

---
### Requirement: Staged concept publish boundary

The Joplin wiki writeback stage SHALL publish concept resume output only when it is invoked as the explicit writeback stage by `wiki-compile` or `agent-compile`.

The stage SHALL treat `concepts/*.md` and `indexes/All-Concepts.md` as completed downstream relPaths and SHALL NOT infer or upsert `summaries/*.md` unless summary relPaths are explicitly included by a non-resume compile flow.

#### Scenario: SCN-JWKB-STAGED-PUBLISH-01 Writeback stage publishes completed concepts only

- **WHEN** `wiki-compile --resume-stage writeback` or `agent-compile --resume-stage writeback` runs without dry-run
- **AND** the local wiki contains `concepts/topic.md` and `indexes/All-Concepts.md`
- **THEN** writeback upserts only those downstream relPaths
- **AND** writeback does not upsert unchanged summaries.


<!-- @trace
source: stage-concept-writeback-gui-tool
updated: 2026-05-23
code:
  - src/health-gui/main.js
  - src/cli.js
  - docs/scheduling-examples.md
  - docs/llm-knowledge-flow.md
  - src/health-gui/renderer/app.js
  - src/wiki/wiki-compiler.js
  - src/health-gui/preload.cjs
  - src/commands/cmd-sqlite-sync.js
  - README.md
  - src/commands/cmd-agent-compile.js
  - config.yaml.example
  - src/health-gui/renderer/index.html
  - src/health-gui/corpus/corpus-pipeline-runner.js
tests:
  - test/agent-compile.test.js
  - test/health-gui/concept-resume-actions.test.js
  - test/joplin-wiki-writeback.test.js
  - test/cli-help.test.js
  - test/sqlite-sync-change-detection.test.js
  - test/wiki-concept-resume.test.js
-->

---
### Requirement: Staged writeback dry-run remains non-mutating

The explicit writeback dry-run stage SHALL inspect the target Joplin notebook tree and SHALL report collisions, orphan candidates, and would-write counts without mutating notes or folders.

#### Scenario: SCN-JWKB-STAGED-DRYRUN-01 Writeback dry-run reports publication plan

- **WHEN** `wiki-compile --resume-stage writeback --dry-run` or `agent-compile --resume-stage writeback --dry-run` runs
- **THEN** the result includes `writeback_relpaths`
- **AND** the result includes `writeback_would_write`
- **AND** no mutating Joplin Data API request is sent.


<!-- @trace
source: stage-concept-writeback-gui-tool
updated: 2026-05-23
code:
  - src/health-gui/main.js
  - src/cli.js
  - docs/scheduling-examples.md
  - docs/llm-knowledge-flow.md
  - src/health-gui/renderer/app.js
  - src/wiki/wiki-compiler.js
  - src/health-gui/preload.cjs
  - src/commands/cmd-sqlite-sync.js
  - README.md
  - src/commands/cmd-agent-compile.js
  - config.yaml.example
  - src/health-gui/renderer/index.html
  - src/health-gui/corpus/corpus-pipeline-runner.js
tests:
  - test/agent-compile.test.js
  - test/health-gui/concept-resume-actions.test.js
  - test/joplin-wiki-writeback.test.js
  - test/cli-help.test.js
  - test/sqlite-sync-change-detection.test.js
  - test/wiki-concept-resume.test.js
-->

---
### Requirement: Incremental writeback relPath contract

When an upstream compile stage provides a changed downstream relPath list, the writeback stage SHALL upsert only those relPaths.

The writeback stage SHALL return counts for created, updated, collision, and orphan candidate notes for the provided relPath list.

#### Scenario: SCN-JWKB-INCREMENTAL-RELPATHS-01 Changed concepts only

- **WHEN** writeback receives `concepts/topic.md` and `indexes/All-Concepts.md`
- **THEN** only those two wiki files are eligible for Joplin mutation
- **AND** unchanged `summaries/*.md` files are not listed, read for mutation, or upserted.

<!-- @trace
source: stage-concept-writeback-gui-tool
updated: 2026-05-23
code:
  - src/health-gui/main.js
  - src/cli.js
  - docs/scheduling-examples.md
  - docs/llm-knowledge-flow.md
  - src/health-gui/renderer/app.js
  - src/wiki/wiki-compiler.js
  - src/health-gui/preload.cjs
  - src/commands/cmd-sqlite-sync.js
  - README.md
  - src/commands/cmd-agent-compile.js
  - config.yaml.example
  - src/health-gui/renderer/index.html
  - src/health-gui/corpus/corpus-pipeline-runner.js
tests:
  - test/agent-compile.test.js
  - test/health-gui/concept-resume-actions.test.js
  - test/joplin-wiki-writeback.test.js
  - test/cli-help.test.js
  - test/sqlite-sync-change-detection.test.js
  - test/wiki-concept-resume.test.js
-->