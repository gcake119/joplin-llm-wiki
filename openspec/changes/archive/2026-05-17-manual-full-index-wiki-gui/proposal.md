## Why

初次安裝或資料目錄就緒後，操作者通常需要一次性將 `notes_root` 全庫嵌入向量並產出 `wiki_root` 下的 LLM Wiki；目前僅能透過終端機分別執行套件子命令。Health GUI 已承擔本機依賴檢查與設定編輯，若缺少對應的一鍵／確認式管線入口，會提高上手門檻並與「圖形化健康檢查」角色不一致。

## What Changes

- 於 Health GUI 新增操作者可見控制項（例如按鈕），在明確確認對話後，於 Electron **main** 行程以固定、可審計之方式啟動與 CLI 相同語意的 **`index` 再接 `wiki-compile`**（共用同一 `--config` 路徑），並將每階段結束狀態與有界日誌尾端呈現給操作者。
- 以 IPC 暴露上述行為；**renderer 不得接受任意 shell 字串或任意工作目錄**，與既有 `run-stack-script`／`start-local-dependency` 之安全模型對齊。
- 自動化測試覆蓋 main 層級 argv／working directory 契約與「未確認則不 spawn」行為。

## Goals

- **G1（可發現性）**：操作者自 GUI 即可在首次或資料就緒後手動觸發「全庫索引＋wiki 編譯」管線，無需查文件拼終端機指令。
- **G2（語意一致）**：觸發之管線與 `pnpm exec joplin-llm-wiki index` / `wiki-compile` 使用相同設定檔解析與 repo 根工作目錄契約，避免 GUI 與 CLI 各說各話。
- **G3（安全邊界）**：僅 main 可 spawn；需確認旗標；防止重入或並行第二套同類管線造成資源互損（具體單飛策略見 design）。
- **G4（可驗收）**：行為具單元測試；規格含 SHALL／Scenario，可供 `/spectra:apply` 逐項核對。

## Non-Goals

- 不取代 `sqlite-sync`、不於此變更內建 Joplin SQLite 匯出；若筆記尚未於 `notes_root`，操作者仍須先完成匯出或複製流程。
- 不實作即時進度條或剖析各命令 stdout 的結構化百分比（僅要求有界文字 tail 與離散階段結果）。
- 不新增遠端 HTTP API、不在區網暴露新監聽。
- 不變更 `index`／`wiki-compile` 核心演算法或預設 chunk 參數（除非另開 change）。
- 不強制自動排程或「安裝精靈」多步驟精靈 UI。

## 全本機運作

- **資料路徑**：僅讀寫設定檔所解析之 `notes_root`、`wiki_root`、`chroma.persist_path` 等本機路徑；不新增雲端儲存。
- **Ollama／Chroma**：管線執行期間仍只對設定之 `ollama.base_url` 與本機 Chroma HTTP 探測位址互動，與現行 MVP 邊界相同。
- **網路邊界**：GUI 不新增對外 listener；spawn 之子程序網路行為等同 CLI 子命令。
- **離線驗收**：在模型已拉取、Chroma／Ollama 本機可預期啟動之前提下，可離線驗證按鈕、確認 gate 與 exit code 顯示（不要求雲端服務）。

## Capabilities

### New Capabilities

（無；行為以 Health GUI 規格增補為主。）

### Modified Capabilities

- `local-runtime-health-gui`：新增「確認後觸發完整 index→wiki-compile 管線」之需求與場景，含 IPC 契約、spawn 邊界與可觀察輸出。

## Impact

- Affected specs：`local-runtime-health-gui`（delta）。
- Affected code：
  - Modified：`src/health-gui/main.js`、`src/health-gui/preload.cjs`、`src/health-gui/renderer/app.js`、`src/health-gui/renderer/index.html`
  - New：main 行程可重用之管線執行模組（路徑與檔名由 design 決定，例如置於 `src/health-gui/` 下之子目錄）
  - Modified：`package.json` 若需暴露測試或用於文件之腳本鍵（僅在有實際需求時）
- Affected tests：新增或擴充 `test/health-gui/` 底下針對 IPC／spawn argv 之測試。

## Risks（高層）

- 長時程嵌入與 wiki-compile 可能佔用 CPU／記憶體；需避免操作者誤觸重複啟動。
- `wiki-compile` 可能觸發 Joplin CLI 寫回（當 `joplin_wiki_writeback` 啟用且非 dry-run）；確認文案必須提示與 `wiki-compile` 說明一致之破壞性／覆寫風險。
- Ollama 或 Chroma 未就緒時，管線仍可能失敗；失敗須以非崩潰方式呈現最後狀態與日誌尾端。

## MVP 對照

| 面向 | MVP 範圍內 |
|------|------------|
| GUI 手動觸發 | 是 |
| 與 CLI 同設定檔 | 是 |
| main-only spawn | 是 |
| 結構化百分比進度 | 否（Non-goal） |
| sqlite 自動匯出 | 否 |

## Success Criteria

- [ ] SCN-HGUI-CORPUS-01：未確認時 main 拒絕 spawn（單元測試斷言）。
- [ ] SCN-HGUI-CORPUS-02：確認後 argv 依序為套件子命令 `index` 與 `wiki-compile`，且兩者皆帶相同 `--config <absConfigPath>`，工作目錄為偵測之 repo root（單元測試／mock spawn）。
- [ ] SCN-HGUI-CORPUS-03：renderer 僅能透過固定 IPC 觸發，若傳入無效 payload 則不啟動子程序（單元測試）。
- [ ] SCN-HGUI-CORPUS-04：第二階段僅在第一階段以 exit code 0 成功結束後執行；若第一階段非零退出則不開始 wiki-compile，並呈現第一階段 tail／exit code（單元測試或整合測試）。
- [ ] SCN-HGUI-CORPUS-05：操作者於 GUI 可讀取兩階段各自的 exit code 與有界 stderr／stdout tail（手動或快照測試由 tasks 指定）。

## 與 Joplin／Jarvis／joplin-llm-wiki 之關係

- **Joplin**：仍為筆記權威來源與同步；本變更不修改任何 Joplin Desktop 二進位。
- **Jarvis**：仍負責編輯器內即時語境；本變更重於批次索引與 wiki-compile，互補而非取代。
- **joplin-llm-wiki**：GUI 僅編排既有子命令；實際索引、schema 驗證、可選寫回行為仍由現有 CLI 模組實作。

## Assumptions

- 操作者已安裝 Node 20+、pnpm，且透過 Health GUI 啟動時之 repo root 與現有 `runStackScript`／依賴啟動所用偵測一致。
- `notes_root` 已有可索引之 Markdown（或接受首跑失敗並從日誌判讀）。
- Ollama／Chroma 是否已啟動由子命令自身失敗語意處理；GUI 不於此變更保證「必定成功」。

## Rollback

- 還原相關提交並移除 GUI 控制項即可；中止執行中子程序由操作者於 OS 層處理；刪除或重建 `chroma.persist_path`／`wiki_root` 不影響 Joplin 官方 SQLite 本體。

變更類型：**Feature**
