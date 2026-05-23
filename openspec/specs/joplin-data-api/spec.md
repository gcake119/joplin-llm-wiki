# joplin-data-api Specification

## Purpose

The Joplin Data API client talks to the local Joplin Desktop Web Clipper /
Data API for writeback preflight and note/folder mutations.

## Requirements

### Requirement: REQ-JDA-ALLOWLIST Loopback-only API base URL

The system SHALL parse `joplin_data_api.base_url` as an absolute HTTP or HTTPS
URL.

When writeback is enabled, the hostname SHALL be exactly one of `127.0.0.1`,
`localhost`, or `::1` (case-insensitive for `localhost`), or configuration
loading SHALL fail with `CONFIG_INVALID`.

The system SHALL reject unsupported schemes or missing hosts during
configuration validation.

#### Scenario: SCN-JDA-AL-01 Localhost hostname accepted

- **WHEN** `joplin_data_api.base_url` is `http://127.0.0.1:41184`
- **AND** writeback is enabled with a token
- **THEN** configuration loading succeeds for this constraint.

#### Scenario: SCN-JDA-AL-02 LAN hostname rejected

- **WHEN** `joplin_data_api.base_url` uses hostname `192.168.1.10`
- **AND** writeback is enabled
- **THEN** configuration loading fails with `CONFIG_INVALID`.

### Requirement: REQ-JDA-CONFIG Configuration mapping for Data API

The system SHALL support `joplin_data_api` with at least:

| Key | Type | Default | Required when writeback enabled |
| --- | ---- | ------- | ------------------------------- |
| `base_url` | string | `http://127.0.0.1:41184` | SHALL satisfy REQ-JDA-ALLOWLIST |
| `token` | string | `""` | SHALL be non-empty |
| `timeout_ms` | integer | `30000` | SHALL be between 1000 and 600000 |

#### Scenario: SCN-JDA-CFG-01 Missing token fails fast

- **WHEN** `joplin_wiki_writeback.enabled` is true
- **AND** `joplin_data_api.token` is empty after trim
- **THEN** configuration loading fails with `CONFIG_INVALID`.

#### Scenario: SCN-JDA-CFG-02 Disabled writeback permits missing token

- **WHEN** writeback is disabled
- **THEN** configuration loading does not require a non-empty Data API token.

### Requirement: REQ-JDA-CLIENT Authorized HTTP transport

The Data API client SHALL attach the configured token to requests using the
`token` query parameter.

Each request SHALL honor `joplin_data_api.timeout_ms` with cancellation
semantics.

The client SHALL serialize JSON request bodies where required by the endpoint
contract.

#### Scenario: SCN-JDA-CL-01 Token appears on requests

- **WHEN** the client performs a Data API GET call
- **THEN** the resolved request URL includes `token=<configured-token>`.

### Requirement: REQ-JDA-PREFLIGHT Preflight before writeback mutations

Before executing writeback mutations, the system SHALL perform a successful Data
API read operation that proves authentication and API availability.

When preflight fails irrecoverably, the command SHALL surface
`JOPLIN_DATA_API_FAILED`.

#### Scenario: SCN-JDA-PF-01 Preflight precedes folder creation

- **WHEN** writeback runs without dry-run
- **THEN** the preflight request completes successfully before the first
  mutating HTTP call.

### Requirement: REQ-JDA-ERRORS Stable transport error codes

When Data API preflight or non-mutation setup fails irrecoverably, stderr SHALL
contain a single JSON object with `"error":"JOPLIN_DATA_API_FAILED"`.

When a mutating writeback step fails irrecoverably, stderr SHALL contain
`"error":"JOPLIN_DATA_API_WRITE_FAILED"`.

Error payloads SHALL NOT include the raw API token.

#### Scenario: SCN-JDA-ERR-01 Classification distinguishes preflight vs write

- **WHEN** preflight receives HTTP 403 consistently
- **THEN** user-visible stderr JSON uses `JOPLIN_DATA_API_FAILED`.
