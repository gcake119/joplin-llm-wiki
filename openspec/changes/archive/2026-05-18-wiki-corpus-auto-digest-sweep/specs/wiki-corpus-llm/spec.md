## ADDED Requirements

### Requirement: REQ-WCC-CORPUS-SWEEP-001 Corpus digest offset advancement between sweep windows

When corpus digest sweep mode is enabled (`wiki_ingest.corpus_auto_sweep.enabled` true), after a sweep window completes successfully and state advancement is permitted per REQ-WI-CORPUS-SWEEP-003, the system SHALL update the effective planner digest start index by adding `wiki_ingest.corpus_auto_sweep.step_files` (defaults resolved at load-config time to equal `wiki_ingest.corpus_digest_max_files`) and reducing modulo `max(1, totalMarkdownFiles)` using the same lexicographic discovery ordering as REQ-WCC-002.

The writer excerpt slice for corpus modes SHALL use the same effective `corpus_digest_offset` as the planner digest for that sweep window before applying mode-specific bumps (`filesystem_plus_chroma` hash bump remains additive on top of that base).

#### Scenario: SCN-WCC-SWEEP-OFFSET

- **WHEN** totalMarkdownFiles is 5, `corpus_digest_max_files` is 2, `step_files` is 2, and two sweep windows run with advancement enabled
- **THEN** the first planner digest covers indices {0,1} and the second covers indices {2,3} in lexicographic order

##### Example: wrap-around indices

| total | step | start offset | next offset after window |
| ----- | ---- | ------------ | ------------------------- |
| 5 | 2 | 4 | 1 |
| 3 | 3 | 0 | 0 |

---

### Requirement: REQ-WCC-CORPUS-SWEEP-002 Sweep step validation

`wiki_ingest.corpus_auto_sweep.step_files` MUST be rejected at `load-config` time with `CONFIG_INVALID` when it is greater than `wiki_ingest.corpus_digest_max_files`.

Sweep mode MUST be rejected with `CONFIG_INVALID` when `wiki_ingest.corpus_mode_enabled` resolves to false while sweep is enabled.

#### Scenario: SCN-WCC-SWEEP-CFG-INVALID

- **WHEN** `corpus_auto_sweep.enabled` is true and `corpus_mode_enabled` is false
- **THEN** `load-config` throws `CONFIG_INVALID`

#### Scenario: SCN-WCC-SWEEP-STEP

- **WHEN** `step_files` is 100 and `corpus_digest_max_files` is 80
- **THEN** `load-config` rejects the configuration with `CONFIG_INVALID`

