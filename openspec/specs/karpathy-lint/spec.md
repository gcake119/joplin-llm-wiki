# karpathy-lint Specification

## Purpose

The `lint` command performs filesystem checks over `raw/`, `wiki/`,
`brainstorming/`, and schema metadata. It no longer depends on embeddings,
Chroma, or vector indexes.

## Requirements

### Requirement: REQ-KL-001 Duplicate wiki basename candidates

The system SHALL emit duplicate candidates for wiki files that share the same
case-insensitive basename.

#### Scenario: SCN-KL-DUP-01 Duplicate basename listed

- **WHEN** `wiki/concepts/foo.md` and `wiki/summaries/foo.md` both exist
- **THEN** JSON `duplicates` contains an object with those paths.

### Requirement: REQ-KL-002 Raw readability scan

The system SHALL scan Markdown files under resolved `raw` and report unreadable
or invalid UTF-8 files under `skipped_notes`.

#### Scenario: SCN-KL-RAW-01 Invalid raw note listed

- **WHEN** a raw Markdown file decodes with replacement characters
- **THEN** it appears under `skipped_notes` with reason `INVALID_UTF8`.

### Requirement: REQ-KL-003 Wiki link gaps

The system SHALL scan Markdown links in wiki files and report broken relative
wiki links under `wiki_orphans`.

External URL links SHALL NOT be treated as wiki link gaps.

#### Scenario: SCN-KL-WIKI-LINK-01 Broken wiki link

- **WHEN** a wiki page links to a missing relative Markdown target
- **THEN** JSON `wiki_orphans` contains `reason: broken_wiki_link`.

### Requirement: REQ-KL-004 Schema and layout gaps

The system SHALL report wiki layout violations under `schema_gaps` when files
are not flat under `summaries/`, `concepts/`, or `indexes/`.

The system SHALL report missing required index files for
`indexes/All-Sources.md` and `indexes/All-Concepts.md`.

When `wiki_schema.path` is configured, the system SHALL report wiki files that
lack required frontmatter keys declared by the schema.

#### Scenario: SCN-KL-GAP-01 Missing index

- **WHEN** `wiki/indexes/All-Sources.md` is absent
- **THEN** `schema_gaps` contains a `missing_index` entry.

### Requirement: REQ-KL-005 Brainstorming follow-up candidates

The system SHALL list Markdown files under `brainstorming/chat/` as
`brainstorming_followups` so the operator can decide whether they should be
promoted into future knowledge work.

#### Scenario: SCN-KL-BRAIN-01 Chat note listed

- **WHEN** `brainstorming/chat/example.md` exists
- **THEN** JSON `brainstorming_followups` contains `example.md`.
