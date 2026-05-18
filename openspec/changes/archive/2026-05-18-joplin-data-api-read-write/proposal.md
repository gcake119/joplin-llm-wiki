## Why

現行 `wiki-compile` 寫回仰賴 **Joplin 終端機 CLI** 子程序（`use`／`ls`／`mkbook`／`mknote`／`set`），在部分環境會遭遇 **JSON 欄位差異、錨點筆記本不一致、模型誤傳 ID** 等問題時更難診斷；操作者也須額外安裝並維護 CLI 與 Desktop **同一 Profile**。**Joplin Data API**（官方 REST，預設本機）提供更穩定的資源模型與錯誤回應，適合作為寫回與輕量讀取的唯一整合面，降低對 CLI 剖析器的依賴。

## What Changes

- 以 **Joplin Data API（HTTP）** 取代寫回流程中所有 **透過 `joplin_cli` spawn** 的讀寫（列出／建立資料夾、列舉／建立／更新 note）；語意維持：**父筆記本標題**（預設 `note-wiki`）、**主題子資料夾**（預設 frontmatter `domain`，缺漏為 `_uncategorized`）、**依 note 標題 upsert 正文**。
- 新增設定區塊（名稱於 design 敲定，例如 `joplin_data_api`）：至少包含 **base URL**（預設 `http://127.0.0.1:41184` 或官方預設埠）、**API token**（由 Joplin「網頁剪輯器／Clipper」選項提供）、**逾時**；與 `joplin_wiki_writeback` 啟用旗標聯動。
- **load-config**：當寫回啟用時，改為要求 **Data API 設定完整可用**（而非強制 `joplin_cli.enabled` + `command`）。**BREAKING**：現有僅配置 CLI、未啟用 API 的組態需在 migration 說明中補齊 token／URL。
- **預檢**：`wiki-compile` 寫回前與 `index` 等沿用之 Joplin 預檢，改為對 Data API 執行可驗證之連線檢查（例如輕量 endpoint），不再依賴 `joplin_cli.preflight_argv` 執行 CLI `--version`。
- **錯誤碼**：保留使用者可辨識之單行 stderr JSON 契約；將 `JOPLIN_CLI_*` 映射或細分為 **`JOPLIN_DATA_API_*`**（於 spec／design 定義對照表），文件與測試同步更新。
- **測試**：以 **mock `fetch`**（或注入 HTTP client）取代 CLI argv 假貨腳本為主體；保留少量整合測試文件化「真機 Desktop 開啟 API」之手動步驟（若有）。

## Non-Goals

- **不以 Data API 取代** `joplin_sqlite_sync` 之大宗唯讀 Markdown 匯出（仍維持 better-sqlite3／檔案樹為索引與 RAG 之主要來源）；若未來要以 API 全量匯出須另開 change 並處理效能與分頁。
- **不實作**遠端 Joplin Server／Cloud 托管部署為預設目標；規範僅允許 **本機／回環** API 端點（細節見 spec）。
- **不批量刪除** Joplin 端筆記；不因 wiki 檔案消失而自動刪除 Joplin 列。
- **不引入**雲端 LLM、遠端向量庫或第三方 SaaS；除既有 `ollama.base_url` 與**明示允許之 Joplin Data API base URL** 外，不新增對外 HTTP 依賴。

## Goals

1. 操作者在 **Joplin Desktop 已啟用 Data API 並取得 token** 的前提下，`wiki-compile` 寫回階段**不需安裝 Joplin 終端機 CLI** 即可完成與現版等價之 upsert 樹狀行為。
2. 規格層明確允許 **對回環位址之 Joplin Data API HTTP**，並仍維持「資料不出機、無任意對外 SaaS」之威脅模型。
3. 失敗路徑維持可驗收：**退出碼**、**stderr 單行 JSON**、可指引設定錯誤（token、埠、父筆記本不存在等）。

## 全本機運作

- **資料路徑**：`wiki_root`、`notes_root`、Chroma 仍僅在本機；API 僅作為 **Desktop 同一 Profile** 的程式化入口，不將筆記內容送往遠端。
- **Ollama**：行為不變；編譯與嵌入仍僅呼叫設定之 `ollama.base_url`。
- **Chroma**：寫回不改變向量庫邊界。
- **網路邊界**：允許 **HTTP 至設定之 Joplin Data API host**（須限制為本機／127.0.0.1／::1 或 unix socket 等價策略，由 spec normative 定義）；**禁止**將 token 或 note body 送往其他主機。
- **離線驗收**：在 Ollama 與 Joplin Desktop（API 啟用）可用、無外網情境下，寫回流程應可完成；若 Desktop 未開 API，預檢應失敗並給出可操作訊息。

## Capabilities

### New Capabilities

- `joplin-data-api`：Joplin Data API **設定與安全邊界**（base URL 允許範圍、token 載入、逾時、請求語意）、**共用錯誤分類**，供寫回及其他未來功能重用。

### Modified Capabilities

- `joplin-wiki-writeback`：將「透過終端機 CLI 子程序」改為「透過 **Joplin Data API**」完成等價之資料夾確保與 note upsert；修訂 **REQ-JWKB-LOCAL-FIRST**／網路相關需求以允許回環 API，並排除任意對外連線。

## Impact

- Affected specs: 新增 `joplin-data-api`；修改 `joplin-wiki-writeback`。
- Affected code:
  - New: `src/joplin/` 底下 Data API 客戶端模組（檔名由 design 定義）、必要之型別／錯誤封裝。
  - Modified: `src/joplin/wiki-writeback.js`、`src/joplin/cli-runner.js`（缩减為移除或僅保留過渡）、`src/config/load-config.js`、`src/commands/cmd-index.js`、`src/commands/cmd-wiki-compile.js`（若有間接）、`config.yaml.example`、`README.md`、`test/joplin-wiki-writeback.test.js` 與相關測試。
  - Removed: 無強制刪檔；CLI runner 可標記 deprecated 至移除為止（由 tasks 列明）。

## Risks

- **Desktop 與 API 並發寫入**：與現行 CLI 相同，仍可能有競態；须於文件重申離峰／備份建議。
- **Token 外洩**：token 等同本機密鑰；须規範設定檔權限與日志不得打印完整 token。
- **API 版本差異**：不同 Joplin 版之欄位或行為差異；須以最小支援版本與測試矩陣記載。

## 與 Joplin / Jarvis / joplin-llm-wiki 的關係

- **Joplin Desktop**：仍為權威 UI 與同步；Data API 為官方支援之本機整合介面，**取代終端機 CLI 作為 joplin-llm-wiki 寫回適配層**，不改變使用者於客户端之閱讀方式。
- **Jarvis**：無整合變更。
- **joplin-llm-wiki**：在既有 `wiki-compile` 閉環上以 **較穩定之 HTTP 契約** 落地；**不取代** `notes_root` 匯出與 Chroma 索引主路徑。

## Assumptions

- 操作者使用 **Joplin Desktop** 並可在設定中 **開啟 Clipper／Data API**、複製 **token**；API 監聽於本機（預設埠或自訂）。
- Node.js 20+、pnpm；筆記量級在單次批次可接受範圍內（與現行類似）。
- `sqlite-sync` 匯出路線維持現狀，不需為此 change 同步升級。

## Rollback

- 設定關閉 `joplin_wiki_writeback.enabled` 後，不写回 Joplin（與現版一致）。
- 若保留過渡期雙適配（design 可選），可切回 CLI 路徑直至移除；正式稿以 spec 為準。

## MVP 對照

- **現況**：写回靠 CLI；預檢靠 CLI argv；spec 禁止寫回階段對外 HTTP。
- **目標**：写回與預檢改走 **本機 Data API**；spec 允許**限縮之**回環 HTTP；CLI 不再是必要條件。

## Success Criteria

- [ ] 写回啟用時，load-config **不要求** `joplin_cli.command`，改要求 Data API **base URL + token**（完整鍵名以 design 為準）。
- [ ] 單元／整合測試覆蓋：**父筆記本不存在時建立或失敗語意**、**主題資料夾確保**、**note 標題 upsert（新建與更新）**；不依賴真 `joplin` 可執行檔。
- [ ] `--dry-run` 仍不對 Joplin 執行會變更資料的 API 突變（僅允許唯讀預檢若需要，由 spec 定義）。
- [ ] README 與 `config.yaml.example` 載明：**啟用 Desktop Data API**、token 取得步驟、**不再要求安裝 CLI**（若過渡期支援 CLI，须標記 deprecations）。
- [ ] stderr JSON `error` 鍵與 exit code 對照表於 spec 或 README 可查到。

## 變更類型

Feature（含既有 CLI 整合之替換，對組態具 **BREAKING** 意味；於 migration／README 明示）
