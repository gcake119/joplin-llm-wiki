# wiki-schema Specification

## Purpose

The wiki schema file constrains compiled wiki page shape and required hub pages
for the current flat `wiki/` layout.

## Requirements

### Requirement: REQ-WS-001 Schema document shape

The schema file SHALL contain:

- `schema_version`: string
- `page_types`: array of objects with `id`, `required_frontmatter_keys`, and
  `required_outbound_link_patterns`
- `required_hub_pages`: array of relative wiki paths

#### Scenario: SCN-SCHEMA-SHAPE-01 Parse succeeds

- **WHEN** the schema validator loads a conforming schema file
- **THEN** parsing completes without error and exposes at least one page type.

### Requirement: REQ-WS-002 Hub pages existence

When `wiki_schema.strict` is true, before `wiki-compile` writes output, the
system SHALL verify every path in `required_hub_pages` exists under resolved
`wiki` or is scheduled for creation in the current compile plan.

Required hub paths SHALL follow the flat wiki layout; the standard hub pages are
`indexes/All-Sources.md` and `indexes/All-Concepts.md`.

#### Scenario: SCN-SCHEMA-HUB-01 Missing hub fails strict mode

- **WHEN** strict mode is true and a required hub page is absent and not in the
  compile plan
- **THEN** `wiki-compile` exits non-zero with `SCHEMA_INVALID`.
