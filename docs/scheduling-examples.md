## Cron / launchd 範例：`wiki-compile` + `lint`

> **Joplin 寫回**：若設定中 `joplin_wiki_writeback` 為開啟（預設），`wiki-compile`（非 `--dry-run`）會經 **本機 Joplin Data API** 寫入；須設定 **`joplin_data_api.token`**（Web Clipper 授權權杖）且 Desktop **Clipper 服務**在跑、與 **`database.sqlite`／profile** 一致。無頭排程機若無法滿足此前提，請設 `joplin_wiki_writeback.enabled: false` 或改用僅 `--dry-run`。詳見 README「Joplin：Desktop、Data API 與 Wiki 寫回」。

以下假設儲存庫在 `/ABS/PATH/TO/joplin-llm-wiki`，且已在該目錄執行過 `pnpm install`。

```cron
# 每小時編譯 wiki（請改成你的 config 路徑）
0 * * * * cd /ABS/PATH/TO/joplin-llm-wiki && pnpm exec joplin-llm-wiki wiki-compile --config ./my-karpathy.config.yaml >> ~/logs/joplin-llm-wiki-wiki-compile.log 2>&1

# 每天凌晨跑 lint 報告
15 3 * * * cd /ABS/PATH/TO/joplin-llm-wiki && pnpm exec joplin-llm-wiki lint --config ./my-karpathy.config.yaml >> ~/logs/joplin-llm-wiki-lint.log 2>&1
```

建議：

- 長時間任務請確認本機 `ollama` 與 `chroma run`（向量伺服器）已在使用者 session 內啟動。
- macOS 可使用 `launchd` plist 將上述命令包成 `LaunchAgent`，並設定 `PATH` 包含 `pnpm` / `node`。
