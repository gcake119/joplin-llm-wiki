# compiled-wiki Specification (delta)

## ADDED Requirements

### Requirement: REQ-WIKI-015 Corpus mode preserves mandatory frontmatter

When `wiki_ingest.corpus_mode_enabled` is true, every wiki markdown file produced or updated by `wiki-compile` SHALL still satisfy **REQ-WIKI-002** without removing or renaming existing mandatory keys.

#### Scenario: SCN-WIKI-CORPUS-FM

- **WHEN** corpus mode is true and a page is written
- **THEN** YAML frontmatter includes `source_refs`, `compiled_at`, and `compiler_revision`

---

### Requirement: REQ-WIKI-016 Corpus-mode writer evidence beyond legacy five-file excerpt window

When `wiki_ingest.corpus_mode_enabled` is true, the writer excerpt bundle passed to the Ollama chat call for a given wiki path SHALL be able to contain text read from a source file whose lexicographic rank under `discoverMarkdown` is **strictly greater than four** when **REQ-WCC-003** filesystem rotation places that file inside the active excerpt window for the fixture under test.

#### Scenario: SCN-WIKI-CORPUS-SLICE

- **WHEN** automated tests call `runWikiCompileFlow` with a temporary `notes_root` that contains at least eleven markdown files and embeds a unique ASCII token only inside the eleventh lexicographic file
- **AND** corpus digest offset and excerpt rotation are configured so that token-bearing file is included in the excerpt bundle for a chosen wiki path
- **THEN** the mock Ollama writer transcript for that path includes the unique token substring
