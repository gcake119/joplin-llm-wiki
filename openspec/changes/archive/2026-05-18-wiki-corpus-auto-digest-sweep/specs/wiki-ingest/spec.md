## ADDED Requirements

### Requirement: REQ-WI-CORPUS-SWEEP-001 Corpus digest sweep orchestration

When `wiki_ingest.corpus_auto_sweep.enabled` is true and corpus mode resolves to enabled, a single `wiki-compile` CLI invocation SHALL execute up to `wiki_ingest.corpus_auto_sweep.max_windows_per_invocation` sequential sweep windows in one OS process.

Each sweep window SHALL run the existing wiki-compile pipeline (planner, writer, optional writeback) using an effective `corpus_digest_offset` equal to the persisted sweep state value modulo the discovery list length with the same normalization rules as legacy corpus mode.

When `wiki_ingest.corpus_auto_sweep.enabled` is false, the system SHALL preserve the single-window behavior described in existing wiki-ingest requirements.

#### Scenario: SCN-WI-SWEEP-MULTI

- **WHEN** sweep is enabled with `max_windows_per_invocation` at least 2 and enough markdown files exist to rotate the digest
- **THEN** the process performs at least two planner invocations with different effective offsets before exiting successfully

---

### Requirement: REQ-WI-CORPUS-SWEEP-002 Sweep state file and fingerprint reset

The system SHALL persist sweep progress in a JSON state file at `wiki_ingest.corpus_auto_sweep.state_path` when provided, otherwise at the default path documented in design.md under `wiki_root`.

The state file SHALL record at minimum: `schema_version`, `next_offset`, `markdown_file_count`, `step_files`, `updated_at_ms`.

Before advancing offsets, if the current discovered markdown file count differs from `markdown_file_count` stored in state, the system SHALL reset sweep progression by setting `next_offset` to 0 and updating `markdown_file_count` to the current count, and MUST emit telemetry identifying fingerprint reset.

The system SHALL NOT mutate the operator-edited `config.yaml` to advance offsets.

#### Scenario: SCN-WI-SWEEP-FPR-RESET

- **WHEN** state exists with `markdown_file_count` equal to 10 and discovery later reports 11 files before the first sweep window begins
- **THEN** the effective offset for the first window is 0 relative to the reset semantics
- **AND** telemetry indicates fingerprint reset

---

### Requirement: REQ-WI-CORPUS-SWEEP-003 Dry-run interaction with sweep state

When `wiki-compile` runs with `--dry-run` and `wiki_ingest.corpus_auto_sweep.advance_state_on_dry_run` is false, the system SHALL NOT update `next_offset` or `updated_at_ms` in the sweep state file after a window completes.

When `--dry-run` is active and `advance_state_on_dry_run` is true, the system SHALL advance `next_offset` after each completed window exactly as non-dry-run mode does, MUST persist the state file, and MUST emit telemetry warning that dry-run advanced sweep state.

#### Scenario: SCN-WI-SWEEP-DRY-NO-ADVANCE

- **WHEN** sweep is enabled, `advance_state_on_dry_run` is false, and two sweep windows would run without dry-run
- **THEN** a `--dry-run` invocation performs planner-visible work for the starting window but leaves `next_offset` unchanged on disk

---

### Requirement: REQ-WI-CORPUS-SWEEP-004 Window-local page budget under sweep

When sweep is enabled, the constraint in REQ-WI-001 SHALL apply independently to each sweep window inside the same CLI invocation.

The product of `max_windows_per_invocation` and `max_pages_per_run` forms an upper bound on distinct wiki paths processed in one invocation only when the planner saturates the budget every window.

#### Scenario: SCN-WI-SWEEP-BUDGET

- **WHEN** `max_pages_per_run` is 3 and sweep runs 2 windows and each planner returns 5 paths
- **THEN** at most 3 distinct wiki files are written or planned per window
- **AND** truncation telemetry matches REQ-WI-001 semantics within each window

