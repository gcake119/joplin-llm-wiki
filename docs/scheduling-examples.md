# Cron / launchd 範例：`wiki-compile` + `lint`

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
