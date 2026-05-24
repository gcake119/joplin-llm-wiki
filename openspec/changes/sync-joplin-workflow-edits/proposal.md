## Why

變更類型：Feature。

目前 `brainstorming/` 與 `artifacts/` 可以從工作目錄按需寫回 Joplin，但使用者若在 Joplin 的 `@llm-wiki/brainstorming` 或 `@llm-wiki/artifacts` 筆記本中修正文句、補充內容，這些修改不會回到工作目錄。這會讓 Joplin 端與 repo 端逐漸分歧，削弱 `brainstorming/` 與 `artifacts/` 作為可審計工作成果的價值。

## What Changes

- 新增 Joplin workflow 筆記反向同步能力：從本機 Joplin Data API 讀取 `@llm-wiki/brainstorming` 與 `@llm-wiki/artifacts` 下面的 Markdown 筆記，映射回工作目錄的 `brainstorming/` 與 `artifacts/` 檔案。
- 同步範圍只包含 workflow 筆記本，不包含一般 Joplin 來源筆記、`raw/`、compiled `wiki/`、Jarvis related notes 或 Joplin Cloud 同步。
- 支援明確的手動 CLI 入口與 MCP 工具入口，讓使用者可在 Codex/Cursor 中要求把 Joplin workflow 編輯同步回 repo。
- 同步需保留本機優先與 loopback Data API 邊界；不引入雲端 LLM、遠端資料庫或第三方 SaaS。
- 預設採安全寫入：只改寫可由 workflow notebook path 決定的目標檔案，避免任意路徑穿越；衝突、重名或無法映射的筆記要回報並跳過或失敗，不靜默覆蓋未知檔案。
- 文件需更新，清楚說明 `brainstorming/` / `artifacts/` 現在有「按需寫回 Joplin」與「按需從 Joplin 拉回工作目錄」兩種方向，但仍不是 raw/wiki 編譯管線的一部分。

## Goals

- G1：使用者在 Joplin `@llm-wiki/brainstorming/chat` 或 `@llm-wiki/brainstorming/health` 編輯筆記後，可以透過明確命令同步到工作目錄同一路徑語意下的 Markdown 檔。
- G2：使用者在 Joplin `@llm-wiki/artifacts/<project>` 編輯筆記後，可以同步到 `artifacts/<project>/` 下對應 Markdown 檔。
- G3：同步過程保持可審計：輸出列出 scanned、updated、skipped、conflict、error 的結構化摘要，並能 dry-run 顯示將修改的檔案而不寫入。
- G4：同步邊界安全明確：只使用本機 Joplin Data API，只處理允許的 notebook tree，只寫工作目錄內允許的 workflow path。

## Non-Goals

- 不把 `raw/` 或 compiled `wiki/` 改成雙向同步；`raw/` 仍由 SQLite source export 管理，`wiki/` 仍由 compile pipeline 管理。
- 不同步一般 Joplin 筆記庫、Jarvis 資料、附件、圖片、PDF、資源檔或 Joplin note metadata。
- 不自動常駐監看 Joplin Data API；MVP 只提供明確命令或 MCP 呼叫觸發。
- 不處理多使用者合併、雲端衝突解決或 CRDT 類型雙向同步。
- 不在 proposal 階段變更既有程式碼。

## 全本機運作

- 資料路徑：Joplin 端限定在 `@llm-wiki/brainstorming` 與 `@llm-wiki/artifacts`；工作目錄端限定在 `brainstorming/` 與 `artifacts/`。
- Joplin：透過既有 `joplin_data_api.base_url` 與 token 存取本機 Web Clipper / Data API，hostname 沿用 loopback allowlist。
- Ollama：此同步不需要 LLM 推理，不要求 Ollama 可用。
- Chroma：此同步不讀寫 Chroma 或向量索引。
- 網路邊界：只允許連到本機 Joplin Data API，不新增外部 HTTP 目的地。
- 離線驗收：在 Joplin Desktop 與 Data API 可用、repo 測試資料可建立的情況下，可用 mocked Data API 或本機 loopback 測試驗證，不需要外網。

## Capabilities

### New Capabilities

- `joplin-workflow-sync`: 從 Joplin workflow notebook tree 讀取 brainstorming/artifacts 筆記，安全同步回工作目錄對應 Markdown 檔。

### Modified Capabilities

- `joplin-wiki-writeback`: 釐清 workflow notes 除了按需 writeback，也支援相反方向的按需 pull sync，但 compiled wiki writeback 行為不變。
- `mcp-knowledge-flow`: MCP 工具集新增 workflow pull sync 入口，回傳結構化同步摘要。

## Impact

- Affected specs: new `joplin-workflow-sync`; modified `joplin-wiki-writeback`, `mcp-knowledge-flow`
- Affected code:
  - New: src/joplin/workflow-sync.js, src/commands/cmd-workflow-sync.js, test/joplin-workflow-sync.test.js
  - Modified: src/cli.js, src/mcp/tools.js, src/mcp/schema.js, src/knowledge-flow/orchestration-service.js, src/joplin/wiki-writeback.js, src/config/load-config.js, README.md, docs/llm-knowledge-flow.md, config.yaml.example
  - Removed: none
- APIs and tools: add a CLI subcommand for Joplin-to-workspace workflow sync and an MCP tool that wraps the same service.
- Dependencies: no new runtime dependency expected; use existing Node.js ESM, pnpm, and Joplin Data API client.
- Systems: Joplin Desktop Web Clipper / Data API remains the only network integration point.

## Risks

- Joplin note titles can map to the same filesystem filename; the implementation must detect collisions and avoid silent overwrites.
- A user can edit both sides before syncing; MVP surfaces conflicts rather than attempting automatic merge.
- Artifacts require project notebook mapping; missing or ambiguous project notebooks must be reported clearly.
- Data API pagination or nested folder traversal mistakes could skip notes; tests need nested notebook fixtures.

## MVP 對照

- Joplin：仍是使用者可編輯介面與 workflow note mirror；本變更只拉回指定 `@llm-wiki` workflow tree 的文字內容。
- Jarvis：不受影響；仍負責 Joplin 內的 related notes 體驗。
- joplin-llm-wiki：負責 repo 端檔案、按需 writeback、按需 pull sync、CLI/MCP 操作與測試驗證。

## Assumptions

- Joplin Desktop Web Clipper / Data API 已啟用，token 已在 `config.yaml` 設定。
- Node.js 20+ 與 pnpm 可用。
- workflow 筆記量級低於 10k，單次手動同步可在本機完成。
- `@llm-wiki`、`brainstorming`、`artifacts` notebook title 使用現有設定鍵解析。
- Ollama 模型是否已 pull 不影響此同步。

## Rollback

- 停止使用新增 CLI/MCP sync 入口即可；不影響既有 `sqlite-sync`、`wiki-compile` 或 writeback。
- 若同步結果不符合預期，可用 git diff 檢視並還原工作目錄 Markdown 檔。
- 不需要刪除或重建 `data/chroma/`，因本變更不碰向量資料。
- 不會修改 Joplin 原始筆記以外的既有 writeback 行為；pull sync 本身只讀 Joplin workflow 筆記並寫 repo 檔案。

## Success Criteria

- [ ] SCN-JWFS-BRAIN-01：Joplin brainstorming note 更新後，dry-run 顯示對應工作目錄檔案將被更新，正式執行後檔案內容一致。
- [ ] SCN-JWFS-ART-01：Joplin artifacts project note 更新後，正式執行更新 `artifacts/<project>/` 對應檔案。
- [ ] SCN-JWFS-SAFE-01：重名、未知路徑或路徑穿越候選不會被靜默寫入，摘要列為 skipped/conflict/error。
- [ ] SCN-JWFS-DRY-01：dry-run 不改寫任何工作目錄檔案。
- [ ] SCN-MCP-WFS-01：MCP 工具可觸發同一同步服務並回傳結構化摘要。
