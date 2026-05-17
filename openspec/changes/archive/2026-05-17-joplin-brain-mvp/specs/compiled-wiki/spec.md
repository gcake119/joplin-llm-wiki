# compiled-wiki — System Goal & Scope

Defines the **Compiled Wiki** tree (`wiki_root`): Markdown pages maintained by the local LLM pipeline, physically separate from immutable **Sources** (`notes_root`). Specifies directory layout contracts, mandatory frontmatter, and provenance links to source notes.

# Components & Interfaces

| Name | Input | Output | Error codes | Idempotent |
|------|-------|--------|-------------|------------|
| WikiFilesystem | wiki_root path | md files | WIKI_ROOT_MISSING | per-path hash |
| FrontmatterValidator | file content | parsed metadata | FRONTMATTER_INVALID | yes |

# Config & Env Vars

| Key | Type | Default | Required | Description |
|-----|------|---------|----------|-------------|
| wiki_root | string | — | yes for full Karpathy | Root directory for compiled wiki md |
| wiki.glob | string | **/*.md | no | Glob under wiki_root |
| write_back.sources_enabled | boolean | false | no | Allow modifying notes_root from tooling |

# Acceptance Tests

1. SCN-WIKI-FM-01: Given a wiki page missing required frontmatter keys, `wiki-compile` or validator exits 1 with `FRONTMATTER_INVALID`.

# Risks & Assumptions

- Operators back up `wiki_root`; regeneration can delete stale compiled pages only when explicitly configured.

## ADDED Requirements

### Requirement: REQ-WIKI-001 Wiki root separation

The system SHALL treat `wiki_root` as distinct from `notes_root`.

The Wiki maintenance pipeline SHALL NOT modify bytes under `notes_root` when configuration `write_back.sources_enabled` is false (default).

#### Scenario: SCN-WIKI-SEP Default no touch sources

- **WHEN** `write_back.sources_enabled` is false and `wiki-compile` runs
- **THEN** no file under `notes_root` changes mtime or content_hash

### Requirement: REQ-WIKI-002 Mandatory frontmatter

Every Markdown file under `wiki_root` produced or updated by `wiki-compile` SHALL contain YAML frontmatter with keys `source_refs` (array of strings), `compiled_at` (ISO8601 UTC), `compiler_revision` (string).

#### Scenario: SCN-WIKI-FM Required keys

- **WHEN** a new wiki page is written by `wiki-compile`
- **THEN** the file parses as YAML frontmatter and contains all three keys

### Requirement: REQ-WIKI-003 Source reference semantics

Each element of `source_refs` SHALL be a `relative_path` resolvable under `notes_root` pointing to the originating source note or section anchor documented in README.

#### Scenario: SCN-WIKI-REF Resolvable path

- **WHEN** `wiki-compile` completes for a fixture pair (sources + wiki)
- **THEN** every `source_refs` entry resolves to an existing file under `notes_root`
