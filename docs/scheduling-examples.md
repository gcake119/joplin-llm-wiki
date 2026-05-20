## Cron / launchd 範例：`wiki-compile` / `agent-compile` + `lint`

> **Joplin 寫回**：若設定中 `joplin_wiki_writeback` 為開啟（預設），`wiki-compile`（非 `--dry-run`）會經 **本機 Joplin Data API** 寫入；須設定 **`joplin_data_api.token`**（Web Clipper 授權權杖）且 Desktop **Clipper 服務**在跑、與 **`database.sqlite`／profile** 一致。無頭排程機若無法滿足此前提，請設 `joplin_wiki_writeback.enabled: false` 或改用僅 `--dry-run`。詳見 README「Joplin：Desktop、Data API 與 Wiki 寫回」。

> **模型選擇**：`wiki-compile` 是本地 Ollama 路線；`agent-compile` 是本機已登入 `codex exec` 的 Codex Agent 路線，不使用 OpenAI API key，也不等同 API 額度。兩者都應維持 `notes_root/<joined-notebook-slug>/` → `wiki_root/<joined-notebook-slug>/` 的資料流。

以下假設儲存庫在 `/ABS/PATH/TO/joplin-llm-wiki`，且已在該目錄執行過 `pnpm install`。

```cron
# 每 30 分鐘從 Joplin SQLite 匯出 selected notebooks（請先用 --select-notebooks 寫入 config）
*/30 * * * * cd /ABS/PATH/TO/joplin-llm-wiki && pnpm exec joplin-llm-wiki sqlite-sync --config ./my-karpathy.config.yaml --export-only >> ~/logs/joplin-llm-wiki-sqlite-sync.log 2>&1

# 每小時編譯 wiki（請改成你的 config 路徑）
0 * * * * cd /ABS/PATH/TO/joplin-llm-wiki && pnpm exec joplin-llm-wiki wiki-compile --config ./my-karpathy.config.yaml >> ~/logs/joplin-llm-wiki-wiki-compile.log 2>&1

# 若要改用 Codex Agent 編譯，確認排程環境可找到且已登入 codex
0 * * * * cd /ABS/PATH/TO/joplin-llm-wiki && pnpm exec joplin-llm-wiki agent-compile --config ./my-karpathy.config.yaml >> ~/logs/joplin-llm-wiki-agent-compile.log 2>&1

# 每天凌晨跑 lint 報告
15 3 * * * cd /ABS/PATH/TO/joplin-llm-wiki && pnpm exec joplin-llm-wiki lint --config ./my-karpathy.config.yaml >> ~/logs/joplin-llm-wiki-lint.log 2>&1
```

建議：

- 長時間任務請確認本機 `ollama` 與 `chroma run`（向量伺服器）已在使用者 session 內啟動。
- 若排程使用 `agent-compile`，請先以互動式 session 驗證 `codex exec` 可用；若只想取得可手動貼給 Codex 的任務提示，先跑 `agent-compile --dry-run`。
- macOS 可使用 `launchd` plist 將上述命令包成 `LaunchAgent`，並設定 `PATH` 包含 `pnpm` / `node`。
