## ADDED Requirements

### Requirement: REQ-WCC-PLANNER-ALIAS-001 Planner JSON alias extraction

The wiki planner SHALL normalize model JSON by accepting string arrays from keys `paths`, `items`, `answer`, `files`, or `plan`, and objects with a string `path` field, before applying path validation.

#### Scenario: SCN-WCC-PLANNER-ALIAS-01 Items key accepted

- **WHEN** the model returns `{"items":["topics/foo.md"]}`
- **THEN** the planner treats `topics/foo.md` as a candidate wiki path

### Requirement: REQ-WCC-PLANNER-SOURCE-001 Reject bare source filenames in planner output

When `wiki_ingest.planner_reject_source_paths` is true, paths that look like bare exported note basenames (no slash, hash-like stem) SHALL NOT be passed to the compile plan unless rewritten under `topics/`.
