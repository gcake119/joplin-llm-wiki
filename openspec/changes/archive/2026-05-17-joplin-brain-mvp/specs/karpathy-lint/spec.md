# karpathy-lint — System Goal & Scope

Full Karpathy-style lint over **sources graph**, **wiki graph**, **vectors**, and **schema**: duplicate candidates (embedding similarity), link orphans (sources), wiki hub orphans, **contradiction candidates** (LLM-structured, local), and **schema gaps** (missing required pages or frontmatter).

# Components & Interfaces

| Name | Input | Output | Error codes | Idempotent |
|------|-------|--------|-------------|------------|
| KarpathyLintEngine | config, chroma, fs graphs | LintReport | LINT_JUDGE_FAILED | yes |
| ContradictionJudge | wiki + source excerpts | structured JSON | JUDGE_TIMEOUT | yes retry |

# Config & Env Vars

| Key | Type | Default | Required | Description |
|-----|------|---------|----------|-------------|
| lint.out_dir | string | reports | no | Output directory |
| lint.duplicate_similarity_threshold | number | 0.92 | no | Same as prior kb lint |
| lint.contradiction.max_pairs | number | 50 | no | Cap LLM judge invocations |
| lint.contradiction.timeout_ms | number | 180000 | no | Per batch timeout |

# Acceptance Tests

1. SCN-LINT-KFULL: `pnpm exec joplin-brain lint --config fixtures/full-karpathy.config.yaml` produces `.json` with keys `duplicates`, `orphans`, `contradictions`, `wiki_orphans`, `schema_gaps`, `skipped_notes`.

# Risks & Assumptions

- Contradiction results are **candidates** requiring human review.

## ADDED Requirements

### Requirement: REQ-KL-001 Duplicate embedding pairs

The system SHALL emit candidate duplicate pairs from cosine similarity ≥ `lint.duplicate_similarity_threshold` across combined embeddings when configured, or per-layer when `lint.duplicate_scope` is `source|wiki|both` (default `both`).

#### Scenario: SCN-KL-DUP Still works

- **WHEN** lint runs with indexed sources and wiki
- **THEN** JSON contains `duplicates` array

### Requirement: REQ-KL-002 Source link orphans

The system SHALL detect markdown notes under `notes_root` with zero outbound internal links and no backlinks when `lint.source_link_check` is true (default).

#### Scenario: SCN-KL-SRC-ORPH Source orphan listed

- **WHEN** a source note matches orphan definition
- **THEN** it appears under `orphans` with `layer: source`

### Requirement: REQ-KL-003 Wiki hub orphans

The system SHALL detect wiki pages listed in `required_hub_pages` from schema that have zero inbound links from other wiki pages.

#### Scenario: SCN-KL-WIKI-ORPH Hub orphan

- **WHEN** a hub page exists but no wiki page links to it
- **THEN** JSON `wiki_orphans` contains an object with `path` and `reason: hub_unlinked`

### Requirement: REQ-KL-004 Contradiction candidates via local LLM

The system SHALL select up to `lint.contradiction.max_pairs` pairs of excerpts (wiki-vs-wiki or wiki-vs-source) using heuristic scheduling (e.g. recent edits, shared entities).

The system SHALL call Ollama chat with a JSON-schema-constrained prompt and SHALL parse verdict objects with keys `severity`, `claim_a`, `claim_b`, `explanation`.

#### Scenario: SCN-KL-CONTRA Structured output

- **WHEN** lint completes contradiction stage successfully
- **THEN** `contradictions` array length ≥ 0 and every element contains `severity` and `explanation` strings

### Requirement: REQ-KL-005 Schema gap detection

The system SHALL list missing required hub pages, missing page types count below threshold, or pages lacking required frontmatter keys per schema.

#### Scenario: SCN-KL-GAP Missing hub

- **WHEN** schema declares a hub path absent on disk
- **THEN** `schema_gaps` contains `{ "type":"missing_hub", "path":"..." }`

### Requirement: REQ-KL-006 Report format

The system SHALL write paired Markdown and JSON reports under `lint.out_dir` with ISO8601 UTC timestamps in filenames.

The JSON SHALL contain arrays `duplicates`, `orphans`, `contradictions`, `wiki_orphans`, `schema_gaps`, `skipped_notes`.

#### Scenario: SCN-LINT-KFULL Keys present

- **WHEN** lint succeeds on fixture project
- **THEN** JSON parses and includes all six array keys
