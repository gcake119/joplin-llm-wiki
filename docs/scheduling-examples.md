## Cron / launchd 範例：`wiki-compile` + `lint`

> **Joplin 寫回**：若設定中 `joplin_wiki_writeback` 為開啟（預設），排程執行 `wiki-compile` 時，`PATH` 須能找到 `joplin_cli.command`（預設 `joplin`），且該 CLI 須對到與 Desktop 相同的 Profile；否則請在設定檔設 `joplin_wiki_writeback.enabled: false`，或改用僅 `--dry-run` 的排程。詳見 README「Joplin：Desktop、CLI 與 Wiki 寫回」。

以下假設儲存庫在 `/ABS/PATH/TO/notes-knowledge`，且已在該目錄執行過 `pnpm install`。

```cron
# 每小時編譯 wiki（請改成你的 config 路徑）
0 * * * * cd /ABS/PATH/TO/notes-knowledge && pnpm exec joplin-brain wiki-compile --config ./my-karpathy.config.yaml >> ~/logs/joplin-brain-wiki.log 2>&1

# 每天凌晨跑 lint 報告
15 3 * * * cd /ABS/PATH/TO/notes-knowledge && pnpm exec joplin-brain lint --config ./my-karpathy.config.yaml >> ~/logs/joplin-brain-lint.log 2>&1
```

建議：

- 長時間任務請確認本機 `ollama` 與 `chroma run`（向量伺服器）已在使用者 session 內啟動。
- macOS 可使用 `launchd` plist 將上述命令包成 `LaunchAgent`，並設定 `PATH` 包含 `pnpm` / `node`。
