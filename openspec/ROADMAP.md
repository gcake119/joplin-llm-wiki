# Roadmap（規劃中能力）

本文記錄**尚未視為規格義務**的產品／工程方向；實作前應另行開 Spectra
**`changes/` proposal**（`discuss → propose → apply`）。現行已定義的行為請
以 **`openspec/specs/`** 為準。目前收錄：
**PR-PIPELINE-RESUME**（管線 checkpoint／resume）、
**PR-DISTRIBUTION-PLUGIN-BREW**（Joplin 外掛或 Homebrew 獨立 app／CLI）。

---

## PR-PIPELINE-RESUME｜初始化與長時程管線：從中斷處自動接續

### 問題陳述

- Health GUI 初始化／full corpus 管線目前仍以數個序向 `pnpm exec`
  子程序執行：視情況先跑 `sqlite-sync --export-only`，再依使用者選擇跑
  `wiki-compile` 或 `agent-compile`。操作者無法事前得知總耗時。
- 行程或視窗中斷後，沒有內建「從上一次安全點自動接續」：必須手動再次
  觸發；下一輪仍會重新做管線級決策，例如 `raw/` 是否已有符合
  `raw_glob` 的 Markdown。
- `wiki-compile` 的 corpus sweep 已有自己的
  `wiki/.joplin-llm-wiki/corpus-sweep-state.json`（或設定覆寫路徑）追蹤
  digest offset；Health GUI 尚未有跨子程序、跨 UI session 的總管線
  checkpoint。
- `sqlite-sync --export-only` 若中途失敗，`raw/` 可能處於部分匯出狀態；
  下一輪會重新執行匯出與 snapshot 比對，但尚未提供可視化的分段 resume
  manifest。

### 設計意向（未承諾交付日）

1. **Phase-level 檢查點（管線協調）**
   - 以單一份本機紀錄寫入 `run_id`、config 指紋、最後成功結束的 phase
     （sqlite、wiki、agent）、對應子程序 exit、`raw/` 檔數摘要。
   - 重新進入初始化時，可選「接續模式」跳過已標記成功的 phase；仍須對
     `wiki-compile` / `agent-compile` 做一致性預檢，避免沿用過期 state。

2. **Corpus sweep state 可視化**
   - 將現有 corpus sweep state 的 `next_offset`、`markdown_file_count`、
     `step_files`、cycle completion 顯示到 Health GUI，讓操作者知道 full
     library sweep 目前進度。

3. **機器可讀進度／ETA（配合 UI）**
   - `wiki-compile` / `agent-compile` / `sqlite-sync` 可選 progress JSON lines
     或固定 prefix，Health GUI runner 將事件轉成 `pipeline-progress`，供進度
     條或剩餘估時。

4. **`sqlite-sync` 匯出可恢復性或明確分段**
   - 例如匯出水位／run manifest、或可 idempotent 的段落 commit；需與
     `reconcile_mode: mirror` 行為對齊，避免半套刪除與離線資料庫狀態解讀
     不一致。

### 風險與約束

- **單使用者本機**：resume 紀錄必須無法被子程序注入任意路徑（維持
  main-only／固定 argv 語意）。
- **多版本並行**：config 或 compiler behavior 變更時，resume token 失效或
  強制重新跑，須在行為上明載。
- **測試**：需 mock／整合測模擬「殺進程 → 重新啟動」，驗證
  sqlite state、corpus sweep state、GUI 紀錄不矛盾。

### 相關實作與規格錨點

| 區域 | 路徑或文件 |
|------|-------------|
| 管線序向／IPC | `src/health-gui/corpus/corpus-pipeline-runner.js`、`src/health-gui/main.js` |
| GUI 進度 UI | `src/health-gui/renderer/app.js` |
| Corpus sweep state | `src/wiki/corpus-sweep-state.js`、`src/commands/cmd-wiki-compile.js` |
| SQLite sync state | `src/joplin/sqlite/sync-state.js`、`src/commands/cmd-sqlite-sync.js` |
| 現行行為（對照） | `openspec/specs/local-runtime-health-gui/spec.md`、`openspec/specs/joplin-sqlite-sync/spec.md`、`openspec/specs/wiki-ingest/spec.md` |

---

## PR-DISTRIBUTION-PLUGIN-BREW｜交付形態：Joplin 外掛或 Homebrew 獨立 App

### 方向摘要

在現行 baseline（pnpm 工作區、`pnpm exec joplin-llm-wiki …`、可選
Electron Health GUI、launchd 堆疊）穩定之後，評估將使用者裝載方式擴展為
兩條主軸之一或並存（均需另開 Spectra change；不得無 proposal 即廢除現行
CLI 開發路徑）。

| 路線 | 工作稱呼 | 概要 |
|------|----------|------|
| **TRACK-A** | Joplin Desktop **plugin** | Host 跑在 Joplin 內建 Electron；優先以 Plugin API 讀寫／寫回 wiki；UI 改為 panel／command；長任務不得阻塞 UI thread；Ollama 可由外部 helper 管理。 |
| **TRACK-B** | **Homebrew** 通路 | 可含 CLI formula、GUI cask、launchd／shim 指向 Cellar；不以 pnpm 為使用者執行前提。 |

### 架構前提（與規格對齊）

- **Core／Host 分離**：領域管線（設定、`sqlite-sync`、`wiki-compile`、
  `agent-compile`、filesystem query、lint）應可由 Host 呼叫；Host 負責
  路徑、spawn 政策、Joplin／Electron 差異。
- **全本機預設**：任何交付形態不得預設將筆記送離本機；Codex Agent 路線是
  本機已登入 `codex exec`，不等同 OpenAI API provider。

### 詳細約束與決策清單

見 **[`openspec/specs/future-distribution-modes/spec.md`](specs/future-distribution-modes/spec.md)**。

### 相關錨點

| 區域 | 說明 |
|------|------|
| 現行 bin／GUI | `bin/joplin-llm-wiki.js`、`bin/joplin-llm-wiki-health-gui.js` |
| 堆疊與 launchd | `scripts/launchd/*`、`docs/macos-launchd-stack.md` |
| 使用者入口文件 | `README.md` |

---

## 後續

新增 roadmap 項目時請於本檔與 README「Roadmap（規劃中）」同步摘要（避免
長期漂移：以本檔為全文真相來源），並於相關 `openspec/specs/*.md` 底部補
連結以免分散。
