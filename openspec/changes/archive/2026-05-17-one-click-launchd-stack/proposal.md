## Why

營運者若以 Joplin 為筆記真相來源、並以 `sqlite-sync` 搭配每 10 分鐘週期匯出與 `wiki-compile` 寫回，需在 macOS 上以**可復原、可守護行程**的方式啟動；目前 repo 僅有分散的 cron／launchd 文字提示，缺乏**可版控的一鍵安裝與 LaunchAgent 範本**，導致 PATH／WorkingDirectory 錯誤、或關閉終端機後行程消失。此變更補齊**以 launchd 為核心的背景常駐與啟動封裝**，與 Jarvis 編輯器內即時體驗互補：Jarvis 負責編輯中 RAG；joplin-brain 負責批次匯出、索引與寫回管線。

## What Changes

- 新增**可版控**之 macOS `launchd` **LaunchAgent 範本**（含 `WorkingDirectory`、`EnvironmentVariables` 建議用法），**除**長駐 `pnpm exec joplin-brain sqlite-sync` 外，**納入以 launchd 常駐本機 Ollama 服務行程**（例如 `ollama serve`，以 PATH 可解析之 `ollama` 為前提）與 **Chroma**（`pnpm exec chroma run …`，埠與 `data/chroma` 對齊 README／`config.yaml.example`），使「一鍵」指令安裝後登入即備妥推理解析與向量服務，再執行排程 `sqlite-sync`（週期仍依 `joplin_sqlite_sync.schedule.every_seconds`，對齊討論之 **600 秒**）。
- 新增**一鍵安裝／解除安裝**之 shell 腳本：可一次註冊／卸載 **Ollama + Chroma + sqlite-sync** 三支（或等價三份 plist）、`launchctl bootstrap`／`bootout`；並於 `sqlite-sync` 之 wrapper 內對 **Ollama／Chroma HTTP 就緒**做可設定之等待或逾時錯誤（不修改 Node 原始碼，僅 shell 層）。
- 新增／更新說明文件：**不再**將「手動先開 Ollama／Chroma」列為唯一路徑—改以**全堆疊一鍵**為預設敘事，並保留「僅 sqlite-sync」之進階手動／裁剪安裝的簡短附錄；另含 **Joplin CLI** 寫回 PATH、日誌與 Rollback（停止三支 job、撤銷 plist）。
- **Non-goals** 內容見下節；**不**變更既有 `sqlite-sync`／`wiki-compile` 核心行為（行為變更僅發生在 `scripts/launchd/` 之 shell／plist 層）。

## 全本機運作

- **資料路徑**：沿用既有 `notes_root`、`wiki_root`、`data/chroma`；**Joplin Desktop** 筆記庫之 **`database.sqlite`** 在常見 Linux／macOS 使用者設定佈局下，預設路徑為 **`~/.config/joplin-desktop/database.sqlite`**（營運者仍須在 `joplin_sqlite_sync.database_path` 填**絕對路徑**；自訂 Profile 位置者改填實際檔案）。launchd 僅觸發本機 CLI，不新增對外服務。
- **Ollama／Chroma**：維持 README 契約（本機埠、持久化路徑）；**預設一鍵**透過各自 LaunchAgent 常駐；文件仍**對照**精簡模式（營運者自行終端機啟動、只裝 sqlite-sync 範本）以利除錯。
- **網路邊界**：仍僅允許本機 Ollama／本機 Chroma client；plist 不注入雲端端點。
- **離線驗收**：在 Ollama 與 Chroma 可用、且 SQLite 檔可讀時，排程週期應寫入可讀的 stdout／stderr 日誌；無外網仍可驗證「行程存活與週期 JSON summary」。

## Goals

1. **G1**：營運者可依文件以**單一指令**完成 **Ollama、Chroma、sqlite-sync** 三支 LaunchAgent（或文件聲明之等價組合）之安裝並在登入後自動載入。
2. **G2**：launchd 啟動環境下，**`joplin` CLI**（寫回前提）在**不經互動式 shell** 時仍可被解析（透過 plist `EnvironmentVariables` 或 wrapper 腳本記錄於文件）。
3. **G3**：文件與腳本清楚描述 **Rollback** 與日誌位置（含三支服務），避免誤刪 Joplin 資料。
4. **G4**：`sqlite-sync` 之 wrapper 在依賴未就緒時**可觀測失敗**（逾時訊息寫入 StandardErrorPath），而非無限空轉。

## Non-Goals

- 不於此 change **內建** Linux **systemd** 同等封裝（可於文件以一句話指向前景手動做法）。
- **不**在 repo 內捆綁或自動下載 Ollama／Chroma 二進位檔；仍假設營運者已依官方方式安裝，一鍵流程僅**註冊 launchd 啟動命令**。
- 不修改 Joplin／Jarvis 外掛程式碼；不新增 joplin-brain HTTP API，不作雲端向量或雲端 LLM 預設路徑。

## Capabilities

### New Capabilities

- `macos-launchd-stack`：描述以 macOS launchd LaunchAgent 封裝 joplin-brain 背景執行之**部署契約**（plist 鍵、載入／卸載、`PATH`、日誌、與 `sqlite-sync` 長駐語意之關係），以及隨附腳本／範本之驗收情境。

### Modified Capabilities

- （none）

## Impact

- Affected specs: 新增 `macos-launchd-stack` 能力規格（英文 normative 檔）。
- Affected code:
  - New:
    - `docs/macos-launchd-stack.md`（使用者向操作說明；路徑相對專案根目錄）
    - `scripts/launchd/` 目錄下放安裝／卸載腳本、**Ollama／Chroma／sqlite-sync** 之 plist 範本與 wrapper（檔名於設計階段敲定）
  - Modified:
    - `README.md`：新增一小節鏈結至上述文件（若維護者同意於此變更內加入）
  - Removed:
    - （none）

## Risks（高層）

- **`launchctl` 語義版本差異**：bootstrap／bootout 指令在不同 macOS 版本可能不同；文件與腳本須註明最低版本或提供備援指令。
- **與 Joplin Desktop／CLI 並行**：大量寫回仍可能與使用者手動同步衝突；文件重申 README 既有警告（錯開時段／備份）。
- **多守護（Ollama + Chroma + sqlite-sync）**：登入時並行載入不保證先後；需 **wrapper 等待**/逾時與獨立日誌，避免誤判「服務壞掉」。

## MVP 對照

- 此變更屬 **Infrastructure／交付物** 封裝，不擴充 RAG／索引演算法；MVP 以**一鍵後**本機 **Ollama、Chroma、sqlite-sync** 皆可從 launchd 觀察到行程／日誌，且 `sqlite-sync` 週期輸出可寫入日誌為達標。

## Success Criteria

- [ ] 依新規格之 Scenario，營運者在乾淨使用者帳號下可完成**全堆疊**安裝並於日誌看到 Ollama／Chroma／`sqlite-sync` 之可觀測輸出（含至少一筆 `sqlite-sync` 週期 summary 或等價 JSON 行）。
- [ ] `launchctl` 卸載後，無殘留常駐 **ollama／chroma／joplin-brain sqlite-sync** 相關行程（以文件步驟驗證）。
- [ ] 文件明示：**必須**能呼叫 Joplin CLI 時之 PATH／`EnvironmentVariables` 設定方式；並說明依賴等待逾時時如何從日誌判讀。

## Assumptions

- 營運者使用 macOS，具備登入時執行 LaunchAgents 之權限。
- Node 20+、`pnpm`、專案已 `pnpm install`；Joplin CLI 已安裝且與 Desktop 共用 Profile（寫回情境）；`joplin_sqlite_sync.database_path` 指向與 Joplin Desktop 相同之 **`database.sqlite`**（典型預設 **`~/.config/joplin-desktop/database.sqlite`**）。
- 筆記量級與硬體符合既有 MVP 假設（<10k 等級量級）。

## Rollback

- 停止 LaunchAgent、自 `~/Library/LaunchAgents/` 移除對應 plist、確認行程結束；**不**需刪除 `data/chroma/` 或 Joplin Profile；若需重置索引，維持既有 README 所述刪除向量目錄之方式（與本變更正交）。

變更類型：**Infrastructure**（含使用者向腳本與規格）。
