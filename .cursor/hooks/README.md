# Cursor project hooks（joplin-brain）

此目錄供**可選**的專案級 Cursor hooks。預設 **未啟用**任何 hook（避免拖慢每次 Agent 停頓）。

## 建議用法

| 目標 | 事件 | 備註 |
|------|------|------|
| 變更 `src/` 或 `test/` 後提醒自己跑測試 | `stop` | 以 command 執行 `pnpm test`，可設 `timeout` |
| 變更 `README.md`、`docs/llm-knowledge-flow.md`、`docs/macos-launchd-stack.md`、`AGENTS.md`、`.cursor/rules/`、`.cursor/skills/` | `stop` | 檢查資料流、模型選擇、`compile_mode` 與繁體中文知識輸出規則是否仍一致 |
| 限制具風險的 shell | `beforeShellExecution` | 例如對 `git push --force` 等設 matcher |

## 啟用方式

1. 在專案根目錄建立或編輯 `.cursor/hooks.json`（schema `version: 1`）。
2. 將可執行腳本放在 `.cursor/hooks/`（例如 `run-tests.sh`），並 `chmod +x`。
3. 在 Cursor 設定中確認 Hooks 已載入；修改 `hooks.json` 後必要時重啟 Cursor。

詳見 Cursor 文件：Hooks 的 stdin/stdout JSON 契約與各事件允許的回傳欄位。

## 與本 repo 的對齊

- 本專案主要驗證指令為 **`pnpm test`**（`node --test test/**/*.test.js`）。
- 若 hook 內呼叫 `pnpm`，請確認 hook 行程的 `PATH` 與互動式終端一致（`launchd`／Agent 環境常缺路徑）。
- **知識流文件／規則同步**：若修改 `sqlite-sync`、snapshot state、`compile_mode`、`wiki-compile`、`agent-compile`、notebook filter、模型選擇或 Joplin writeback，請同步檢查 `README.md`、`docs/llm-knowledge-flow.md`、`docs/macos-launchd-stack.md`、`AGENTS.md`、`.cursorrules`、`.cursor/rules/joplin-brain-config.mdc`、`.cursor/skills/joplin-brain-dev/SKILL.md`。
- **資料流基準**：`gatelynch/llm-knowledge-base` 只作為四層 workflow 參考。此 repo 的 `raw/` 是 Joplin SQLite 匯出的來源層；compiled wiki 只能落在 `wiki/summaries/*.md`、`wiki/concepts/*.md`、`wiki/indexes/All-Sources.md`、`wiki/indexes/All-Concepts.md`，不得在這三個目錄底下建立子資料夾。
- **模型基準**：本地路線是 `wiki-compile` + Ollama；Codex 月訂閱路線是 `agent-compile` + 本機 `codex exec`，不使用 OpenAI API key。兩條管路預設都掃完整個 `raw/`；`--batch=true` 才是 10-15 頁單批次 fallback。
- **SQLite sync 基準**：正常 `sqlite-sync` 以 snapshot 判斷 raw 變更，依 `joplin_sqlite_sync.pipeline.compile_mode: local|agent|off` 決定觸發 `wiki-compile`、`agent-compile` 或不編譯。首次非 dry-run 只建 baseline；`--snapshot-only` 只建立既有 `raw/` baseline。
- **Health GUI 基準**：主要 CLI workflow 應維持可從固定 tab 進入：Health、Config、Notebooks、Pipeline、Query、Lint、LaunchAgent。不得用 generic command runner 取代 Query/Lint/snapshot-only 的固定 IPC handler。
- **Query / Capture**：`query` 預設優先讀 `wiki/`，必要時補 `raw/`；Q&A 先進 pending capture，確認後才寫 `brainstorming/chat/` 或 `artifacts/projects/<project>/`。`ask`、`index`、`watch`、RAG／Chroma／embedding vector 管線已移除。
- **Joplin wiki 寫回**依 **本機 Data API**（Web Clipper token）；舊版「PATH 裡要有 `joplin` CLI」敘述已廢止。compile 寫回只同步 `@llm-wiki/wiki/{summaries,concepts,indexes}`；`brainstorming` 與 `artifacts` 只在需要整理問答、健康報告或作品時按需寫回。排程／無頭環境若要跳過寫回，設定檔使用 `joplin_wiki_writeback.enabled: false` 或僅 `--dry-run`（詳見 `README.md`、`docs/scheduling-examples.md`）。
