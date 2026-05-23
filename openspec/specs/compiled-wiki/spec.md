# compiled-wiki Specification

## Purpose

Compiled wiki output is the curated filesystem layer under `wiki/`. It is
derived from source evidence under `raw/`, uses a flat directory contract, and
can be mirrored to Joplin through the local Data API writeback path.

## Requirements

### Requirement: REQ-WIKI-001 Raw/wiki separation

The system SHALL treat `raw` as source evidence and `wiki` as compiled output.

`wiki-compile` SHALL NOT modify files under `raw`.

Compiled wiki files SHALL be written only under these paths:

- `wiki/summaries/*.md`
- `wiki/concepts/*.md`
- `wiki/indexes/All-Sources.md`
- `wiki/indexes/All-Concepts.md`

The system SHALL NOT create child folders below `summaries/`, `concepts/`, or
`indexes/`.

#### Scenario: SCN-WIKI-SEP-01 Default no raw writes

- **WHEN** `wiki-compile` runs successfully
- **THEN** no file under `raw` is modified by the compile step.

#### Scenario: SCN-WIKI-LAYOUT-01 Flat output only

- **WHEN** planner output contains nested paths such as
  `concepts/nested/topic.md`
- **THEN** those paths are filtered out and are not written.

---
### Requirement: REQ-WIKI-002 Mandatory frontmatter

Every Markdown file under `wiki` produced or updated by `wiki-compile` SHALL
contain YAML frontmatter with keys:

- `source_refs`: array of raw-relative source paths
- `compiled_at`: ISO8601 timestamp string
- `compiler_revision`: string
- `domain`: Joplin writeback topic/notebook title
- `title`: Joplin writeback note title

#### Scenario: SCN-WIKI-FM-01 Required keys

- **WHEN** a new wiki page is written by `wiki-compile`
- **THEN** the file parses as YAML frontmatter and contains all required keys.

---
### Requirement: REQ-WIKI-003 Source reference semantics

Each `source_refs` entry SHALL be a path relative to `raw` and SHALL resolve
under `raw` without escaping the source root.

`source_refs` SHALL refer to existing Markdown source files when the page is
written.

#### Scenario: SCN-WIKI-REF-01 Resolvable raw path

- **WHEN** `wiki-compile` writes a page from a raw slice
- **THEN** every `source_refs` entry resolves to an existing file under `raw`.

---
### Requirement: REQ-WIKI-010 Repository default path convention

`config.yaml.example` SHALL use repository-root `./raw` and `./wiki` defaults.

Repository documentation SHALL state that `raw/` and `wiki/` are gitignored
runtime/output directories by default.

#### Scenario: SCN-WIKI-EX-01 Example paths

- **WHEN** an operator copies `config.yaml.example` to a repo-root config
- **THEN** `raw` resolves to repo-root `raw/` and `wiki` resolves to repo-root
  `wiki/`.

---
### Requirement: REQ-WIKI-011 Wiki section routing for Joplin writeback

The repository SHALL document that compiled wiki writeback routes pages by their
wiki path section: `summaries`, `concepts`, or `indexes`.

When a wiki path is outside those sections, writeback routing SHALL fall back to
`_uncategorized`.

#### Scenario: SCN-WIKI-SECTION-01 Documentation mentions section routing

- **WHEN** README describes the Joplin writeback tree
- **THEN** it mentions `@llm-wiki/wiki/summaries`,
  `@llm-wiki/wiki/concepts`, and `@llm-wiki/wiki/indexes`.

---
### Requirement: REQ-WIKI-015 Corpus mode preserves mandatory frontmatter

When `wiki_ingest.corpus_mode_enabled` is true, every wiki Markdown file produced
or updated by `wiki-compile` SHALL still satisfy **REQ-WIKI-002**.

#### Scenario: SCN-WIKI-CORPUS-FM-01

- **WHEN** corpus mode writes a page
- **THEN** YAML frontmatter includes the mandatory compiled wiki keys.

---
### Requirement: Compiled concept evidence consistency

Every compiled concept page produced or updated by the system SHALL keep the filesystem slug, frontmatter `title`, body H1, and `source_refs` aligned to the same canonical concept.

The body of a concept page SHALL synthesize evidence from its own concept source set. The system SHALL NOT write a concept page when the selected evidence set is unrelated to the canonical concept title.

#### Scenario: SCN-WIKI-CONCEPT-CONSISTENCY-01 title body and sources match

- **WHEN** the system writes `wiki/concepts/depression-support-and-psychoeducation.md`
- **THEN** the frontmatter `title` represents the same concept as the filename slug
- **AND** the first Markdown H1 represents the same concept as the frontmatter `title`
- **AND** every `source_refs` entry belongs to the evidence set used to generate the page body

##### Example: reject mismatched concept evidence

- **GIVEN** a planned concept title `憂鬱症陪伴、心理衛教與求助`
- **AND** the selected evidence set contains only investment and frontend learning sources
- **WHEN** non-dry-run concept writing starts
- **THEN** the system fails the concept page before writing it
- **AND** the failure reports a concept evidence mismatch


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
### Requirement: Concept index reflects canonical concepts only

`wiki/indexes/All-Concepts.md` SHALL list canonical concept entries only.

When multiple source titles or planned paths merge into one canonical concept, the index SHALL include one link for the canonical concept and SHALL NOT include duplicate links for merged aliases.

#### Scenario: SCN-WIKI-CONCEPT-INDEX-01 duplicate aliases excluded from index

- **WHEN** concept aliases `憂鬱症支持與心理衛教` and `憂鬱症陪伴、心理衛教與求助` merge into one canonical concept
- **THEN** `wiki/indexes/All-Concepts.md` contains one link to the canonical concept file
- **AND** the index does not contain separate entries for the merged aliases

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