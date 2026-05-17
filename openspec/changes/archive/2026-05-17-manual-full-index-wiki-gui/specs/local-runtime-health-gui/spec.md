## ADDED Requirements

### Requirement: REQ-HGUI-CORPUS-PIPELINE Manual full index and wiki-compile from Health GUI

The system SHALL expose an IPC handler in the Electron **main** process named `run-corpus-pipeline`. The renderer SHALL NOT supply arbitrary shell strings or custom argv for this pipeline; only the fixed contract in this requirement applies.

The IPC payload SHALL include `confirmed` as boolean `true` only after the operator accepts a confirmation modal dedicated to this pipeline. When `confirmed` is not strict boolean `true`, the main process SHALL return a structured response with code `CONFIRMATION_REQUIRED` and SHALL NOT spawn any child process.

When executing the pipeline, the main process SHALL run two sequential phases from the repository root working directory. Each phase SHALL spawn **pnpm** with `stdio` configured so stdout and stderr can be captured into bounded in-memory buffers. The argv for phase **index** SHALL be exactly:

`exec`, `joplin-llm-wiki`, `index`, `--config`, `<absConfigPath>`

The argv for phase **wiki-compile** SHALL be exactly:

`exec`, `joplin-llm-wiki`, `wiki-compile`, `--config`, `<absConfigPath>`

where `<absConfigPath>` is the absolute configuration path already bound to the Health GUI instance (same path used for other `loadConfig` IPC flows).

The main process SHALL start phase wiki-compile only if phase index exits with code `0`. If phase index exits with any non-zero code, the main process SHALL NOT spawn wiki-compile and SHALL return a failure result that names the index phase failure.

The main process SHALL enforce **single-flight** for `run-corpus-pipeline`: while an invocation is in progress, another overlapping validated request SHALL resolve with code `PIPELINE_IN_FLIGHT` and SHALL NOT spawn additional concurrent pipeline processes for this handler.

Each successful resolution SHALL include tail strings for stdout and stderr for **each phase that ran** (empty string when none captured) and integer exit codes for each phase, using `null` for phases that did not run. The top-level `ok` flag SHALL be `true` only when both phases ran and both exit codes equal `0`.

#### Scenario: SCN-HGUI-CORPUS-01 Main rejects missing confirmation

- **WHEN** main receives `run-corpus-pipeline` with `confirmed` omitted, set to `false`, or not strictly boolean `true`
- **THEN** main returns `CONFIRMATION_REQUIRED` and spawns zero child processes

#### Scenario: SCN-HGUI-CORPUS-02 Spawn argv uses pnpm exec with index then wiki-compile

- **WHEN** main receives `run-corpus-pipeline` with `confirmed: true`, configuration absolute path `/tmp/fixture/cfg.yaml`, and both phases exit `0`
- **THEN** the first spawned process uses executable `pnpm` and argv whose first six tokens are `exec`, `joplin-llm-wiki`, `index`, `--config`, `/tmp/fixture/cfg.yaml` in that order, with cwd equal to the resolved repository root, and the second spawned process uses `pnpm` with argv whose first six tokens are `exec`, `joplin-llm-wiki`, `wiki-compile`, `--config`, `/tmp/fixture/cfg.yaml` in that order with the same cwd

#### Scenario: SCN-HGUI-CORPUS-03 Index failure skips wiki-compile

- **WHEN** phase index exits with a non-zero exit code
- **THEN** main does not spawn wiki-compile and returns a structured failure whose code distinguishes index failure and records the index exit code

#### Scenario: SCN-HGUI-CORPUS-04 Overlapping request is rejected

- **WHEN** a pipeline invocation is still in progress and a second `run-corpus-pipeline` request arrives with `confirmed: true`
- **THEN** the second request resolves with `PIPELINE_IN_FLIGHT` without starting an additional concurrent pipeline

#### Scenario: SCN-HGUI-CORPUS-05 Operator-visible summary

- **WHEN** the pipeline completes with either success or a controlled failure after the index phase has finished
- **THEN** the renderer displays each executed phase exit code and the stderr or stdout tail fields returned by main so the operator can debug without attaching an external terminal
