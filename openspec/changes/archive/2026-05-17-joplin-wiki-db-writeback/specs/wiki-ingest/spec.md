## ADDED Requirements

### Requirement: REQ-WI-020 Post-compile optional Joplin database writeback orchestration

When `joplin_wiki_writeback.enabled` is true (including the default `true` when the key is omitted) and `wiki-compile` completes wiki file writes successfully without `--dry-run`, the system SHALL invoke the Joplin CLI writeback stage before the `wiki-compile` process exits with code 0.

When `wiki-compile` is invoked with `--dry-run`, the system SHALL NOT execute writeback Joplin CLI invocations that mutate Joplin profile data, regardless of `joplin_wiki_writeback.enabled`.

When `joplin_wiki_writeback.enabled` is false, the system SHALL NOT invoke the writeback stage during `wiki-compile`.

#### Scenario: SCN-WI-WB-01 Dry-run skips mutating CLI

- **WHEN** wiki-compile runs with --dry-run
- **AND** joplin_wiki_writeback.enabled is true
- **THEN** no writeback mutating Joplin CLI subprocess runs

#### Scenario: SCN-WI-WB-02 Success runs writeback after compile

- **WHEN** wiki-compile runs without --dry-run
- **AND** compile completes successfully
- **AND** joplin_wiki_writeback.enabled is true
- **THEN** writeback executes before process exit

#### Scenario: SCN-WI-WB-03 Disabled skips writeback

- **WHEN** joplin_wiki_writeback.enabled is false
- **THEN** wiki-compile SHALL NOT invoke the writeback stage

#### Scenario: SCN-WI-WB-04 Omitted enabled key defaults to writeback on

- **WHEN** configuration omits `joplin_wiki_writeback.enabled`
- **AND** `joplin_cli.enabled` is true with a non-empty `joplin_cli.command`
- **AND** wiki-compile completes file writes successfully without --dry-run
- **THEN** the writeback stage SHALL execute before exit code 0
