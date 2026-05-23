## ADDED Requirements

### Requirement: sqlite-sync LaunchAgent restarts on non-zero exit with throttle

The macOS LaunchAgent template for `sqlite-sync` SHALL include launchd restart configuration that restarts the job after non-zero exits and does not restart the job after successful exits.

The LaunchAgent template SHALL include a throttle interval to prevent high-frequency restart loops when configuration or dependencies remain invalid.

#### Scenario: plist contains non-zero-exit restart policy

- **WHEN** the repository sqlite-sync LaunchAgent plist template is rendered or installed
- **THEN** the plist SHALL contain a `KeepAlive` dictionary
- **AND** `KeepAlive.SuccessfulExit` SHALL be false
- **AND** the plist SHALL contain `ThrottleInterval` with a positive integer value

#### Scenario: successful one-shot exit does not loop

- **GIVEN** `joplin_sqlite_sync.schedule.every_seconds` is null
- **AND** the sqlite-sync command exits with code 0 after one successful cycle
- **WHEN** launchd evaluates the job exit
- **THEN** the LaunchAgent restart policy SHALL NOT request an immediate restart due to successful exit

#### Scenario: failed dependency triggers throttled retry

- **GIVEN** the sqlite-sync command exits non-zero because Joplin Data API preflight fails
- **WHEN** launchd evaluates the job exit
- **THEN** the LaunchAgent restart policy SHALL request a restart
- **AND** launchd SHALL apply the configured throttle interval before repeated restarts

### Requirement: LaunchAgent scheduling documentation avoids double scheduling

The macOS launchd documentation SHALL explain the relationship between in-process polling and LaunchAgent restart policy.

The documentation SHALL state that `schedule.every_seconds` or CLI `--every` controls normal polling cadence, while LaunchAgent restart policy is a recovery mechanism for non-zero process exits.

The documentation SHALL warn operators not to combine a plist `StartInterval` with non-null `schedule.every_seconds` unless they intentionally accept overlapping schedule risk.

#### Scenario: operator reads scheduling guidance

- **WHEN** an operator reads the macOS launchd stack documentation
- **THEN** the documentation SHALL identify in-process polling as the normal automatic update mechanism
- **AND** the documentation SHALL identify non-zero-exit KeepAlive as failure recovery
- **AND** the documentation SHALL warn against unintentional double scheduling with `StartInterval`

### Requirement: sqlite-sync LaunchAgent readiness follows compile mode

The sqlite-sync LaunchAgent wrapper SHALL determine the resolved `joplin_sqlite_sync.pipeline.compile_mode` from the configured YAML before applying Ollama readiness checks.

When resolved `compile_mode` is `agent`, the wrapper SHALL NOT wait for or probe `ollama.base_url` before starting `sqlite-sync`.

When resolved `compile_mode` is `local`, the wrapper SHALL wait for the configured Ollama endpoint before starting `sqlite-sync`, preserving the local compile startup guard.

When resolved `compile_mode` is `off`, the wrapper SHALL NOT wait for or probe `ollama.base_url` before starting `sqlite-sync`.

#### Scenario: agent mode skips Ollama readiness

- **GIVEN** the configured YAML resolves `joplin_sqlite_sync.pipeline.compile_mode` to `agent`
- **AND** `ollama.base_url` is unreachable
- **WHEN** the sqlite-sync LaunchAgent wrapper starts
- **THEN** the wrapper SHALL NOT wait for Ollama readiness
- **AND** the wrapper SHALL execute the sqlite-sync command

#### Scenario: local mode waits for Ollama readiness

- **GIVEN** the configured YAML resolves `joplin_sqlite_sync.pipeline.compile_mode` to `local`
- **AND** `ollama.base_url` is unreachable
- **WHEN** the sqlite-sync LaunchAgent wrapper starts
- **THEN** the wrapper SHALL wait for Ollama readiness until the configured timeout
- **AND** the wrapper SHALL exit non-zero if Ollama remains unreachable until timeout

#### Scenario: off mode skips Ollama readiness

- **GIVEN** the configured YAML resolves `joplin_sqlite_sync.pipeline.compile_mode` to `off`
- **AND** `ollama.base_url` is unreachable
- **WHEN** the sqlite-sync LaunchAgent wrapper starts
- **THEN** the wrapper SHALL NOT wait for Ollama readiness
- **AND** the wrapper SHALL execute the sqlite-sync command

### Requirement: LaunchAgent restart preserves local-only execution

LaunchAgent restart configuration SHALL NOT add remote network services, remote schedulers, cloud credentials, or non-local executables.

The job SHALL continue to execute the local shim and local project CLI only.

#### Scenario: plist remains local-only after restart changes

- **WHEN** the sqlite-sync LaunchAgent plist is inspected
- **THEN** `ProgramArguments` SHALL still point to the local repository shim and run script
- **AND** environment variables SHALL NOT include Joplin token values
- **AND** the plist SHALL NOT define remote service endpoints beyond existing local PATH and config path values
