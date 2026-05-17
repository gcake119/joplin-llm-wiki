## 1. 依賴與設定（REQ-JSQ-CONFIG、Interface / data shape）

- [x] 1.1 新增 better-sqlite3 依賴並更新 pnpm-lock.yaml，使執行環境能以唯讀 URI 開啟 SQLite（對齊 design「Decision: 採用 better-sqlite3 以 URI file 唯讀模式開啟 SQLite」）。驗收：`pnpm install` 成功；在 CI／本機執行一小段載入 `better-sqlite3` 的 smoke script 或單元測試通過。

- [x] [P] 1.2 在 `src/config/load-config.js` 解析並驗證 `joplin_sqlite_sync` 區塊：含 `enabled`、`database_path`、`export_root`、`reconcile_mode`、`busy_timeout_ms`、`max_export_attempts`、`pipeline`、`schedule`；當 `enabled` 為 true 且缺少 `database_path` 時拋出 `CONFIG_INVALID`；並強制解析後的 `export_root`（空則為 `notes_root`）與 `notes_root` 路徑相同，否則 `CONFIG_INVALID`（對應規格「REQ-JSQ-CONFIG Configuration surface」）。驗收：`test/config-schema.test.js` 新增案例或新測試檔覆蓋有效／無效組合。

- [x] 1.3 更新 `config.yaml.example` 加上完整 `joplin_sqlite_sync` 範例鍵與註解（對齊「Interface / data shape（config.yaml）」）。驗收：檔案可被專案範例測試或人工 `pnpm exec joplin-brain sqlite-sync --help` 前讀取解析無占位符。

## 2. SQLite 匯出核心（REQ-JSQ-SQLITE-RO、REQ-JSQ-EXPORT-MIRROR、Scope boundaries）

- [x] 2.1 新增 `src/joplin/sqlite/joplin-schema.js` 與 `src/joplin/sqlite/paths.js`：封裝 Joplin `notes`（及必要欄位）常數、檔名／相對路徑清理與 `export_root` 底下路徑逃逸檢查（對齊「Scope boundaries」與規格「REQ-JSQ-EXPORT-MIRROR Markdown export and reconciliation」之路徑安全子責）。驗收：針對 `..` 與非法字元的單元測試；測試名稱包含路徑逃逸案例。

- [x] 2.2 實作 `src/joplin/sqlite/exporter.js` 的 `SqliteMirrorExporter`：以唯讀開啟 DB、`busy_timeout_ms`、重試 `max_export_attempts`，將可讀 note body 寫成 UTF-8 Markdown；`reconcile_mode: mirror` 時刪除過時檔案，`leave` 時不刪（對應規格「REQ-JSQ-SQLITE-RO Read-only SQLite access with busy handling」與「REQ-JSQ-EXPORT-MIRROR Markdown export and reconciliation」）。驗收：以程式建立的暫存 SQLite fixture（至少三筆 notes）執行匯出，斷言檔案數與內容；並有 mirror 刪除 SCN-JSQ-EXP-01 對應案例。

## 3. CLI 與管線編排（REQ-JSQ-PIPELINE-ORDER、REQ-JSQ-SCHEDULE、Behavior、Decision: 管線編排）

- [x] 3.1 新增 `src/commands/cmd-sqlite-sync.js`：`enabled` false 時 stdout 印出 skipped JSON 並退出 0；`enabled` true 時先跑匯出，成功後依序可選呼叫 `runIndex` 與 `runWikiCompile`（重用 `src/commands/cmd-index.js`／`cmd-wiki-compile.js` 的現有進入點；對齊 design：decision: 管線編排採「同一子命令內呼叫既有函式」而非另開行程），失敗則中止後續步驟（對應規格「REQ-JSQ-PIPELINE-ORDER Orchestration order and failure gating」與 design「Behavior」）。驗收：整合測試或 mock Chroma／Ollama 中，故意讓 index 失敗時 wiki-compile 不曾被呼叫。

- [x] 3.2 在 `src/commands/cmd-sqlite-sync.js` 實作 `schedule.every_seconds` 與 CLI `--every` 覆寫的非阻塞迴圈：每週期結束印一行 JSON summary，收到 SIGINT 優雅退出（對應規格「REQ-JSQ-SCHEDULE Optional periodic re-run in-process」與 design：decision: 定時排程優先支援外部排程器；內建 `--every <seconds>` 為可選）。驗收：測試使用極短間隔與 SIGINT 模擬，斷言至少兩次週期(summary 行數)。

- [x] 3.3 實作 `--dry-run`：只驗證 DB 可開啟並輸出計數，不寫檔、不跑下游（對齊 design「acceptance criteria（供 reviewer／測試）」第一點之變體）。驗收：`pnpm exec joplin-brain sqlite-sync --config ...` 搭配 dry-run 後 `export_root` 檔案清單與執行前相同。

## 4. CLI 註冊與錯誤契約（Failure modes、REQ-JSQ-LOCAL-FIRST）

- [x] 4.1 更新 `src/cli.js`、`src/commands/index.js`：註冊子命令 `sqlite-sync`，補全域 help 條目；將新錯誤碼 `SQLITE_OPEN_FAILED`、`SQLITE_EXPORT_FAILED` 對應退出碼 1；保留 `OLLAMA_UNAVAILABLE`／`CHROMA_ERROR` 退出碼 2 行為與既有命令一致（design「Failure modes」）。驗收：`pnpm exec joplin-brain --help` 含 sqlite-sync；錯誤時 stderr 單行 JSON 與現有 `emitErr` 格式一致。

- [x] [P] 4.2 新增測試驗證當 `pipeline.run_index` 與 `pipeline.run_wiki_compile` 皆 false 時，sqlite-sync 匯出流程不對 `ollama.base_url` 發送 HTTP（對應規格「REQ-JSQ-LOCAL-FIRST Local execution and network boundary」之 SCN-JSQ-LF-01）：以 mock `global.fetch` 或抽出 http 客戶端注入方式斷言零請求。驗收：測試檔通過且名稱含完整 REQ 標題字樣。

## 5. 文件與作業範本

- [x] [P] 5.1 在 README 或 `docs/`（若專案慣例）新增「Joplin Desktop SQLite 匯出＋排程」段落：說明 `database.sqlite` 路徑、建議 external cron／launchd 呼叫 `pnpm exec joplin-brain sqlite-sync --config <abs>`，並警告 mirror 刪除與 `notes_root` 重合風險（對齊 design：decision: 匯出根目錄預設等於 `notes_root` 但強烈建議獨立 `export_root`）；並**載明**預設 `notes_root` 為倉庫根 `./notes_root` 且該目錄已列於 `.gitignore`（對齊 design「Decision: 倉庫根目錄 `notes_root` 不納入版控」）。驗收：Reviewer 可依文件在乾淨機器完成單次匯出（不含占位 TBD），且可複製 `config.yaml.example` 得到相對 `notes_root` 路徑。

## 6. 倉庫筆記目錄與版控

- [x] [P] 6.1 將倉庫根目錄 `notes_root/` 列進 `.gitignore`，並維持 `config.yaml.example` 預設 `notes_root: ./notes_root` 與「不進版控」註解（對應規格「REQ-JSQ-REPO-NOTES-LAYOUT Repository-local notes directory and version control exclusion」；對齊 design：decision: 倉庫根目錄 `notes_root` 不納入版控）。驗收：在 `notes_root/` 建立暫存檔後執行 `git check-ignore -qv notes_root/<該檔>` 回傳匹配規則；若 CI 無 Git 則以僅讀 `.gitignore` 內容之測試斷言 `notes_root/` 條目存在。
