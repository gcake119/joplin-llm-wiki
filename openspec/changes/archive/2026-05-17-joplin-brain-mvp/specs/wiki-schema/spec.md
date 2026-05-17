# wiki-schema — System Goal & Scope

Machine-readable **Schema** for Karpathy workflows: page types, required hub links, ingest workflow steps, and structural rules used by `wiki-compile` validation and `lint` gap detection.

# Components & Interfaces

| Name | Input | Output | Error codes | Idempotent |
|------|-------|--------|-------------|------------|
| SchemaValidator | wiki_schema.path file | validated model | SCHEMA_INVALID | yes |

# Config & Env Vars

| Key | Type | Default | Required | Description |
|-----|------|---------|----------|-------------|
| wiki_schema.path | string | — | yes | Path to schema file (YAML or JSON) |
| wiki_schema.strict | boolean | true | no | Fail wiki-compile on validation errors |

# Acceptance Tests

1. SCN-SCHEMA-01: Run validator against `wiki-schema.example.yaml`; expect exit 0.
2. SCN-SCHEMA-02: Corrupt schema (duplicate page type id); expect exit 1 `SCHEMA_INVALID`.

# Risks & Assumptions

- Schema versioning tracked via top-level `schema_version` key.

## ADDED Requirements

### Requirement: REQ-WS-001 Schema document shape

The schema file SHALL contain keys `schema_version` (string), `page_types` (array of objects with `id`, `required_frontmatter_keys`, `required_outbound_link_patterns`), and `required_hub_pages` (array of relative wiki paths).

#### Scenario: SCN-SCHEMA-SHAPE Parse succeeds

- **WHEN** SchemaValidator loads a conforming schema file
- **THEN** parsing completes without error and exposes page_types count ≥ 1

### Requirement: REQ-WS-002 Hub pages existence

When `wiki_schema.strict` is true, before `wiki-compile` writes output, the system SHALL verify every path in `required_hub_pages` exists under `wiki_root` or is scheduled for creation in the current compile plan.

#### Scenario: SCN-SCHEMA-HUB Missing hub fails strict mode

- **WHEN** strict mode is true and a required hub page is absent and not in compile plan
- **THEN** `wiki-compile` exits 1 with `SCHEMA_INVALID`
