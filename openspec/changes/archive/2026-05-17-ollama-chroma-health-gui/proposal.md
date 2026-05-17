## 變更類型

Feature

## Why

操作者在設定 joplin-brain 管線時，常需反覆確認本機 **Ollama** 是否已安裝／daemon 是否啟動、HTTP 端點是否可達、必要模型是否已 pull，以及 **Chroma 本機伺服器**（搭配 `chroma.persist_path`）是否依 README／launchd 說明正常運作。現況須手動編輯 `config.yaml`、閱讀多份文件並自行執行 `scripts/launchd/` 安裝／解除腳本，步驟分散、易漏且不利 onboarding。

**（本次 ingest 補充）** 操作員希望 Health GUI 同時涵蓋：**視覺化／表單式調整主要 `config.yaml` 設定**（仍與 CLI 同源語意），以及對 **`scripts/launchd/install-joplin-brain-stack.sh`／`uninstall-joplin-brain-stack.sh` 等已交付腳本的一鍵呼叫**（含確認對話與輸出記錄），使「檢查—調整設定—安裝／解除本機 stack」可在單一視窗完成。

**（本次 ingest 補充 — 2026-05-17）** 當健康面板顯示 **Chroma 未連線**（`chroma.reachable: false`）或 **Ollama 未連線** 時，操作員希望在 GUI 內以**一鍵啟動**啟動與 `scripts/launchd/run-chroma.sh`／`run-ollama.sh` **同源語意**之本機常駐指令（仍為 **main 行程 allowlist spawn**，非 renderer shell），並在介面上以**與最近一次刷新結果一致**的語意標示兩者是否「已連線／執行中」（以 HTTP／heartbeat 探測結果為準，而非完整 OS 行程列表面貌）。

## What Changes

- 新增／擴充 **本機圖形化操作／診斷介面**（Health GUI）：維持既有 Ollama／Chroma 健康面板與指引。
- **設定編輯**：以表單或結構化欄位編輯與 `load-config.js` 對齊之鍵（至少包含 `notes_root`、`ollama.base_url`、`ollama.embed_model`、`ollama.chat_model`、`chroma.persist_path`；其餘進階鍵可折疊或 Phase 2）；**儲存前**須通過與 CLI 相同之載入／驗證語意（成功呼叫 `loadConfig` 於目標路徑或暫存檔）。
- **Stack 生命週期**：在主行程以 **允許清單** 之 `child_process.spawn` 呼叫 repo 內既有 **`scripts/launchd/install-joplin-brain-stack.sh`** 與 **`uninstall-joplin-brain-stack.sh`**（解析為專案根絕對路徑）；每次執行前須 **明示確認** modal；將 stdout／stderr 串流至 GUI 日誌區（或同等可閱讀輸出）。
- GUI **僅供單機操作員**：預設不對 `0.0.0.0` 綁定服務；若需本機 HTTP 載入資源，僅 `127.0.0.1`。
- **不在 renderer 執行任意 shell**：所有行程衍生僅能發生於 Electron main，且指令／腳本路徑須落在允許清單。
- **本機依賴一鍵啟動（新增）**：於健康區提供 **Chroma 本機伺服器**與 **Ollama `serve`** 之啟動動作（各按鈕觸發前須 **modal 確認**）；命令列 argv 由 main 依 `loadConfig` 結果與環境變數組出，**禁止**自由文字指令。
- **連線狀態可讀（新增）**：在刷新結果基礎上，對 Ollama／Chroma 顯示操作員可理解的 **已連線／未連線**（或等同語意），與 JSON 面板之 `reachable` 一致。

## Goals（可衡量）

1. **G1**：操作者在安裝後 3 分鐘內，可透過 GUI 判讀 Ollama 是否「可連線」與「必要 embedding/chat 模型是否可用」。
2. **G2**：操作者可透過 GUI 判讀 Chroma 伺服器端點是否可連線、`persist_path` 目錄提示是否正確，並取得與 CLI 一致的啟動指引。
3. **G3**：Health GUI 在本機防火牆視角下為**低暴露**：預設不監聽 `0.0.0.0`。
4. **G4**：與 **joplin-brain CLI／Jarvis／Joplin** 分工清楚：GUI **不**取代編輯器內 Jarvis 體驗；**全文索引／RAG／Lint 仍以 CLI** 為主體，GUI 負責 **設定、依賴檢查與 launchd stack 腳本編排**。
5. **G5（新增）**：操作員於 GUI 修改並儲存設定後，**同一檔案**可被 `pnpm exec joplin-brain … --config …` 無 `CONFIG_INVALID` 載入（除非使用者刻意存入無效值）。
6. **G6（新增）**：操作員可在 GUI 內對 **`install-joplin-brain-stack.sh`／`uninstall-joplin-brain-stack.sh`** 發起執行並閱讀退出碼與輸出摘要；**解除安裝不預設刪除** `data/chroma/`、`notes_root` 或 Joplin 資料（僅 `launchctl bootout`／移除 plist，與現有腳本語意一致）。
7. **G7（本次 ingest）**：操作員無須先開終端機即可從 GUI **嘗試啟動**與 launchd wrapper **一致語意**之本機 Chroma／Ollama 伺服器；並能自介面讀取兩者是否**已連線**（以最後一次刷新之探測為準）。

## Non-goals

- 不提供遠端託管 Chroma、雲端向量服務或 PostgreSQL/pgvector 連線設定 UI。
- 不將 GUI 作為對外公開的 Web 服務或多人協作後台。
- **MVP 不保證**儲存 `config.yaml` 時保留所有 YAML 註解／鍵順序（若以 `YAML.stringify` 回寫）；若採回寫整檔，須在 README 載明並建議備份。
- 不在 MVP 內實作完整模型下載管理器（仍僅指引與複製 `ollama pull`）。
- 不修改 Joplin／Jarvis 外掛原始碼。
- 不以 Python 或第二語言 runtime 作為預設實作路徑。
- **不**在 GUI 內提供任意命令列輸入執行（僅允許清單內腳本／預定義動作）。
- **MVP 不提供**從 GUI **停止／強制結束**使用者已啟動之 Ollama 或 Chroma 行程（操作員仍以 Activity Monitor、`launchctl` 或終端機處置）；亦不保證與其他來源已啟動之實例自動合併辨識。

## 全本機運作

- **資料路徑**：向量資料與筆記仍在使用者既有 `data/chroma/`、`notes_root`；GUI stack 解除僅依腳本移除 LaunchAgent，**不**偷偷破壞資料目錄。
- **Ollama**：診斷請求僅指向設定中的 `ollama.base_url`。
- **Chroma**：與 `src/vector/chroma-store.js` 一致之本機伺服器模式；`persist_path` 用於指引與檔案檢查。
- **網路邊界**：無第三方 SaaS LLM；stack 腳本僅本機 launchd。
- **離線驗收**：設定編輯與腳本路徑解析可在離線完成；實際 bootstrap／Ollama 就緒仍依本機環境。

## Capabilities

### New Capabilities

- `local-runtime-health-gui`: 本機 Ollama／Chroma 狀態、`config.yaml` 編輯與驗證、對 `scripts/launchd/` 安裝／解除腳本之允許清單編排與操作員引導；**以及** allowlist 下之本機 Chroma／Ollama **一鍵啟動**與**連線狀態**呈現；綁定本機優先安全邊界。

### Modified Capabilities

（無）

## Impact

- Affected specs: `local-runtime-health-gui`（擴充）
- Affected code:
  - New:
    - `src/health-gui/`（擴充：`config/`、`stack/`、`deps/` 或同等 **dependency starter** 模組、`renderer` 狀態列／啟動按鈕）
    - `test/health-gui/`（設定儲存驗證、stack runner mock、**dependency starter** mock）
  - Modified:
    - `package.json`、`pnpm-lock.yaml`
    - `README.md`、`docs/macos-launchd-stack.md`（若有 GUI 入口交叉連結需求）
  - Referenced（僅透過絕對路徑 spawn，**不改行為**除非另有 change）:
    - `scripts/launchd/install-joplin-brain-stack.sh`
    - `scripts/launchd/uninstall-joplin-brain-stack.sh`
  - Removed:
    - （無）

## Risks（高層）

- **YAML 回寫**：可能去除註解或改變格式 → 備份提醒與文件化。
- **特權與誤操作**：安裝／解除 stack 影響使用者 LaunchAgents → 強制二次確認與 stdout／stderr 完整可追溯。
- **重複啟動／埠占用**：一鍵啟動若與既有行程衝突 → 文件與 UI 提示操作員檢查埠與 Activity Monitor；main 可於啟動前以輕量探測避免在 **已連線** 時重複 spawn（見 design）。
- **Electron 體積**、**虚假安全感**、**本機監聽**：（沿用原案 mitigation）。

## MVP 對照

| MVP 項目 | 說明 |
|---------|------|
| Ollama／Chroma 健康面板 | 沿用原 spec |
| **連線狀態／已連線標示** | 對齊刷新結果 `reachable` |
| **一鍵啟動 Chroma／Ollama** | allowlist + 確認對話 |
| config 表單 + 儲存驗證 | `loadConfig` 語意 |
| 一鍵 install／uninstall stack | 呼叫既有 sh，允許清單 |
| 安全預設 | main-only spawn、無任意 shell |

## Success Criteria（勾選清單）

- [ ] SCN-HGUI-01～05：（沿用）連線與綁定語意。
- [ ] SCN-HGUI-06：儲存無效 YAML 時 GUI 阻擋寫入並顯示 `CONFIG_INVALID` 對應訊息。
- [ ] SCN-HGUI-07：儲存有效變更後 `pnpm exec joplin-brain` 以同一 `--config` 可載入。
- [ ] SCN-HGUI-08：使用者未確認前，main 不會 spawn install／uninstall 腳本。
- [ ] SCN-HGUI-09：install／uninstall 結束後 GUI 顯示退出碼與最後數百字輸出摘要。

## Assumptions（假設）

- macOS 上使用 launchd stack 時路徑與 `docs/macos-launchd-stack.md` 一致。
- Node.js 20+、pnpm、bash 可得。
- 使用者理解解除 stack **不等於**刪除向量資料。

## Rollback

- 停止使用 GUI；必要時手動執行 uninstall 腳本（與現況相同）。
- 還原程式碼與 lockfile；組態檔若已被 GUI 回寫，依備份還原。
