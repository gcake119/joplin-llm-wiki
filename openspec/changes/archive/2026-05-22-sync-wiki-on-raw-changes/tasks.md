## 1. 設定與狀態模型

- [x] 1.1 實作 `joplin_sqlite_sync.pipeline.compile_mode` 解析，讓 `REQ-JSQ-CONFIG Configuration surface` 支援 `local|agent|off`、非法值回報 `CONFIG_INVALID`、未設定時依 legacy `run_wiki_compile` 推導；驗收：`test/config-schema.test.js` 覆蓋有效值、無效值、legacy true/false、compile_mode 優先。
- [x] 1.2 建立 raw snapshot state helper，落實 `Decision: Store raw snapshot state outside raw` 與 `Decision: Compare raw-relative path plus content hash and Joplin id`，輸出 baseline/added/updated/deleted/dry-run 比對結果；驗收：新增 `test/sqlite-sync-change-detection.test.js` 覆蓋 `REQ-JSQ-RAW-CHANGE-DETECTION Raw snapshot change detection` 的五個 scenario。
- [x] 1.3 實作 state I/O 失敗與 malformed JSON 行為，讓 state write failure 不觸發 compile、malformed state 形成可觀測 baseline warning；驗收：`test/sqlite-sync-change-detection.test.js` 斷言 state write error code 與 malformed state summary/warning。
- [x] 1.4 實作 `sqlite-sync --snapshot-only`，落實 `Decision: Provide snapshot-only as a sqlite-sync option and GUI pipeline action` 與 `REQ-JSQ-RAW-CHANGE-DETECTION Raw snapshot change detection`：從現有 `raw` Markdown 建立 baseline、不開 SQLite、不匯出、不刪 raw、不編譯；驗收：`test/sqlite-sync-change-detection.test.js` 覆蓋 `SCN-JSQ-RCD-06`、`SCN-JSQ-RCD-07`、`SCN-JSQ-RCD-08`。

## 2. sqlite-sync 編排

- [x] 2.1 將 `cmd-sqlite-sync` 改為 export 後執行 raw change gate，落實 `REQ-JSQ-PIPELINE-ORDER Orchestration order and failure gating`：export 失敗不寫 state、不編譯，unchanged 不編譯，changed 才依模式決策；驗收：`test/joplin-sqlite.test.js` 或新增整合測試以 mock runners 斷言 baseline、unchanged、changed 三條路徑。
- [x] 2.2 實作 `Decision: Use a compile_mode enum instead of two booleans or a command string` 的 local/off 分支，`compile_mode: local` 只呼叫 `runWikiCompile` 一次，`off` 不呼叫任何 runner；驗收：測試覆蓋 `SCN-JSQ-PIPE-02 Changed raw triggers local compile` 與 `SCN-JSQ-PIPE-05 Off mode skips compile even when raw changed`。
- [x] 2.3 實作 `REQ-JSQ-AGENT-COMPILE-ORCHESTRATION Agent compile as a fixed sqlite-sync downstream mode`，讓 `compile_mode: agent` 呼叫既有 `runAgentCompile` runtime 並保留 Codex error code；驗收：`test/agent-compile.test.js` 或 sqlite-sync mock 測試覆蓋 agent runner invoked、不可用/usage/incomplete compile error propagation。
- [x] 2.4 落實 `Decision: First run establishes baseline without compiling`，首次成功 non-dry-run export 寫入 baseline 並回報 `compile_triggered: false`；驗收：測試斷言 `change_detection: "baseline"`、`raw_changed: false`、compile runner zero calls。
- [x] 2.5 擴充 `REQ-JSQ-SCHEDULE Optional periodic re-run in-process` summary contract，stdout 每輪包含 `raw_changed`、`change_detection`、`changed_files`、`compile_mode`、`compile_triggered`；驗收：週期/單輪測試解析 JSON summary 並檢查所有欄位與 cycle counter。
- [x] 2.6 確認 `--export-only`、`--snapshot-only` 與 dry-run contract：export-only 可更新 state 但不編譯，snapshot-only 建立 baseline 且 summary 有 `snapshot_only: true`，dry-run 不寫 state、不編譯且回報 would-change；驗收：測試以相同 fixture 斷言 state mtime/content、summary 欄位與 runner calls。

## 3. Health GUI 分頁與 IPC

- [x] 3.1 實作 `REQ-HGUI-CLI-TAB-COVERAGE Major CLI workflows are reachable from GUI tabs`，讓 renderer 顯示 Health、Config、Notebooks、Pipeline、Query、Lint、LaunchAgent tabs 且不提供 generic shell command runner；驗收：`test/health-gui/corpus-pipeline-runner.test.js` 或新增 GUI renderer 靜態測試斷言 tab/panel id 覆蓋所有主要 workflows。
- [x] 3.2 實作 Pipeline tab 的 snapshot-only action，讓 `REQ-HGUI-SNAPSHOT-ONLY Raw snapshot action in Pipeline tab` 透過固定 IPC handler spawn `pnpm exec joplin-llm-wiki sqlite-sync --config <absConfigPath> --snapshot-only` 並顯示 bounded output；驗收：Health GUI runner 測試斷言 argv、cwd、confirmation required、stdout/stderr tail rendering contract。
- [x] 3.3 實作 Query tab 與固定 main-process IPC handler，落實 `Decision: Add fixed GUI tabs for query and lint instead of a generic command runner` 與 `REQ-HGUI-QUERY-TAB Query workflow tab`：問題查詢支援 `knowledge|wiki|raw` source scope，confirm-capture 支援 pending capture id；驗收：Health GUI 測試斷言 query argv、confirm-capture argv、無 arbitrary executable/string payload。
- [x] 3.4 實作 Lint tab 與固定 main-process IPC handler，落實 `REQ-HGUI-LINT-TAB Lint workflow tab`：按鈕執行 `lint --config <absConfigPath>` 並顯示 exit code/stdout/stderr tails；驗收：Health GUI 測試斷言 lint argv、bounded tail、failure result display contract。

## 4. CLI 與文件

- [x] [P] 4.1 更新 CLI help 與 `config.yaml.example`，讓操作者看見 `pipeline.compile_mode`、legacy fallback、local/agent/off 與 `sqlite-sync --snapshot-only` 語意；驗收：`test/cli-routing.test.js` 或 help snapshot 測試包含 compile_mode 與 snapshot-only 說明，並人工檢查 example YAML 可被 `loadConfig` 載入。
- [x] [P] 4.2 更新 README、`docs/llm-knowledge-flow.md`、`docs/scheduling-examples.md`，描述 raw change gated synchronization、snapshot-only baseline、agent mode prerequisites、first-run baseline 行為與 rollback；驗收：內容審查確認文件包含 `compile_mode: local|agent|off`、`--snapshot-only`、baseline-only、`--export-only`、dry-run 語意。
- [x] [P] 4.3 更新 `docs/macos-launchd-stack.md`，落實 `REQ-MLS-OBSERVABILITY Logging locations and Joplin Data API prerequisites` 與 `REQ-MLS-SQLITE-SYNC-COMPILE-MODE Scheduled compile mode documentation`，使 launchd 指南列出 summary 欄位、snapshot-only 初始化建議與 agent mode 預檢；驗收：內容審查確認範例包含 `pipeline.compile_mode` 且日誌章節列出五個 JSON 欄位。
- [x] [P] 4.4 更新 `.cursor/rules/joplin-brain-config.mdc`、`.cursor/skills/joplin-brain-dev/SKILL.md`、`.cursor/hooks/README.md`，讓 Cursor rule/skill/hook README 描述新 config、raw change gate、snapshot-only、GUI tab coverage 與文件同步規則且不新增啟用 hook；驗收：`rg "compile_mode|snapshot-only|raw_changed|compile_triggered|Query|Lint" .cursor` 可找到對應規則與文件段落。

## 5. 驗證與收斂

- [x] 5.1 執行 focused tests，確認 config、state helper、snapshot-only、sqlite-sync orchestration、agent mode error propagation、Health GUI query/lint/snapshot IPC 全部通過；驗收：`pnpm exec node --test test/config-schema.test.js test/joplin-sqlite.test.js test/sqlite-sync-change-detection.test.js test/agent-compile.test.js test/health-gui/corpus-pipeline-runner.test.js` 成功。
- [x] 5.2 執行全套測試並檢查 artifacts 一致性；驗收：`pnpm test` 成功，`spectra analyze sync-wiki-on-raw-changes --json` 無 Critical/Warning，`spectra validate sync-wiki-on-raw-changes` 成功。
- [x] 5.3 完成實作交接檢查：確認 tasks 覆蓋 design 中六個 decision heading、所有新增 summary 欄位、snapshot-only、GUI Query/Lint tab、所有 spec requirement 名稱與文件/Cursor assets；驗收：人工審查 `openspec/changes/sync-wiki-on-raw-changes/{proposal.md,design.md,tasks.md,specs/**/*.md}` 無 placeholder、無 file-path-only task、無 line-number-coupled instruction。
