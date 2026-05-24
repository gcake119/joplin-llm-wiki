## Why

變更類型：Infrastructure / Refactor。

目前專案已安裝 Vitest 並提供 test:vitest 腳本，但大多數既有測試仍使用 Node.js 內建 node:test runner，形成兩套測試進入點與 assertion/mock 寫法。把既有測試統一遷移到 Vitest 可以降低後續新增測試的心智負擔，讓 workflow-sync 等新測試與 legacy suite 使用同一個 runner、同一套 CLI 驗證方式。

## What Changes

- 將 test/**/*.test.js 既有 Node.js runner 測試改為 Vitest 可執行測試，包含 import、assertion、mock/spy、生命週期 hook 與 async 錯誤斷言語意。
- 調整 package.json 測試腳本與 vitest.config.js，讓 pnpm test 成為 Vitest 主入口，且不再依賴 node --test 作為主要驗證路徑。
- 維持 Node.js 20+、JavaScript ESM、pnpm 與全本機執行邊界；測試不得新增雲端服務、遠端 API、外部資料庫或需網路的測試依賴。
- 保留現有測試覆蓋意圖與 fixture 行為，遷移後同一批測試案例仍驗證 CLI、config、Joplin Data API mock、SQLite sync、MCP、wiki compile、Health GUI helper 與 launchd script helper 等本機功能。
- 更新 README.md 或相關開發文件中的測試指令，避免新貢獻者繼續使用舊 runner 指令。

## Goals

- Goal 1：repo 的主要測試入口統一為 Vitest，pnpm test 可執行所有已遷移的既有單元與整合測試。
- Goal 2：遷移後的測試保持原有行為覆蓋，不因 runner 轉換而放寬錯誤碼、stdout/stderr、檔案輸出、mock spawn、Data API mock 或本機路徑安全斷言。
- Goal 3：測試框架設定清楚標示收檔範圍，避免 legacy node:test 檔案與新 Vitest 檔案被不同 runner 重複或漏跑。
- Goal 4：文件與 package scripts 對齊，使開發者只需要使用 Vitest 相關指令完成日常驗證與窄範圍測試。

## Non-Goals

- 不重寫被測產品程式碼的功能行為；只有在測試遷移揭露真實回歸時，才另行修正並以測試證明。
- 不新增 TypeScript、Babel、ts-node、Jest、Playwright 或瀏覽器 runner。
- 不把測試拆成遠端 CI 專用流程，也不新增需要外網、雲端 LLM、Joplin Cloud、真實 Joplin Desktop profile 或真實 Ollama server 的測試。
- 不把 workflow-sync 進行中 change 的功能實作納入本次遷移；若遇到該 change 的新增 Vitest 測試，只調整 repo 層級 runner 邊界與相容性，不替它完成產品功能。

## 全本機運作

- 資料路徑：測試 fixture、暫存 raw/wiki/config/report 內容應維持在 test fixture 或作業系統暫存目錄，不寫入使用者真實 Joplin profile。
- Ollama：既有測試若驗證 Ollama client 或 compile 流程，仍使用 mock fetch 或 dry-run，不要求本機模型已啟動。
- Chroma：目前 active specs 已移除 legacy vector indexing；本次測試遷移不得重新引入 Chroma 或向量服務測試依賴。
- 網路邊界：Joplin Data API 與外部 subprocess 均使用 mock 或 loopback allowlist 斷言，Vitest 遷移不得放寬 loopback-only 驗證。
- 離線驗收：在已安裝 pnpm dependencies 的狀態下，pnpm test 應可離線完成，不需外網或帳號。

## Capabilities

### New Capabilities

- `test-infrastructure`: 定義專案測試 runner、測試腳本、收檔範圍、離線測試邊界與遷移後的驗收契約。

### Modified Capabilities

(none)

## Impact

- Affected specs: test-infrastructure
- Affected code:
  - Modified: package.json, vitest.config.js, README.md, test/agent-compile.test.js, test/cli-help.test.js, test/cli-routing.test.js, test/config-schema.test.js, test/corpus-sweep-state.test.js, test/joplin-data-api-client.test.js, test/joplin-sqlite.test.js, test/joplin-wiki-writeback.test.js, test/launchd-plist.test.js, test/launchd-run-sqlite-sync.test.js, test/mcp-server.test.js, test/ollama-client.test.js, test/query.test.js, test/sqlite-sync-change-detection.test.js, test/wiki-concept-resume.test.js, test/wiki-separation.test.js, test/health-gui/concept-resume-actions.test.js, test/health-gui/corpus-pipeline-runner.test.js, test/health-gui/ollama-probe.test.js, test/health-gui/raw-wiki-health.test.js, test/health-gui/refresh-single-flight.test.js, test/health-gui/stack-runner.test.js
  - New: none
  - Removed: none

## Risks

- Runner semantics differ: node:test and Vitest handle assertion failures, mock cleanup, unhandled rejections, process warning capture, and timer behavior differently. Mitigation: migrate in small groups and run narrow Vitest files before the full suite.
- Existing tests may depend on process-level side effects that node:test isolated differently. Mitigation: add explicit cleanup for temporary directories, environment variables, global fetch, child-process mocks, and console interception.
- In-progress sync-joplin-workflow-edits already references Vitest. Mitigation: keep this migration scoped to repo-level runner and existing committed tests, and avoid completing unrelated workflow-sync product tasks.

## MVP 對照

- MVP includes migrating committed test/**/*.test.js files that currently import node:test.
- MVP includes making pnpm test invoke Vitest over the migrated test suite.
- MVP includes updating documentation for the new test command.
- MVP excludes new product capabilities, CI provider changes, and uncommitted feature tests from other active changes.

## Success Criteria

- [ ] SCN-TINF-001：pnpm test runs Vitest and completes the migrated committed test suite without invoking node --test.
- [ ] SCN-TINF-002：pnpm test:vitest remains available or is aliased consistently so existing Vitest-oriented workflow commands still work.
- [ ] SCN-TINF-003：A targeted Vitest command can run one migrated file, for example pnpm vitest run test/config-schema.test.js, and reports the same intended assertions.
- [ ] SCN-TINF-004：Migrated tests keep mock-only/local-only boundaries: no real Joplin Cloud, no real Ollama requirement, no remote network dependency, and no writes to user profile paths.
- [ ] SCN-TINF-005：README.md or equivalent developer docs list the Vitest command as the repo's test workflow and no longer instruct new work to use node --test as the primary runner.

## Assumptions

- Node.js 20+ is available, matching package.json engines.
- Dependencies are installed through pnpm and pnpm-lock.yaml remains authoritative.
- Existing tests are the behavioral source of truth for migration; their assertions should be preserved unless a real bug is found.
- Test data volume stays within normal local developer machine limits and does not require parallel shard orchestration.

## Rollback

- Revert package.json, vitest.config.js, documentation, and test file changes from this change.
- Restore pnpm test to node --test "test/**/*.test.js" if the migration must be abandoned.
- No Joplin user data, raw/wiki production outputs, or local profile files are modified by this infrastructure change.
