# future-distribution-modes Specification

## Purpose

本規格記錄 **joplin-llm-wiki**（npm 套件／本 repo）在未來可能採取的兩條 **交付／裝載（distribution）** 方向：**Joplin Desktop 外掛** 與 **可經 Homebrew 安裝的獨立應用程式（含 CLI formula 或 GUI cask）**。目的為：

- 在 **現行交付物**（pnpm 工作區、`bin/joplin-llm-wiki` CLI、可選 Electron Health GUI、launchd 堆疊）**跑順並穩定維運**之前，**不預先綁死**實作選型；
- 為日後開 change（proposal／design／tasks）時提供 **一致的架構約束與決策檢查清單**；
- 與 `openspec/config.yaml` 之「全本機運作」「架構邊界」對齊：**任何交付形態均不得預設將筆記或向量資料送離本機**，除非另開 change 並明示理由。

本文件 **不作為** 現行程式碼的強制驗收規格；現行驗收仍以各功能 spec（如 `note-indexing`、`local-runtime-health-gui` 等）為準。若未來選定其中一路線並開始重構，應另開 Spectra change，並將本規格中相關 REQ 吸收或改寫為「已採納」之實作規格。

---

## Scope

| 項目 | 說明 |
|------|------|
| **含** | 兩條路线的目標使用者、架構分界（Core／Host）、 path／行程／原生模組／UI 課題、決策前須達成的澄清事項 |
| **不含** | 具體 Homebrew formula／cask 名稱、Joplin plugin id、electron-builder 設定檔、商店上架流程 |
| **時機** | 僅在維護者確認「目前 CLI + Health GUI + 堆疊」已達可接受的穩定度與文件完整度後，再啟動路線選擇與重構 |

---

## Definitions

- **Core**：與裝載方式無關的管線與領域邏輯（設定載入與驗證、索引、wiki-compile、RAG、lint、探測語意等）。理想上可於 Node 行程內被呼叫，而不假設「倉庫根目錄」「pnpm 是否可用」。
- **Host**：裝載適配層——CLI 入口、Electron 視窗、Joplin plugin 載體、launchd／brew wrapper、設定檔與資料目錄解析、`spawn` 政策等。
- **現行 Host**：`bin/joplin-llm-wiki.js`、`bin/joplin-llm-wiki-health-gui.js`（spawn 專案內 Electron）、`scripts/launchd/*`、`README` 記載之操作方式。

---

## Requirements

### Requirement: REQ-DIST-PARK No commitment until current baseline is stable

在維護者明確記錄「目前交付 baseline 已穩定」**之前**，專案 **SHALL NOT** 將下列任一項列為必達里程碑：**上架 Joplin 官方市集**、**發布 Homebrew formula／cask**、或 **移除現行 pnpm／CLI 開發者工作流程**。準備工作（文件、介面草圖、spike）允許，但不得破壞現行預設開發與安裝路徑。

#### Scenario: SCN-DIST-PARK Baseline first

- **GIVEN** 尚未有書面決策（proposal 或 ADR）宣告「baseline 穩定」
- **WHEN** 新增依賴或重構裝載邊界
- **THEN** 變更 **SHALL** 保留現行 `pnpm install` + `pnpm exec joplin-llm-wiki …` 或等效文件化路徑可用，且不將 plugin／brew 設為唯一安裝方式

---

### Requirement: REQ-DIST-CORE Extractability of Core from Host

任何朝向 plugin 或 brew app 的重構 **SHALL** 以「Core 可被 Host 呼叫」為架構目標：Domain 規則與 I／O 契約 **SHOULD** 集中於可測試模組；Host **SHALL** 負責路徑解析（設定檔、`notes_root`／`wiki_root`、Chroma persist）、是否允許 `child_process`、以及 Electron／Joplin API 差異。

#### Scenario: SCN-DIST-CORE Test without Electron

- **WHEN** 維護者為 Core 撰寫或延伸自動化測試
- **THEN** 核心管線 **SHOULD** 可在 **無啟動 Electron、無啟動 Joplin Desktop** 的情境下通過驗證（mock／fixture 可接受），以避免裝載方式綁死測試環境

---

### Requirement: REQ-DIST-TRACK-A Joplin Plugin track constraints

若未來選擇 **Joplin Desktop plugin** 作為主要 Host，實作 **SHALL** 遵守下列約束（於開 change 時細化為 design／tasks）：

| 面向 | 約束 |
|------|------|
| **執行環境** | 外掛載入於 **Joplin 內建 Electron**，非獨立第二個 Electron runtime；API／權限以 Joplin plugin 模型為準 |
| **讀取 Joplin 資料** | **優先**評估 **Joplin Plugin API** 取得筆記／結構；若以唯讀 SQLite 直讀 Profile，須文件化鎖定／相容／升級風險並預設謹慎 |
| **Wiki 寫回** | **優先**評估以 **Plugin API** upsert 取代對 **外部 `joplin` CLI** 的依賴；若保留 CLI 模式，須視為選配並載明安裝前提 |
| **UI** | Health／設定／進度 **SHALL** 適配為 panel／command／dialog，不得假設獨立 `BrowserWindow` 由本 repo 單獨擁有 |
| **長時間工作** | index／compile **SHALL** 避免阻塞 UI thread；背景佇列或 worker 策略須在 design 載明 |
| **本機服務** | Ollama／Chroma 之 `spawn` 或埠連線 **SHALL** 對照 Joplin／Electron 安全模型評估；可行時預設「使用者已啟動服務」，或拆 **plugin + 伴隨 CLI／daemon** 並文件化 |
| **設定** | **SHOULD** 支援 plugin settings（或使用者選目錄）與既有 YAML 設定的對應／匯入策略 |

#### Scenario: SCN-DIST-TRACK-A Document plugin-native integration

- **WHEN** 開始實作 plugin Host
- **THEN** proposal／design **SHALL** 列出「API 取代 sqlite／CLI」的決策與 rollback（例如回退到現行 CLI-only 管線）

---

### Requirement: REQ-DIST-TRACK-B Homebrew standalone track constraints

若未來選擇 **Homebrew** 作為使用者安裝主通路，須先釐清交付形態（可複選），實作 **SHALL** 符合對應約束：

| 形態 | 說明 | 架構要點 |
|------|------|----------|
| **B1：CLI formula** | `brew install` 後於 PATH 取得 `joplin-llm-wiki` 類指令 | **不得**假設使用者具 pnpm 或 git checkout；發布物須為 **可安裝樹**（例如 npm pack／release tarball）；`bin` 與資源路徑 **SHALL** 以 **install prefix** 解析，而非「倉庫根下有 `src/`」 |
| **B2：GUI cask（.app）** | Electron 打包之 `.app`，devDependency 與 runtime 邊界須重划 | **electron** 須為正式打包鏈之一環；**better-sqlite3** 等原生模組須對 **目標 Node／Electron ABI** 重建或提供對應 artifact；Health GUI **SHALL** 使用 **bundle 資源路徑**（例如 `process.resourcesPath`），而非開發時 `repoRoot` |
| **B3：launchd／堆疊腳本** | plist／shim 指向 Cellar／opt 路徑 | 模板 **SHALL** 可替換為 `$(brew --prefix)` 或安裝時產生；**SHALL NOT** 硬編碼單一使用者 clone 路徑 |

與 **Chroma CLI** 相關：`pnpm exec chroma …` 在 brew 使用者環境可能不存在；**SHALL** 以「依賴另一 formula」「文件要求 PATH」「或 app bundle 內含 wrapper」之一明示解決，並維持與現行探測／Health GUI 語意一致或可設定差異。

#### Scenario: SCN-DIST-TRACK-B No implicit pnpm at runtime

- **WHEN** 發布 B1 或 B2 供終端使用者安裝
- **THEN** 預設執行路徑 **SHALL NOT** 要求使用者於任意目錄執行 `pnpm exec` 方能完成文件宣告的核心流程（除非該流程明文標為「開發者選配」）

---

### Requirement: REQ-DIST-LOCAL Local-first invariant across tracks

無論採 **TRACK-A** 或 **TRACK-B**，系統 **SHALL** 維持 `openspec/config.yaml` context 所載之 **全本機運作** 優先：預設資料路徑於本機、Ollama／Chroma 預設 **`127.0.0.1`**、MVP **不**將向量庫或筆記內容送網際網路作為預設行為。若交付型態需要自動更新／telemetry，須 **另開 change**，並列為 **opt-in** 與隱私說明。

#### Scenario: SCN-DIST-LOCAL Default localhost services

- **WHEN** 新 Host 提供預設設定範本
- **THEN** `ollama.base_url` 與 Chroma 連線預設 **SHALL** 等同或窄於現行之 localhost 語意（除非使用者明確覆寫）

---

### Requirement: REQ-DIST-DECISION Explicit selection and deprecation policy

切換主要交付方式時，維護者 **SHALL** 經 Spectra **proposal**（或等效 ADR）明載：**選定路線**、**現行方式是否並存**、**棄用時間表**。不得無文件地將開發者工作流程改為僅支援單一裝載。

#### Scenario: SCN-DIST-DECISION Proposal before breaking developers

- **WHEN** PR 將預設開發安裝步驟改為「僅 plugin」或「僅 brew」
- **THEN** 該 PR **SHALL** 引用已核准之 proposal，並說明遷移步驟

---

## Decision checklist（路線選擇前建議填寫）

於 baseline 穩定後、開大型重構 change 前，建議確認：

1. **使用者畫像**：以 CLI 批次為主，還是需要 Joplin 內嵌操作？
2. **原生模組矩陣**：目標 macOS 版本、是否必須 Electron、是否接受維護多個預編譯 target？
3. **Joplin 整合**：能否接受長期依賴 **Joplin Desktop Data API（Web Clipper）** 寫回，或必須 **Plugin API**？
4. **Chroma／Ollama 啟動**：是否堅持「一鍵 spawn」；若 plugin 受限，是否接受 **伴隨 helper**？
5. **設定來源**：維持單一 YAML、改為 app／plugin 設定儲存，或雙向同步？
6. **測試與 CI**：brew bottle／plugin 載入是否納入自動化（到哪個程度）？

---

## Risks & Assumptions

| 風險 | 說明 |
|------|------|
| **原生依賴 ABI** | `better-sqlite3` 與 Electron／Node 版本升級需連動；brew／plugin 發布節奏不同於現行 pnpm |
| **權限模型** | Plugin sandbox 可能禁止現行 Health GUI 的部分 `spawn` 或路徑 |
| **維護負擔** | 雙軌（CLI + plugin）若無清楚邊界，易造成重複實作 |

**假設**：現行 repo 持續作為 **原始碼真相（source of truth）**；無論未來 formula／marketplace 如何包裝，**規格與 acceptance** 仍優先更新於 `openspec/`。

---

## Related specs & docs

- **Roadmap 總覽（與其他規劃項並列）**：[`openspec/ROADMAP.md`](../ROADMAP.md) — **PR-DISTRIBUTION-PLUGIN-BREW**（本檔兩條交付路線）、**PR-PIPELINE-RESUME**（管線 checkpoint 等）
- 現行 Health GUI／堆疊：`openspec/specs/local-runtime-health-gui/spec.md`、`openspec/specs/macos-launchd-stack/spec.md`
- 專案脈絡與全本機規則：`openspec/config.yaml`
- 使用者操作入口：`README.md`

---

## Revision history

| 日期 | 說明 |
|------|------|
| 2026-05-17 | 初版：記錄 TRACK-A（Joplin plugin）與 TRACK-B（Homebrew／獨立 app）之規範與決策約束 |
| 2026-05-17 | Roadmap 互指：`openspec/ROADMAP.md` **PR-DISTRIBUTION-PLUGIN-BREW**，Related docs 合併重複項目 |
