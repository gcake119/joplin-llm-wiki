## 1. 專案骨架與設定

- [x] 1.1 建立 Node.js ESM 套件骨架：`package.json`（`type: module`、`bin`→`bin/joplin-brain.js`）、`pnpm-lock.yaml`，`pnpm exec joplin-brain --help` exit 0。**對齊 design「Decision: Node.js JavaScript ESM + pnpm」。** 驗收：`pnpm exec joplin-brain --help`。
- [x] [P] 1.2 `.gitignore` 涵蓋 `data/`、`reports/`、`wiki_root/`（若置於 repo 內）。**對齊 REQ-IDX-004。** 驗收：`git status` 不追蹤運行時資料目錄。
- [x] [P] 1.3 `config.yaml.example` 涵蓋 Karpathy 全欄位：`notes_root`、`wiki_root`、`wiki_schema.path`、`wiki_ingest.*`、`chroma.collection_sources`／`collection_wiki`、`rag.retrieve_mode`、`lint.contradiction.*`、`write_back.sources_enabled`、`joplin_cli.*`。**對齊各 spec Config 表。** 驗收：load-config 單元測試。
- [x] [P] 1.4 新增 `wiki-schema.example.yaml`（含 `schema_version`、`page_types`、`required_hub_pages`）。**對齊 REQ-WS-001。** 驗收：SCN-SCHEMA-01。
- [x] 1.5 `bin/joplin-brain.js` + `src/cli.js` 路由：`index|watch|wiki-compile|ask|lint`、exit 0/1/2/3 與錯誤鍵。**對齊 design Implementation Contract。** 驗收：未知子命令 exit 1。

## 2. 設定載入與 Chroma 雙 collection

- [x] 2.1 `src/config/load-config.js`：校驗 Karpathy 欄位、預設 `rag.retrieve_mode=wiki_first`。**對齊 REQ-RAG-006。** 驗收：`pnpm test`。
- [x] 2.2 `src/vector/chroma-store.js`：支援兩 named collections、`layer` metadata。**對齊 design「Decision: 雙 Chroma collection」、Requirement: REQ-IDX-004 Chroma persistence contract、Requirement: REQ-IDX-008 Dual-layer indexing。** 驗收：SCN-IDX-DUAL。
- [x] [P] 2.3 `src/schema/schema-validator.js`：載入 wiki schema；錯誤時 `SCHEMA_INVALID`。**對齊 Requirement: REQ-WS-001 Schema document shape、Requirement: REQ-WS-002 Hub pages existence。** 驗收：SCN-SCHEMA-01／02。

## 3. 原件索引管線（sources）

- [x] 3.1 `note-discovery`／`chunker`／`ollama/client`／`indexer`：寫入 `collection_sources`、`layer=source`。**對齊 Requirement: REQ-LOCAL-IDX Network and storage locality for indexing、Requirement: REQ-IDX-001 Read-only Markdown discovery、Requirement: REQ-IDX-002 Chunking and content-hash idempotency、Requirement: REQ-IDX-003 Ollama embedding failure semantics、Requirement: REQ-IDX-005 State machine for lifecycle、Requirement: REQ-IDX-007 Unreadable and skipped notes。** 驗收：SCN-IDX-01、SCN-IDX-IDEMP。
- [x] 3.2 `watch`（sources）。**對齊 Requirement: REQ-IDX-006 Watch-driven incremental indexing latency。** 驗收：SCN-IDX-02。
- [x] [P] 3.3 `src/joplin/cli-runner.js` 選配預檢（選配 joplin cli 子行程）。design topic decision: 選配 joplin cli 子行程。**對齊 design「Decision: 選配官方 Joplin CLI 子行程」、Requirement: REQ-JOP-CLI-001 Optional official Joplin CLI preflight、Requirement: REQ-JOP-CLI-002 CLI must not supply corpus bytes。** 驗收：SCN-JOP-CLI-01。

## 4. Wiki 層：frontmatter 與目錄契約

- [x] [P] 4.1 `src/wiki/frontmatter.js`：parse／serialize；校驗 `source_refs`／`compiled_at`／`compiler_revision`。**對齊 Requirement: REQ-WIKI-002 Mandatory frontmatter、Requirement: REQ-WIKI-003 Source reference semantics。** 驗收：SCN-WIKI-FM-01、SCN-WIKI-REF。
- [x] 4.2 確保預設 `write_back.sources_enabled=false` 時 wiki 管線不碰 `notes_root`。**對齊 design「Decision: Wiki 預設為唯一可寫知識樹」、Requirement: REQ-WIKI-001 Wiki root separation。** 驗收：檔案系統断言測試。

## 5. wiki-compile（ingest）

- [x] 5.1 `src/wiki/wiki-planner.js`：呼叫本機 Ollama 產生有序 wiki 路徑列表（≤max_pages）。**對齊 design「Decision: wiki-compile 上限頁數」、Requirement: REQ-WI-001 Page budget per run、Requirement: REQ-WI-003 Planner uses local Ollama only。** 驗收：SCN-WI-CAP。
- [x] 5.2 `src/wiki/wiki-compiler.js`：讀 sources 上下文、寫 `wiki_root`；支援 `--dry-run`。**對齊 Requirement: REQ-WI-002 Dry-run mode。** 驗收：SCN-WIKI-COMPILE、SCN-WI-DRY。
- [x] 5.3 `wiki-compile` 與 schema strict hub 檢查。**對齊 REQ-WS-002。** 驗收：SCN-SCHEMA-HUB。

## 6. Wiki 向量索引

- [x] 6.1 延伸 `indexer`：索引 `wiki_root`→`collection_wiki`、`layer=wiki`。**對齊 REQ-IDX-008。** 驗收：SCN-IDX-DUAL。

## 7. RAG（wiki_first／merged／sources_only）

- [x] 7.1 `src/rag/rag-service.js`：双 collection 检索逻辑。**對齊 design「Decision: RAG wiki_first」、Requirement: REQ-RAG-006 Wiki-first retrieval、Requirement: REQ-RAG-007 Sources-only and merged modes。** 驗收：SCN-RAG-WIKI-FIRST、SCN-RAG-SOURCES-ONLY。
- [x] 7.2 `ask` CLI wiring、SOURCES JSON。**對齊 Requirement: REQ-RAG-002 Grounded answer with citations、Requirement: REQ-RAG-001 Retrieval uses indexed vectors、Requirement: REQ-RAG-003 Failure modes、Requirement: REQ-RAG-004 Performance targets、Requirement: REQ-RAG-005 Offline localhost operation、Requirement: REQ-LOCAL-RAG Local inference only。** 驗收：SCN-RAG-01。

## 8. Karpathy Lint

- [x] 8.1 `src/lint/karpathy-lint-engine.js`：duplicates、source orphans、wiki hub orphans。**對齊 Requirement: REQ-KL-001 Duplicate embedding pairs、Requirement: REQ-KL-002 Source link orphans、Requirement: REQ-KL-003 Wiki hub orphans。** 驗收：`pnpm test` 圖_fixture。
- [x] 8.2 矛盾判定批次：Ollama JSON 輸出解析、timeout／retry。**對齊 design「Decision: 矛盾判定為 LLM 結構化輸出」、Requirement: REQ-KL-004 Contradiction candidates via local LLM。** 驗收：SCN-KL-CONTRA。
- [x] 8.3 schema_gaps 偵測。**對齊 Requirement: REQ-KL-005 Schema gap detection。** 驗收：SCN-KL-GAP。
- [x] 8.4 `report-writer` 延伸 JSON 鍵。**對齊 Requirement: REQ-KL-006 Report format。** 驗收：SCN-LINT-KFULL。

## 9. 整合測試與文件

- [x] [P] 9.1 Fixtures：`fixtures/full-karpathy.config.yaml` + 最小 sources／wiki／schema。**對齊 proposal Success Criteria。** 驗收：README Quick Karpathy path。
- [x] [P] 9.2 mock Ollama：涵蓋 planner、writer、contradiction。**對齊 REQ-WI-003、REQ-KL-004。** 驗收：`pnpm test`。
- [x] 9.3 `README.md`：三層架構、`wiki-compile`、預設不寫回 sources、風險說明。**對齊 proposal。** 驗收：人工跟跑。
- [x] [P] 9.4 `docs/scheduling-examples.md`：cron 呼叫 `wiki-compile` + `lint`。**對齊 Scheduler。** 驗收：檔案存在。

## 10. 追蹤與分析

- [x] 10.1 `pnpm test` 全綠後跑 `spectra validate joplin-brain-mvp`。**驗收：CLI valid。
