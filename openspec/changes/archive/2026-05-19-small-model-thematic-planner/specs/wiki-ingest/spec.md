## ADDED Requirements

### Requirement: REQ-WI-TOPIC-001 Minimum topic paths per compile window

When `wiki_ingest.min_topic_pages_per_run` is greater than zero, the planner stage SHALL attempt to produce at least that many wiki paths whose normalized form starts with `topics/` and are not listed in `wiki_schema.required_hub_pages`.

If Ollama rounds are exhausted without meeting the quota, the system SHALL merge deterministic heuristic topic paths and emit stderr JSON `{"warning":"PLAN_TOPIC_TOPUP_HEURISTIC",...}`.

#### Scenario: SCN-WI-TOPIC-01 Heuristic top-up after hub-only planner

- **WHEN** the model returns only hub paths for all planner rounds
- **THEN** the compile plan includes at least `min_topic_pages_per_run` paths under `topics/` from heuristic top-up

### Requirement: REQ-WI-SWEEP-UNTIL-001 Optional run until corpus cycle complete

When `wiki_ingest.corpus_auto_sweep.run_until_cycle_complete` is true, a single `wiki-compile` invocation SHALL execute sweep windows sequentially until `cycle_complete` is true or `max_total_windows_per_invocation` is reached.

#### Scenario: SCN-WI-SWEEP-UNTIL-01 Cycle completes within total cap

- **WHEN** a small notes fixture completes one full offset cycle in fewer windows than `max_total_windows_per_invocation`
- **THEN** stdout summary includes `cycle_complete: true`
