# Cursor project hooks（joplin-brain）

此目錄供**可選**的專案級 Cursor hooks。預設 **未啟用**任何 hook（避免拖慢每次 Agent 停頓）。

## 建議用法

| 目標 | 事件 | 備註 |
|------|------|------|
| 變更 `src/` 或 `test/` 後提醒自己跑測試 | `stop` | 以 command 執行 `pnpm test`，可設 `timeout` |
| 變更 `README.md`、`docs/llm-knowledge-flow.md`、`AGENTS.md`、`.cursor/rules/`、`.cursor/skills/` | `stop` | 檢查資料流、模型選擇與繁體中文知識輸出規則是否仍一致 |
| 限制具風險的 shell | `beforeShellExecution` | 例如對 `git push --force` 等設 matcher |

## 啟用方式

1. 在專案根目錄建立或編輯 `.cursor/hooks.json`（schema `version: 1`）。
2. 將可執行腳本放在 `.cursor/hooks/`（例如 `run-tests.sh`），並 `chmod +x`。
3. 在 Cursor 設定中確認 Hooks 已載入；修改 `hooks.json` 後必要時重啟 Cursor。

詳見 Cursor 文件：Hooks 的 stdin/stdout JSON 契約與各事件允許的回傳欄位。

## 與本 repo 的對齊

- 本專案主要驗證指令為 **`pnpm test`**（`node --test test/**/*.test.js`）。
- 若 hook 內呼叫 `pnpm`，請確認 hook 行程的 `PATH` 與互動式終端一致（`launchd`／Agent 環境常缺路徑）。
- **知識流文件／規則同步**：若修改 `sqlite-sync`、`wiki-compile`、`agent-compile`、notebook filter、模型選擇或 Joplin writeback，請同步檢查 `README.md`、`docs/llm-knowledge-flow.md`、`AGENTS.md`、`.cursorrules`、`.cursor/rules/joplin-brain-config.mdc`、`.cursor/skills/joplin-brain-dev/SKILL.md`。
- **資料流基準**：`gatelynch/llm-knowledge-base` 只作為四層 workflow 參考。此 repo 的 `raw/` 對應 `notes_root/<joined-notebook-slug>/<safe-title>.md`，`wiki/` 對應 `wiki_root/<joined-notebook-slug>/`。
- **模型基準**：本地路線是 `wiki-compile` + Ollama；Codex 月訂閱路線是 `agent-compile` + 本機 `codex exec`，不使用 OpenAI API key。
- **Joplin wiki 寫回**依 **本機 Data API**（Web Clipper token）；舊版「PATH 裡要有 `joplin` CLI」敘述已廢止。排程／無頭環境若要跳過寫回，設定檔使用 `joplin_wiki_writeback.enabled: false` 或僅 `--dry-run`（詳見 `README.md`、`docs/scheduling-examples.md`）。
