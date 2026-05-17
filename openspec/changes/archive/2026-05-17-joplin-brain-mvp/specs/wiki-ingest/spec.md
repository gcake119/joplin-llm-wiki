# wiki-ingest — System Goal & Scope

**Wiki compile / ingest** batch: plan which wiki pages to touch (bounded), invoke local LLM with structured prompts, write or update files under `wiki_root`, optional dry-run. Aligns with Karpathy single-ingest touching **10–15** wiki pages (here configurable default **15**).

# Components & Interfaces

| Name | Input | Output | Error codes | Idempotent |
|------|-------|--------|-------------|------------|
| WikiPlanner | changed sources summary, schema | ordered wiki path list | PLAN_EMPTY | yes |
| WikiWriter | planned pages + context | markdown files | WRITE_FAILED | hash-idempotent |

# Config & Env Vars

| Key | Type | Default | Required | Description |
|-----|------|---------|----------|-------------|
| wiki_ingest.max_pages_per_run | number | 15 | no | Hard cap pages touched per invocation |
| wiki_ingest.min_pages_per_run | number | 10 | no | Soft lower target for planner |
| wiki_ingest.max_planner_rounds | number | 3 | no | LLM round-trip limit |
| write_back.sources_enabled | boolean | false | no | Allow modifying notes_root (default deny) |

# Acceptance Tests

1. SCN-WIKI-COMPILE: Fixtures with schema + sources; `pnpm exec joplin-brain wiki-compile --config ...`; expect ≤ `max_pages_per_run` files created or updated with valid frontmatter.
2. SCN-WIKI-DRY: `--dry-run` emits JSON plan without filesystem writes.

# Risks & Assumptions

- Planner may return fewer pages than min; log warning, exit 0 if schema satisfied.

## ADDED Requirements

### Requirement: REQ-WI-001 Page budget per run

The system SHALL NOT create or update more than `wiki_ingest.max_pages_per_run` distinct wiki files in one `wiki-compile` invocation.

#### Scenario: SCN-WI-CAP Budget enforced

- **WHEN** planner returns 20 candidate paths and max_pages_per_run is 15
- **THEN** only 15 files are written and stdout summary states truncation occurred

##### Example: cap table

| max_pages_per_run | Planner candidates | Files written |
|-------------------|-------------------|---------------|
| 15 | 20 | 15 |
| 15 | 8 | 8 |

### Requirement: REQ-WI-002 Dry-run mode

When `--dry-run` is passed, the system SHALL NOT write or modify files under `wiki_root`.

The system SHALL emit a JSON document listing planned paths and reasons.

#### Scenario: SCN-WI-DRY No writes

- **WHEN** `wiki-compile --dry-run` executes
- **THEN** wiki md file mtimes under `wiki_root` remain unchanged

### Requirement: REQ-WI-003 Planner uses local Ollama only

The WikiPlanner SHALL send HTTP only to `ollama.base_url`.

#### Scenario: SCN-WI-LOCAL Planner HTTP

- **WHEN** wiki-compile runs successfully
- **THEN** no HTTP host other than `ollama.base_url` receives planner or writer prompts
