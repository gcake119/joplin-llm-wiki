## ADDED Requirements

### Requirement: REQ-JDA-ALLOWLIST Loopback-only API base URL

The system SHALL parse `joplin_data_api.base_url` as an absolute HTTP or HTTPS URL.

After parsing, the hostname SHALL be exactly one of `127.0.0.1`, `localhost`, or `::1` (case-insensitive for `localhost`), or configuration loading SHALL fail with `CONFIG_INVALID`.

The system SHALL reject unsupported schemes or missing hosts during configuration validation.

#### Scenario: SCN-JDA-AL-01 Localhost hostname accepted

- **WHEN** `joplin_data_api.base_url` is `http://127.0.0.1:41184`
- **AND** writeback is enabled
- **THEN** configuration loading SHALL succeed for this constraint

#### Scenario: SCN-JDA-AL-02 RFC1918 hostname rejected

- **WHEN** `joplin_data_api.base_url` uses hostname `192.168.1.10`
- **AND** writeback is enabled
- **THEN** configuration loading SHALL fail with `CONFIG_INVALID`

---
### Requirement: REQ-JDA-CONFIG Configuration mapping for Data API

The system SHALL extend `config.yaml` with a `joplin_data_api` mapping containing at least:

| Key | Type | Default | Required when writeback enabled |
| --- | ---- | ------- | ------------------------------- |
| `base_url` | string | `http://127.0.0.1:41184` | SHALL be present and satisfy REQ-JDA-ALLOWLIST |
| `token` | string | `""` | SHALL be non-empty |
| `timeout_ms` | integer | `30000` | SHALL be greater than zero |

#### Scenario: SCN-JDA-CFG-01 Missing token fails fast

- **WHEN** `joplin_wiki_writeback.enabled` is true
- **AND** `joplin_data_api.token` is empty after trim
- **THEN** configuration loading SHALL fail with `CONFIG_INVALID`

#### Scenario: SCN-JDA-CFG-02 Defaults apply when keys omitted

- **WHEN** writeback is disabled
- **THEN** configuration loading SHALL NOT require a non-empty `joplin_data_api.token`

---
### Requirement: REQ-JDA-CLIENT Authorized HTTP transport

The Data API client SHALL attach the configured `joplin_data_api.token` to every request using the `token` query parameter on the request URL, consistent with Joplin Data API authentication rules.

Each request SHALL honor `joplin_data_api.timeout_ms` with hard cancellation semantics equivalent to `AbortSignal.timeout` behavior.

The client SHALL serialize JSON request bodies where required by the endpoint contract.

#### Scenario: SCN-JDA-CL-01 Token appears on requests

- **WHEN** the client performs any Data API GET call
- **THEN** the resolved request URL SHALL include `token=<configured-token>` as a query parameter

---
### Requirement: REQ-JDA-PREFLIGHT Preflight before writeback mutations

Before executing writeback mutations, the system SHALL perform at least one successful Data API read operation that proves authentication and API availability (exact endpoint SHALL be documented in `README.md`).

When preflight fails irrecoverably after retries exhausted, the command SHALL surface `JOPLIN_DATA_API_FAILED` per `REQ-JWKB-ERRORS`.

#### Scenario: SCN-JDA-PF-01 Preflight precedes folder creation

- **WHEN** writeback runs without `--dry-run`
- **THEN** the preflight request SHALL complete successfully before the first mutating HTTP call

---
### Requirement: REQ-JDA-ERRORS Stable transport error codes

When Data API preflight or non-mutation setup fails irrecoverably, stderr SHALL contain a single JSON object with `"error":"JOPLIN_DATA_API_FAILED"`.

When a mutating writeback step fails irrecoverably after retries, stderr SHALL contain `"error":"JOPLIN_DATA_API_WRITE_FAILED"`.

Error payloads SHALL NOT include the raw API token.

#### Scenario: SCN-JDA-ERR-01 Classification distinguishes preflight vs write

- **WHEN** preflight receives HTTP 403 consistently after retries
- **THEN** the user-visible stderr JSON `error` field SHALL be `JOPLIN_DATA_API_FAILED`

