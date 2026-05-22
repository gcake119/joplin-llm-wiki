## MODIFIED Requirements

### Requirement: REQ-MLS-OBSERVABILITY Logging locations and Joplin Data API prerequisites

The system SHALL document how operators satisfy Joplin Data API prerequisites for scheduled wiki write-back under launchd: `joplin_data_api.token` configured, `joplin_data_api.base_url` reachable from the agent environment with loopback hostname only, and awareness that Joplin Desktop must expose the Clipper service when write-back is enabled.

The operator guide SHALL require that stdout and stderr from `sqlite-sync` are captured using `StandardOutPath` and `StandardErrorPath`, and SHALL require the same for Ollama jobs in the full-stack path, so periodic JSON summaries from `sqlite-sync` and server startup diagnostics remain available for troubleshooting.

The operator guide SHALL document that scheduled `sqlite-sync` summaries include raw change detection fields: `raw_changed`, `change_detection`, `changed_files`, `compile_mode`, and `compile_triggered`.

The operator guide SHALL document that `joplin_sqlite_sync.pipeline.compile_mode` controls scheduled wiki synchronization after raw changes: `local` runs `wiki-compile`, `agent` runs `agent-compile`, and `off` exports without compiling.

#### Scenario: Write-back prerequisites are visible to operators

- **WHEN** an operator enables Joplin wiki write-back in configuration (`joplin_wiki_writeback` enabled by default or explicitly)
- **THEN** `docs/macos-launchd-stack.md` SHALL describe Data API and Clipper setup
- **AND** it SHALL reference `README.md` for token acquisition
- **AND** it SHALL call out headless launchd limitations

#### Scenario: Raw change compile fields are visible in launchd guidance

- **WHEN** an operator reads the launchd guide before enabling scheduled `sqlite-sync`
- **THEN** the guide SHALL describe the JSON summary fields `raw_changed`, `change_detection`, `changed_files`, `compile_mode`, and `compile_triggered`
- **AND** the guide SHALL state that `compile_mode: agent` requires a launchd environment where local `codex exec` is available and logged in

## ADDED Requirements

### Requirement: REQ-MLS-SQLITE-SYNC-COMPILE-MODE Scheduled compile mode documentation

The launchd documentation SHALL show a `joplin_sqlite_sync` config example that includes `pipeline.compile_mode`.

The launchd documentation SHALL state that `compile_mode: local` is the default local Ollama route for scheduled wiki synchronization after raw changes.

The launchd documentation SHALL state that `compile_mode: agent` uses local Codex CLI `agent-compile`, does not use an OpenAI API key, and is not automatically managed by the Ollama LaunchAgent.

The launchd documentation SHALL state that operators can disable scheduled compile by setting `compile_mode: off` while retaining SQLite export.

#### Scenario: Config example includes compile mode

- **WHEN** an operator copies the launchd config example
- **THEN** the example SHALL include `joplin_sqlite_sync.pipeline.compile_mode`

#### Scenario: Agent mode prerequisites are documented

- **WHEN** an operator chooses `compile_mode: agent`
- **THEN** the launchd documentation SHALL instruct the operator to verify local `codex exec` availability in the scheduled user environment before enabling the job
