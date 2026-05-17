# Roadmap（規劃中能力）

本文記錄**尚未視為規格義務**的產品／工程方向；實作前應另行開 Spectra **`changes/` proposal**（`discuss → propose → apply`）。現行已定義的行為請以 **`openspec/specs/`** 為準。目前收錄：**PR-PIPELINE-RESUME**（管線 checkpoint／resume）、**PR-DISTRIBUTION-PLUGIN-BREW**（Joplin 外掛或 Homebrew 獨立 app／CLI）。

---

## PR-PIPELINE-RESUME｜初始化與長時程管線：從中斷處自動接續（checkpoint & resume）

### 問題陳述

- Health GUI **初始化**／**full corpus** 管線目前是 main 行程內以 **數個序向 `pnpm exec` 子程序**執行（條件式 `sqlite-sync --export-only` → `index` → `wiki-compile`）。操作者無法事前得知總耗時。
- **行程或視窗中斷後**，沒有內建的「從上一次安全點自動接續」：必須手動再次觸發；下一輪仍會重新做管線級決策（例如 `notes_root` 是否有 `.md` 決定是否略過 SQLite 匯出）。
- **`index`**：雖可依 chunk hash／Chroma id 達到多輪呼叫下的**近似冪等**，但 **`index-state.json`** 若在長版 `indexAll` 過程中**延後落盤**（見 `src/index/indexer.js`），中斷時可能出現磁碟上的 state **落後於已在 Chroma 中寫入的向量**，下一輪會多重做工作，並非精準 resume。
- **`sqlite-sync --export-only`**：若中途失敗，`notes_root` 可能為部分檔案；下一輪行為依目錄內既有檔案情況決定是否再跑匯出，並不保證「接續匯出到與離線快照一致」而無另行設計。

### 設計意向（未承諾交付日）

下列為拆分後的典型能力，可分階段採納：

1. **Phase-level 檢查點（管線協調）**  
   - 以單一份本機紀錄（例如 `persist_path` 旁或 `_health-gui`/專案暫存目錄下的 JSON）寫入：`run_id`、`config` 指紋、最後**成功結束**的 phase（sqlite/index/wiki）、對應子程序 exit、`notes_root` 檔數摘要。  
   - 重新進入初始化時：**可選**「接續模式」時跳過已標記為成功的 phase（仍須對 `index`/`wiki-compile` 做一致性預檢，避免沿用過期 state）。

2. **`indexAll`／`index-tree` 的細粒度 persistence**  
   - 在每個 **layer（source／wiki）** 完成後、或每完成 **N 個檔**（可設定）即以**原子取代**方式寫入 `index-state.json`，使中斷後重跑時能大幅減少重複 embed。  
   - 需文件化與 **`tombstoneMissing`**／Chroma orphan 的一致性策略（crash 發生在 tombstone 前／後）。

3. **機器可讀進度／ETA（配合 UI）**  
   - CLI `index` 可選 **`--progress-json-lines`**（stderr 或 stderr 專用 fd）或以固定 prefix 報 `files_done/total`、當前相對路徑等，Health GUI runner 將事件轉成 `pipeline-progress`，供進度條或剩餘估時（非必須與 checkpoint 綁在同一 change）。

4. **`sqlite-sync` 匯出可恢復性或明確分段**  
   - 例如匯出水位／run manifest、或可 idempotent 的段落 commit；需與 `reconcile_mode: mirror` 行為對齊，避免半套刪除與離線資料庫狀態解讀不一致。

### 風險與約束

- **單使用者本機**：resume 紀錄必須無法被子程序注入任意路徑（維持 main-only／固定 argv 語意）。
- **多版本並行**：config 或 `compiler_revision` 變更時，resume token 失效或強制全文重編，須在行為上明載。
- **測試**：需 mock／整合測模擬「殺進程 → 重新啟動」，驗證 state/Chroma／GUI 紀錄不矛盾。

### 相關實作與規格錨點

| 區域 | 路徑或文件 |
|------|-------------|
| 管線序向／IPC | `src/health-gui/corpus/corpus-pipeline-runner.js`、`src/health-gui/main.js` |
| GUI 進度 UI | `src/health-gui/renderer/app.js` |
| index 狀態 | `src/index/state-store.js`、`src/index/indexer.js`、`src/commands/cmd-index.js` |
| 現行行為（對照） | `openspec/specs/local-runtime-health-gui/spec.md`、`openspec/specs/note-indexing/spec.md` |

---

## PR-DISTRIBUTION-PLUGIN-BREW｜交付形態：Joplin 外掛或 Homebrew 獨立 App

### 方向摘要

在 **現行 baseline**（pnpm 工作區、`pnpm exec joplin-llm-wiki …`、可選 Electron Health GUI、launchd 堆疊）穩定之後，評估將使用者裝載方式擴展為兩條主軸之一或並存（均需另開 Spectra change；**不得**無 proposal 即廢除現行 CLI 開發路徑——見規格 **REQ-DIST-PARK**）。

| 路線 | 工作稱呼 | 概要 |
|------|----------|------|
| **TRACK-A** | Joplin Desktop **plugin** | Host 跑在 Joplin 內建 Electron；優先以 Plugin API 讀寫／寫回 wiki；UI 改為 panel／command；長任務不得阻塞 UI thread；Ollama／Chroma spawn 須對齊外掛安全模型（可拆 **plugin + 伴隨 helper**）。 |
| **TRACK-B** | **Homebrew** 通路 | 可含 **B1** CLI formula（PATH 可得指令、不以 pnpm 為執行前提）、**B2** GUI cask（打包 `.app`、原生模組 ABI、資源路徑）、**B3** launchd／shim 指向 Cellar；Chroma CLI 依賴須明示（另一 formula、PATH 或 bundle wrapper）。 |

### 架構前提（與規格對齊）

- **Core／Host 分離**：領域管線（設定、索引、wiki-compile、RAG、lint）應可由 Host 呼叫；Host 負責路徑、`spawn` 政策、Joplin／Electron 差異。
- **全本機預設**：任何交付形態不得預設將筆記／向量送離本機（與 `openspec/config.yaml` context 一致）。

### 詳細約束與決策清單

見 **[`openspec/specs/future-distribution-modes/spec.md`](specs/future-distribution-modes/spec.md)**（含 REQ-DIST-PARK、REQ-DIST-CORE、TRACK-A／B 表格、風險與 Related docs）。

### 相關錨點

| 區域 | 說明 |
|------|------|
| 現行 bin／GUI | `bin/joplin-llm-wiki.js`、`bin/joplin-llm-wiki-health-gui.js` |
| 堆疊與 launchd | `scripts/launchd/*`、`docs/macos-launchd-stack.md` |
| 使用者入口文件 | `README.md` |

---

## 後續

新增 roadmap 項目時請於本檔與 **`README.md`「Roadmap（規劃中）」** 同步摘要（避免長期漂移：以本檔為全文真相來源），並於相關 `openspec/specs/*.md` 底部 **Roadmap 指標** 區塊補連結以免分散。
