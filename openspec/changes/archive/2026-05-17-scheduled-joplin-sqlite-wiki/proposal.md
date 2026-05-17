## Why

使用者希望 joplin-brain 不必完全依賴「Joplin 已寫入 Profile 的 .md 快取」作為唯一輸入；改為**依排程從 Joplin Desktop 本機 `database.sqlite` 匯出完整筆記樹**到指定目錄後，再接上既有的向量索引與 LLM wiki 產製管線。如此可在桌面版未開啟、或僅有資料庫檔可讀的情境下，仍能批次重建知識庫與 wiki。

## What Changes

- 新增**可設定的排程／定時觸發**（例如固定間隔或外部 cron 呼叫單次子命令），於每次執行時：
  1. 以唯讀方式開啟 Joplin Desktop 的 SQLite（可設定路徑）
  2. 將全部可匯出筆記**轉成 Markdown 檔**寫入設定的 `notes_root`（或中繼匯出目錄後再與 `notes_root` 對齊）
  3. 匯出成功後，**依序呼叫既有流程**：來源索引（Chroma + Ollama embedding）與 `wiki-compile`（Ollama chat）等，行為與現有 CLI 一致，不新增雲端依賴
- 新增對應 **config.yaml** 區塊：sqlite 檔路徑、匯出選項、排程參數、與下游 `index`／`wiki-compile` 的啟用旗標與失敗策略（例如匯出失敗則不觸發 wiki）
- 明確定義**並行安全**：Joplin 正在寫入資料庫時的讀取策略（WAL 唯讀、重試、或文件化限制）
- **倉庫慣例**：預設將筆記目錄設為倉庫根目錄下之 `./notes_root`（見 `config.yaml.example`），並以 `.gitignore` 排除 `notes_root/`，使匯出／索引用之 Markdown **不納入版控**；克隆後若無目錄則由使用者或工具建立。

## Goals

1. **可預測的批次更新**：使用者能設定一段間隔或定時 job，自動從 SQLite 產出與資料庫一致的 Markdown 鏡像。
2. **管線銜接**：匯出完成後，無需手動再下指令即可銜接索引與 LLM wiki（於同一進程或文件化的一組子命令順序中）。
3. **維持全本機邊界**：不落盤遠端向量、不新增對外 HTTP API；LLM 僅透過既有 `ollama.base_url`。

## Non-Goals

- 不實作遠端 Joplin Server／Cloud API 拉取；僅限本機 SQLite 檔。
- 不取代 Joplin 編輯器、Jarvis 外掛的即時體驗；本變更是**批次／排程**互補。
- 不預設自動覆寫使用者於 Profile 內手動維護的 `.md`（若匯出目錄與 Profile 快取重疊，須在設計中明示風險並預設使用獨立匯出目錄）。
- 不處理 E2EE 下無法解密的內容（維持跳過並於日誌／報告記錄的策略，細節於 spec 與設計中具體化）。
- 不以雲端 LLM／託管向量庫作為備援。

## 全本機運作

- **資料路徑**：SQLite 與匯出目錄、`notes_root`、`wiki_root`、`chroma.persist_path` 皆在本機檔案系統；設定檔為倉庫內 `config.yaml`（或使用者指定路徑）。
- **Ollama**：匯出後的嵌入與 wiki 編譯仍只對 `ollama.base_url`（預設 127.0.0.1）送出 HTTP。
- **Chroma**：仍使用專案內持久化路徑；無遠端 Chroma。
- **網路邊界**：除 Ollama 外，此能力不引入其他對外連線需求。
- **離線驗收**：在 SQLite 可唯讀複本可用、Ollama 已啟動且模型已下載的前提下，完整流程可不依賴外網（Joplin Cloud 同步非本變更依賴）。

## Assumptions

- 使用者可提供 Joplin Desktop `database.sqlite` 的**穩定絕對路徑**（或從 Joplin 說明文件約定之 Profile 路徑組合）。
- Node.js 20+、pnpm 環境與現有 joplin-brain 相依套件政策允許加入**唯讀 SQLite** 存取用的經審核原生／純 JS 方案（詳見 design）。
- 單機、單使用者；筆記量級與匯出時間在可接受範圍內（例如萬級筆記需文件化預期與超時）。
- Ollama 指定 embed／chat 模型已於本機拉取完成。

## Rollback

- 關閉排程或停用設定區塊後，行為回到「僅讀現有 `notes_root`」的既有模式。
- 可刪除匯出目錄並重建，不影響 Joplin 主資料庫（前提：匯出目錄未與 Profile 內使用者資料重疊配置）。
- 向量索引可照既有方式刪除 `data/chroma/` 目錄後重建。

## 與 Joplin / Jarvis / joplin-brain 的關係

- **Joplin Desktop**：仍為筆記權威儲存；本變更僅**讀取**其 SQLite 以產生批次 Markdown，不修改 Joplin 程式。
- **Jarvis**：維持編輯器內即時 RAG／Chat；本變更不做外掛整合。
- **joplin-brain**：負責排程匯出後的**索引、wiki 產製、Lint 報告**等 CLI 管線；匯出層是新增的上游步驟。

## Risks

- **資料庫鎖定／損毀風險**：若 Joplin 正在寫入，唯讀連線可能失敗或讀到部分狀態；需重試與明確錯誤碼。
- **匯出與 Profile .md 快取不一致**：若使用者混淆兩種來源，可能以為索引內容即時反映編輯器；需文件與設定預設避免誤配。
- **附件與資源路徑**：從 SQLite 匯出時，檔案／圖片相對路徑若與現有 `source_link_check` 假設不符，可能出現大量孤立連結告警（需界定為預期或可設定行為）。

## MVP 對照

- 現有 MVP：**notes_root** 直接餵給索引與 wiki。  
- 本變更 MVP：**notes_root（或匯出目錄）由 SQLite 批次填充**後再餵給**同一套**索引與 wiki；不擴展到雲端或多使用者。

## Success Criteria

- [ ] 在設定啟用時，單次執行可於日誌確認：**SQLite 匯出筆記數**與**寫入檔案數**一致（容錯規則於 spec 定義）。
- [ ] 匯出成功後，**索引與 wiki-compile** 可在同一設定下一鍵／單命令鏈式完成，且退出碼與現有 CLI 慣例相容。
- [ ] 當 SQLite 路徑不存在或無法開啟時，**不中斷**使用者既有「純讀目錄」流程：僅當同步功能啟用且不滿足前置條件時回報錯誤並中止該次同步（行為於 spec 具體化）。
- [ ] 離線環境下（除本機 Ollama），匯出＋索引＋wiki 可在無外網下完成。

## 變更類型

Feature

## Capabilities

### New Capabilities

- `joplin-sqlite-sync`：Joplin Desktop SQLite 唯讀匯出、排程觸發、與下游索引／LLM wiki 管線銜接之設定與行為契約；並將「倉庫根 `notes_root` + gitignore」之佈局契約一併納入規格（見該 spec 之 REQ-JSQ-REPO-NOTES-LAYOUT）。

### Modified Capabilities

（無）既有索引與 wiki 仍以 Markdown 檔為輸入；不要求修改現有 note-indexing／wiki-ingest 的規範性條文，除非後續分析發現衝突再以 follow-up change 追加 delta。

## Impact

- Affected specs: `joplin-sqlite-sync`（新建）
- Affected code:
  - New:
    - openspec/changes/scheduled-joplin-sqlite-wiki/specs/joplin-sqlite-sync/spec.md
    - openspec/changes/scheduled-joplin-sqlite-wiki/design.md
    - openspec/changes/scheduled-joplin-sqlite-wiki/tasks.md
    - src/joplin/sqlite-sync/（或專案慣用之單一模組路徑，詳 design）
    - src/commands/cmd-sqlite-sync.js（子命令名稱以 design 為準）
  - Modified:
    - src/cli.js
    - src/config/load-config.js
    - .gitignore（加入 `notes_root/`，與既有 `data/`、`wiki_root/` 等並列）
    - config.yaml.example（預設 `notes_root: ./notes_root` 及倉庫相對路徑說明）
  - Removed:
    - （無）

