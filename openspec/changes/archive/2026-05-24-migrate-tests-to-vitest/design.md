## Context

專案目前是 Node.js 20+、JavaScript ESM、pnpm 套件管理。package.json 已有 Vitest devDependency 與 test:vitest 腳本，vitest.config.js 目前只收 test/**/*.vitest.test.js；主要 test 腳本仍是 node --test "test/**/*.test.js"。因此現況是新測試可用 Vitest，但既有測試仍使用 node:test，造成 assertion、mock、hook、執行指令與收檔規則分裂。

本設計只處理測試基礎設施與既有 committed test suite 的 runner 遷移。它不改變 joplin-llm-wiki 產品功能、不要求真實 Joplin/Ollama、不擴大網路邊界，也不完成其他 active change 的功能實作。

## Goals / Non-Goals

**Goals:**

- 讓 pnpm test 成為 Vitest full-suite 入口，涵蓋已遷移的 committed test/**/*.test.js 與既有 .vitest.test.js 檔案。
- 將 node:test import、assert 寫法、mock cleanup、hook 與 async failure checks 轉成 Vitest 等價語意。
- 保留每個測試原本驗證的產品行為，包括 stable error code、stdout/stderr、filesystem output、mock spawn、mock fetch、loopback allowlist、temporary path safety。
- 更新開發文件，讓日常 full-suite 與 targeted-file 驗證都使用 Vitest。

**Non-Goals:**

- 不新增 TypeScript、Jest、Playwright、瀏覽器 runner 或新的 build tool chain。
- 不新增需要外網、雲端服務、真實 Joplin profile、真實 Ollama model 的測試。
- 不重寫產品模組架構；若遷移揭露產品 bug，apply 階段必須把 bug fix 與測試遷移原因寫清楚。
- 不完成 sync-joplin-workflow-edits change 的 workflow-sync 產品實作。

## Decisions

### Decision: Use Vitest as the single primary runner

pnpm test 改為執行 Vitest。test:vitest 保留為相容入口，並使用相同或明確相容的 Vitest 收檔規則。

Rationale：專案已安裝 Vitest，且另一個 active change 已開始使用 .vitest.test.js；統一 runner 可以消除 node:test 與 Vitest 兩套測試語意。

Alternative considered：保留 node:test 作為 legacy runner、只讓新增測試用 Vitest。這會保留兩套 mocking/assertion/hook 模型，後續每次新增測試都要先判斷 runner，不能達成遷移目標。

### Decision: Migrate tests in behavior groups before switching full-suite ownership

apply 階段先依測試性質分組遷移：pure config/filesystem tests、CLI subprocess tests、network-adjacent mock tests、MCP/service tests、Health GUI helper tests。每組完成後跑 targeted Vitest，再跑 full-suite。

Rationale：Vitest 與 node:test 在 mock lifecycle、global fetch、process env、temporary directory cleanup、unhandled rejection 上有差異。分組可以把 failure 歸因限制在同一類測試語意。

Alternative considered：一次性改所有 import 後只跑 full-suite。這會讓失敗訊號混雜，apply 階段很難判斷是 runner 語意差異、測試清理不足，還是真實產品回歸。

### Decision: Preserve file names unless a runner boundary requires a suffix change

既有 test/**/*.test.js 檔名預設保留，vitest.config.js 改成收 migrated .test.js 與 .vitest.test.js。只有在同一目錄需要同時保留 temporary legacy 與 migrated variants 時，才使用 .vitest.test.js 作為過渡 suffix；最終 pnpm test 不得重複收同一案例。

Rationale：保留檔名能降低 review noise，也避免 tasks 只是在搬檔。收檔邊界由 Vitest config 負責，而不是靠大量 rename 表達遷移。

Alternative considered：將所有測試檔改名成 .vitest.test.js。這會產生大量 path churn，讓 reviewer 更難確認 assertion 是否等價。

### Decision: Make local/offline boundaries explicit in migrated mocks

遷移時要把 global fetch、child process spawn、console capture、process env、temporary directory 與 fixture cleanup 改成 Vitest lifecycle 中明確還原。測試不得落到真實 Joplin Cloud、真實 Ollama、真實 Joplin profile 或遠端 URL。

Rationale：Vitest worker 與 mock state 可能跨同一檔案內案例互相影響；明確 cleanup 可以保留本專案 local-first 測試契約。

Alternative considered：沿用 node:test 時期的隱式 process-level cleanup。這在 Vitest 中較容易造成順序相依或跨案例污染。

## Implementation Contract

### Observable Behavior

- pnpm test executes Vitest as the repository full-suite runner.
- pnpm test:vitest remains a valid Vitest command and is not a separate legacy suite.
- pnpm vitest run test/config-schema.test.js can run a migrated single file.
- The migrated suite remains offline-capable after dependencies are installed.
- The suite does not require Joplin Cloud credentials, a real Joplin Desktop profile, a running Ollama server, or remote network access.

### Interfaces and Files

| Surface | Contract |
| --- | --- |
| package.json scripts | test invokes Vitest. test:vitest remains available as a Vitest alias or compatible command. |
| vitest.config.js | Collects migrated test/**/*.test.js and .vitest.test.js files without duplicating the same committed test case. Uses node environment. |
| test files | Import test, describe, it, expect, beforeEach, afterEach, vi, or equivalent Vitest APIs from vitest. No committed test imports node:test after migration. |
| README.md or developer docs | Documents pnpm test for full suite and a targeted Vitest command for a single file. |

### Failure Modes

- If a test relies on node:test mock APIs, it must be converted to vi.fn, vi.spyOn, vi.stubGlobal, vi.useFakeTimers, or an explicit injected fake as appropriate.
- If a test mutates process.env, global.fetch, console methods, current working directory, temporary directories, or module-level state, it must restore that state in Vitest lifecycle hooks.
- If a migrated test begins failing because it exposes a true product bug, the implementer must keep the failing assertion, fix the product behavior in the smallest necessary scope, and record that reason in the apply summary.
- If a test cannot be faithfully migrated without broad product rewrites, keep the scope narrow by extracting a helper or adding explicit setup/teardown; do not remove the assertion to make the suite pass.

### Acceptance Criteria

- pnpm vitest run test/config-schema.test.js passes after config-schema migration.
- Targeted Vitest runs pass for each migrated behavior group before full-suite verification.
- pnpm test passes and the output identifies Vitest as the runner.
- A repository search for import from node:test under committed migrated tests returns no remaining primary test imports, excluding archived Spectra artifacts if searched globally.
- README.md or equivalent developer docs uses Vitest commands for new test workflow.

### Scope Boundaries

In scope：package scripts, Vitest config, committed test files that currently use node:test, README/testing docs, and narrowly necessary test-only helper adjustments.

Out of scope：new product capabilities, CI provider setup, TypeScript conversion, browser tests, cloud integration tests, true Joplin/Ollama integration requirements, and implementation of unrelated active Spectra changes.

## Risks / Trade-offs

- [Risk] Vitest concurrency reveals hidden shared state in tests. → Mitigation: use explicit beforeEach/afterEach cleanup, restore globals, and configure serial behavior only for the smallest file or suite that truly needs it.
- [Risk] Subprocess and CLI tests depend on exact stdout/stderr timing. → Mitigation: keep assertions on stable output fragments and exit codes already present in the tests, not on incidental runner formatting.
- [Risk] Global fetch or process env mocks leak between tests. → Mitigation: use vi.stubGlobal or direct assignment with saved originals and restore in afterEach.
- [Risk] Large mechanical import changes hide assertion weakening. → Mitigation: migrate by behavior group and compare each file's assertions while editing.
- [Risk] Active change sync-joplin-workflow-edits already uses Vitest-specific tests. → Mitigation: keep runner config compatible with .vitest.test.js while avoiding product implementation from that change.

## Migration Plan

1. Update vitest.config.js and package.json scripts so Vitest can collect the intended migrated files, while keeping test:vitest usable.
2. Migrate low-risk pure tests first: config/schema, corpus sweep state, sqlite path/export helpers, data API client, Ollama client, CLI routing/help.
3. Migrate subprocess-heavy and output-heavy tests: launchd scripts, wiki writeback, agent compile, sqlite sync change detection.
4. Migrate service and MCP tests: query, MCP server, wiki separation, wiki concept resume.
5. Migrate Health GUI helper tests, preserving mock subprocess and local filesystem behavior.
6. Update README.md or equivalent developer docs with Vitest full-suite and targeted-file commands.
7. Run targeted Vitest groups, then pnpm test.

Rollback：revert package.json, vitest.config.js, README/testing docs, and migrated test edits from this change. Restoring node --test as the test script is sufficient because the change does not alter Joplin data, raw/wiki production outputs, or user profile files.

## Traceability

| Spec requirement | Design coverage |
| --- | --- |
| Vitest is the primary test runner | Decision: Use Vitest as the single primary runner; Implementation Contract |
| Migrated tests preserve behavioral coverage | Decision: Migrate tests in behavior groups before switching full-suite ownership; Failure Modes |
| Tests remain local and offline | Decision: Make local/offline boundaries explicit in migrated mocks; Observable Behavior |
| Runner configuration prevents duplicate and missing execution | Decision: Preserve file names unless a runner boundary requires a suffix change; Interfaces and Files |
| Developer documentation reflects Vitest workflow | Interfaces and Files; Migration Plan step 6 |

## Open Questions

None.
