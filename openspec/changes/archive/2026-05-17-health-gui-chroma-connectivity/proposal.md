## Why

操作者在 Health GUI 以背景方式啟動 Chroma（或 Ollama）後，狀態列顯示已成功送出行程，但「已連線／未連線」標籤仍長時間與實際可連線狀態不一致；另者，設定檔中相對路徑的 `chroma.persist_path` 若依 `process.cwd()` 解析，會與 `notes_root` 等欄位（依設定檔目錄解析）不一致，導致從非專案目錄啟動 GUI 時，`pnpm exec chroma run --path` 與探測／CLI 所假設的資料目錄脫節，放大「看似已啟動卻仍未連線」的觀感與除錯成本。此變更在**不引入遠端服務**前提下，收斂設定語意並改善 Health GUI 在背景啟動後的連線回饋。

## What Changes

- 將 `loadConfig` 對**相對**之 `chroma.persist_path` 的解析改為與 `notes_root` 相同：**相對於設定檔所在目錄**（`cfgDir`），而非 `process.cwd()`。
- Health GUI：在操作者確認並**成功**背景啟動 `chroma-server` 或 `ollama-serve` 後，於主程序以**有上限的輪詢間隔**重複執行與 `check-health` 等效之快照建置，直到對應之 `reachable` 為真或逾時；並將最新快照反映於操作者可見之連線標籤與 JSON 區（無需手動按「重新整理」即可完成一回確認）。
- 測試：`load-config` 對 `chroma.persist_path` 之相對路徑解析加入回歸斷言；必要時補強與 Health GUI／探測相關之現有測試，使行為可驗證。

## Non-Goals

- 不變更 Chroma HTTP API 契約、不將向量資料改為遠端儲存。
- 不將 Health GUI 改為即時串流伺服器 log；stderr／stdout 仍不因 detached 啟動而內嵌於視窗。
- 不重新設計 LaunchAgent 標籤或 plist 命名（除非既有檔案因本次修補而需文件對齊，且範圍限於說明文字）。

## Goals

- **G1（設定語意一致）**：相對之 `chroma.persist_path` 與其他依設定檔目錄解析之路徑行為一致，避免因啟動行程的工作目錄不同而誤解資料目錄。
- **G2（連線狀態可信）**：背景啟動成功後，操作者在**合理等待時間內**可於 GUI 看到與 `check-health` 一致之 **Chroma／Ollama reachable** 顯示，無需額外手動重新整理即可完成首輪確認。
- **G3（可驗證）**：上述行為具自動化測試或既有測試路徑可覆蓋，避免回歸。

## 全本機運作

- **資料路徑**：僅影響本機檔案系統上 `chroma.persist_path` 的解析方式；資料仍存放於操作者本機，不新增雲端儲存。
- **Ollama／Chroma**：仍僅透過本機 loopback（預設 `127.0.0.1`）與環境變數 `CHROMA_HOST`／`CHROMA_PORT` 可選覆寫；不新增對外監聽或遠端向量服務。
- **網路邊界**：與現行 MVP 相同；Health GUI 之探測仍僅針對本機依賴。
- **離線驗收**：在已安裝依賴且本機 Chroma／Ollama 可啟動之前提下，可離線驗證 GUI 連線標籤與快照之一致性（不依賴外網 LLM 服務）。

## Assumptions

- 操作者使用之 `config.yaml` 與筆記／向量工作目錄位於本機可讀寫路徑；Joplin Profile 仍由 Joplin／Jarvis 生態維護，本變更不取代之。
- Ollama 模型與 Chroma CLI 可依文件於本機取得；Node.js 20+、pnpm 與專案 lockfile 與現存專案一致。
- 筆記量級與磁碟空間假設維持專案既有 MVP 假設（例如 <10k 筆記量級之開發驗證）。

## Rollback

- 若需還原：回退相關提交；停止 Health GUI 與背景子行程；刪除或重建本機 `data/chroma/`（依操作者自訂之 `persist_path`）不影響 Joplin 官方資料庫本體（仍遵守「不靜默破壞使用者資料」之邊界）。

## Risks（高層）

- **R1**：相對路徑解析語意變更後，少數依賴「相對於 shell cwd」之非文件化工作流程可能需改為絕對路徑或將設定檔置於預期目錄；需於 release 說明標註 **BREAKING** 層級之行為變更（若與舊行為不相容）。
- **R2**：輪詢逾時仍無法連線時，根因可能在於埠號衝突、防火牆或 Chroma 啟動失敗；GUI 僅能反映探測結果，無法取代閱讀本機日誌。

## 與 Joplin／Jarvis／joplin-llm-wiki 之關係

- **Joplin**：仍僅經既有管線與可選寫回語意存取筆記；本變更不修改 Joplin Desktop 或官方同步行為。
- **Jarvis**：仍為編輯器內體驗；本變更僅改善 **joplin-llm-wiki** 附屬之 Health GUI 與設定載入，與 Jarvis 互不取代。
- **joplin-llm-wiki**：強化本機運維可觀測性與設定一致性，降低操作者誤判「服務已起但探測未過」之成本。

## MVP 對照

- 屬 **MVP 本機運維體驗修補**：不擴張 RAG／Lint／wiki-compile 之功能集合，仅收斂設定與 GUI 回饋。

## Success Criteria

- [ ] **SC-01**：給定設定檔目錄下之迷你 YAML，`chroma.persist_path` 以相對路徑撰寫時，載入後之絕對路徑等於「設定檔目錄＋該相對片段」之解析結果（自動化測試可驗證）。
- [ ] **SC-02**：Health GUI 在成功背景啟動 Chroma 後，於bounded 時間與間隔輪詢後，當本機 Chroma 已可接受 `check-health` 探測時，操作者可見之 Chroma 連線狀態與快照中 `chroma.reachable: true` 一致（手動或現有測試策略可驗證；若僅手動，需在 tasks 指明操作步驟與預期畫面）。
- [ ] **SC-03**：Ollama 背景啟動路徑具與 SC-02 對等之回饋（同為本機依賴），且不引入遠端連線。

變更類型：**Bug Fix**（含行為語意收斂；可能對相對 `chroma.persist_path` 解讀具 **BREAKING** 意味，需於實作／文件標註）。

## Capabilities

### New Capabilities

（none）

### Modified Capabilities

- `local-runtime-health-gui`：新增／延伸「背景啟動後自動輪詢 health 快照直至 reachable 或逾時」之需求；並與 `loadConfig` 解析後之 `chroma.persist_path` 對齊（與 `REQ-HGUI-DEP-SPAWN` 現有 argv 契約一致）。
- `note-indexing`：延伸 `chroma.persist_path` 之相對路徑解析規則，明定為相對於設定檔目錄，與索引持久化目錄之實際落點一致。

## Impact

- Affected specs：
  - Modified：`openspec/specs/local-runtime-health-gui/spec.md`（delta）
  - Modified：`openspec/specs/note-indexing/spec.md`（delta）
- Affected code：
  - Modified：`src/config/load-config.js`
  - Modified：`src/health-gui/renderer/app.js`
  - Modified：`test/config-schema.test.js`
  - （若需）Modified：`test/health-gui/` 底下與依賴啟動或快照相關之測試
- Affected systems：無新增第三方 SaaS；仍為 Node.js + JavaScript (ESM) + pnpm + 本機 Chroma／Ollama。
