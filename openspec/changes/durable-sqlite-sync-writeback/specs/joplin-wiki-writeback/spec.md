## ADDED Requirements

### Requirement: Non-mutating writeback preflight for automatic compile orchestration

When wiki writeback is enabled and an automatic compile is about to run from `sqlite-sync`, the system SHALL verify that the configured Joplin Data API endpoint is reachable and that the configured token is accepted before invoking `wiki-compile` or `agent-compile`.

The preflight check SHALL NOT create, update, or delete Joplin notebooks or notes.

If preflight fails, the system SHALL surface a stable Joplin Data API error code and SHALL NOT invoke the compile stage for that cycle.

#### Scenario: Invalid token stops automatic compile before agent invocation

- **GIVEN** `joplin_wiki_writeback.enabled` is true
- **AND** resolved `compile_mode` is `agent`
- **AND** the configured Joplin Data API returns HTTP 403 for the configured token
- **WHEN** `sqlite-sync` detects raw Markdown changes
- **THEN** the system SHALL run writeback preflight before invoking `agent-compile`
- **AND** the system SHALL NOT spawn Codex agent compile
- **AND** the process SHALL exit non-zero with a stable Joplin Data API error code
- **AND** the sqlite-sync snapshot state SHALL remain unchanged

#### Scenario: Valid token allows automatic compile to proceed

- **GIVEN** `joplin_wiki_writeback.enabled` is true
- **AND** the configured Joplin Data API accepts the configured token
- **AND** `sqlite-sync` detects raw Markdown changes
- **WHEN** writeback preflight completes successfully
- **THEN** the system SHALL invoke the resolved compile mode
- **AND** actual wiki writeback SHALL remain owned by the compile command after wiki files are produced

#### Scenario: Disabled writeback skips preflight

- **GIVEN** `joplin_wiki_writeback.enabled` is false
- **AND** `sqlite-sync` detects raw Markdown changes
- **WHEN** automatic compile orchestration starts
- **THEN** the system SHALL NOT call Joplin Data API preflight
- **AND** the system SHALL invoke the resolved compile mode without writeback validation

### Requirement: Writeback preflight preserves local-first boundaries

The writeback preflight SHALL use only the configured loopback Joplin Data API base URL already accepted by configuration loading.

The writeback preflight SHALL NOT send note content, wiki content, or token values to non-loopback hosts.

#### Scenario: Preflight uses only loopback Data API

- **GIVEN** configuration loading accepted `joplin_data_api.base_url`
- **WHEN** writeback preflight runs
- **THEN** every HTTP request SHALL target that configured loopback Joplin Data API origin
- **AND** no HTTP request SHALL target remote vector databases, hosted LLM APIs, or third-party services
- **AND** error output SHALL NOT include the configured token value

### Requirement: Writeback preflight result is observable

Automatic compile orchestration SHALL expose the writeback preflight result in operator-readable and machine-readable output.

The output SHALL distinguish preflight skipped, passed, and failed states.

#### Scenario: Preflight status appears in failed cycle output

- **GIVEN** writeback preflight fails because Joplin Data API rejects the token
- **WHEN** automatic compile orchestration exits
- **THEN** stdout or stderr SHALL include `writeback_preflight_status: "failed"`
- **AND** stderr SHALL include the Joplin Data API failure code
- **AND** stderr SHALL include an error message that identifies invalid token or unreachable Data API without printing the token
