## Cron / launchd 範例：`wiki-compile` / `agent-compile` + `lint`

> **Joplin 寫回**：若設定中 `joplin_wiki_writeback` 為開啟（預設），`wiki-compile` 與成功的 `agent-compile`（非 `--dry-run`）都會經 **本機 Joplin Data API** 寫入 `@llm-wiki/wiki/{summaries,concepts,indexes}`。`brainstorming/` 與 `artifacts/` 不跟著 compile 自動同步，只在需要整理問答、健康報告或作品時按需寫回；artifacts 寫回才需要 **`joplin_wiki_writeback.artifacts_project_notebook_title`**。須設定 **`joplin_data_api.token`**（Web Clipper 授權權杖），且 Desktop **Clipper 服務**在跑、與 **`database.sqlite`／profile** 一致。無頭排程機若無法滿足此前提，請設 `joplin_wiki_writeback.enabled: false` 或改用僅 `--dry-run`。詳見 README「Joplin：Desktop、Data API 與 Wiki 寫回」。

> **模型選擇**：`wiki-compile` 是本地 Ollama 路線；`agent-compile` 是本機已登入 `codex exec` 的 Codex Agent 路線，不使用 OpenAI API key，也不等同 API 額度。兩條管路預設都會掃完整個 `raw/` 筆記庫；`--batch=true` 才是 10-15 頁單批次 fallback。`sqlite-sync` 的自動編譯由 `joplin_sqlite_sync.pipeline.compile_mode: local|agent|off` 決定：`local` 觸發 `wiki-compile`，`agent` 觸發 `agent-compile`，`off` 僅同步 raw。兩者都應維持 `raw/` → `wiki/summaries|concepts|indexes` 的資料流。

> **定時語意**：這不是檔案系統 watcher。每次 `sqlite-sync` 執行時才會匯出 SQLite、比對 raw snapshot，並依 `compile_mode` 決定是否編譯。可用 cron/launchd 反覆啟動單輪命令，也可在 config 設 `joplin_sqlite_sync.schedule.every_seconds` 或 CLI 傳 `--every <seconds>` 讓同一個行程常駐輪詢。

> **LaunchAgent 語意**：repo 內 sqlite-sync plist 使用 `RunAtLoad` 啟動，並以 `KeepAlive.SuccessfulExit=false` + `ThrottleInterval` 只在非零退出時受控重啟。正常週期請由 `schedule.every_seconds` 或 `--every` 控制；不要同時加 plist `StartInterval` 與非空 `every_seconds`。LaunchAgent wrapper 會依 resolved `compile_mode` 分流：`agent` / `off` 不檢查 Ollama，`local` 才等待 Ollama `/api/tags`。

以下假設儲存庫在 `/ABS/PATH/TO/joplin-llm-wiki`，且已在該目錄執行過 `pnpm install`。

```cron
# 每 30 分鐘從 Joplin SQLite 匯出 selected notebooks；若 raw 有變更，依 compile_mode 自動編譯
*/30 * * * * cd /ABS/PATH/TO/joplin-llm-wiki && pnpm exec joplin-llm-wiki sqlite-sync --config ./my-karpathy.config.yaml >> ~/logs/joplin-llm-wiki-sqlite-sync.log 2>&1

# 單一常駐行程每 600 秒輪詢一次；適合手動測試，不一定比 launchd/cron 更好管理
@reboot cd /ABS/PATH/TO/joplin-llm-wiki && pnpm exec joplin-llm-wiki sqlite-sync --config ./my-karpathy.config.yaml --every 600 >> ~/logs/joplin-llm-wiki-sqlite-sync-loop.log 2>&1

# 只刷新 raw，不觸發編譯，但仍更新 snapshot state
*/30 * * * * cd /ABS/PATH/TO/joplin-llm-wiki && pnpm exec joplin-llm-wiki sqlite-sync --config ./my-karpathy.config.yaml --export-only >> ~/logs/joplin-llm-wiki-sqlite-export.log 2>&1

# raw 已有資料時，只建立 baseline snapshot（不開 SQLite、不刪檔、不編譯）
@daily cd /ABS/PATH/TO/joplin-llm-wiki && pnpm exec joplin-llm-wiki sqlite-sync --config ./my-karpathy.config.yaml --snapshot-only >> ~/logs/joplin-llm-wiki-snapshot.log 2>&1

# 每小時編譯 wiki（請改成你的 config 路徑）
0 * * * * cd /ABS/PATH/TO/joplin-llm-wiki && pnpm exec joplin-llm-wiki wiki-compile --config ./my-karpathy.config.yaml >> ~/logs/joplin-llm-wiki-wiki-compile.log 2>&1

# 若要改用 Codex Agent 編譯，確認排程環境可找到且已登入 codex
0 * * * * cd /ABS/PATH/TO/joplin-llm-wiki && pnpm exec joplin-llm-wiki agent-compile --config ./my-karpathy.config.yaml >> ~/logs/joplin-llm-wiki-agent-compile.log 2>&1

# 本機 Ollama 單批次 fallback（只在全庫掃描太重時使用）
0 2 * * 0 cd /ABS/PATH/TO/joplin-llm-wiki && pnpm exec joplin-llm-wiki wiki-compile --config ./my-karpathy.config.yaml --batch=true >> ~/logs/joplin-llm-wiki-wiki-batch.log 2>&1

# 每天凌晨跑 lint 報告
15 3 * * * cd /ABS/PATH/TO/joplin-llm-wiki && pnpm exec joplin-llm-wiki lint --config ./my-karpathy.config.yaml >> ~/logs/joplin-llm-wiki-lint.log 2>&1
```

建議：

- 長時間任務請確認本機 `ollama` 已在使用者 session 內啟動；Chroma／向量索引已移除。
- 若 concept 產生或 Joplin 寫回事故需要手動修復，先暫停 launchd/cron 或常駐 `sqlite-sync`，再使用 `wiki-compile --resume-stage concepts --dry-run`、`wiki-compile --resume-stage concepts`、`wiki-compile --resume-stage writeback --dry-run` 檢查與接續。這不會重新產生 `wiki/summaries/*.md`，也不改變一般 sqlite-sync polling 語意。
- 若 `sqlite-sync` 使用 `compile_mode: agent`，排程環境只需可執行已登入的 `codex exec`，不需要 Ollama readiness；`compile_mode: local` 才需要 Ollama。
- 若採用 `sqlite-sync` 自動編譯，第一次非 dry-run 會建立 snapshot baseline，不觸發 compile；第二次起才會根據 raw-relative path、Joplin note id 與內容 hash 判定是否變更。
- raw 變更後若 compile 或 writeback preflight 失敗，snapshot state 不會提交；修復 token、Data API 或 downstream 問題後，下一輪會重試同一批 raw 變更。查看 `sqlite-sync.log` 的 `state_committed`、`state_commit_reason`、`downstream_status`、`writeback_preflight_status`，以及 `sqlite-sync.err.log` 的錯誤碼。
- 若排程使用 `agent-compile`，請先以互動式 session 驗證 `codex exec` 可用；若只想取得可手動貼給 Codex 的任務提示，先跑 `agent-compile --dry-run`。`--batch=true` 只適合本地模型資源不足時的 fallback，不是預設資料流。
- macOS 可使用 `launchd` plist 將上述命令包成 `LaunchAgent`，並設定 `PATH` 包含 `pnpm` / `node`。
