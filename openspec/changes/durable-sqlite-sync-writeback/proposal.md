## Why

變更偵測與編譯觸發已能運作，但目前 `sqlite-sync` 會在 downstream 編譯與 Joplin 寫回完成前先更新 snapshot state；若 `agent-compile` 或 Data API 寫回失敗，下一輪可能判定 `raw_changed:false` 而不會自動重試同一批 wiki 更新。實際排程也只靠 LaunchAgent `RunAtLoad` 啟動，程序因寫回 token 失敗退出後不會自動恢復輪詢，導致「筆記更動後自動更新 wiki 並寫回 Joplin」不耐久。

## What Changes

- 變更 `sqlite-sync` 成功提交語意：只有 SQLite 匯出、raw change detection、設定的 compile mode、以及啟用的 Joplin writeback 全部成功後，才提交新的 snapshot state。
- 當 compile 或 writeback 失敗時，保留上一份有效 snapshot state，讓下一輪輪詢或重啟後可重試同一批 raw 變更。
- 在啟用 writeback 的自動編譯路徑中加入 Joplin Data API token / reachability preflight，避免長時間編譯後才因 token 無效失敗。
- 調整 sqlite-sync LaunchAgent readiness gate：`compile_mode: agent` 時不得等待 Ollama 連線；只有 `compile_mode: local` 或其他實際需要本機 Ollama 的路徑才檢查 Ollama readiness。
- 更新 macOS LaunchAgent 範本與安裝文件，讓 sqlite-sync job 可在非零退出時受控重啟，並以 throttle 避免錯誤設定造成高頻重啟。
- 改善 stdout / stderr 摘要，讓 operator 可直接看出是 raw 未變、compile 失敗、writeback preflight 失敗、或 writeback commit 失敗。

## Goals

- G1：downstream 失敗不得吞掉待重試變更；若 compile 或 writeback 失敗，下一輪仍能再次判定 raw 變更並重跑 pipeline。
- G2：writeback token 無效時，在昂貴的 agent compile 前失敗並給出可操作錯誤，而不是先大量寫 wiki 再退出。
- G3：LaunchAgent 在非零退出時可自動重啟，但成功退出或正常常駐輪詢時不產生重啟循環。
- G4：agent compile 走 Codex CLI，不依賴 Ollama；agent 模式的 sqlite-sync 啟動不得因 Ollama 未連線而被 readiness gate 擋住。
- G5：保留現有 local-first 邊界；不引入遠端服務、雲端 LLM、遠端向量庫或背景 HTTP API。

## Non-Goals

- 不改變 `wiki-compile` 與 `agent-compile` 的內容生成策略、語料選擇策略或 wiki 檔案格式。
- 不加入獨立 Web UI、公網 API、雲端排程器或 Joplin plugin。
- 不自動修復或旋轉 Joplin Web Clipper token；token 來源仍由 operator 在 Joplin Desktop 設定中取得。
- 不把 `joplin_wiki_writeback.enabled: false` 作為預設替代方案；這只作為無法使用 Data API 時的 operator 選項。
- 不處理已經因舊語意提交 state 的歷史失敗批次；本 change 只保證新版本之後的耐久語意。

## 全本機運作

資料路徑維持在 repo 工作目錄與本機 Joplin profile：SQLite 讀取本機 database.sqlite，raw 匯出至 raw/，wiki 產出至 wiki/，snapshot state 寫入 .joplin-llm-wiki/sqlite-sync-state.json。Ollama 與 Codex CLI 仍只在本機流程內被呼叫；本 change 不新增 Chroma、遠端向量庫或任何雲端 LLM API。Joplin 寫回只允許既有 loopback Data API base_url，離線驗收可用 fixture SQLite、mock compile、mock writeback client 與 LaunchAgent plist 靜態檢查完成。

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `joplin-sqlite-sync`: raw snapshot state 的提交時機改為 downstream 成功後，並定義 downstream 失敗後的可重試語意。
- `joplin-wiki-writeback`: 啟用 writeback 的自動編譯路徑需先驗證 Data API 可用與 token 有效，並以穩定錯誤碼回報驗證失敗。
- `macos-launchd-stack`: sqlite-sync LaunchAgent 支援非零退出受控重啟與節流，避免排程在 transient failure 後永久停止。

## Impact

- Affected specs: joplin-sqlite-sync, joplin-wiki-writeback, macos-launchd-stack
- Affected code:
  - Modified: src/commands/cmd-sqlite-sync.js
  - Modified: src/commands/cmd-agent-compile.js
  - Modified: src/commands/cmd-wiki-compile.js
  - Modified: src/joplin/wiki-writeback.js
  - Modified: src/joplin/data-api-client.js
  - Modified: scripts/launchd/com.joplin-brain.sqlite-sync.plist
  - Modified: scripts/launchd/run-sqlite-sync.sh
  - Modified: scripts/launchd/install-joplin-brain-stack.sh
  - Modified: docs/macos-launchd-stack.md
  - Modified: docs/scheduling-examples.md
  - Modified: README.md
  - Modified: test/sqlite-sync-change-detection.test.js
  - Modified: test/joplin-wiki-writeback.test.js
  - Modified: test/joplin-cli.test.js
  - New: test/launchd-plist.test.js
  - New: test/launchd-run-sqlite-sync.test.js
  - Removed: none
- APIs and dependencies: no new runtime dependencies; CLI JSON summaries may add fields for downstream failure and state commit status.
- Systems: local macOS LaunchAgent behavior changes only for this project’s sqlite-sync job.

## Risks

- Delaying snapshot commit can rerun export/compile after repeated writeback failures; throttle and clearer error output are required so retries are visible rather than noisy.
- Preflight auth checks must be non-mutating or minimally scoped, otherwise they could create partial Joplin state before compile.
- Existing users with manually modified plist files may need to reinstall the LaunchAgent to pick up KeepAlive and throttle settings.

## MVP 對照

本 change preserves the current MVP: Node.js 20+ JavaScript ESM, pnpm CLI, local Joplin SQLite export, local raw/wiki filesystem outputs, optional local loopback Joplin Data API writeback, and macOS launchd scheduling. It does not add Python, npm/yarn defaults, cloud vector storage, hosted LLM APIs, or network services.

## Joplin / Jarvis / joplin-llm-wiki 關係

Joplin Desktop remains the source editor and Web Clipper/Data API provider. Jarvis remains an in-editor assistant and is not modified. joplin-llm-wiki owns the local scheduled export, wiki compilation, retry-safe snapshot state, and optional writeback into the @llm-wiki notebook tree.

## Assumptions

- The operator uses a local Joplin Desktop profile with database.sqlite readable by the current user.
- Joplin Desktop Web Clipper is enabled when writeback is enabled, and its token can be copied into config.yaml.
- Node.js 20+, pnpm, and the configured local compile backend are installed.
- Typical notebook scale remains below 10k notes.
- LaunchAgent installation targets the interactive macOS user domain, not a headless system daemon.

## Rollback

Rollback is to remove or park this change before apply, or after implementation to reinstall the previous LaunchAgent template and restore the previous `sqlite-sync` state-commit behavior. Data safety remains local: stopping the LaunchAgent stops polling, and deleting generated wiki/ or rebuilding .joplin-llm-wiki state does not modify original Joplin source notes. Existing Joplin writeback notes can be managed from the @llm-wiki tree.

## Success Criteria

- [ ] SCN-JSQ-RETRY-01: when compile fails after raw changes, sqlite-sync exits non-zero and the previous snapshot state remains unchanged.
- [ ] SCN-JSQ-RETRY-02: after the same failure is fixed, the next sqlite-sync invocation still detects the same raw change and reruns the configured compile mode.
- [ ] SCN-JWKB-PREFLIGHT-01: when writeback is enabled and the Joplin token is invalid, auto compile fails before invoking wiki or agent compile and reports the invalid token cause.
- [ ] SCN-MLS-RESTART-01: generated sqlite-sync LaunchAgent restarts on non-zero exit with throttle, but does not require external StartInterval when `schedule.every_seconds` is set.
- [ ] SCN-MLS-READINESS-AGENT-01: generated sqlite-sync LaunchAgent startup does not wait for Ollama when resolved `compile_mode` is `agent`.
- [ ] SCN-MLS-READINESS-LOCAL-01: generated sqlite-sync LaunchAgent startup still waits for Ollama when resolved `compile_mode` is `local`.
- [ ] SCN-LOCAL-BOUNDARY-01: tests and docs confirm no new remote network endpoints or external services are introduced.
