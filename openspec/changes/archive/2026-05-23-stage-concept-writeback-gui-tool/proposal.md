## Why

目前 concept resume 已能從既有 summaries 接續，但產品行為仍可能在 concept 編寫完成前或同一階段立即寫回 Joplin，讓使用者難以先檢查本機 canonical concepts 再發布到 `@llm-wiki`。同時，raw 變動後的自動流程需要更精準地把「變動 summaries 影響到的 concepts」重編並只寫回變動 downstream 頁面，避免重跑全庫或重送所有 summaries。

Health GUI 目前仍以健康檢查為主，尚未把這些 CLI 階段化能力變成清楚的操作流程；名稱也低估了它作為 Joplin-LLM-wiki 操作工具的角色。

## What Changes

- 變更類型：Feature + Refactor。
- 調整產品行為：concept 編寫與 Joplin 寫回分成兩個明確階段；local 與 agent 兩個編譯模式都必須先完成本機 `wiki/concepts/*.md` 與 `wiki/indexes/All-Concepts.md`，才允許 writeback 階段寫入 Joplin。
- 調整 `wiki-compile --resume-stage concepts` 與新增/補齊 `agent-compile --resume-stage concepts`：即使 `joplin_wiki_writeback.enabled` 為 true，也只寫本機 concepts/index，不自動寫回 Joplin。
- 保留/補齊 `wiki-compile --resume-stage writeback` 與 `agent-compile --resume-stage writeback` 作為 concept resume 發布到 Joplin 的階段，並維持 dry-run collision/orphan 檢查。
- 在 raw 變動導致 summaries 變動時，sqlite-sync downstream orchestration 應能依 `compile_mode: local|agent` 追蹤變動 summary relPaths，針對受影響 concepts 重編，完成後只把變動 concepts 與 All-Concepts 寫回 Joplin。
- 將 CLI 對應能力放進 GUI：提供 concept dry-run、concept compile、writeback dry-run、writeback run，以及 raw-change incremental concept flow 的操作入口與狀態顯示。
- 將 Health GUI 對使用者呈現名稱更名為 Joplin-LLM-wiki tool，保留現有 executable 與內部目錄命名相容性，避免破壞既有啟動方式。

## Non-Goals

- 不恢復 RAG、Chroma、embedding 或向量索引。
- 不新增雲端 LLM API、遠端 DB、遠端 Joplin 服務或第三方 SaaS。
- 不自動永久刪除 Joplin 舊 concept；cleanup 仍須明確模式，且預設只移到 trash。
- 不重新設計 sqlite raw export、notebook filter、snapshot baseline 或 polling 語意。
- 不把 Jarvis 納入本 repo 內部模組；Jarvis 仍只是 Joplin 內即時輔助的互補工具。
- 不移除既有 CLI；GUI 只包裝固定白名單 workflow，不提供任意 shell command runner。

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `wiki-ingest`: local 與 agent 的 concept resume 與 raw-change downstream 編譯改成先完成本機 concepts，再由 writeback stage 發布。
- `joplin-wiki-writeback`: 明確定義 concept 發布只能由 writeback stage 執行，並只處理已完成的 downstream relPaths。
- `joplin-sqlite-sync`: raw 變動後的 downstream orchestration 需要傳遞 changed summary/concept scope，避免重跑或重送不變頁面。
- `local-runtime-health-gui`: GUI 更名為 Joplin-LLM-wiki tool，並新增固定按鈕/流程對應 local/agent concept resume 與 writeback resume CLI 功能。

## Impact

- Affected specs: `wiki-ingest`, `joplin-wiki-writeback`, `joplin-sqlite-sync`, `local-runtime-health-gui`
- Affected code:
  - Modified: `src/wiki/wiki-compiler.js`
  - Modified: `src/wiki/wiki-planner.js`
  - Modified: `src/commands/cmd-wiki-compile.js`
  - Modified: `src/commands/cmd-agent-compile.js`
  - Modified: `src/commands/cmd-sqlite-sync.js`
  - Modified: `src/joplin/wiki-writeback.js`
  - Modified: `src/health-gui/main.js`
  - Modified: `src/health-gui/preload.cjs`
  - Modified: `src/health-gui/renderer/index.html`
  - Modified: `src/health-gui/renderer/app.js`
  - Modified: `src/health-gui/corpus/corpus-pipeline-runner.js`
  - Modified: `src/health-gui/health-snapshot.js`
  - Modified: `README.md`
  - Modified: `docs/llm-knowledge-flow.md`
  - Modified: `docs/scheduling-examples.md`
  - Modified: `test/wiki-concept-resume.test.js`
  - Modified: `test/agent-compile.test.js`
  - Modified: `test/joplin-wiki-writeback.test.js`
  - Modified: `test/sqlite-sync-change-detection.test.js`
  - Modified: `test/health-gui/corpus-pipeline-runner.test.js`
  - Modified: `test/health-gui/raw-wiki-health.test.js`
  - New: `test/health-gui/concept-resume-actions.test.js`
  - Removed: none

## Goals

- G1：local 與 agent 兩種 concept 編譯模式都與 Joplin 寫回有乾淨階段邊界，concept resume 不會在本機輸出完成前或同階段自動寫回 Joplin。
- G2：raw 變動後，`compile_mode: local|agent` 都只針對受影響 summaries/concepts 重編 downstream concept，完成後只寫回變動 concepts 與 All-Concepts。
- G3：GUI 提供與 CLI 等價的固定操作入口，讓使用者不用記憶 local/agent resume 指令即可完成 dry-run、compile、writeback 檢查與發布。
- G4：GUI 對外名稱改成 Joplin-LLM-wiki tool，符合它作為操作工具而非單純健康頁的定位。

## 全本機運作

- 資料路徑：仍只讀 `raw/` 與 `wiki/summaries/` 作為本機 evidence，輸出限制在 `wiki/concepts/`、`wiki/indexes/All-Concepts.md`，再由 writeback stage 可選寫入本機 Joplin Desktop。
- Ollama / Codex agent：local concept 編譯仍只呼叫 `ollama.base_url`，預設 loopback；agent concept 編譯仍只透過本機 `codex exec`，不使用 OpenAI API key。
- Chroma：本變更不新增 Chroma、RAG、embeddings 或向量索引。
- 網路邊界：除 loopback Ollama 與 loopback Joplin Data API 外，不允許對外 HTTP。
- 離線驗收：使用 mock Ollama、mock Joplin Data API、fixture raw/summaries/wiki 即可驗證 CLI 與 GUI 行為。

## MVP 對照

- Joplin：仍是原始筆記來源與可選 compiled wiki 發布目的地；本變更只調整發布時機與範圍。
- Jarvis：仍負責 Joplin 內閱讀與寫作當下的 related notes；不被取代也不被本 repo 呼叫。
- joplin-llm-wiki：負責 raw/wiki pipeline、local/agent summary/change scope、concept canonicalization、writeback staging 與 GUI 操作工具。
- 技術棧：Node.js 20+、JavaScript ESM、pnpm、Electron GUI；不新增 Python stack、Chroma 或雲端服務。

## Assumptions

- Joplin SQLite export 與 raw snapshot comparison 已可判斷 raw 是否變動。
- `wiki/summaries/*.md` frontmatter 可提供 source_refs 與 summary relPath，足以建立 concept impact scope。
- Ollama chat model 已 pull，local compile 可連到 loopback `ollama.base_url`。
- Agent mode 使用者本機已登入 Codex CLI，且 `codex exec` 可在非互動流程執行。
- Joplin Desktop Web Clipper token 已設定時，writeback dry-run 與 writeback 可連到 loopback Data API。
- Node.js 20+ 與 pnpm 可用；筆記量級小於 10k。

## Rollback

- 停止排程或將 `joplin_sqlite_sync.pipeline.compile_mode` 設為 `off` 可停止自動 downstream compile/writeback。
- 若 staged concept 行為不符合預期，可只回復 `wiki/concepts/*.md` 與 `wiki/indexes/All-Concepts.md`，不影響 `raw/`。
- 若 GUI 入口有問題，可繼續使用 CLI resume commands；既有 executable 名稱保持相容。
- 若 Joplin writeback 有疑慮，可保留本機 concepts 並停用 `joplin_wiki_writeback.enabled` 或只跑 writeback dry-run。

## Risks

- Incremental concept impact scope 過窄可能漏掉跨 summary 的概念更新；需要以 source_refs、summary_refs 與 canonical plan metadata 擴張影響範圍。
- Incremental scope 過寬可能接近全庫重編；需要 telemetry 顯示 changed summaries、candidate concepts、planned concepts 與 writeback relPaths。
- GUI 將長流程按鈕化後可能被連點或重入；必須沿用 single in-flight operation lock。
- 更名 GUI 可能影響既有文件與測試；應只改使用者可見名稱，保留 executable 與內部路徑相容。

## Success Criteria

- [ ] SCN-WI-STAGED-CONCEPT-01：local 與 agent 的 `--resume-stage concepts` 非 dry-run 只寫本機 concepts/index，不呼叫 Joplin Data API mutating endpoints。
- [ ] SCN-JWKB-STAGED-PUBLISH-01：local 與 agent 的 `--resume-stage writeback` 是 concept resume 寫入 Joplin 的唯一階段，且只處理 completed downstream relPaths。
- [ ] SCN-JSQ-INCREMENTAL-CONCEPT-01：raw 變動造成 summaries 變動時，sqlite-sync 在 `compile_mode: local|agent` 都顯示 changed summary relPaths、concept relPaths planned/written、writeback relPaths，且不重送 unchanged summaries。
- [ ] SCN-HGUI-CONCEPT-ACTIONS-01：GUI 提供 local/agent concept dry-run、concept compile、writeback dry-run、writeback run 的固定操作入口，spawn argv 與 CLI contract 一致。
- [ ] SCN-HGUI-RENAME-01：GUI 視窗標題與主要 UI copy 顯示 Joplin-LLM-wiki tool，既有 CLI executable 保持可用。
