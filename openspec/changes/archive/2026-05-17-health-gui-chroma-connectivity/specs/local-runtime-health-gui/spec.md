## ADDED Requirements

### Requirement: REQ-HGUI-DEP-POLL Bounded automatic health refresh after successful detached dependency start

After the renderer receives a successful `start-local-dependency` response for `kind` equal to `chroma-server` or `ollama-serve` (success indicates the detached child spawn handshake completed without an application-level spawn error), the renderer SHALL repeatedly invoke the same `check-health` IPC handler used by manual refresh until either condition holds:

1. For `kind: chroma-server`, the latest snapshot has `ok: true` and `chroma.reachable === true`, or
2. For `kind: ollama-serve`, the latest snapshot has `ok: true` and `ollama.reachable === true`, or
3. A maximum wall-clock wait time from the first poll attempt has elapsed.

Between attempts the renderer SHALL wait a fixed sleep interval so the UI event loop remains responsive. Each time a snapshot with `ok: true` is obtained during this loop, the renderer SHALL update operator-visible dependency labels and the JSON health panel to match that snapshot (same semantics as a completed manual refresh).

The renderer SHALL NOT require a manual refresh click to finish this first post-start verification cycle when the dependency becomes reachable within the bounded window.

#### Scenario: SCN-HGUI-DEP-POLL-01 Chroma label matches snapshot after poll

- **WHEN** the operator successfully starts `chroma-server` from the GUI and Chroma becomes reachable before polling times out
- **THEN** the Chroma operator-visible label reflects a reachable (connected) state and the JSON panel shows `chroma.reachable: true` on the last applied snapshot

#### Scenario: SCN-HGUI-DEP-POLL-02 Ollama label matches snapshot after poll

- **WHEN** the operator successfully starts `ollama-serve` from the GUI and Ollama becomes reachable before polling times out
- **THEN** the Ollama operator-visible label reflects a reachable (connected) state and the JSON panel shows `ollama.reachable: true` on the last applied snapshot

#### Scenario: SCN-HGUI-DEP-POLL-03 Polling stops on timeout

- **WHEN** the operator successfully starts a dependency but the dependency never becomes reachable within the maximum wall-clock wait time
- **THEN** polling stops without crashing the GUI process and the UI shows the last obtained snapshot values for reachability (still `false` when never reachable)
