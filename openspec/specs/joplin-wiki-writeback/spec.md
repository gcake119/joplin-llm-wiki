# joplin-wiki-writeback Specification

## Purpose

TBD - created by archiving change 'joplin-wiki-db-writeback'. Update Purpose after archive.

## Requirements

### Requirement: REQ-JWKB-LOCAL-FIRST Local execution boundary

The system SHALL execute wiki writeback entirely on the local filesystem of the operator workstation.

The writeback stage SHALL NOT open outbound HTTP connections.

The system SHALL NOT connect to remote vector databases or third-party SaaS APIs as part of this capability.

#### Scenario: SCN-JWKB-LF-01 Writeback adds no HTTP

- **WHEN** joplin_wiki_writeback.enabled is true
- **AND** wiki-compile runs without --dry-run
- **AND** writeback executes
- **THEN** no outbound HTTP requests are opened by the writeback stage


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
  - src/joplin/cli-runner.js
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
### Requirement: REQ-JWKB-CONFIG Configuration surface

The system SHALL extend `config.yaml` with a `joplin_wiki_writeback` mapping containing at least:

| Key | Type | Default | Required when enabled |
| --- | ---- | ------- | ---------------------- |
| `enabled` | boolean | true | — |
| `parent_notebook_title` | string | `note-wiki` | — |
| `topic_frontmatter_key` | string | `domain` | — |
| `note_title_key` | string | `title` | — |
| `max_cli_attempts` | integer | 3 | — |

When `joplin_wiki_writeback.enabled` is true, `joplin_cli.enabled` SHALL be true and `joplin_cli.command` SHALL be non-empty, or config loading SHALL fail with `CONFIG_INVALID`.

The system SHALL NOT require `database_path` under `joplin_wiki_writeback` for writeback; database path remains the concern of `joplin_sqlite_sync` export only.

#### Scenario: SCN-JWKB-CFG-01 Writeback enabled without Joplin CLI fails fast

- **WHEN** joplin_wiki_writeback.enabled is true
- **AND** joplin_cli.enabled is false
- **THEN** config loading SHALL fail with CONFIG_INVALID

#### Scenario: SCN-JWKB-CFG-02 Defaults match notebook tree convention

- **WHEN** config omits `joplin_wiki_writeback.enabled`, `parent_notebook_title`, `topic_frontmatter_key`, and `note_title_key`
- **THEN** resolved config SHALL treat writeback as enabled with parent notebook title `note-wiki`, topic key `domain`, and note title key `title`


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
  - src/joplin/cli-runner.js
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
### Requirement: REQ-JWKB-DRYRUN Dry-run produces no durable Joplin updates

When `wiki-compile` is invoked with `--dry-run`, the writeback stage SHALL NOT spawn the Joplin CLI subprocess with arguments that mutate Joplin profile data.

#### Scenario: SCN-JWKB-DRY-01 No mutating CLI on dry-run

- **WHEN** wiki-compile runs with --dry-run
- **AND** joplin_wiki_writeback.enabled is true
- **THEN** zero writeback-related Joplin CLI invocations that persist notebook tree or note body changes are executed


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
  - src/joplin/cli-runner.js
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
### Requirement: REQ-JWKB-NOTEBOOK-TREE Parent and topic notebooks

For each `wiki-compile` writeback batch, the system SHALL resolve the parent notebook whose human-readable title equals `joplin_wiki_writeback.parent_notebook_title`.

When the parent notebook does not exist and the invocation is not `--dry-run`, the system SHALL create that top-level notebook using Joplin CLI before creating any topic notebooks or notes.

For each wiki Markdown file in the writeback batch, the system SHALL parse YAML frontmatter and read a topic string from the key named by `joplin_wiki_writeback.topic_frontmatter_key`. When the key is absent, null, or a non-string, the topic SHALL be `_uncategorized`. When the string is non-empty after trim, the system SHALL normalize it into a notebook title per design.md (trim, forbid path separators, enforce maximum length, stable Unicode normalization).

For each distinct normalized topic in the batch, the system SHALL resolve a child notebook directly under the parent whose title equals that normalized topic. When the child notebook does not exist and the invocation is not `--dry-run`, the system SHALL create it using Joplin CLI.

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
source: joplin-wiki-db-writeback
updated: 2026-05-17
code:
  - my.config.yaml
  - src/joplin/wiki-writeback.js
  - src/config/load-config.js
  - fixtures/full-karpathy.config.yaml
  - README.md
  - config.yaml.example
  - src/joplin/cli-runner.js
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
  - src/joplin/cli-runner.js
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

When Joplin CLI reports that a target notebook cannot be created, a target note cannot be resolved for update, or a create/update cannot accept a body write, the system SHALL record a skip reason or fail the command per design.md fatal-vs-skip table.

#### Scenario: SCN-JWKB-ROW-01 CLI skip outcome

- **GIVEN** Joplin CLI returns a documented skip outcome for one file in the batch
- **WHEN** the outcome is classified as skippable in design.md
- **THEN** no successful upsert is recorded for that file in the writeback summary


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
  - src/joplin/cli-runner.js
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
### Requirement: REQ-JWKB-CLI-WRITE Joplin CLI write semantics

Before writeback mutations, the system SHALL run Joplin CLI preflight using the same mechanism as `runJoplinCliPreflight`.

For each required CLI action (notebook resolve/create, note create/update, body set), the system SHALL spawn `joplin_cli.command` with arguments aligned to design.md Implementation Contract and current Joplin terminal documentation, using `joplin_cli.timeout_ms` per invocation.

The system SHALL retry a failed subprocess for the same logical action up to `joplin_wiki_writeback.max_cli_attempts` when exit is non-zero or timeout occurs, unless design.md marks the failure as non-retryable.

When any file in the batch still has no successful upsert after retries and design.md classifies that outcome as fatal, the command SHALL fail.

#### Scenario: SCN-JWKB-CLI-01 Non-zero exit fails after retries

- **WHEN** Joplin CLI consistently exits non-zero for the first required writeback action
- **AND** retries are exhausted
- **THEN** wiki-compile SHALL exit with code 1


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
  - src/joplin/cli-runner.js
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
### Requirement: REQ-JWKB-ERRORS Error reporting

When Joplin CLI preflight or a writeback spawn fails irrecoverably, the command SHALL exit with code 1 and stderr SHALL contain a single JSON object with `"error":"JOPLIN_CLI_FAILED"` or `"error":"JOPLIN_CLI_WRITE_FAILED"`.

#### Scenario: SCN-JWKB-ERR-01 Preflight failure surfaces JSON

- **WHEN** Joplin CLI preflight exits non-zero
- **THEN** the command SHALL exit with code 1
- **AND** stderr SHALL contain JOPLIN_CLI_FAILED


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
  - src/joplin/cli-runner.js
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
### Requirement: REQ-JWKB-README-PREREQUISITES Operator install documentation

The repository SHALL document in `README.md` that operators install **Joplin Desktop** (or an equivalent official Joplin client) to browse and manage the full note corpus, and that this client SHALL use the **same Joplin profile** as `joplin_sqlite_sync` (when export is enabled) so `database.sqlite` export targets match the operator's authoritative library.

The repository SHALL document in `README.md` that operators install the **Joplin terminal CLI** separately and configure `joplin_cli.command`, and that this CLI is used for **wiki-compile writeback** into the configured notebook tree (default top-level `note-wiki`) to publish the LLM-maintained compiled wiki alongside the same profile used by Desktop.

#### Scenario: SCN-JWKB-DOC-01 README lists Desktop and CLI roles

- **WHEN** an operator reads the setup section of `README.md` for joplin-brain
- **THEN** the document SHALL state that **Joplin Desktop** covers full-library reading and interactive use
- **AND** SHALL state that the **Joplin CLI** is required for automated writeback into the `note-wiki` notebook hierarchy
- **AND** SHALL state that Desktop, CLI, and sqlite export MUST agree on the **same profile** path or equivalent configuration

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
  - src/joplin/cli-runner.js
  - src/cli.js
  - src/wiki/wiki-compiler.js
tests:
  - test/wiki-separation.test.js
  - test/integration-index.test.js
  - test/config-schema.test.js
  - test/joplin-wiki-writeback.test.js
  - test/joplin-sqlite.test.js
-->