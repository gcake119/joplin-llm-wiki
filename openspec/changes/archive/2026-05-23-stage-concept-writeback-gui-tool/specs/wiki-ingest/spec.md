## MODIFIED Requirements

### Requirement: REQ-WI-020 Post-compile Joplin Data API writeback

When `joplin_wiki_writeback.enabled` is true and `wiki-compile` or `agent-compile` completes wiki file writes successfully without dry-run, the system SHALL invoke the Joplin Data API writeback stage before the process exits with code 0, except when the active resume stage is `concepts`.

When the active resume stage is `concepts`, the system SHALL write only local concept and concept-index files and SHALL defer Joplin publication to the `writeback` resume stage.

When `joplin_wiki_writeback.enabled` is false, `wiki-compile` and `agent-compile` SHALL skip writeback.

#### Scenario: SCN-WI-WB-01 Dry-run skips mutating Data API calls

- **WHEN** `wiki-compile --dry-run=true` or `agent-compile --dry-run=true` runs with writeback enabled
- **THEN** no writeback mutating Data API requests are executed.

#### Scenario: SCN-WI-WB-02 Success runs writeback

- **WHEN** full `wiki-compile` or `agent-compile` completes successfully without dry-run
- **AND** `joplin_wiki_writeback.enabled` is true
- **THEN** writeback executes before process exit.

#### Scenario: SCN-WI-STAGED-CONCEPT-01 Concept resume defers writeback

- **WHEN** `wiki-compile` or `agent-compile` runs with resume stage `concepts` without dry-run
- **AND** `joplin_wiki_writeback.enabled` is true
- **THEN** the system writes local concept and All-Concepts files
- **AND** the system does not send mutating Joplin Data API requests
- **AND** the JSON result reports `writeback_deferred: true`.

## ADDED Requirements

### Requirement: Staged concept resume output

The `wiki-compile` and `agent-compile` commands SHALL treat `--resume-stage concepts` as a local-file-only concept compilation stage.

The concepts stage SHALL read existing `wiki/summaries/*.md`, SHALL write only `wiki/concepts/*.md` and `wiki/indexes/All-Concepts.md`, and SHALL expose the downstream writeback relPaths that a later writeback stage can publish. Local mode SHALL perform writing through the Ollama-backed wiki compiler. Agent mode SHALL perform the same file contract through the local `codex exec` agent path without using a remote API service.

#### Scenario: SCN-WI-STAGED-CONCEPT-LOCAL-01 Concepts stage writes local outputs only

- **WHEN** an operator runs `wiki-compile --resume-stage concepts`
- **THEN** the system writes canonical concept files and `indexes/All-Concepts.md`
- **AND** the system leaves `wiki/summaries/*.md` unchanged
- **AND** the result contains `writeback_relpaths` for completed concept/index files.

#### Scenario: SCN-WI-STAGED-CONCEPT-AGENT-01 Agent concepts stage writes local outputs only

- **WHEN** an operator runs `agent-compile --resume-stage concepts`
- **THEN** the system writes canonical concept files and `indexes/All-Concepts.md`
- **AND** the system leaves `wiki/summaries/*.md` unchanged
- **AND** the system does not send mutating Joplin Data API requests
- **AND** the result contains `writeback_relpaths` for completed concept/index files.

### Requirement: Incremental concept rebuild from changed summaries

When changed raw content causes one or more summaries to change, the system SHALL compute a changed summary scope and SHALL use that scope to plan downstream concept rebuilds.

The system SHALL expand the impact scope from changed summaries through available `summary_refs`, `source_refs`, canonical concept metadata, and LLM semantic judgment when the relationship is ambiguous.

#### Scenario: SCN-WI-INCREMENTAL-CONCEPT-01 Changed summary rebuilds affected concept

- **WHEN** `summaries/a.md` changes after raw export
- **AND** existing concept metadata links `summaries/a.md` to `concepts/topic.md`
- **THEN** the concept planning stage includes `concepts/topic.md`
- **AND** the JSON result includes `changed_summary_paths: ["summaries/a.md"]`.

##### Example: changed summary scope expansion

| Changed summary | Existing concept metadata | Expected planned concept |
| ----- | ----- | ----- |
| `summaries/a.md` | `summary_refs: ["summaries/a.md"]` | `concepts/topic.md` |
| `summaries/b.md` | source_refs overlap with `concepts/finance.md` | `concepts/finance.md` |

### Requirement: Staged concept telemetry

Concept resume and incremental concept rebuild results SHALL expose enough telemetry for operators and GUI consumers to understand what changed and what remains to publish.

The JSON output SHALL include `compile_adapter`, `resume_stage`, `summary_paths_read`, `changed_summary_paths`, `concept_paths_planned`, `concept_paths_written`, `writeback_relpaths`, and `writeback_deferred` when applicable.

#### Scenario: SCN-WI-STAGED-TELEMETRY-01 Concept stage reports deferred writeback

- **WHEN** concept resume completes without dry-run
- **THEN** the JSON result includes `resume_stage: "concepts"`
- **AND** the JSON result includes `compile_adapter: "local"` or `compile_adapter: "agent"`
- **AND** the JSON result includes `writeback_deferred: true`
- **AND** the JSON result includes the relPaths required by the writeback stage.
