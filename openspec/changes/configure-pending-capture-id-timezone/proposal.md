## Why

目前 joplin_query、joplin_brainstorm 等 MCP／CLI capture draft 流程會用 UTC ISO 字串產生 capture_draft_id，例如 2026-05-25T11-46-36-845Z-topic-hash。這讓使用者在臺灣本地工作時需要自行換算時間，也讓 pending capture 檔案排序與實際工作時間的直覺不一致。

這次變更要讓 pending capture ID 的時間前綴可依設定使用 Asia/Taipei／GMT+8，同時保留預設 UTC 行為與既有 pending capture 讀取、確認相容性。

## What Changes

- 變更類型：Feature。
- 新增可設定的 pending capture ID 時區行為，預設仍使用 UTC Z 時間，避免既有安裝升級後 ID 格式突然改變。
- MCP 與 CLI 中會產生 capture_draft_id 的流程，在設定為 Asia/Taipei／GMT+8 時 SHALL 產生本地時間前綴，建議格式為 YYYY-MM-DDTHH-mm-ss-<slug>-<hash>。
- 保留既有 slug 與 hash 規則；只調整時間前綴產生來源與格式，不改變 capture title slug 化與隨機 hash 的語意。
- joplin_show_capture 與 joplin_confirm_capture SHALL 繼續接受舊 UTC Z capture ID，包含已存在於 .joplin-llm-wiki/pending-captures/ 的 JSON 檔案。
- 文件需補充 pending capture ID 可使用 Asia/Taipei／GMT+8，並說明舊 UTC Z ID 仍可讀取與確認。

## Goals

- G1：使用者可透過設定把新建立的 pending capture ID 時間前綴切換為 Asia/Taipei／GMT+8。
- G2：未設定時，新建立的 pending capture ID 仍維持現有 UTC Z 預設，降低升級風險。
- G3：既有 pending capture JSON 檔案不需要 migration，舊 UTC Z ID 仍可 show 與 confirm。
- G4：slug 與 hash 行為不因時區設定改變，避免既有檔名辨識與測試語意漂移。

## Non-Goals

- 不改變 formal note 的 brainstorming/chat 或 artifacts/<project> 落地路徑命名規則，除非後續實作發現與 capture draft ID 產生共用且必須拆分。
- 不 migration、重新命名或刪除 .joplin-llm-wiki/pending-captures/ 內既有 JSON 檔案。
- 不把 capture ID 改成需要解析時區 offset 才能讀取的強約束格式；讀取與確認流程仍以完整 capture_id 對應檔案。
- 不引入第三方日期時間套件；優先使用 Node.js 20+ 內建 Intl／Date 能力。
- 不引入雲端服務、遠端 DB、遠端向量庫或任何外部網路依賴。

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- mcp-knowledge-flow: pending capture draft ID generation becomes configurable for local timezone prefixes while preserving legacy UTC ID lookup and confirmation.

## Impact

- Affected specs: mcp-knowledge-flow
- Affected code:
  - Modified: src/knowledge-flow/query-service.js
  - Modified: src/config/load-config.js
  - Modified: src/mcp/tools.js
  - Modified: src/commands/cmd-query.js
  - Modified: config.yaml.example
  - Modified: README.md
  - Modified: README.en.md
  - Modified: docs/codex-cursor-mcp.md
  - Modified: docs/llm-knowledge-flow.md
  - Modified: test/query.test.js
  - Modified: test/mcp-server.test.js
  - New: none
  - Removed: none
- Package scripts checked: package.json defines test and test:vitest as vitest run.
- 全本機運作：變更只影響本機檔案系統中的 .joplin-llm-wiki/pending-captures/ 命名與 JSON metadata；不改變 Ollama、Chroma、本機 Data API 或網路邊界；可用 repo 內 Vitest 單測離線驗收。
- Joplin／Jarvis／joplin-llm-wiki 關係：Joplin 仍是筆記與 Data API 的來源／目的地，Jarvis 不受影響；joplin-llm-wiki 只調整自己產生 pending capture draft 的本機 ID。
- 技術棧：Node.js 20+、JavaScript ESM、pnpm、既有 Vitest 測試；ChromaDB 與 Ollama 不在本次 runtime 路徑內。

## Risks

- 若格式化邏輯分散在多處，可能導致 MCP 與 CLI 產生不同 ID；後續設計與任務需集中產生端。
- 若讀取流程誤加入新格式 parser，可能破壞舊 UTC Z ID；後續測試必須覆蓋舊 ID show 與 confirm。
- 若使用 Intl timeZone 設定在執行環境缺少 ICU 支援，Asia/Taipei 格式化可能不穩；實作需使用 Node 20 常見能力並以測試固定日期驗證。

## MVP 對照

- MVP 僅新增 pending capture ID 時區設定與文件／測試，不重建 RAG、wiki compile、sqlite-sync 或 Joplin writeback。
- MVP 不需要 Ollama、ChromaDB 或外網；驗收集中在本機 Node.js 與 Vitest。

## Assumptions

- 使用者執行環境為 Node.js 20+，且 package manager 為 pnpm。
- pending capture 檔案量維持單機使用者規模，不需要批次 migration。
- 既有 capture ID 查找是以 capture_id 對應 pending-captures 檔名；不要求從 ID 反解析時間。
- 使用者的主要本地時區需求是 Asia/Taipei／GMT+8，但設定欄位應可容納其他 IANA timezone，預設為 UTC。

## Rollback

- 移除或改回新增的設定即可回到 UTC Z ID 產生行為。
- 已建立的 pending capture JSON 可繼續以完整 ID 讀取與確認；不需要重建 data/chroma/ 或修改 Joplin 筆記。
- 此變更不啟動 watcher、不碰 Joplin 原始資料、不影響 Jarvis。

## Success Criteria

- [ ] SCN-MCP-CAPTURE-ID-01：當 pending capture ID timezone 設為 Asia/Taipei 時，新 capture_draft_id 使用 GMT+8 本地時間前綴，且不包含 UTC Z 後綴。
- [ ] SCN-MCP-CAPTURE-ID-02：未設定 timezone 時，新 capture_draft_id 維持既有 UTC Z 時間前綴。
- [ ] SCN-MCP-CAPTURE-ID-03：既有 UTC Z capture ID 的 pending JSON 可被 joplin_show_capture 讀取。
- [ ] SCN-MCP-CAPTURE-ID-04：既有 UTC Z capture ID 的 pending JSON 可被 joplin_confirm_capture 寫成正式 note 並移除 pending 檔。
- [ ] SCN-MCP-CAPTURE-ID-05：相同 title 在 UTC 與 Asia/Taipei 設定下仍保留相同 slug 化規則，hash 長度與十六進位格式不變。
