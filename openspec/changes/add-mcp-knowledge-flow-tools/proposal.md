## Why

目前 joplin-llm-wiki 已有 CLI 可以查詢本機知識庫、產生 pending capture、確認寫入 brainstorming 或 artifacts，並能經由 writeback 同步到 Joplin。不過 Codex/Cursor 對話中若要使用這些能力，仍需要人工或 agent 拼接 shell 指令、解析 stdout，缺少穩定的工具 schema、明確的確認流程與 project 歸檔邊界。

這個變更要把既有知識流包成 MCP 工具層，讓 Codex/Cursor 可以在對話中可靠執行 query、brainstorm、capture 檢視/確認、project 歸檔、來源同步與 wiki 編譯，同時保留 CLI 作為原有入口。

## What Changes

變更類型：Feature

- 新增 MCP server 能力，提供結構化 tools 給 Codex/Cursor 呼叫。
- 將既有 query/capture/workflow writeback 行為抽成可由 CLI 與 MCP 共用的 service 邊界。
- 新增 brainstorm 工具語意：以 query 知識層為基礎，預設將值得保存的探索結果分類為 brainstorming capture。
- 新增 project 歸檔工具語意：正式成品寫入 artifacts/<project>/，且在歸檔前必須先提供 project 名稱建議並取得使用者確認。
- 新增 MCP tools 規劃：joplin_query、joplin_show_capture、joplin_confirm_capture、joplin_brainstorm、joplin_suggest_archive_project、joplin_archive_project、joplin_sync_sources、joplin_compile_wiki。
- 更新 query capture 規格：artifact 類 capture 的正式歸檔路徑改為 artifacts/<project>/，不使用 artifacts/projects/<project>/。
- 補上 Codex/Cursor 使用說明或 skill 規則，使對話 agent 知道何時使用 MCP tools、何時等待使用者確認。

## Goals

- Codex/Cursor 能用 MCP tools 執行本機知識庫 query，回傳 answer、sources、capture_draft_id 與錯誤碼。
- Codex/Cursor 能檢視與確認 pending capture，確認後才產生正式 brainstorming 或 artifact note。
- Project 歸檔必須先建議 2-3 個 project 名稱並等待使用者確認，確認後才寫入 artifacts/<project>/。
- MCP tools 與 CLI 共用同一套核心邏輯，避免 CLI 與 MCP 行為分裂。
- 所有 tools 維持本機優先，不引入外部 SaaS、遠端資料庫或 OpenAI API provider。

## Non-Goals

- 不新增 Web UI 或常駐 HTTP API。
- 不引入遠端向量庫、Chroma Cloud、PostgreSQL/pgvector 或第三方 SaaS。
- 不把 Codex/Cursor 對話內容自動寫入 raw/。
- 不自動決定 project 名稱並直接歸檔；project 名稱必須由使用者確認。
- 不取代 Joplin Desktop、Jarvis 外掛或 Joplin Cloud 同步；本變更只提供本機知識流工具介面。
- 不改用 Python 或雙語言 runtime；維持 Node.js 20+、JavaScript ESM 與 pnpm。

## Capabilities

### New Capabilities

- `mcp-knowledge-flow`: Codex/Cursor 可透過 MCP tools 執行 joplin-llm-wiki 的 query、brainstorm、capture 確認、project 歸檔、來源同步與 wiki 編譯工作流。

### Modified Capabilities

- `cli-rag`: query capture 的 artifact 歸檔規則改為 artifacts/<project>/，且 project 歸檔前必須有建議命名與使用者確認。
- `joplin-wiki-writeback`: workflow note writeback 必須支援 artifacts/<project>/ 的 project hierarchy，不再以 artifacts/projects/<project>/ 作為新 MCP 歸檔預設。

## 全本機運作

- 資料路徑：query 讀取 wiki/ 與 raw/；pending capture 寫入 .joplin-llm-wiki/pending-captures/；brainstorming 正式筆記寫入 brainstorming/chat/；project 歸檔寫入 artifacts/<project>/。
- Ollama：query 與 local compile 仍只呼叫設定的本機 ollama.base_url。
- Chroma：本變更不新增或恢復 Chroma 依賴；現行 filesystem query 邏輯仍不使用 RAG、embedding、Chroma 或 vector index。
- 網路邊界：MCP server 只在本機執行；writeback 只允許既有 Joplin Data API loopback 邊界。
- 離線驗收：在 Node 20+、pnpm、既有 wiki/raw 測試素材可用時，可不連外執行 MCP tool 單元測試與 CLI 行為測試。

## 關係說明

- Joplin：仍是使用者筆記與可選 writeback 的目的地，不由 MCP 直接取代。
- Jarvis：仍負責 Joplin 內的即時 AI 輔助；本變更補上 Codex/Cursor 對話中的知識流工具。
- joplin-llm-wiki：仍是本機知識庫與 workflow artifact 的 source of truth；MCP 只是穩定操作入口。

## Impact

- Affected specs: mcp-knowledge-flow, cli-rag, joplin-wiki-writeback
- Affected code:
  - New: src/mcp/server.js
  - New: src/mcp/tools.js
  - New: src/mcp/schema.js
  - New: docs/codex-cursor-mcp.md
  - New: .cursor/mcp.json.example
  - Modified: src/commands/cmd-query.js
  - Modified: src/commands/index.js
  - Modified: src/joplin/wiki-writeback.js
  - Modified: src/config/load-config.js
  - Modified: package.json
  - Modified: README.md
  - Modified: AGENTS.md
  - Removed: none

## Risks

- MCP 與 CLI 行為若分裂，會讓 capture 與 writeback 路徑不一致；需要抽出共用 service 並以測試覆蓋。
- Project 名稱確認若只靠 agent prompt 約束，可能被略過；MCP tool schema 需要把 suggest 與 archive 拆成兩步，archive tool 要要求 confirmed_project 來源。
- Writeback hierarchy 改為 artifacts/<project>/ 後，既有 artifacts/projects/ 歷史資料不應被自動搬移，避免破壞舊筆記連結。

## MVP 對照

- MVP 包含 MCP server、核心 tools、CLI/MCP 共用 query/capture/歸檔 service、測試、Codex/Cursor 設定範例與使用規則。
- MVP 不包含 UI、長期 daemon 管理、遠端部署、雲端 LLM provider、歷史 artifacts/projects/ 遷移。

## Assumptions

- 使用者在本機 repo 內執行 MCP server，且 Node.js 20+ 與 pnpm 可用。
- config.yaml 已存在，wiki/ 與 raw/ 至少有一層含 Markdown 才能 query。
- Ollama 模型已 pull；若使用 provider=codex-agent，則本機 codex exec 可用。
- 筆記量級仍小於 10000 篇，MCP tool 回應會裁切長輸出以避免對話過載。

## Rollback

- 停用 Codex/Cursor MCP 設定即可停止新工具入口。
- CLI 入口保留；若 MCP 有問題，可回到 pnpm exec joplin-llm-wiki query 與既有 compile/sync 命令。
- 不搬移既有 raw/、wiki/、brainstorming/ 或 artifacts/ 內容；刪除 MCP 新增檔案不應影響 Joplin 資料。

## Success Criteria

- [ ] MCP query tool 在測試素材上回傳 answer、sources，並在需要保存時回傳 capture_draft_id。
- [ ] MCP confirm capture tool 在確認前不寫正式 note，確認後才寫入 brainstorming/chat/ 或 artifacts/<project>/。
- [ ] MCP archive flow 無 confirmed project 時拒絕寫入，並要求先取得使用者確認。
- [ ] artifact project 歸檔路徑為 artifacts/<project>/，不是 artifacts/projects/<project>/。
- [ ] CLI 既有 query/capture 測試仍通過。
- [ ] MCP server 可由 Codex/Cursor 設定範例啟動，且不需要外部網路服務。
