## Why

On resource-constrained laptops (e.g. `gemma4:e4b`), `wiki-compile` corpus sweep runs but the planner often returns only schema hub paths or invalid JSON keys, so full-corpus thematic wiki build does not progress beyond `index.md` and `topics/overview.md`.

## What Changes

- Harden planner: JSON alias extraction, few-shot prompt, retries on empty/hub-only/insufficient topic paths.
- Config: `min_topic_pages_per_run`, `planner_reject_source_paths`.
- Deterministic `topics/cluster-<offset>-<n>.md` heuristic top-up when LLM rounds exhaust.
- Compiler: truncate budget favors topic paths over hubs.
- Sweep: optional `run_until_cycle_complete` with `max_total_windows_per_invocation`.

## Non-Goals

- One wiki page per source note (3000+ pages).
- Manual expansion of `required_hub_pages` for every note.

## Success Criteria

- [ ] Mock tests SCN-WCC-040–043 pass.
- [ ] Dry-run with small-model config yields ≥ `min_topic_pages_per_run` paths under `topics/`.
- [ ] `run_until_cycle_complete` reaches `cycle_complete` on small fixtures.
