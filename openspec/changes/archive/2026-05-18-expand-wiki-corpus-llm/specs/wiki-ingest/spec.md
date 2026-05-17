# wiki-ingest Specification (delta)

## ADDED Requirements

### Requirement: REQ-WI-030 Corpus mode respects page budget

When `wiki_ingest.corpus_mode_enabled` is true, the system SHALL enforce **REQ-WI-001** unchanged: the number of distinct wiki markdown files created or updated in one `wiki-compile` invocation SHALL NOT exceed **`wiki_ingest.max_pages_per_run`**.

#### Scenario: SCN-WI-CORPUS-CAP

- **WHEN** corpus_mode_enabled is true and the planner returns more candidate paths than `max_pages_per_run`
- **THEN** the implementation truncates to `max_pages_per_run` before writing
- **AND** stdout summary reports truncation consistent with **SCN-WI-CAP**

---

### Requirement: REQ-WI-031 Corpus excerpt uses local Chroma only

When corpus excerpt configuration requests Chroma augmentation, the system SHALL open Chroma only through the embedded client bound to **`chroma.persist_path`** for read-only neighbor queries and SHALL NOT target a remote Chroma HTTP server in the default configuration profile.

#### Scenario: SCN-WI-CORPUS-LOCALCH

- **WHEN** corpus_writer_excerpt_mode enables chroma augmentation
- **THEN** excerpt retrieval instantiates the vector store using **`chroma.persist_path`** identical to the embedded client policy used by `index` for `collection_sources`
- **AND** no new configuration key introduces a remote Chroma HTTP base URL for MVP defaults
