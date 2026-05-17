## Why

目前 `wiki-compile` 只將 LLM 產物寫入 `wiki_root`，與 Joplin Desktop 權威儲存（SQLite）之間沒有內建閉環；使用者若希望「編譯後的 wiki 頁」回寫成可從 Joplin 客戶端閱讀的筆記，只能手動複製或另寫腳本。另一方面，範例設定仍以絕對路徑占位 `wiki_root`，與 `notes_root` 已採 `./notes_root` 的倉庫慣例不一致，導致新手上手與版控邊界說明不對齊。

## What Changes

- 新增**可選、預設開啟**的內建階段：在 **`wiki-compile` 成功完成後**（同一 Node 行程內），當設定啟用時，將本輪已編譯的 wiki 頁**透過 Joplin 終端機 CLI（`joplin`）子行程**寫入**獨立於原件匯出樹狀結構的 Joplin 筆記本階層**：預設建立／使用**頂層筆記本** `note-wiki`，並依 wiki frontmatter 的**主題鍵**（預設 `domain`）在其下建立**子筆記本**以區分領域知識庫；各頁以 **note 標題 upsert**（預設取自 frontmatter `title`，否則檔名）建立或更新正文（不直接對 `database.sqlite` 做 `UPDATE`）；argv 建構、逾時與重試見 design／spec。
- **讀取／批次匯出**：維持既有 `joplin_sqlite_sync` 以 **better-sqlite3 唯讀**讀取 SQLite 匯出至 `notes_root`；**本 change 不以 Joplin CLI 取代該匯出路徑**（理由：大批量匯出若以 CLI 逐筆呼叫，子行程與序列化成本過高；若以 CLI 取代須另開 change 並定義效能與行為對齊策略）。
- 對齊倉庫慣例：`config.yaml.example` 將 `wiki_root` 預設為 **`./wiki_root`**（與 `./notes_root` 並列），並在文件中重申 **`wiki_root/` 已列於 `.gitignore`**，預設不進版控。（若 `.gitignore` 已含 `wiki_root/`，則僅補強範例與說明，不重複建立規則。）
- 延伸設定：`joplin_wiki_writeback` 與既有 `joplin_cli` 區塊**聯動**（啟用寫回時須啟用並可通過 CLI 預檢）；另含 dry-run 行為、子行程逾時／重試與錯誤碼；失敗時退出碼與 stderr JSON 單行格式與既有 `JOPLIN_CLI_FAILED` 家族對齊或可區分之新碼（見 spec）。

## Non-Goals

- **不實作**遠端 Joplin Server／Cloud API 同步；寫回僅限**本機透過 Joplin CLI** 觸及 Joplin 資料。
- **不批量刪除** Joplin 端筆記；不因 wiki 刪除而刪除 Joplin 列（若檔案自 `wiki_root` 消失，Joplin 側**留殘**由操作者手動處理，除非另開 change 定義墓碑語意）。
- **不解密** E2EE 無法讀取的內容；無金鑰情境下應跳過並記錄原因。
- **不取代** `joplin_sqlite_sync` 的唯讀匯出；寫回與匯出在資料流上須有明確邊界（避免同一執行個體內競態），細節由 design 規定。
- **不引入**雲端 LLM、遠端向量庫或需帳號的第三方 SaaS。

## Goals

1. 操作者在**本機**執行 `wiki-compile` 時，**預設**將編譯後的 wiki 頁寫入 Joplin 的 **`note-wiki` 筆記本樹**（可配置名稱），並依 **`domain`（可配置鍵）分子筆記本**，使不同領域知識庫在客戶端可視化分區；不需手動複製 Markdown 到 Joplin。
2. 新克隆專案者複製 `config.yaml.example` 後，可得到與 `notes_root` 一致的**相對** `wiki_root` 預設，並理解其**不進版控**；範例設定須與**預設開啟寫回**及 **`joplin_cli` 聯動**說明一致，避免誤解為「零設定即可在所有環境通過 load-config」。
3. 寫回失敗不應悄然成功；須有可驗收的錯誤碼與摘要輸出。

## 系統預備條件（操作者環境）

- **Joplin Desktop**：應安裝並登入／同步與本機 **Profile** 一致；用於**閱讀與管理完整筆記庫**（含行動版與桌面檢索體驗），並與 `joplin_sqlite_sync` 所讀取之 `database.sqlite` 屬同一資料情境說明於 README。
- **Joplin 終端機 CLI**：應另外安裝並可在 PATH 或 `joplin_cli.command` 路徑執行；專責 **`wiki-compile` 寫回階段**：在 **`note-wiki` 筆記本樹**內 upsert 編譯後的 LLM Wiki，形成可與 Desktop 並用之「編譯知識庫」分區。

## 全本機運作

- **資料路徑**：`wiki_root`、`notes_root`、Chroma 持久化目錄皆在本機；Joplin Profile／`database.sqlite` 由 Joplin 與 `sqlite-sync` 唯讀匯出使用；**寫回**經 Joplin CLI，不強制在應用程式內開啟 RW SQLite。
- **Ollama**：寫回階段**不應**額外要求雲端服務；若寫回與 `wiki-compile` 同一命令鏈，僅沿用既有對 `ollama.base_url` 的本機呼叫模式（寫回本體不中繼 Ollama）。
- **Chroma**：寫回不改變向量庫邊界；索引更新仍依既有 `index`／`watch` 行為。
- **網路邊界**：除既有 `ollama.base_url` 外，寫回不應新增對外 HTTP 依賴。
- **離線驗收**：在 Joplin CLI 可用且 wiki-compile 前題滿足下，寫回流程應可在無外網環境完成。

## Capabilities

### New Capabilities

- `joplin-wiki-writeback`：定義 wiki 完成後透過 **Joplin CLI** 的可選寫回（**父筆記本／主題子筆記本／note 標題 upsert**、子行程／逾時／重試、dry-run、錯誤碼與安全邊界）。

### Modified Capabilities

- `wiki-ingest`：在 normative 層面補上「`wiki-compile` 成功結束後可選擇觸發寫回階段」的編排契約（條件、失敗閘道、與 `--dry-run` 的關係）。
- `compiled-wiki`：補上架構／範例層要求：`wiki_root` 預設路徑慣例與版控排除說明與 `notes_root` 對齊（不要求改變 `wiki_root` 與 `notes_root` 目錄必須互斥的既有分離語意）。

## Impact

- Affected specs: 新增 `joplin-wiki-writeback`；修改 `wiki-ingest`、`compiled-wiki`。
- Affected code:
  - New: `src/joplin/` 底下與 **CLI 寫回**相關之模組檔案（design 命名）、延伸 `src/joplin/cli-runner.js` 或等價 spawn 封裝。
  - Modified: `src/config/load-config.js`、`src/commands/cmd-wiki-compile.js`、`config.yaml.example`、`README.md`、相關測試於 `test/` 目錄。
  - Removed: （無）

## Risks

- **CLI／Desktop 互動**：Joplin Desktop 與 CLI 並行寫入仍可能造成競態；需逾時、重試與文件化「建議關閉 Desktop 或僅離峰執行」。
- **內容覆寫**：同一 **（主題筆記本, note 標題）** 下 upsert 會覆蓋該 note 的 body；若操作者在 Joplin 客戶端編輯了對應標題之 note，下次編譯可能被覆寫——須 **預設開啟下仍於 README 明載警語**、支援 `enabled: false` rollback、並鼓勵 `--dry-run` 預覽。
- **E2EE 與不可讀筆記**：寫入前須偵測並跳過不可表示為明文的列。

## 與 Joplin / Jarvis / joplin-brain 的關係

- **Joplin Desktop**：仍為筆記權威 UI 與同步客戶端，供**完整筆記庫**閱讀與日常編輯；**終端機 CLI** 則供管線批次寫入 **`note-wiki` LLM Wiki 樹**；兩者須對齊同一 Profile。本變更是在 joplin-brain 內透過 CLI 寫入，不接 Joplin REST／外掛 API。
- **Jarvis**：維持編輯器內即時體驗，與本批次寫回無整合需求。
- **joplin-brain**：在既有「Sources → Compiled Wiki」之上補上**可選、預設開啟之闭合**，讓 wiki 產物落到 **`note-wiki` 樹**供行動版／官方客戶端閱讀；**不**以此路徑取代 `notes_root` 之元件層匯出語意；不改變 RAG 檢索語意邊界。

## Assumptions

- 操作者已安裝 **Joplin Desktop**（或等價官方客戶端），用以**讀取／瀏覽完整筆記本與同步內容**；與 `sqlite-sync`、`joplin_cli` 共用同一句：**Profile／資料目錄須一致**，否則匯出與寫回目標會錯位。
- 操作者已另安裝 **Joplin 終端機 CLI**，並可在 PATH（或 `joplin_cli.command` 指向之路徑）執行；`joplin_cli` 設定可通過預檢，且寫回用 CLI 與 Desktop 寫入同一 Profile，以便在 **`note-wiki`** 下建立 LLM 編譯知識庫並於客戶端可見。
- Node.js 20+、pnpm；寫回不依賴應用程式直接開啟 RW SQLite。`sqlite-sync` 匯出仍依現況使用 `better-sqlite3` 唯讀。
- 筆記量級在單次批次可接受範圍內；超時與部分成功策略由 spec 定義。

## Rollback

- 關閉設定旗標後，`wiki-compile` 行為與現版一致。
- 建議操作者在首次啟用前備份 Joplin Profile／`database.sqlite`；rollback 不包含自動還原，僅停止寫入行為。

## MVP 對照

- **現況**：wiki 僅在 `wiki_root`；Joplin DB 僅經 `sqlite-sync` 唯讀匯出至 `notes_root`（若啟用）。
- **目標**：編譯後經 **Joplin CLI** 將各頁 **upsert** 至 **`note-wiki`／`<domain>`** 筆記本樹；範例設定中 `wiki_root` 與 `notes_root` 採**同一種相對目錄慣例**；**不需要**再維護 `source_refs` → 32 字元 note id 之窄映射。

## Success Criteria

- [ ] 設定關閉時，`wiki-compile` 完全不發起寫回用 Joplin CLI 子行程，行為與現版一致。
- [ ] 設定啟用（含預設）且 `joplin_cli` 有效時，同一命令在 wiki 成功後可驗證 **`note-wiki` 樹下對應主題與標題之 note** body 已建立或更新（測試以 mock CLI、整合測內嵌 stub，或文件化手動驗證步驟）。
- [ ] `--dry-run` 下不執行會變更 Joplin 資料的 CLI 呼叫，但可輸出候選寫回摘要。
- [ ] `config.yaml.example` 出現 `./wiki_root` 預設且註解說明 gitignore；README 與既有 `notes_root` 說明並列。
- [ ] `README.md` 依 **REQ-JWKB-README-PREREQUISITES** 說明 **Joplin Desktop**（完整筆記庫）與 **Joplin CLI**（`note-wiki` 寫回）分工及 **Profile 對齊**。
- [ ] 相關退出碼與 stderr JSON 單行錯誤格式與既有 CLI 一致。

## 變更類型

Feature
