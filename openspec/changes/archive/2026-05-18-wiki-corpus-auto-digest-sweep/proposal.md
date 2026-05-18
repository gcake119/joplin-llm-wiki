## Why

大型筆記庫在 corpus 模式下，單次 `wiki-compile` 的 planner digest 僅能納入最多 `corpus_digest_max_files` 條來源路徑；`corpus_digest_offset` 需人工換檔或改設定才能滑動視窗，導致難以 Batch 覆蓋整庫語境，與「自動建立/wiki 逐步完整」的操作預期不符。需在**維持本機資料不出機**前提下，提供可驗收的**自動進位 offset + 單次 CLI 可連續多視窗**（直到該輪掃掠完成或達上限）能力。

## What Changes

- 新增可選 **corpus digest sweep** 模式：`wiki-compile` 在同一進程內依設定**自動遞增**（環狀 modulo）`corpus_digest_offset`，並对每个視窗各跑一次現有編譯管線（planner → writer → 寫入／dry-run／寫回）。
- 提供 **checkpoint / state 檔**（獨立於使用者的 `config.yaml`）記錄下一個 offset、已完成視窗數與用於偵測筆記樹是否漂移的簡要指紋（例如總 Markdown 檔數與／或可選 discovery 版本欄位），避免只靠「回 offset 0」判斷時誤判。
- stderr／JSON summary 附 **sweep telemetry**（例如本 invocation 跑了幾個視窗、最終 offset、是否因達上限提前結束、state 路徑）。
- **Non-breaking**：預設關閉；未啟用時行為與現版完全一致。

## Goals

1. 使用者啟用 sweep 後，可在**單次 CLI 呼叫**內連續處理多個 digest 視窗，無須手動改 `corpus_digest_offset`。
2. 程式能判定「字典序 discovery 列表的一輪不重疊視窗是否已跑完」（或達 `max_windows_per_invocation` 安全上限），並將進度持久化到 state 檔以供下次續跑。
3. 文件與規格明確區分：**digest 視窗掃完 ≠ 保證每一則筆記都有對應 wiki 頁**（仍受 planner 與 `max_pages_per_run` 約束）。

## Non-Goals

- 不保證為每一則 Markdown 建立一對一 wiki 頁；不接「全庫頁面枚舉生成」為本 change 的完成條件。
- 不把 checkpoint 寫回並修改使用者編輯中的 `config.yaml`。
- 不引入遠端協調、雲端隊列、跨機 Distributed sweep。
- 不在此 change 將 Chroma／RAG 改為唯一 planner 輸入來源（仍以現有 corpus digest + 可選 chroma augment 為準）。

## 全本機運作

- 資料：`notes_root`、`wiki_root`、`chroma.persist_path` 皆為本機路徑；state 檔預設落在專案可寫目錄（例如 `wiki_root` 鄰近或設計書指定之資料目錄），不得預設上傳雲端。
- Ollama／Chroma：與現管線相同，僅本機 loopback 或可設定之本機服務。
- 網路邊界：啟用 `joplin_wiki_writeback` 時仍僅允許既有規格之 Joplin Data API loopback；sweep 不重開非本機 HTTP。
- 離線驗收：在 Ollama／索引資料可用、寫回關閉或 mock 的前提下，可對合成 `notes_root` 跑 dry-run sweep 斷言視窗數與 offset 演進。

## Risks（高層）

- Token／時間成本隨視窗數線性上升；需 `max_windows_per_invocation` 預設上限與文件警示。
- 筆記檔案增刪導致字典序列表變動，offset 語意可能漂移；需 state 指紋不匹配時的降級策略（例如重設 sweep 並記錄 telemetry）。
- 與 `filesystem_plus_chroma` writer bump 的互動需在設計書逐條說明，避免雙重位移造成誤解。

## MVP 對照

- MVP：CLI + YAML 啟用、sweep state 檔、單進程多視窗、`pnpm test` 可測的 SCN。
- 進階（可列為後續 change）：GUI 一鍵 sweep、依 notebook 分區而非全域字典序視窗。

## Success Criteria

- [ ] 關閉 sweep 時，`wiki-compile` 行為與現有測試相容（無迴歸）。
- [ ] 啟用 sweep、固定小型 fixture：`pnpm test` 中可驗證單次 invocation 執行 **N 個視窗**（N≥2）且 offset／state 符合設計。
- [ ] 達 `max_windows_per_invocation` 時優雅結束並在 telemetry 標示 **truncated**，下次 invocation 可續跑。
- [ ] 規格（wiki-ingest + wiki-corpus-llm delta）以英文 SHALL／Scenario 描述 sweep 與 state 契約。

## Assumptions

- Node.js 20+、pnpm；筆記量級與現專案假設一致（<10k 量級仍可負擔多次 planner 呼叫）。
- 使用者已理解 planner 產出頁數仍受 `max_pages_per_run` 限制。

## Rollback

- 關閉設定旗標或刪除 state 檔即可回到單視窗行為；不中斷 Joplin 資料。

## 與 Joplin／Jarvis／joplin-llm-wiki 關係

- **Joplin**：仍為筆記來源與可選寫回目標；sweep 不改同步語意。
- **Jarvis**：無整合；補足批次 wiki 管線覆蓋。
- **joplin-llm-wiki**：僅擴充 CLI／設定與規格；Jarvis 即時 Related Notes 仍互補。

## 變更類型

Feature

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `wiki-ingest`：新增 corpus digest sweep 相關設定鍵、單次 invocation 視窗上限、state 檔契約與 CLI 觸發方式；以及 sweep 模式下 stderr／machine-readable summary 的 telemetry 欄位。
- `wiki-corpus-llm`：規範 sweep 模式下 `corpus_digest_offset` 於連續視窗間的環狀進位步長、完成判定，以及與既有 digest／writer slice 規則的一致性。

## Impact

- Affected specs：openspec/specs/wiki-ingest/spec.md（delta）、openspec/specs/wiki-corpus-llm/spec.md（delta）
- Affected code：
  - Modified：src/wiki/wiki-compiler.js（或等同 orchestration 入口）、src/config/load-config.js、bin/joplin-llm-wiki.js（若新增旗標）、README.md、test 底下 wiki-compile／設定相關測試
  - New：src/wiki/corpus-sweep-state.js（或設計書核定之模組路徑）
  - Removed：（無）

