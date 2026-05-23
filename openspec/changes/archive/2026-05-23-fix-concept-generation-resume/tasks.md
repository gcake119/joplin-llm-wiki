## 1. 測試先行與合約鎖定

- [x] 1.1 在 `test/wiki-concept-resume.test.js` 新增 concept resume fixture，驗證 `Concept resume stage`：`wiki-compile --resume-stage concepts --dry-run` 讀取既有 summaries、回報 `resume_stage: concepts` 與 `summary_paths_read`，且不改寫 summaries；驗收：`pnpm vitest run test/wiki-concept-resume.test.js` 先紅燈。
- [x] 1.2 在 `test/wiki-concept-resume.test.js` 新增 canonical merge 測試，驗證 `Concept canonicalization during wiki compile` 與 `Decision 2: Use LLM semantic judgment for concept identity`：LLM 判斷同一主題的候選 concept 連續兩輪只產生同一 canonical path 並回報 `canonical_merge_count`；驗收：同一測試先紅燈。
- [x] 1.3 在 `test/wiki-concept-resume.test.js` 新增 concept consistency 測試，驗證 `Compiled concept evidence consistency` 與 `Concept index reflects canonical concepts only`：filename slug、frontmatter title、H1、source_refs 一致，`All-Concepts.md` 不列 merged aliases；驗收：同一測試先紅燈。
- [x] 1.4 在 `test/joplin-wiki-writeback.test.js` 新增 dry-run 測試，驗證 `Concept writeback collision observability` 與 `Concept orphan reporting`：mock Joplin Data API 回傳重複 concept title 與舊 concept note 時，dry-run 回報 collision/orphan details 且沒有 mutating request；驗收：`pnpm vitest run test/joplin-wiki-writeback.test.js` 先紅燈。
- [x] 1.5 在 `test/wiki-concept-resume.test.js` 或 `test/joplin-wiki-writeback.test.js` 新增 downstream relPaths 測試，驗證 `Writeback resume stage` 與 `Downstream-only concept writeback`：`--resume-stage writeback` 不呼叫 Ollama，且只傳 `concepts/*.md` 與 `indexes/All-Concepts.md`；驗收：相關 vitest 測試先紅燈。
- [x] 1.6 在 `test/wiki-concept-resume.test.js` 新增 semantic relation 測試，驗證 `LLM semantic concept relation judgment`：title/slug 相似但 LLM 回傳 `distinct_topic` 的候選不得合併，title 不相似但 LLM 回傳 `same_topic` 的候選可以合併；驗收：`pnpm vitest run test/wiki-concept-resume.test.js` 先紅燈。
- [x] 1.7 在 `test/joplin-wiki-writeback.test.js` 新增 REST lifecycle 測試，驗證 `Joplin REST API note lifecycle for compiled wiki writeback` 與 `Decision 5: Use Joplin REST update before create and trash only for explicit cleanup`：唯一 managed note 用 `PUT /notes/:id` 更新，缺漏 note 用 `POST /notes` 建立，explicit cleanup 才用不含 `permanent=1` 的 `DELETE /notes/:id` 移到 trash；驗收：`pnpm vitest run test/joplin-wiki-writeback.test.js` 先紅燈。

## 2. Concept resume 與 canonical planning

- [x] 2.1 實作 summary inventory reader，交付 `Decision 1: Use summary inventory as concept resume input`：`src/wiki/wiki-compiler.js` 可從 `wiki/summaries/*.md` 讀取 title、domain、source_refs、body excerpt 作為 concept planning input；驗收：1.1 測試轉綠且 missing summaries 回報 `WIKI_COMPILE_ABORT`。
- [x] 2.2 實作 canonical concept planner，交付 `Concept canonicalization during wiki compile` 與 `LLM semantic concept relation judgment`：`src/wiki/wiki-planner.js` 或新 helper 先用字串/slug 產生候選，再由 LLM 依 summaries/source_refs 語意輸出 relation、confidence、reason，最後建立穩定 slug、title、source_refs、summary_refs、merged_from；驗收：1.2 與 1.6 測試轉綠。
- [x] 2.3 實作 concept writer evidence binding，交付 `Compiled concept evidence consistency`：`src/wiki/wiki-compiler.js` 的 concept writer 使用 canonical plan item 的 evidence set，而不是 unrelated corpus slice，並在 mismatch 時 fail fast；驗收：1.3 測試轉綠。
- [x] 2.4 更新 `wiki/indexes/All-Concepts.md` 產生邏輯，交付 `Concept index reflects canonical concepts only`：index 只列 canonical concept links 並排除 merged aliases；驗收：1.3 測試中的 index assertion 轉綠。

## 3. CLI resume stage 與輸出觀測

- [x] 3.1 在 `src/commands/cmd-wiki-compile.js` 與 `src/wiki/wiki-compiler.js` 加入 `--resume-stage concepts|writeback` 解析與分流，交付 `API/CLI Contract` 和 `Data Flow & State Machine`：concepts stage 只寫 concepts/index，writeback stage 只跑 writeback；驗收：1.1 與 1.5 測試轉綠。
- [x] 3.2 實作 compile JSON summary 欄位，交付 `Observability`：輸出 `resume_stage`、`summary_paths_read`、`concept_paths_planned`、`concept_paths_written`、`canonical_merge_count`、`semantic_decision_count`、`low_confidence_semantic_decision_count`、`writeback_relpaths`、`writeback_created_count`、`writeback_updated_count`、`writeback_trashed_count`、`writeback_collision_count`、`writeback_orphan_candidate_count`；驗收：`test/wiki-concept-resume.test.js` 斷言欄位名稱與數值。
- [x] 3.3 更新 `src/config/load-config.js` 與 `config.yaml.example` 的設定說明，交付 `Local-First Constraints`：不新增外部服務，並記錄 resume stage 不依賴 Chroma 或 embeddings；驗收：`pnpm vitest run test/config-schema.test.js test/wiki-concept-resume.test.js` 通過。

## 4. Joplin writeback 接續與安全觀測

- [x] 4.1 擴充 `src/joplin/wiki-writeback.js` dry-run inspection，交付 `Concept writeback collision observability`：dry-run 可列出 concept title collisions 並維持 non-mutating；驗收：1.4 collision 測試轉綠。
- [x] 4.2 擴充 `src/joplin/wiki-writeback.js` orphan candidate report，交付 `Concept orphan reporting` 與 `Decision 4: Keep cleanup explicit and non-destructive by default`：dry-run 回報 Joplin concepts notebook 中沒有 current canonical relPath 的 note title，且不刪除；驗收：1.4 orphan 測試轉綠。
- [x] 4.3 實作 downstream-only writeback relPath filtering，交付 `Downstream-only concept writeback` 與 `Decision 3: Separate downstream relPaths for writeback`：resume writeback 只 upsert relPaths input 內的 concepts/indexes，不掃整個 summaries；驗收：1.5 測試轉綠。
- [x] 4.4 擴充 `src/joplin/data-api-client.js` 與 `src/joplin/wiki-writeback.js` 的 managed note lifecycle，交付 `Joplin REST API note lifecycle for compiled wiki writeback` 與 `Decision 5: Use Joplin REST update before create and trash only for explicit cleanup`：支援 `PUT /notes/:id` 更新 body/title/parent_id、`POST /notes` 建立缺漏 note、explicit cleanup 用 `DELETE /notes/:id` 移到 trash 且不帶 `permanent=1`；驗收：1.7 測試轉綠。

## 5. Agent route 後置檢查

- [x] 5.1 更新 `src/commands/cmd-agent-compile.js` prompt 與後置驗證，交付 `Compiled concept evidence consistency`：agent 產出的 concept 在 writeback 前必須通過 canonical title/H1/source_refs 檢查，失敗回報 `AGENT_COMPILE_FAILED`；驗收：`pnpm vitest run test/agent-compile.test.js` 通過並包含 mismatch failure case。
- [x] 5.2 更新 agent writeback path selection，交付 `Downstream-only concept writeback`：agent resume 或 post-check 階段可只寫回 concepts/indexes，不重送所有 summaries；驗收：`test/agent-compile.test.js` 斷言 `runWikiWriteback` relPaths 不含 `summaries/*.md`。

## 6. 文件、回歸檢查與排程恢復指引

- [x] 6.1 更新 `README.md` 與 `docs/llm-knowledge-flow.md`，交付 `Architecture Overview`、`Component Diagram` 對應的 operator recovery flow：文件說明先暫停排程、跑 concept dry-run、跑 concept non-dry-run、跑 writeback dry-run、再恢復排程；驗收：人工檢查文件包含三個 resume commands 與 rollback 說明。
- [x] 6.2 更新 `docs/scheduling-examples.md` 或 `docs/macos-launchd-stack.md`，交付 `Events & Triggers`：排程文件說明一般 sqlite-sync polling 不變，事故修復時使用手動 resume stage；驗收：人工檢查文件沒有要求重新生成 summaries。
- [x] 6.3 執行針對性測試與 lint，交付完整 `Implementation Contract`：`pnpm vitest run test/wiki-concept-resume.test.js test/joplin-wiki-writeback.test.js test/agent-compile.test.js test/config-schema.test.js` 通過；驗收：命令 exit code 0。
- [x] 6.4 執行 Spectra 驗證，交付 `Traceability` 與規格一致性：`spectra validate fix-concept-generation-resume` 通過，且 `spectra analyze fix-concept-generation-resume --json` 無 Critical/Warning；驗收：兩個命令回報成功或僅剩非阻塞 Suggestion。
