## ADDED Requirements

### Requirement: Staged concept publish boundary

The Joplin wiki writeback stage SHALL publish concept resume output only when it is invoked as the explicit writeback stage by `wiki-compile` or `agent-compile`.

The stage SHALL treat `concepts/*.md` and `indexes/All-Concepts.md` as completed downstream relPaths and SHALL NOT infer or upsert `summaries/*.md` unless summary relPaths are explicitly included by a non-resume compile flow.

#### Scenario: SCN-JWKB-STAGED-PUBLISH-01 Writeback stage publishes completed concepts only

- **WHEN** `wiki-compile --resume-stage writeback` or `agent-compile --resume-stage writeback` runs without dry-run
- **AND** the local wiki contains `concepts/topic.md` and `indexes/All-Concepts.md`
- **THEN** writeback upserts only those downstream relPaths
- **AND** writeback does not upsert unchanged summaries.

### Requirement: Staged writeback dry-run remains non-mutating

The explicit writeback dry-run stage SHALL inspect the target Joplin notebook tree and SHALL report collisions, orphan candidates, and would-write counts without mutating notes or folders.

#### Scenario: SCN-JWKB-STAGED-DRYRUN-01 Writeback dry-run reports publication plan

- **WHEN** `wiki-compile --resume-stage writeback --dry-run` or `agent-compile --resume-stage writeback --dry-run` runs
- **THEN** the result includes `writeback_relpaths`
- **AND** the result includes `writeback_would_write`
- **AND** no mutating Joplin Data API request is sent.

### Requirement: Incremental writeback relPath contract

When an upstream compile stage provides a changed downstream relPath list, the writeback stage SHALL upsert only those relPaths.

The writeback stage SHALL return counts for created, updated, collision, and orphan candidate notes for the provided relPath list.

#### Scenario: SCN-JWKB-INCREMENTAL-RELPATHS-01 Changed concepts only

- **WHEN** writeback receives `concepts/topic.md` and `indexes/All-Concepts.md`
- **THEN** only those two wiki files are eligible for Joplin mutation
- **AND** unchanged `summaries/*.md` files are not listed, read for mutation, or upserted.
