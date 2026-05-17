# macOS LaunchAgent helpers（joplin-brain）

此目錄之 shell／plist 範本僅用於**本機** `launchd` 部署：透過 LaunchAgent 常駐 **Ollama**、**Chroma** 與 **`joplin-brain sqlite-sync`**，不對外公開新的服務介面；實際監聽仍為本機 loopback（與專案 README 一致）。

完整步驟與風險說明見專案根目錄 [`docs/macos-launchd-stack.md`](../../docs/macos-launchd-stack.md)。

## 檔案一覽

| 檔案 | 用途 |
|------|------|
| `run-ollama.sh` | 前景執行 `ollama serve`（stdout／stderr 建議由 plist 導向日誌） |
| `run-chroma.sh` | 於 repo root 執行 `pnpm exec chroma run …`（對齊 README 預設 host／port／`data/chroma`） |
| `run-sqlite-sync.sh` | 等待 Ollama／Chroma 就緒後執行 `pnpm exec joplin-brain sqlite-sync` |
| `com.joplin-brain.*.plist.example` | LaunchAgent 範本（安裝腳本會替換路徑占位符） |
| `install-joplin-brain-stack.sh` | 將三份 plist 裝入 `~/Library/LaunchAgents/` 並 `launchctl bootstrap` |
| `uninstall-joplin-brain-stack.sh` | `launchctl bootout` 並移除 plist |
