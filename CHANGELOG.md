# Changelog

## Unreleased

### Breaking

- **wiki-compile / `wiki_ingest`**: Omitted **`wiki_ingest.corpus_mode_enabled`** is now treated as **`true`** (notebook-wide rotated digest window and broader filesystem excerpts). This increases default Ollama prompt size and disk I/O versus the legacy compact planner digest / five-file excerpt path. Restore pre-change semantics with **`wiki_ingest.corpus_mode_enabled: false`** in YAML. See **`config.yaml.example`**, **`README.md`**, and design decision in `openspec/changes/expand-wiki-corpus-llm/design.md`.
