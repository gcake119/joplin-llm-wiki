## 1. Service 邊界與既有 CLI 保護

- [x] 1.1 建立 regression tests，鎖定 `REQ-QUERY-003 Pending capture before formal notes` 與 `REQ-QUERY-004 On-demand workflow writeback` 的既有 query/capture 行為，確認 pending capture 在正式確認前不寫入 workflow note；驗收：新增或調整 node:test 測試並執行 `pnpm test`。
- [x] 1.2 實作 `抽出 CLI 與 MCP 共用的 knowledge-flow service`，讓 query、pending capture read/write、confirm capture 與 archive path resolution 可被 CLI 與 MCP 共用；驗收：既有 query CLI 測試通過，且 cmd-query.js 只負責 argv/opts 轉換與 stdout/stderr 呈現。
- [x] 1.3 實作 artifact capture 新路徑契約，讓 artifacts capture 以 project name 寫入 `artifacts/<project>/` 並拒絕缺少 project 的確認；驗收：`REQ-QUERY-003 Pending capture before formal notes` 測試覆蓋 `ARTIFACT_PROJECT_REQUIRED` 與 `artifacts/tainan-city/` 路徑。
- [x] 1.4 調整 workflow writeback mapping，讓 `REQ-JWKB-WORKFLOW On-demand workflow writeback` 接受 `artifacts/<project>/...md` 並映射到 `@llm-wiki/artifacts/<project>`；驗收：writeback 單元測試驗證 `artifacts/tainan-city/example.md` 不需要 `artifacts/projects/` segment。

## 2. MCP server 與工具 schema

- [x] 2.1 新增 `新增 MCP server 作為對話工具入口` 的 stdio MCP server，註冊 `REQ-MCP-001 Local MCP server exposes knowledge-flow tools` 要求的八個 tool names，且不開 HTTP listener；驗收：MCP server harness 或 handler 測試列出所有 tools。
- [x] 2.2 [P] 定義 `joplin_query`、`joplin_show_capture`、`joplin_confirm_capture` 的 input/output schema，所有成功結果回傳 JSON-compatible object 而非要求解析 CLI stdout；驗收：schema 測試覆蓋 required fields 與錯誤 shape。
- [x] 2.3 [P] 定義 `joplin_brainstorm`、`joplin_suggest_archive_project`、`joplin_archive_project` 的 input/output schema，包含 `confirmed_project` 或等價確認欄位；驗收：schema 測試拒絕沒有 project confirmation 的 archive input。
- [x] 2.4 [P] 定義 `joplin_sync_sources` 與 `joplin_compile_wiki` orchestration schema，回傳 exit code、bounded stdout summary、bounded stderr summary 與 stable error code；驗收：mock spawn 測試驗證輸出截斷與 exit code 保留。

## 3. Query、Brainstorm 與 Capture 工具行為

- [x] 3.1 實作 `joplin_query` handler，滿足 `REQ-MCP-002 MCP tools preserve pending capture workflow`：回傳 answer、sources、capture_draft_id，且只建立 pending capture；驗收：fixture wiki/raw 測試確認正式 note 尚未寫入。
- [x] 3.2 實作 `joplin_show_capture` handler，讀取 pending capture 並保持 read-only；驗收：測試確認呼叫前後 pending capture file 仍存在且內容一致。
- [x] 3.3 實作 `joplin_confirm_capture` handler，確認 brainstorming capture 後寫入 `brainstorming/chat/`，確認 artifact capture 後寫入 `artifacts/<project>/`，並在成功後清除 pending capture；驗收：測試覆蓋 brainstorming 與 artifact 兩種 classification。
- [x] 3.4 實作 `Brainstorm 是 query 的語意化包裝`，讓 `joplin_brainstorm` 使用 query service 並將保存意圖偏向 brainstorming capture；驗收：測試確認產生的 pending capture classification 為 `brainstorming`。

## 4. Project 歸檔與確認流程

- [x] 4.1 實作 `Project 歸檔拆成建議與確認兩步` 的 project 建議器，`joplin_suggest_archive_project` 依 title/content/context 產生 2-3 個 project 名稱、artifact title 與 reason；驗收：deterministic fixture 測試確認 suggestions 長度與欄位。
- [x] 4.2 實作 `REQ-MCP-003 Project archive requires suggested and confirmed project name` 的拒絕規則，`joplin_archive_project` 在缺少 confirmed project 時回傳 `PROJECT_CONFIRMATION_REQUIRED` 並不寫檔；驗收：測試確認 `artifacts/<project>/` 未建立新 Markdown。
- [x] 4.3 實作 confirmed archive 寫入，成功時產生 `artifacts/<project>/<timestamp>-<slug>.md`，frontmatter 包含 title、created_at、project、capture_path 與 knowledge_sources；驗收：測試讀回 Markdown 與 frontmatter 欄位。
- [x] 4.4 串接 archive writeback，當 `writeback_workflow=true` 時使用 confirmed project notebook 名稱寫回 `@llm-wiki/artifacts/<project>`；驗收：mock Joplin Data API 測試確認 notebook path 與 token redaction。

## 5. Sync、Compile 與本機邊界

- [x] 5.1 實作 `Sync 與 compile tools 只包既有命令語意` 的 `joplin_sync_sources` handler，支援 `normal`、`export_only`、`snapshot_only` 並保持 sqlite-sync snapshot semantics；驗收：mock spawn 測試確認對應 argv 與 output summary。
- [x] 5.2 實作 `joplin_compile_wiki` handler，mode `local` 對應 `wiki-compile`，mode `agent` 對應 `agent-compile`，dry_run 與 batch options 正確傳遞；驗收：mock spawn 測試確認 argv 與 bounded output。
- [x] 5.3 強化 `REQ-MCP-005 MCP tools preserve local-first boundaries`，確保 tool output 不包含 Joplin token，query 只使用 wiki/raw 與設定的 local provider，writeback 只使用 loopback Data API；驗收：單元測試覆蓋 token redaction 與 non-loopback config failure。
- [x] 5.4 確認 `REQ-MCP-004 MCP orchestration tools wrap existing sync and compile flows` 不改變既有 CLI 行為；驗收：`pnpm test` 中 sqlite-sync、wiki-compile、agent-compile 相關測試仍通過。

## 6. 文件、設定範例與最終驗證

- [x] 6.1 [P] 新增 Codex/Cursor MCP 設定範例與操作文件，說明 eight tools、project 歸檔前需先建議命名並取得使用者確認、以及 `artifacts/<project>/` 路徑；驗收：內容審查確認 docs 包含 MCP server 啟動方式與 confirmation rule。
- [x] 6.2 [P] 更新 repo guidance，讓 AGENTS.md 或相應規則說明 Codex/Cursor 對話中優先使用 MCP tools 執行 query、brainstorm、confirm capture 與 project archive；驗收：內容審查確認不把 `artifacts/projects/<project>/` 作為新歸檔路徑。
- [x] 6.3 更新 package metadata 與 lockfile，讓 MCP server 可由 pnpm/bin 或設定範例穩定啟動，並保持 Node.js 20+、JavaScript ESM；驗收：本機執行 MCP server 啟動 smoke check 或 handler test。
- [x] 6.4 執行最終驗證，確認 specs、design 與 tasks 一致且實作測試通過；驗收：`spectra analyze add-mcp-knowledge-flow-tools --json` 無 Critical/Warning、`spectra validate add-mcp-knowledge-flow-tools` 通過、`pnpm test` 通過。
