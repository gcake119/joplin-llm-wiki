## ADDED Requirements

### Requirement: Vitest is the primary test runner

The project SHALL use Vitest as the primary runner for committed JavaScript tests under the test directory. The package script named test MUST invoke Vitest, and the committed Vitest configuration MUST include the migrated test file patterns required for the full suite.

#### Scenario: Full suite uses Vitest

- **WHEN** a developer runs pnpm test from the repository root after dependencies are installed
- **THEN** the command SHALL execute Vitest against the migrated committed test suite
- **AND** the command SHALL NOT invoke node --test as the primary runner

#### Scenario: Existing Vitest script remains usable

- **WHEN** a developer runs pnpm test:vitest from the repository root
- **THEN** the command SHALL execute a Vitest run with the same committed suite boundary as pnpm test or an explicitly documented compatible subset

### Requirement: Migrated tests preserve behavioral coverage

Migrated tests SHALL preserve the assertions, fixtures, error-code expectations, stdout and stderr expectations, file output checks, subprocess mock checks, and local API mock checks that existed before migration unless an assertion is changed to document and verify a real product bug fix.

#### Scenario: Targeted migrated file keeps assertions

- **WHEN** a developer runs pnpm vitest run test/config-schema.test.js
- **THEN** Vitest SHALL execute the migrated config schema tests
- **AND** the tests SHALL still verify valid config resolution, legacy key rejection, compile_mode validation, and loopback-only writeback validation

#### Scenario: Product behavior is not weakened during migration

- **WHEN** a node:test assertion is converted to a Vitest assertion
- **THEN** the migrated assertion SHALL verify the same observable product behavior, stable error code, emitted output, or durable filesystem result as the original assertion

### Requirement: Tests remain local and offline

The migrated test suite SHALL remain local-first and offline-capable. Tests MUST use mocks, fixtures, temporary directories, dry-run behavior, or loopback validation for Joplin Data API, Ollama, subprocess, filesystem, and network-adjacent behavior. Tests MUST NOT require Joplin Cloud, a real Joplin Desktop profile, a real Ollama model, a remote network service, or writes to user profile paths.

#### Scenario: Offline test execution

- **WHEN** dependencies are installed and the machine has no external network connectivity
- **THEN** pnpm test SHALL complete without requiring remote services or cloud credentials

#### Scenario: User profile paths are not mutated

- **WHEN** migrated tests create raw, wiki, config, report, or state files
- **THEN** those files SHALL be created in repository fixtures or temporary directories controlled by the test
- **AND** the tests SHALL NOT write to a user's real Joplin profile path

### Requirement: Runner configuration prevents duplicate and missing execution

The Vitest configuration and package scripts SHALL define a clear test collection boundary. The boundary MUST include migrated committed tests and MUST prevent the same committed test file from being run twice by separate primary runners during pnpm test.

#### Scenario: Single primary runner boundary

- **WHEN** pnpm test is executed
- **THEN** each migrated committed test file SHALL be collected by Vitest once
- **AND** no second node --test process SHALL collect the same file during the same command

#### Scenario: Feature-change Vitest tests remain compatible

- **WHEN** another active change adds test files with a .vitest.test.js suffix
- **THEN** the repository Vitest configuration SHALL collect those files or document the compatible command that collects them
- **AND** the migration SHALL NOT implement unrelated product behavior from that active change

### Requirement: Developer documentation reflects Vitest workflow

Developer-facing repository documentation SHALL identify Vitest as the primary local test workflow and SHALL provide commands for full-suite and targeted-file execution.

#### Scenario: Documentation lists full and targeted commands

- **WHEN** a developer reads README.md or the repository's equivalent developer testing documentation
- **THEN** the documentation SHALL include a full-suite command using pnpm test
- **AND** the documentation SHALL include a targeted Vitest command for one test file
- **AND** the documentation SHALL NOT present node --test as the primary workflow for new development
