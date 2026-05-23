# wiki-corpus-llm Specification

## Purpose

Corpus-oriented compilation widens what the local Ollama planner/writer can see
from `raw/` without reintroducing Chroma, embeddings, or vector RAG. The current
implementation uses filesystem digest rotation and filesystem writer slices.

## Requirements

### Requirement: REQ-WCC-LOCAL Corpus LLM wiki local-first

Corpus-oriented compilation SHALL keep plaintext on the host filesystem and
SHALL send prompts only to `ollama.base_url`.

The corpus feature SHALL NOT require Chroma, remote embeddings, hosted vector
endpoints, or OpenAI API providers.

#### Scenario: SCN-WCC-LOCAL-01 Filesystem-only corpus

- **WHEN** corpus mode resolves to enabled
- **THEN** corpus digest assembly reads only Markdown under resolved `raw`
  matching `raw_glob`
- **AND** writer excerpt assembly uses filesystem slices, not Chroma queries.

### Requirement: REQ-WCC-001 Corpus mode defaults on

The system SHALL treat `wiki_ingest.corpus_mode_enabled` as true when the key is
omitted.

Operators MAY set `wiki_ingest.corpus_mode_enabled: false` to restore the compact
legacy digest size used by the current code path, without enabling vectors.

#### Scenario: SCN-WCC-DEFAULT-OMITTED

- **WHEN** configuration omits `wiki_ingest.corpus_mode_enabled`
- **THEN** planner digest widening is active.

### Requirement: REQ-WCC-002 Planner digest window

When `wiki_ingest.corpus_mode_enabled` is true, `summarizeSourcesForPlanner`
SHALL include path and mtime lines for
`min(totalMarkdownFiles, corpus_digest_max_files)` discovered raw Markdown paths
starting at `corpus_digest_offset` modulo `max(1, totalMarkdownFiles)` in stable
lexicographic discovery order.

Values outside the declared configuration bounds SHALL be rejected at
`loadConfig` time with `CONFIG_INVALID`.

#### Scenario: SCN-WCC-DIGEST-WINDOW

- **WHEN** total Markdown files is 120 and `corpus_digest_max_files` is 80
- **THEN** the planner prompt digest contains metadata lines for exactly 80 raw
  relative paths.

### Requirement: REQ-WCC-003 Writer excerpt uses filesystem slices

When `wiki_ingest.corpus_mode_enabled` is true, writer excerpt text SHALL be
assembled from raw Markdown filesystem slices aligned with the effective
`corpus_digest_offset`.

The only accepted `wiki_ingest.corpus_writer_excerpt_mode` value SHALL be
`filesystem_slice`.

#### Scenario: SCN-WCC-EXCERPT-FS

- **WHEN** `wiki-compile` writes a page in corpus mode
- **THEN** the writer prompt includes filesystem source excerpts and does not
  instantiate a vector store.

### Requirement: REQ-WCC-005 Telemetry fields

When `wiki_ingest.corpus_mode_enabled` is true, successful and dry-run payloads
SHALL include `corpus_mode: true` and
`corpus_digest_paths_in_prompt_count`.

#### Scenario: SCN-WCC-TELEMETRY

- **WHEN** corpus mode is true and pages are planned
- **THEN** stdout JSON includes corpus telemetry fields.

### Requirement: REQ-WCC-CORPUS-SWEEP-001 Corpus digest offset advancement

When corpus digest sweep mode is enabled, after a sweep window completes and
state advancement is permitted, the system SHALL update the persisted
`next_offset` by adding `wiki_ingest.corpus_auto_sweep.step_files` modulo
`max(1, totalMarkdownFiles)`.

The writer excerpt slice SHALL use the same effective `corpus_digest_offset` as
the planner digest for that sweep window.

#### Scenario: SCN-WCC-SWEEP-OFFSET

- **WHEN** total Markdown files is 5, `step_files` is 2, and two sweep windows
  run with advancement enabled
- **THEN** the first planner digest starts at index 0 and the second starts at
  index 2 in lexicographic order.
