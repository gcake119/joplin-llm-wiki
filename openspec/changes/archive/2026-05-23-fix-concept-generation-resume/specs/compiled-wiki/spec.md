## ADDED Requirements

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

### Requirement: Concept index reflects canonical concepts only

`wiki/indexes/All-Concepts.md` SHALL list canonical concept entries only.

When multiple source titles or planned paths merge into one canonical concept, the index SHALL include one link for the canonical concept and SHALL NOT include duplicate links for merged aliases.

#### Scenario: SCN-WIKI-CONCEPT-INDEX-01 duplicate aliases excluded from index

- **WHEN** concept aliases `憂鬱症支持與心理衛教` and `憂鬱症陪伴、心理衛教與求助` merge into one canonical concept
- **THEN** `wiki/indexes/All-Concepts.md` contains one link to the canonical concept file
- **AND** the index does not contain separate entries for the merged aliases
