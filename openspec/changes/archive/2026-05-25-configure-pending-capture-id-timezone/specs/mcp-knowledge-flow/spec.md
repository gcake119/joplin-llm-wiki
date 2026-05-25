## ADDED Requirements

### Requirement: REQ-MCP-006 Configurable pending capture draft ID timezone

The system SHALL generate new pending capture draft identifiers with a configurable timestamp timezone.

The default pending capture draft identifier timezone MUST be UTC and MUST preserve the existing UTC `Z` timestamp prefix behavior when no explicit configuration is provided.

When configured with `Asia/Taipei`, the system SHALL generate new `capture_draft_id` values with a GMT+8 local timestamp prefix formatted as `YYYY-MM-DDTHH-mm-ss`, followed by the existing capture title slug and hash components.

Changing the pending capture draft identifier timezone SHALL NOT change the capture title slugging logic, hash length, hash alphabet, pending capture JSON shape, pending capture directory, or formal note confirmation behavior.

`joplin_show_capture` and `joplin_confirm_capture` SHALL continue to resolve existing pending capture files whose identifiers use the legacy UTC `Z` timestamp prefix.

#### Scenario: SCN-MCP-CAPTURE-ID-01 Asia Taipei prefix for new pending capture

- **WHEN** `joplin_query` or `joplin_brainstorm` creates a pending capture with the pending capture identifier timezone configured as `Asia/Taipei`
- **THEN** the returned `capture_draft_id` starts with a GMT+8 local timestamp prefix formatted as `YYYY-MM-DDTHH-mm-ss`
- **AND** the returned `capture_draft_id` does not include the UTC `Z` suffix in the timestamp prefix
- **AND** the pending capture JSON is written under `.joplin-llm-wiki/pending-captures/` using that identifier as the filename stem

##### Example: GMT+8 conversion

- **GIVEN** the generation instant is `2026-05-25T11:46:36.845Z`
- **WHEN** the pending capture identifier timezone is `Asia/Taipei`
- **THEN** the generated identifier prefix is `2026-05-25T19-46-36`

#### Scenario: SCN-MCP-CAPTURE-ID-02 UTC remains the default

- **WHEN** `joplin_query` or `joplin_brainstorm` creates a pending capture without an explicit pending capture identifier timezone configuration
- **THEN** the returned `capture_draft_id` uses the existing UTC `Z` timestamp prefix behavior

##### Example: existing UTC prefix shape

- **GIVEN** the generation instant is `2026-05-25T11:46:36.845Z`
- **WHEN** no pending capture identifier timezone is configured
- **THEN** the generated identifier prefix remains compatible with `2026-05-25T11-46-36-845Z`

#### Scenario: SCN-MCP-CAPTURE-ID-03 Legacy UTC pending capture can be shown

- **WHEN** `.joplin-llm-wiki/pending-captures/2026-05-25T11-46-36-845Z-topic-a7206886.json` exists
- **AND** `joplin_show_capture` is called with capture id `2026-05-25T11-46-36-845Z-topic-a7206886`
- **THEN** the tool returns that pending capture content
- **AND** the pending capture file remains present

#### Scenario: SCN-MCP-CAPTURE-ID-04 Legacy UTC pending capture can be confirmed

- **WHEN** `.joplin-llm-wiki/pending-captures/2026-05-25T11-46-36-845Z-topic-a7206886.json` exists
- **AND** `joplin_confirm_capture` is called with capture id `2026-05-25T11-46-36-845Z-topic-a7206886`
- **THEN** the tool writes the formal note according to the pending capture target
- **AND** the legacy UTC pending capture file is removed only after the formal note write succeeds

#### Scenario: SCN-MCP-CAPTURE-ID-05 Slug and hash remain stable in shape

- **WHEN** two pending captures are generated from the same title with different pending capture identifier timezone settings
- **THEN** both generated identifiers use the same slugging rules for the title component
- **AND** both generated identifiers end with an 8-character lowercase hexadecimal hash component
