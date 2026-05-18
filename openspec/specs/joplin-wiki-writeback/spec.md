# joplin-wiki-writeback Specification

## Purpose

TBD - created by archiving change 'joplin-wiki-db-writeback'. Update Purpose after archive.

## Requirements

### Requirement: REQ-JWKB-LOCAL-FIRST Local execution boundary

The system SHALL execute wiki writeback entirely on the local filesystem of the operator workstation.

The writeback stage SHALL open HTTP connections only to the configured Joplin Data API host that satisfies `REQ-JDA-ALLOWLIST`.

The system SHALL NOT connect to remote vector databases or third-party SaaS APIs as part of this capability.

#### Scenario: SCN-JWKB-LF-01 Writeback HTTP stays on loopback API

- **WHEN** joplin_wiki_writeback.enabled is true
- **AND** wiki-compile runs without --dry-run
- **AND** writeback executes
- **THEN** every HTTP request issued by the writeback stage SHALL target only the configured loopback Data API host

#### Scenario: SCN-JWKB-LF-02 Non-loopback Data API URL rejects configuration

- **WHEN** joplin_wiki_writeback.enabled is true
- **AND** `joplin_data_api.base_url` resolves to a hostname outside REQ-JDA-ALLOWLIST
- **THEN** configuration loading SHALL fail with CONFIG_INVALID


<!-- @trace
source: joplin-data-api-read-write
updated: 2026-05-18
code:
  - AGENTS.md
  - .agents/skills/spectra-apply/SKILL.md
  - src/commands/cmd-index.js
  - src/cli.js
  - src/joplin/data-api-client.js
  - .agents/skills/spectra-debug/SKILL.md
  - config.yaml.example
  - .agents/skills/spectra-commit/SKILL.md
  - README.md
  - .agents/skills/spectra-archive/SKILL.md
  - .agents/skills/spectra-propose/SKILL.md
  - src/joplin/data-api-client.js
  - src/joplin/wiki-writeback.js
  - .agents/skills/spectra-discuss/SKILL.md
  - .agents/skills/spectra-drift/SKILL.md
  - .agents/skills/spectra-audit/SKILL.md
  - src/config/load-config.js
  - .agents/skills/spectra-ingest/SKILL.md
  - .agents/skills/spectra-ask/SKILL.md
tests:
  - test/joplin-wiki-writeback.test.js
  - test/joplin-cli.test.js
  - test/config-schema.test.js
  - test/joplin-data-api-client.test.js
-->

---
### Requirement: REQ-JWKB-CONFIG Configuration surface

The system SHALL extend `config.yaml` with a `joplin_wiki_writeback` mapping containing at least:

| Key | Type | Default | Required when enabled |
| --- | ---- | ------- | ---------------------- |
| `enabled` | boolean | true | — |
| `parent_notebook_title` | string | `note-wiki` | — |
| `topic_frontmatter_key` | string | `domain` | — |
| `note_title_key` | string | `title` | — |
| `max_cli_attempts` | integer | 3 | — |

The `max_cli_attempts` key SHALL bound per-action retries for Data API transport during writeback.

When `joplin_wiki_writeback.enabled` is true, configuration SHALL satisfy all writeback-enabled constraints defined in `REQ-JDA-CONFIG`, or configuration loading SHALL fail with `CONFIG_INVALID`.

The system SHALL NOT require `joplin_cli.enabled` or a non-empty `joplin_cli.command` solely because writeback is enabled.

The system SHALL NOT require `database_path` under `joplin_wiki_writeback` for writeback; database path remains the concern of `joplin_sqlite_sync` export only.

#### Scenario: SCN-JWKB-CFG-01 Writeback enabled without Data API token fails fast

- **WHEN** joplin_wiki_writeback.enabled is true
- **AND** `joplin_data_api.token` is empty after trim
- **THEN** configuration loading SHALL fail with CONFIG_INVALID

#### Scenario: SCN-JWKB-CFG-02 Defaults match notebook tree convention

- **WHEN** config omits `joplin_wiki_writeback.enabled`, `parent_notebook_title`, `topic_frontmatter_key`, and `note_title_key`
- **THEN** resolved config SHALL treat writeback as enabled with parent notebook title `note-wiki`, topic key `domain`, and note title key `title`


<!-- @trace
source: joplin-data-api-read-write
updated: 2026-05-18
code:
  - AGENTS.md
  - .agents/skills/spectra-apply/SKILL.md
  - src/commands/cmd-index.js
  - src/cli.js
  - src/joplin/data-api-client.js
  - .agents/skills/spectra-debug/SKILL.md
  - config.yaml.example
  - .agents/skills/spectra-commit/SKILL.md
  - README.md
  - .agents/skills/spectra-archive/SKILL.md
  - .agents/skills/spectra-propose/SKILL.md
  - src/joplin/data-api-client.js
  - src/joplin/wiki-writeback.js
  - .agents/skills/spectra-discuss/SKILL.md
  - .agents/skills/spectra-drift/SKILL.md
  - .agents/skills/spectra-audit/SKILL.md
  - src/config/load-config.js
  - .agents/skills/spectra-ingest/SKILL.md
  - .agents/skills/spectra-ask/SKILL.md
tests:
  - test/joplin-wiki-writeback.test.js
  - test/joplin-cli.test.js
  - test/config-schema.test.js
  - test/joplin-data-api-client.test.js
-->

---
### Requirement: REQ-JWKB-DRYRUN Dry-run produces no durable Joplin updates

When `wiki-compile` is invoked with `--dry-run`, the writeback stage SHALL NOT execute HTTP requests that mutate Joplin resources managed by this capability (including folder creation and note create/update semantics).

#### Scenario: SCN-JWKB-DRY-01 No mutating Data API calls on dry-run

- **WHEN** wiki-compile runs with --dry-run
- **AND** joplin_wiki_writeback.enabled is true
- **THEN** zero mutating Data API requests for writeback are executed


<!-- @trace
source: joplin-data-api-read-write
updated: 2026-05-18
code:
  - AGENTS.md
  - .agents/skills/spectra-apply/SKILL.md
  - src/commands/cmd-index.js
  - src/cli.js
  - src/joplin/data-api-client.js
  - .agents/skills/spectra-debug/SKILL.md
  - config.yaml.example
  - .agents/skills/spectra-commit/SKILL.md
  - README.md
  - .agents/skills/spectra-archive/SKILL.md
  - .agents/skills/spectra-propose/SKILL.md
  - src/joplin/data-api-client.js
  - src/joplin/wiki-writeback.js
  - .agents/skills/spectra-discuss/SKILL.md
  - .agents/skills/spectra-drift/SKILL.md
  - .agents/skills/spectra-audit/SKILL.md
  - src/config/load-config.js
  - .agents/skills/spectra-ingest/SKILL.md
  - .agents/skills/spectra-ask/SKILL.md
tests:
  - test/joplin-wiki-writeback.test.js
  - test/joplin-cli.test.js
  - test/config-schema.test.js
  - test/joplin-data-api-client.test.js
-->

---
### Requirement: REQ-JWKB-NOTEBOOK-TREE Parent and topic notebooks

For each `wiki-compile` writeback batch, the system SHALL resolve the parent notebook whose human-readable title equals `joplin_wiki_writeback.parent_notebook_title`.

When the parent notebook does not exist and the invocation is not `--dry-run`, the system SHALL create that top-level notebook using the Joplin Data API before creating any topic notebooks or notes.

For each wiki Markdown file in the writeback batch, the system SHALL parse YAML frontmatter and read a topic string from the key named by `joplin_wiki_writeback.topic_frontmatter_key`. When the key is absent, null, or a non-string, the topic SHALL be `_uncategorized`. When the string is non-empty after trim, the system SHALL normalize it into a notebook title per design.md (trim, forbid path separators, enforce maximum length, stable Unicode normalization).

For each distinct normalized topic in the batch, the system SHALL resolve a child notebook directly under the parent whose title equals that normalized topic. When the child notebook does not exist and the invocation is not `--dry-run`, the system SHALL create it using the Joplin Data API.

#### Scenario: SCN-JWKB-TREE-01 Parent and topic creation

- **GIVEN** no notebook titled `note-wiki` exists before the run
- **WHEN** wiki-compile completes successfully without --dry-run
- **AND** joplin_wiki_writeback.enabled is true with default parent title
- **AND** at least one wiki file has frontmatter `domain: Networking`
- **THEN** writeback SHALL create a top-level notebook titled `note-wiki`
- **AND** SHALL create a child notebook titled `Networking` under `note-wiki` before writing notes

#### Scenario: SCN-JWKB-TREE-02 Missing domain uses uncategorized

- **WHEN** a wiki file has no `domain` key in frontmatter (default topic key)
- **AND** writeback runs for that file without --dry-run
- **THEN** writeback SHALL target a child notebook titled `_uncategorized` under the parent notebook


<!-- @trace
source: joplin-data-api-read-write
updated: 2026-05-18
code:
  - AGENTS.md
  - .agents/skills/spectra-apply/SKILL.md
  - src/commands/cmd-index.js
  - src/cli.js
  - src/joplin/data-api-client.js
  - .agents/skills/spectra-debug/SKILL.md
  - config.yaml.example
  - .agents/skills/spectra-commit/SKILL.md
  - README.md
  - .agents/skills/spectra-archive/SKILL.md
  - .agents/skills/spectra-propose/SKILL.md
  - src/joplin/data-api-client.js
  - src/joplin/wiki-writeback.js
  - .agents/skills/spectra-discuss/SKILL.md
  - .agents/skills/spectra-drift/SKILL.md
  - .agents/skills/spectra-audit/SKILL.md
  - src/config/load-config.js
  - .agents/skills/spectra-ingest/SKILL.md
  - .agents/skills/spectra-ask/SKILL.md
tests:
  - test/joplin-wiki-writeback.test.js
  - test/joplin-cli.test.js
  - test/config-schema.test.js
  - test/joplin-data-api-client.test.js
-->

---
### Requirement: REQ-JWKB-NOTE-UPSERT Note title resolution and body upsert

For each wiki file in the writeback batch, the system SHALL determine the Joplin note title as follows:

1. If frontmatter contains a non-empty string at `joplin_wiki_writeback.note_title_key`, that string SHALL be the note title after trim.
2. Otherwise the title SHALL be the wiki file basename with the `.md` suffix removed.

The system SHALL upsert exactly one note per wiki file inside the topic notebook resolved for that file:

- **IF** a note with the same title already exists in that topic notebook, the system SHALL update its body.
- **ELSE** the system SHALL create a new note in that topic notebook with that title and set its body.

The body passed to Joplin for storage SHALL be the wiki file content with the YAML frontmatter block removed; the writeback stage SHALL NOT copy wiki frontmatter keys into the stored body.

#### Scenario: SCN-JWKB-UPSERT-01 Title from frontmatter

- **GIVEN** a wiki file `foo.md` with frontmatter `title: "Overview"` and `domain: Security`
- **WHEN** writeback runs without --dry-run
- **THEN** the affected note title SHALL be `Overview`
- **AND** the note SHALL reside under parent `note-wiki` / child `Security`

#### Scenario: SCN-JWKB-UPSERT-02 Title falls back to filename

- **GIVEN** a wiki file `foo.md` with no `title` key
- **WHEN** writeback runs
- **THEN** the note title SHALL be `foo`

#### Scenario: SCN-JWKB-BODY-01 Frontmatter stripped

- **GIVEN** wiki file text begins with `---` YAML frontmatter closed by `---`
- **WHEN** writeback upserts the note
- **THEN** the content sent to Joplin SHALL not include the `domain` or `title` frontmatter keys from the wiki file


<!-- @trace
source: joplin-wiki-db-writeback
updated: 2026-05-17
code:
  - my.config.yaml
  - src/joplin/wiki-writeback.js
  - src/config/load-config.js
  - fixtures/full-karpathy.config.yaml
  - README.md
  - config.yaml.example
  - src/joplin/data-api-client.js
  - src/cli.js
  - src/wiki/wiki-compiler.js
tests:
  - test/wiki-separation.test.js
  - test/integration-index.test.js
  - test/config-schema.test.js
  - test/joplin-wiki-writeback.test.js
  - test/joplin-sqlite.test.js
-->

---
### Requirement: REQ-JWKB-ROW-ELIGIBILITY Row eligibility

When the Joplin Data API reports that a target notebook cannot be created, a target note cannot be resolved for update, or a create/update cannot accept a body write, the system SHALL record a skip reason or fail the command per design.md fatal-vs-skip table.

#### Scenario: SCN-JWKB-ROW-01 API skip outcome

- **GIVEN** the Data API returns a documented skip outcome for one file in the batch
- **WHEN** the outcome is classified as skippable in design.md
- **THEN** no successful upsert is recorded for that file in the writeback summary


<!-- @trace
source: joplin-data-api-read-write
updated: 2026-05-18
code:
  - AGENTS.md
  - .agents/skills/spectra-apply/SKILL.md
  - src/commands/cmd-index.js
  - src/cli.js
  - src/joplin/data-api-client.js
  - .agents/skills/spectra-debug/SKILL.md
  - config.yaml.example
  - .agents/skills/spectra-commit/SKILL.md
  - README.md
  - .agents/skills/spectra-archive/SKILL.md
  - .agents/skills/spectra-propose/SKILL.md
  - src/joplin/data-api-client.js
  - src/joplin/wiki-writeback.js
  - .agents/skills/spectra-discuss/SKILL.md
  - .agents/skills/spectra-drift/SKILL.md
  - .agents/skills/spectra-audit/SKILL.md
  - src/config/load-config.js
  - .agents/skills/spectra-ingest/SKILL.md
  - .agents/skills/spectra-ask/SKILL.md
tests:
  - test/joplin-wiki-writeback.test.js
  - test/joplin-cli.test.js
  - test/config-schema.test.js
  - test/joplin-data-api-client.test.js
-->

---
### Requirement: REQ-JWKB-ERRORS Error reporting

When Data API preflight fails irrecoverably, the command SHALL exit with code 1 and stderr SHALL contain a single JSON object with `"error":"JOPLIN_DATA_API_FAILED"`.

When a writeback mutation fails irrecoverably after retries are exhausted, the command SHALL exit with code 1 and stderr SHALL contain a single JSON object with `"error":"JOPLIN_DATA_API_WRITE_FAILED"`.

#### Scenario: SCN-JWKB-ERR-01 Preflight failure surfaces JSON

- **WHEN** Data API preflight fails irrecoverably
- **THEN** the command SHALL exit with code 1
- **AND** stderr SHALL contain JOPLIN_DATA_API_FAILED

#### Scenario: SCN-JWKB-ERR-02 Write failure surfaces JSON

- **WHEN** a mutating writeback step fails irrecoverably after retries
- **THEN** the command SHALL exit with code 1
- **AND** stderr SHALL contain JOPLIN_DATA_API_WRITE_FAILED


<!-- @trace
source: joplin-data-api-read-write
updated: 2026-05-18
code:
  - AGENTS.md
  - .agents/skills/spectra-apply/SKILL.md
  - src/commands/cmd-index.js
  - src/cli.js
  - src/joplin/data-api-client.js
  - .agents/skills/spectra-debug/SKILL.md
  - config.yaml.example
  - .agents/skills/spectra-commit/SKILL.md
  - README.md
  - .agents/skills/spectra-archive/SKILL.md
  - .agents/skills/spectra-propose/SKILL.md
  - src/joplin/data-api-client.js
  - src/joplin/wiki-writeback.js
  - .agents/skills/spectra-discuss/SKILL.md
  - .agents/skills/spectra-drift/SKILL.md
  - .agents/skills/spectra-audit/SKILL.md
  - src/config/load-config.js
  - .agents/skills/spectra-ingest/SKILL.md
  - .agents/skills/spectra-ask/SKILL.md
tests:
  - test/joplin-wiki-writeback.test.js
  - test/joplin-cli.test.js
  - test/config-schema.test.js
  - test/joplin-data-api-client.test.js
-->

---
### Requirement: REQ-JWKB-README-PREREQUISITES Operator install documentation

The repository SHALL document in `README.md` that operators install **Joplin Desktop** (or an equivalent official Joplin client) to browse and manage the full note corpus, and that this client SHALL use the **same Joplin profile** as `joplin_sqlite_sync` (when export is enabled) so `database.sqlite` export targets match the operator's authoritative library.

The repository SHALL document in `README.md` that operators SHALL enable the **Joplin Data API** in Desktop settings, configure `joplin_data_api.base_url` and `joplin_data_api.token`, and that **wiki-compile writeback** publishes compiled wiki pages into the configured notebook tree (default top-level `note-wiki`) via that API.

#### Scenario: SCN-JWKB-DOC-01 README lists Desktop and Data API roles

- **WHEN** an operator reads the setup section of `README.md` for joplin-llm-wiki
- **THEN** the document SHALL state that **Joplin Desktop** covers full-library reading and interactive use
- **AND** SHALL state that the **Joplin Data API** is required for automated writeback into the `note-wiki` notebook hierarchy
- **AND** SHALL state that Desktop, Data API token configuration, and sqlite export MUST agree on the **same profile** path or equivalent configuration


<!-- @trace
source: joplin-data-api-read-write
updated: 2026-05-18
code:
  - AGENTS.md
  - .agents/skills/spectra-apply/SKILL.md
  - src/commands/cmd-index.js
  - src/cli.js
  - src/joplin/data-api-client.js
  - .agents/skills/spectra-debug/SKILL.md
  - config.yaml.example
  - .agents/skills/spectra-commit/SKILL.md
  - README.md
  - .agents/skills/spectra-archive/SKILL.md
  - .agents/skills/spectra-propose/SKILL.md
  - src/joplin/data-api-client.js
  - src/joplin/wiki-writeback.js
  - .agents/skills/spectra-discuss/SKILL.md
  - .agents/skills/spectra-drift/SKILL.md
  - .agents/skills/spectra-audit/SKILL.md
  - src/config/load-config.js
  - .agents/skills/spectra-ingest/SKILL.md
  - .agents/skills/spectra-ask/SKILL.md
tests:
  - test/joplin-wiki-writeback.test.js
  - test/joplin-cli.test.js
  - test/config-schema.test.js
  - test/joplin-data-api-client.test.js
-->

---
### Requirement: REQ-JWKB-DATA-API-WRITE Joplin Data API write transport semantics

Before writeback mutations, the system SHALL execute Data API preflight as specified in `REQ-JDA-PREFLIGHT`.

For each required writeback action (parent folder resolve/create, topic folder resolve/create, note resolve/create/update including body), the system SHALL call the Joplin Data API using `joplin_data_api.timeout_ms` per HTTP request.

The system SHALL retry a failed HTTP request for the same logical action up to `joplin_wiki_writeback.max_cli_attempts` when the failure is classified as retryable by design.md, unless design.md marks the failure as non-retryable.

When any file in the batch still has no successful upsert after retries and design.md classifies that outcome as fatal, the command SHALL fail.

#### Scenario: SCN-JWKB-DAPI-01 Exhausted retries fail the command

- **WHEN** the Data API consistently returns errors for the first required writeback mutation
- **AND** retries are exhausted per `max_cli_attempts`
- **THEN** wiki-compile SHALL exit with code 1

<!-- @trace
source: joplin-data-api-read-write
updated: 2026-05-18
code:
  - AGENTS.md
  - .agents/skills/spectra-apply/SKILL.md
  - src/commands/cmd-index.js
  - src/cli.js
  - src/joplin/data-api-client.js
  - .agents/skills/spectra-debug/SKILL.md
  - config.yaml.example
  - .agents/skills/spectra-commit/SKILL.md
  - README.md
  - .agents/skills/spectra-archive/SKILL.md
  - .agents/skills/spectra-propose/SKILL.md
  - src/joplin/data-api-client.js
  - src/joplin/wiki-writeback.js
  - .agents/skills/spectra-discuss/SKILL.md
  - .agents/skills/spectra-drift/SKILL.md
  - .agents/skills/spectra-audit/SKILL.md
  - src/config/load-config.js
  - .agents/skills/spectra-ingest/SKILL.md
  - .agents/skills/spectra-ask/SKILL.md
tests:
  - test/joplin-wiki-writeback.test.js
  - test/joplin-cli.test.js
  - test/config-schema.test.js
  - test/joplin-data-api-client.test.js
-->