## 1. 設定與 ID 產生契約

- [x] 1.1 依照「使用 `knowledge_flow.pending_capture_id_timezone` 作為設定介面」決策，在 `src/config/load-config.js` 新增 `knowledge_flow.pending_capture_id_timezone`，讓未設定時回傳 `UTC`、設定 `Asia/Taipei` 時可通過驗證、無效 timezone 以 `CONFIG_INVALID` 失敗；驗收：新增或更新 config schema Vitest，覆蓋預設值、`Asia/Taipei`、無效值。
- [x] 1.2 在 `src/knowledge-flow/query-service.js` 實作「集中建立 pending capture draft ID formatter」與「UTC 保留舊格式，非 UTC 使用本地無 offset 檔名安全格式」決策，讓 `REQ-MCP-004 Configurable pending capture draft ID timezone` 的 timestamp prefix 由單一 helper 產生；驗收：formatter 單測固定 `2026-05-25T11:46:36.845Z`，UTC 輸出相容 `2026-05-25T11-46-36-845Z`，Asia/Taipei 輸出 `2026-05-25T19-46-36`。
- [x] 1.3 維持 slug 與 hash contract：同一 title 在 UTC 與 Asia/Taipei 設定下保留相同 slug 化規則，ID 仍以 8 字元 lowercase hex hash 結尾；驗收：`test/query.test.js` 或 dedicated formatter test 覆蓋 SCN-MCP-CAPTURE-ID-05。

## 2. MCP／CLI pending capture 流程

- [x] 2.1 將 `src/knowledge-flow/query-service.js` 的 `writePendingCapture` 改為使用 loaded config 的 `knowledge_flow.pending_capture_id_timezone`，讓 CLI `query` 產生的 `CAPTURE_DRAFT` ID 遵守設定且 pending JSON 仍寫入 `.joplin-llm-wiki/pending-captures/<id>.json`；驗收：`test/query.test.js` 覆蓋 SCN-MCP-CAPTURE-ID-01 與 SCN-MCP-CAPTURE-ID-02。
- [x] 2.2 確認 `src/mcp/tools.js` 與 `src/commands/cmd-query.js` 的 query/brainstorm 呼叫會把 config timezone 傳入產生端，讓 `joplin_query` 與 `joplin_brainstorm` 回傳的 `capture_draft_id` 都符合設定；驗收：`test/mcp-server.test.js` 覆蓋 MCP query 與 brainstorm 的 Asia/Taipei prefix。
- [x] 2.3 保持「讀取與確認流程保持以完整 ID 查檔」決策，讓 `joplin_show_capture` 對既有 UTC `Z` ID 不做 parser 轉換即可讀取 pending JSON；驗收：`test/mcp-server.test.js` 建立舊 ID 檔案並覆蓋 SCN-MCP-CAPTURE-ID-03。
- [x] 2.4 保持 `joplin_confirm_capture` 對舊 UTC `Z` ID 的確認流程，成功寫入正式 note 後才移除舊 pending JSON；驗收：`test/mcp-server.test.js` 或 `test/query.test.js` 建立舊 ID 檔案並覆蓋 SCN-MCP-CAPTURE-ID-04。

## 3. 文件與範例

- [x] [P] 3.1 在 `config.yaml.example` 補上 `knowledge_flow.pending_capture_id_timezone: UTC` 與 `Asia/Taipei` 註解範例，讓使用者知道如何切換 GMT+8 capture ID；驗收：人工檢查設定範例語意，並跑 config loading 測試確認範例欄位可被接受。
- [x] [P] 3.2 在 `README.md` 更新 pending capture workflow，說明預設 UTC、可設定 Asia/Taipei／GMT+8、舊 UTC `Z` ID 仍可 show/confirm；驗收：文件內容審查包含 `knowledge_flow.pending_capture_id_timezone`、`Asia/Taipei`、`joplin_show_capture`、`joplin_confirm_capture`。
- [x] [P] 3.3 在 `README.en.md` 同步英文說明 pending capture ID timezone 設定與 legacy UTC compatibility，避免中英文 README 漂移；驗收：文件內容審查包含 `knowledge_flow.pending_capture_id_timezone`、`Asia/Taipei`、legacy UTC ID compatibility。
- [x] [P] 3.4 在 `docs/codex-cursor-mcp.md` 與 `docs/llm-knowledge-flow.md` 補充 MCP pending capture ID 的時區設定與相容性，讓 Codex/Cursor 使用者理解 `capture_draft_id` 的本地時間前綴；驗收：文件內容審查覆蓋 pending capture、Asia/Taipei、舊 ID 相容。

## 4. 驗證與收斂

- [x] 4.1 跑最小 Vitest 命令驗證 capture ID 與 config 行為，例如 `pnpm vitest run test/query.test.js test/mcp-server.test.js test/config-schema.test.js`；驗收：命令通過，且涵蓋 SCN-MCP-CAPTURE-ID-01 到 SCN-MCP-CAPTURE-ID-05。
- [x] 4.2 跑 Spectra analyzer/validation 確認 proposal、design、specs、tasks 與 `mcp-knowledge-flow` delta spec 一致；驗收：`spectra analyze configure-pending-capture-id-timezone --json` 無 Critical/Warning，`spectra validate configure-pending-capture-id-timezone` 通過。
- [x] 4.3 檢查 implementation diff 未碰觸 out-of-scope 的 formal note timestamp、archive artifact timestamp、sqlite-sync timestamp、report timestamp、Joplin Data API writeback；驗收：人工 review `git diff -- src test docs README.md README.en.md config.yaml.example` 並確認 Scope boundaries 未漂移。
