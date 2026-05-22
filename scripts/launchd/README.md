# macOS LaunchAgent helpers（joplin-llm-wiki）

此目錄之 shell／plist 範本僅用於**本機** `launchd` 部署：透過 LaunchAgent 常駐 **Ollama** 與 **`joplin-llm-wiki sqlite-sync`**，不對外公開新的服務介面；實際監聽仍為本機 loopback（與專案 README 一致）。

完整步驟與風險說明見專案根目錄 [`docs/macos-launchd-stack.md`](../../docs/macos-launchd-stack.md)。

## 檔案一覽

| 檔案 | 用途 |
|------|------|
| `shims/joplin-llm-wiki-*` | bash shim：將 plist 引數轉交 `/bin/bash`（見 `docs/macos-launchd-stack.md`） |
| `run-ollama.sh` | 前景執行 `ollama serve`（stdout／stderr 建議由 plist 導向日誌） |
| `run-sqlite-sync.sh` | 等待 Ollama 就緒後執行 `pnpm exec joplin-llm-wiki sqlite-sync`；是否編譯由 `joplin_sqlite_sync.pipeline.compile_mode` 決定，是否常駐輪詢由 `joplin_sqlite_sync.schedule.every_seconds` 決定 |
| `com.joplin-brain.*.plist.example` | LaunchAgent 範本（安裝腳本會替換路徑占位符） |
| `install-joplin-brain-stack.sh` | 將 plist 裝入 `~/Library/LaunchAgents/` 並 `launchctl bootstrap` |
| `uninstall-joplin-brain-stack.sh` | `launchctl bootout` 並移除 plist |

注意：plist 範本只有 `RunAtLoad`，沒有 `StartInterval`。若 config 的 `every_seconds` 是 `null`，`sqlite-sync` 只執行單輪；若要定期檢查，請設定 `every_seconds`，或自行以 `StartInterval`/cron 重複啟動單輪命令，兩者不要同時使用以免重疊。
