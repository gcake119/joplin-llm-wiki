## ADDED Requirements

### Requirement: Concept writeback collision observability

The wiki writeback stage SHALL detect duplicate concept note titles in the Joplin concepts notebook before mutating notes when running in dry-run mode.

Dry-run output SHALL include the number of concept title collisions and the affected note titles. Non-dry-run SHALL preserve the existing duplicate-title failure instead of selecting one duplicate implicitly.

#### Scenario: SCN-JWKB-CONCEPT-COLLISION-01 dry-run reports duplicate concept titles

- **WHEN** writeback dry-run reads two existing Joplin notes titled `憂鬱症陪伴、心理衛教與求助` under the concepts notebook
- **THEN** the dry-run result reports `writeback_collision_count: 1`
- **AND** the result includes the duplicate concept title in collision details
- **AND** no mutating Joplin Data API request is sent

### Requirement: Downstream-only concept writeback

The wiki writeback stage SHALL accept a downstream-only path list from compile resume and SHALL upsert only those wiki files.

When the compile stage resumes at concept or writeback stage, writeback SHALL NOT upsert unchanged `summaries/*.md` files unless those summary paths are explicitly included in the relPath list.

For current canonical concept notes, the stage SHALL update an existing managed Joplin note before creating a new note. An existing managed note SHALL be found by a repo-managed identity marker or by a single unambiguous canonical title match in the target notebook.

#### Scenario: SCN-JWKB-CONCEPT-UPSERT-01 resume writeback excludes summaries

- **WHEN** writeback receives relPaths `concepts/topic.md` and `indexes/All-Concepts.md`
- **THEN** the stage upserts only those two wiki notes
- **AND** it does not list or update summary notes for mutation

##### Example: downstream relPath filtering

| relPaths input | Notes upserted | Summaries updated |
| ----- | ----- | ----- |
| `concepts/topic.md`, `indexes/All-Concepts.md` | 2 | 0 |

### Requirement: Joplin REST API note lifecycle for compiled wiki writeback

The Joplin writeback client SHALL model the official Joplin Data REST API note lifecycle for compiled wiki notes.

The client SHALL support creating notes with `POST /notes`, updating note fields with `PUT /notes/:id`, and moving notes to trash with `DELETE /notes/:id` when an explicit cleanup mode requests it. The system SHALL NOT use permanent deletion by default.

#### Scenario: SCN-JWKB-REST-CAPABILITY-01 update before create and trash only on cleanup

- **WHEN** writeback finds exactly one managed Joplin note for `concepts/topic.md`
- **THEN** it updates that note with `PUT /notes/:id`
- **AND** it does not create a duplicate note
- **WHEN** explicit cleanup mode confirms an orphan concept note
- **THEN** it deletes the orphan with `DELETE /notes/:id` without `permanent=1`

##### Example: REST actions by note state

| State | Action |
| ----- | ----- |
| No matching managed note | `POST /notes` |
| One matching managed note | `PUT /notes/:id` |
| Multiple matching notes | fail with collision |
| Confirmed orphan in cleanup mode | `DELETE /notes/:id` to trash |

### Requirement: Concept orphan reporting

The wiki writeback dry-run stage SHALL report existing Joplin concept notes that do not correspond to any current canonical `wiki/concepts/*.md` relPath.

The system SHALL report orphan candidates without deleting or modifying them unless an explicit cleanup mode is implemented and invoked. Cleanup SHALL move notes to trash by default and SHALL NOT use permanent delete unless a separate explicit permanent-delete option is added.

#### Scenario: SCN-JWKB-CONCEPT-ORPHAN-01 dry-run reports old concept notes

- **WHEN** Joplin concepts notebook contains `憂鬱症支持與心理衛教`
- **AND** current canonical wiki concepts contain only `concepts/depression-support-and-psychoeducation.md` with title `憂鬱症陪伴、心理衛教與求助`
- **THEN** writeback dry-run reports one orphan candidate
- **AND** the dry-run does not delete the old Joplin note
