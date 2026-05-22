## Why

目前 `sqlite-sync` 會週期性把 Joplin SQLite 匯出成 `raw/`，但下游只支援固定觸發本機 `wiki-compile`，且沒有穩定區分 raw 是否真的變更。README 已提到「偵測到新筆記後同步 wiki 層」，需要補齊實作與規格，讓排程只在 raw 來源變動時同步 wiki，並可依設定選擇本機 Ollama 或 Codex Agent 路線。

## What Changes

- 變更類型：Feature。
- `sqlite-sync` 在每輪匯出後建立 raw Markdown snapshot state，偵測新增、更新、刪除任一 exported Markdown 是否發生。
- 新增 `joplin_sqlite_sync.pipeline.compile_mode: local | agent | off`，用來決定 raw 變更後觸發 `wiki-compile`、`agent-compile` 或只匯出不編譯。
- 保留舊 `pipeline.run_wiki_compile` 相容：未設定 `compile_mode` 時，`run_wiki_compile: true` 等同 `local`，`false` 等同 `off`。
- `sqlite-sync --export-only` 永遠跳過 compile；dry-run 不寫 state、不觸發 compile，只輸出 would-change summary。
- `sqlite-sync --snapshot-only` 支援在 `raw/` 已有 Markdown 時獨立建立 baseline snapshot，不重新匯出 SQLite、不觸發 compile。
- Health GUI 補齊主要 CLI 對應分頁：既有健康、設定、筆記本、管線、LaunchAgent 外，新增 Query 與 Lint 分頁，並在管線分頁提供建立 raw snapshot 的入口。
- CLI summary 增加 raw change detection 與 compile decision 欄位，方便 launchd/cron 日誌判讀。
- 更新 README、config example、排程文件、知識流文件，以及 Cursor rule/skill/hook README，使設定與操作規則一致。

## Goals

- `sqlite-sync` 能以持久化 state 判斷 `raw/` 匯出結果是否新增、更新或刪除 Markdown。
- raw 有變化時，系統依 `compile_mode` 觸發 `wiki-compile`、`agent-compile` 或不觸發 compile。
- raw 無變化時，排程輪次不重複啟動昂貴的 wiki 編譯工作。
- raw 已有資料時，操作者可不碰 Joplin SQLite 直接建立 snapshot baseline，避免下一輪把既有 raw 全部視為新變化。
- 操作者可從 JSON summary 看出 raw 是否變更、變更類型計數、compile mode 與是否觸發 compile。
- Health GUI 提供主要 CLI 功能的對應標籤分頁：health/config/notebooks/pipeline/query/lint/launchd。
- 文件、Cursor rule、Cursor skill、Cursor hook README 均描述新的設定與排程語意。

## Non-Goals

- 不恢復已移除的 `watch`、`index`、RAG、Chroma 或 embedding vector pipeline。
- 不引入 Joplin Data API 讀取筆記；SQLite 匯出仍以本機唯讀 database.sqlite 為來源。
- 不提供任意 shell command 設定；compile 只能在固定 enum `local | agent | off` 中選擇。
- 不新增啟用中的 Cursor hook，只更新既有 hook README 的建議與同步檢查文字。
- 不變更 `wiki-compile` 或 `agent-compile` 的編譯內容規則；本 change 只調整何時與如何被 `sqlite-sync` 觸發。
- 不在 GUI 實作所有 CLI 旗標；Query 與 Lint 分頁提供主要日常操作與結果輸出，進階參數仍可用 CLI。

## 全本機運作

- 資料路徑：Joplin `database.sqlite` 以唯讀模式匯出到 repo-local `raw/`；raw change state 存在 repo-local `.joplin-llm-wiki/`，不寫入 `raw/`。
- 推理邊界：`compile_mode: local` 使用既有本機 Ollama `wiki-compile`；`compile_mode: agent` 使用本機已登入的 `codex exec`，不使用 OpenAI API key。
- 網路邊界：不新增遠端資料庫、遠端向量服務或第三方 SaaS endpoint；既有 Joplin wiki 寫回仍只允許 loopback Data API。
- 離線驗收：可用 fixture SQLite、mock compile runners 與檔案 state 驗證 raw change detection 與 compile decision，不需要外網。

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `joplin-sqlite-sync`: Add raw change detection, compile mode selection, summary fields, and change-gated downstream compile orchestration.
- `macos-launchd-stack`: Document that scheduled `sqlite-sync` can gate wiki synchronization on raw changes and can use either local or agent compile mode by config.
- `local-runtime-health-gui`: Add GUI tab coverage for snapshot creation, query, and lint so the major CLI workflows are reachable from Health GUI.

## Impact

- Affected specs: joplin-sqlite-sync, macos-launchd-stack, local-runtime-health-gui
- Affected code:
  - New: src/joplin/sqlite/sync-state.js, test/sqlite-sync-change-detection.test.js
  - Modified: src/config/load-config.js, src/commands/cmd-sqlite-sync.js, src/commands/cmd-agent-compile.js, src/cli.js, src/health-gui/main.js, src/health-gui/preload.cjs, src/health-gui/renderer/index.html, src/health-gui/renderer/app.js, src/health-gui/corpus/corpus-pipeline-runner.js, config.yaml.example, README.md, docs/llm-knowledge-flow.md, docs/scheduling-examples.md, docs/macos-launchd-stack.md, .cursor/rules/joplin-brain-config.mdc, .cursor/skills/joplin-brain-dev/SKILL.md, .cursor/hooks/README.md, test/config-schema.test.js, test/joplin-sqlite.test.js, test/agent-compile.test.js, test/health-gui/corpus-pipeline-runner.test.js
  - Removed: none

## Risks

- First-run behavior can surprise operators if it triggers a full compile; this change defines first run as baseline-only unless raw changes are detected after baseline exists.
- Snapshot-only can hide existing raw changes if used at the wrong time; GUI and docs must label it as establishing a baseline, not compiling or validating wiki freshness.
- Agent compile can be slow or hit Codex CLI limits; failures must preserve existing `CODEX_CLI_UNAVAILABLE`, `CODEX_USAGE_LIMIT`, and `AGENT_COMPILE_FAILED` behavior.
- Hash/state bugs could skip needed wiki updates; tests must cover added, updated, deleted, unchanged, dry-run, and export-only cycles.

## MVP 對照

- Joplin Desktop remains the note owner and editor.
- Jarvis remains complementary for in-editor related notes and chat.
- joplin-llm-wiki owns local SQLite export, raw change detection, scheduled compile orchestration, and optional wiki writeback.

## Success Criteria

- `sqlite-sync` first successful non-dry-run export writes baseline state and reports `change_detection: "baseline"` with `compile_triggered: false`.
- `sqlite-sync --snapshot-only` reads existing `raw/` Markdown, writes baseline state, reports `change_detection: "snapshot_created"`, and does not open Joplin SQLite or trigger compile.
- A later unchanged export reports `raw_changed: false` and does not call any compile runner.
- Adding, editing, or deleting an exported Markdown causes `raw_changed: true`, non-zero changed file counters, and compile execution according to `compile_mode`.
- `compile_mode: local` calls the existing `wiki-compile` path; `compile_mode: agent` calls the existing `agent-compile` path; `compile_mode: off` calls neither.
- `--export-only` and dry-run never trigger compile; dry-run does not persist state.
- Health GUI shows dedicated Query and Lint tabs, and the Pipeline tab can establish a raw snapshot without running compile.
- `pnpm test`, `spectra analyze sync-wiki-on-raw-changes --json`, and `spectra validate sync-wiki-on-raw-changes` pass.

## Assumptions

- Operators use Node.js 20+ and pnpm as the existing CLI runtime.
- Joplin Desktop profile path and `database.sqlite` are configured correctly before enabling `sqlite-sync`.
- Local Ollama is available only when `compile_mode: local`; local `codex exec` is installed and logged in only when `compile_mode: agent`.
- Typical notebook libraries remain under 10k notes, so per-cycle snapshot hashing is acceptable for this feature.

## Rollback

- Set `joplin_sqlite_sync.pipeline.compile_mode: off` or pass `--export-only` to stop compile triggering while retaining raw export.
- Delete `.joplin-llm-wiki/sqlite-sync-state.json` to force the next successful export to establish a fresh baseline.
- Revert to legacy behavior by omitting `compile_mode` and using `pipeline.run_wiki_compile` until the legacy key is removed in a future change.
