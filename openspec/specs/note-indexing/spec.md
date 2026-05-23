# note-indexing Specification

## Purpose

This project no longer ships a vector indexing pipeline. The active knowledge
loop reads Markdown directly from `raw/` and `wiki/`; legacy `index`, Chroma,
RAG, embedding, and vector-store behavior is intentionally absent from the
current implementation.

## Requirements

### Requirement: REQ-IDX-REMOVED Legacy vector indexing is not supported

The CLI SHALL NOT expose an `index` command.

The configuration loader SHALL reject legacy vector-indexing configuration keys
including `notes_root`, `notes_glob`, `wiki_root`, `chroma`, `rag`, `watch`,
`chunk`, `ollama.embed_model`, `ollama.embed_batch_size`,
`wiki_ingest.corpus_chroma_top_k`, and
`joplin_sqlite_sync.pipeline.run_index`.

The Health GUI repair path MAY remove legacy keys before saving a validated
configuration, but saved runtime configuration SHALL use `raw`, `wiki`, and
filesystem-based compile/query settings.

#### Scenario: SCN-IDX-REMOVED-01 Unknown index command

- **WHEN** an operator runs `joplin-llm-wiki index --config <path>`
- **THEN** the CLI exits non-zero with `BAD_COMMAND`.

#### Scenario: SCN-IDX-REMOVED-02 Legacy config rejected

- **WHEN** config YAML contains `chroma` or `joplin_sqlite_sync.pipeline.run_index`
- **THEN** `loadConfig` fails with `CONFIG_INVALID`.

### Requirement: REQ-IDX-REPLACED Filesystem discovery replaces vector indexing

The system SHALL discover source Markdown under resolved `raw` using `raw_glob`
for compile, query, lint, and SQLite snapshot comparison.

The system SHALL discover compiled Markdown under resolved `wiki` using
`wiki_glob` and SHALL only treat flat files under `summaries/`, `concepts/`, and
`indexes/` as compiled wiki knowledge.

#### Scenario: SCN-IDX-REPLACED-01 Query reads filesystem Markdown

- **WHEN** `query --source-scope=knowledge` runs with files under `wiki/` and
  `raw/`
- **THEN** context is assembled from filesystem Markdown without vector lookup.
