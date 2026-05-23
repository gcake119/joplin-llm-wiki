## ADDED Requirements

### Requirement: Concept canonicalization during wiki compile

The wiki compile system SHALL canonicalize concept output before writing `wiki/concepts/*.md`.

A canonical concept SHALL bind one normalized slug, one frontmatter `title`, one body H1, and one evidence set. When two planned concept paths normalize to the same canonical topic, the system SHALL write one canonical concept file and SHALL report the merged titles in compile telemetry.

The final decision that two concepts describe the same topic SHALL be made by an LLM semantic judgment over summary excerpts, raw evidence references, and existing canonical concept context. String equality, slug similarity, title overlap, and filename prefix matching SHALL be used only to gather candidates for the LLM judgment.

#### Scenario: SCN-WI-CONCEPT-CANON-01 stable concept across repeated runs

- **WHEN** two compile windows plan concepts named `depression-support-and-psychoeducation` and `depression-support-psychoeducation`
- **THEN** the system writes or updates one canonical `concepts/depression-support-and-psychoeducation.md` file
- **AND** compile telemetry reports `canonical_merge_count: 1`

##### Example: similar concept title merge

- **GIVEN** planned titles `憂鬱症支持與心理衛教` and `憂鬱症陪伴、心理衛教與求助`
- **WHEN** the LLM semantic judgment classifies both candidate concepts as the same topic
- **THEN** the output includes one concept file with `merged_from` containing the non-canonical title

### Requirement: LLM semantic concept relation judgment

The wiki compile system SHALL classify concept relation candidates with an LLM semantic judgment before merging them.

The judgment input SHALL include candidate concept titles, summary excerpts, source_refs, and any existing canonical concept summary. The judgment output SHALL include `relation`, `confidence`, and `reason`. The system SHALL NOT merge a candidate into an existing canonical concept when the LLM returns a low-confidence or distinct-topic judgment.

#### Scenario: SCN-WI-CONCEPT-SEMANTIC-01 semantic judgment overrides string similarity

- **WHEN** two concept candidates have similar titles but their summary excerpts describe distinct topics
- **THEN** the system keeps them as separate canonical concepts
- **AND** compile telemetry includes a semantic decision with `relation: distinct_topic`

##### Example: string-similar but semantically distinct

| Candidate A | Candidate B | LLM relation | Expected output |
| ----- | ----- | ----- | ----- |
| `投資心理與風險承受` | `心理衛教與求助` | `distinct_topic` | Two canonical concept files |

### Requirement: Concept resume stage

The `wiki-compile` command SHALL support a resume stage that starts from existing `wiki/summaries/*.md` and produces only concept and concept-index output.

When the resume stage is `concepts`, the system SHALL read existing summaries, SHALL use their frontmatter and source references as the concept planning input, SHALL write only `wiki/concepts/*.md` and `wiki/indexes/All-Concepts.md`, and SHALL NOT rewrite `wiki/summaries/*.md`.

#### Scenario: SCN-WI-RESUME-CONCEPTS-01 concept-only resume skips summaries

- **WHEN** an operator runs `wiki-compile` with resume stage `concepts`
- **AND** `wiki/summaries/a.md` and `wiki/summaries/b.md` already exist
- **THEN** the system reads the existing summary files
- **AND** the system writes concept and All-Concepts files only
- **AND** the system leaves summary file mtimes unchanged

##### Example: concept resume telemetry

| Input summaries | Output concepts | Expected telemetry |
| ----- | ----- | ----- |
| `summaries/a.md`, `summaries/b.md` | `concepts/topic.md` | `resume_stage: concepts`, `summary_paths_read: 2`, `concept_paths_written: 1` |

### Requirement: Writeback resume stage

The `wiki-compile` command SHALL support a resume stage that starts from existing concepts and indexes and performs only Joplin wiki writeback.

When the resume stage is `writeback`, the system SHALL read existing `wiki/concepts/*.md` and `wiki/indexes/All-Concepts.md`, SHALL pass only those relative paths to the writeback stage, and SHALL NOT invoke summary generation, concept generation, or Ollama chat completion.

#### Scenario: SCN-WI-RESUME-WRITEBACK-01 writeback-only resume skips model work

- **WHEN** an operator runs `wiki-compile` with resume stage `writeback`
- **THEN** the system does not call Ollama chat completion
- **AND** the system passes only `concepts/*.md` and `indexes/All-Concepts.md` paths to Joplin writeback
- **AND** the JSON summary reports `resume_stage: writeback`
