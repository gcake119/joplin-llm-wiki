## 1. 測試先行與現況重現

- [x] 1.1 在 test/sqlite-sync-change-detection.test.js 新增「Retry-safe snapshot commit for downstream pipelines」失敗案例：模擬 raw changed 且 `runAgentCompile` 回傳 `AGENT_COMPILE_FAILED` 時，行為必須保持舊 snapshot state 不變；先確認測試在現況會失敗，驗收：單跑 `pnpm test test/sqlite-sync-change-detection.test.js` 可看到該案例紅燈，對應 SCN-JSQ-RETRY-01。
- [x] 1.2 在 test/sqlite-sync-change-detection.test.js 新增 retry 成功案例：同一個 raw changed 狀態第一次 downstream failure 不提交 state，第二次 downstream success 後才提交 current snapshot；驗收：實作後該測試通過，對應 SCN-JSQ-RETRY-02。
- [x] 1.3 在 test/joplin-wiki-writeback.test.js 或 test/joplin-cli.test.js 新增「Non-mutating writeback preflight for automatic compile orchestration」案例：invalid token 時 preflight 在 `agent-compile` spawn 前失敗，compile mock call count 為 0；驗收：實作後測試通過，對應 SCN-JWKB-PREFLIGHT-01。
- [x] [P] 1.4 新增 test/launchd-plist.test.js 驗證 sqlite-sync plist 的「sqlite-sync LaunchAgent restarts on non-zero exit with throttle」契約：`KeepAlive.SuccessfulExit` 為 false 且 `ThrottleInterval` 是正整數；驗收：`pnpm test test/launchd-plist.test.js` 通過，對應 SCN-MLS-RESTART-01。
- [x] [P] 1.5 新增 test/launchd-run-sqlite-sync.test.js 驗證「sqlite-sync LaunchAgent readiness follows compile mode」：mock config 分別為 `compile_mode: agent|local|off`，agent/off 不觸發 Ollama probe 並會執行 sqlite-sync，local 會等待 Ollama readiness；驗收：`pnpm test test/launchd-run-sqlite-sync.test.js` 通過，對應 SCN-MLS-READINESS-AGENT-01 與 SCN-MLS-READINESS-LOCAL-01。

## 2. sqlite-sync 狀態提交語意

- [x] 2.1 依設計「Decision: Defer sqlite-sync snapshot commit until downstream success」重構 src/commands/cmd-sqlite-sync.js：將 current snapshot 保持為 pending，只有 downstream success 或明確 skip downstream 的路徑才寫入 state；驗收：1.1、1.2 以及既有 snapshot-only/export-only 測試通過，覆蓋 SCN-JSQ-RETRY-01、SCN-JSQ-RETRY-02、Export-only preserves explicit export semantics。
- [x] 2.2 保留 export-only、snapshot-only、baseline、unchanged raw、`compile_mode: off` 的明確提交或跳過語意，不讓 retry-safe 改動破壞既有操作模式；驗收：`pnpm test test/sqlite-sync-change-detection.test.js` 通過，並在測試中斷言 `export_only` 與 `compile_mode: off` 時 `state_committed: true`。
- [x] 2.3 依「Downstream-aware sqlite-sync cycle summary」與設計「Decision: Keep summaries machine-readable and operator-readable」在 stdout JSON summary 補上 `state_committed`、`state_commit_reason`、`downstream_status`、`writeback_preflight_status` 等非破壞欄位，讓 operator 可判斷 retry 是否仍會發生；驗收：新增或更新測試斷言 success、downstream failed、preflight failed 三種輸出，對應 SCN-JSQ successful downstream summary 與 writeback preflight failure summary。
- [x] 2.4 依「Local retry boundary」確認 retry bookkeeping 不新增遠端 queue 或 repo 外狀態檔，只使用既有 local snapshot state 與 process exit status；驗收：測試檢查失敗路徑未建立額外 retry 檔，並以程式碼審查確認沒有新增網路 endpoint，對應 SCN-JSQ-LOCAL-RETRY-01。

## 3. Joplin writeback preflight

- [x] 3.1 在 src/joplin/data-api-client.js 與 src/joplin/wiki-writeback.js 提供 non-mutating preflight helper，落實「Writeback preflight preserves local-first boundaries」：驗證 Data API reachable 與 token accepted，且錯誤輸出不包含 token、HTTP 只打到 configured loopback origin；驗收：test/joplin-wiki-writeback.test.js 覆蓋 valid token、invalid token、unreachable API 與非 loopback 禁止情境，對應 SCN-JWKB-PREFLIGHT-01 與 SCN-JWKB-PREFLIGHT-LOCAL-01。
- [x] 3.2 依設計「Decision: Add writeback preflight before automatic compile」把 preflight 注入 src/commands/cmd-sqlite-sync.js 的 automatic compile orchestration，writeback enabled 且 raw changed 時先 preflight，再呼叫 `runWikiCompile` 或 `runAgentCompile`；驗收：invalid token 測試證明 compile mock 未被呼叫，valid token 測試證明 compile mock 被呼叫，對應 SCN-JWKB-PREFLIGHT-01、SCN-JWKB-PREFLIGHT-02。
- [x] 3.3 依設計「Decision: Preserve writeback as compile-owned commit stage」保留實際 Joplin upsert 仍由 cmd-wiki-compile.js、cmd-agent-compile.js 與 runWikiWriteback 執行，sqlite-sync 只做 preflight 與 orchestration；驗收：既有 wiki/agent writeback 測試仍通過，且 sqlite-sync 測試只斷言 preflight 與 downstream 呼叫順序，不新增 standalone writeback CLI。
- [x] 3.4 依「Writeback preflight result is observable」確保 preflight skipped、passed、failed 都能在 cycle summary 或 stderr 中被辨識，且 failure 使用穩定 Joplin Data API error code；驗收：測試斷言 `writeback_preflight_status` 三態與錯誤碼，對應 SCN-JWKB observable output。

## 4. macOS LaunchAgent 耐久輪詢

- [x] 4.1 依設計「Decision: Use LaunchAgent KeepAlive for non-zero exits with throttle」更新 scripts/launchd/com.joplin-brain.sqlite-sync.plist 與 installer 產物，讓非零退出受控重啟、成功退出不循環；驗收：test/launchd-plist.test.js 通過，並人工檢查 plist 不含 `StartInterval` 預設值，對應 SCN-MLS-RESTART-01。
- [x] 4.2 依「LaunchAgent restart preserves local-only execution」確認 plist 仍只呼叫 repo 內 shim/run script 與本機 config path，不把 Joplin token 寫進 EnvironmentVariables；驗收：test/launchd-plist.test.js 解析 plist 並斷言 ProgramArguments/local env 契約，對應 SCN-MLS-LOCAL-RESTART-01。
- [x] 4.3 依設計「Decision: Gate Ollama readiness by resolved compile mode」更新 scripts/launchd/run-sqlite-sync.sh：啟動前讀取 resolved `compile_mode`，agent/off 模式不等待 Ollama，local 模式才等待 Ollama readiness；驗收：test/launchd-run-sqlite-sync.test.js 通過，並手動檢查 agent 模式不會因 Ollama 未連線而停止，對應 SCN-MLS-READINESS-AGENT-01、SCN-MLS-READINESS-LOCAL-01。
- [x] [P] 4.4 更新 docs/macos-launchd-stack.md、docs/scheduling-examples.md、README.md，清楚區分 `schedule.every_seconds` 正常輪詢、LaunchAgent KeepAlive 非零退出恢復、不要和 `StartInterval` 雙重排程，以及 agent 模式不需要 Ollama readiness、local 模式仍需要 Ollama readiness；驗收：文件 review 覆蓋「LaunchAgent scheduling documentation avoids double scheduling」與「sqlite-sync LaunchAgent readiness follows compile mode」，並含 token invalid 修復流程。

## 5. 整合驗證與收斂

- [x] 5.1 跑完整 `pnpm test`，確認 sqlite-sync、writeback、launchd plist 與既有 CLI tests 全部通過；驗收：終端輸出顯示所有 node:test 測試通過。
- [x] 5.2 以 fixture 或 mock config 做一次非 dry-run sqlite-sync smoke：raw changed + invalid token preflight 失敗時 state 不提交，修正 mock token 後下一輪會執行 downstream 並提交 state；驗收：保存命令輸出摘要，對應 SCN-JSQ-RETRY-01、SCN-JSQ-RETRY-02、SCN-JWKB-PREFLIGHT-01。
- [x] 5.3 執行 `spectra validate durable-sqlite-sync-writeback` 與 `spectra analyze durable-sqlite-sync-writeback --json`，確認 artifact 與 implementation scope 沒有偏離；驗收：validate 通過，analyze 沒有 Critical/Warning。
