## 1. 測試與核心同步服務

- [x] 1.0 導入 Vitest 作為 workflow-sync 新測試的 runner，保留既有 `node --test` legacy suite，並提供只收 `test/**/*.vitest.js` 的 Vitest 設定；驗收：`pnpm test:vitest` 可啟動 Vitest，且 `package.json` / `pnpm-lock.yaml` / `vitest.config.js` 記錄依賴、腳本與收檔邊界。
- [x] 1.1 建立 `test/joplin-workflow-sync.vitest.js` 的 mocked Joplin Data API fixture，覆蓋 `REQ-JWFS-SCOPE Workflow notebook pull scope`、brainstorming/artifacts notebook traversal、missing notebook skipped summary；驗收：`pnpm vitest run test/joplin-workflow-sync.vitest.js` 先看到對應案例失敗。
- [x] 1.2 [P] 建立 `REQ-JWFS-MAPPING Deterministic note-to-file mapping` 的 path mapper 測試，驗證 `@llm-wiki/brainstorming/chat` 到 `brainstorming/chat/*.md`、`@llm-wiki/brainstorming/health` 到 `brainstorming/health/*.md`、`@llm-wiki/artifacts/<project>` 到 `artifacts/<project>/*.md`；驗收：mapper 測試包含 `SCN-JWFS-BRAIN-01` 與 `SCN-JWFS-ART-01`。
- [x] 1.3 [P] 建立 `REQ-JWFS-CONFLICT Conflict detection` 與 `REQ-JWFS-WRITE File update and dry-run semantics` 測試，驗證 duplicate target、path traversal、dry-run no-write、normal update summary；驗收：測試案例包含 `SCN-JWFS-SAFE-01`、`SCN-JWFS-DRY-01`、`SCN-JWFS-WRITE-01`、`SCN-JWFS-CONFLICT-01`。
- [x] 1.4 實作 `src/joplin/workflow-sync.js` 的 `WorkflowSyncService`，落實設計決策 `Reuse Joplin Data API client and config boundary` 與 `Add WorkflowSyncService as the single implementation path`，讓 service 產生 `scanned/created/updated/unchanged/skipped/conflicts/errors/changed_files` summary；驗收：`pnpm vitest run test/joplin-workflow-sync.vitest.js` 的 traversal 與 summary 測試通過。
- [x] 1.5 實作 `Use deterministic title-based Markdown filenames for MVP` 的 safe filename 與 target resolution，並落實 `Fail closed on ambiguous or unsafe targets`：unsafe path、unsupported brainstorming folder、duplicate target 不寫入；驗收：`pnpm vitest run test/joplin-workflow-sync.vitest.js -t "path|conflict|traversal"` 通過。
- [x] 1.6 實作 `REQ-JWFS-LOCAL Local-first Data API boundary`：workflow pull sync 在讀取 notebook 前執行 Data API preflight，失敗回報 `JOPLIN_DATA_API_FAILED` 且不寫檔；驗收：preflight failure 測試確認 temp workspace 沒有新增或更新檔案。

## 2. CLI 與 MCP 入口

- [x] 2.1 在 `src/commands/cmd-workflow-sync.js` 與 `src/cli.js` 新增 `workflow-sync` subcommand，支援 `--config`、`--dry-run`、`--section brainstorming|artifacts|all`，stdout 回傳 service summary JSON；驗收：CLI smoke test 或 `pnpm exec joplin-llm-wiki workflow-sync --config ./config.yaml --dry-run --section brainstorming` 在 mocked/integration harness 中輸出 `workflow_sync_status` 與 `changed_files`。
- [x] 2.2 在 `src/mcp/schema.js`、`src/mcp/tools.js`、`src/knowledge-flow/orchestration-service.js` 新增 `REQ-MCP-WORKFLOW-SYNC MCP workflow pull sync tool` 的 `joplin_sync_workflow_notes`，使 MCP 直接呼叫 `WorkflowSyncService` 而非解析 CLI stdout；驗收：`pnpm vitest run test/mcp-workflow-sync.vitest.js -t "joplin_sync_workflow_notes"` 通過並覆蓋 `SCN-MCP-WFS-01`、`SCN-MCP-WFS-02`。
- [x] 2.3 更新 CLI help text 與 MCP tool description，明確說明 workflow pull sync 只處理 `brainstorming`/`artifacts` 且不碰 `raw`/`wiki`；驗收：`pnpm exec joplin-llm-wiki --help` 與 MCP tool list snapshot/content review 顯示新入口與邊界文字。

## 3. Writeback 邊界與文件

- [x] 3.1 調整 `src/joplin/wiki-writeback.js` 的相關註解或 shared helpers，使 `REQ-JWKB-WORKFLOW-PULL Workflow notes support explicit pull sync` 在程式邊界上清楚區分 compile writeback、workflow writeback、workflow pull sync；驗收：既有 `test/joplin-wiki-writeback.test.js` 通過且新增/更新測試確認 automatic compile writeback 不觸發 workflow pull sync。
- [x] 3.2 更新 `README.md`、`docs/llm-knowledge-flow.md`、`config.yaml.example`，說明 Joplin-to-workspace workflow pull sync 的命令、dry-run、安全限制、與 raw/wiki 非雙向同步邊界；驗收：文件內容 review 覆蓋 `SCN-JWKB-WP-02`，且 `rg -n "workflow-sync|joplin_sync_workflow_notes|raw/.*wiki/" README.md docs/llm-knowledge-flow.md config.yaml.example` 能定位新說明。
- [x] 3.3 更新 `.agents/skills/joplin-knowledge-flow/SKILL.md` 或 repo 內權威 skill/rule 文件，使 Codex/Cursor 使用者在要求同步 Joplin workflow edits 時優先呼叫 MCP `joplin_sync_workflow_notes`；驗收：skill 文件 review 確認不再把 brainstorming/artifacts 描述成只有 workspace-to-Joplin 單向 writeback。

## 4. 驗證與收斂

- [x] 4.1 執行針對性測試組合，確認 workflow sync、writeback、MCP 三條路徑不互相破壞；驗收：`pnpm vitest run test/joplin-workflow-sync.vitest.js test/mcp-workflow-sync.vitest.js` 與 `node --test test/joplin-wiki-writeback.test.js test/mcp-server.test.js` 通過。
- [x] 4.2 執行 repo 合理最小整體驗證，確認 CLI 與 config loading 沒有回歸；驗收：`pnpm test && pnpm test:vitest` 或 repo 目前定義的最小 test command 通過，若無法執行需記錄原因與未驗證範圍。
- [x] 4.3 執行 Spectra analyzer 與 validation，確認 proposal、design、specs、tasks 與 `REQ-JWFS-*`、`REQ-JWKB-WORKFLOW-PULL`、`REQ-MCP-WORKFLOW-SYNC` 對齊；驗收：`spectra analyze sync-joplin-workflow-edits --json` 無 Critical/Warning，且 `spectra validate sync-joplin-workflow-edits` 通過。
