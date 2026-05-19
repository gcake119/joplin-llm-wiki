# Design: small-model thematic planner

## Decisions

1. **Per-window clustering**: planner targets 3–6 `topics/<slug>.md` per digest window; hubs optional.
2. **Heuristic fallback**: prefix bucketing on digest basenames → `topics/cluster-<offset>-<i>.md` when LLM fails quota.
3. **Retry semantics**: reuse `max_planner_rounds`; retry on parse failure OR insufficient non-hub paths.
4. **Sweep until cycle**: outer loop in `cmd-wiki-compile.js` when `run_until_cycle_complete` true, capped by `max_total_windows_per_invocation`.

## Modules

- `src/wiki/wiki-planner.js` — prompt, extractPathsFromModelJson, retry, heuristic merge
- `src/wiki/topic-path-heuristic.js` — deterministic topic paths
- `src/wiki/wiki-compiler.js` — prioritize topics on truncate
- `src/commands/cmd-wiki-compile.js` — sweep-until-cycle loop
